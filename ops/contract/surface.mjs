/**
 * The published contract, read from a copy of the site, and the check that a
 * release keeps it (t25827).
 *
 * /api/stability.json promises six things a machine may rely on between
 * deploys (`stable[]`): endpoint paths, operation ids, response field names,
 * published service ids, page URLs and enum values. That document is generated
 * from the build it ships with, so on its own it can only describe the build:
 * a release that renamed a field or dropped a page would publish a policy that
 * no longer mentions it, and every test of the build would pass. The promise
 * is about the release BEFORE this one, so that is what this module compares
 * with: it lists every identifier the served site promises (`readSurface`)
 * and every one a candidate build no longer keeps (`brokenPromises`).
 *
 * The same reader works on any copy of the site: `distReader` for a built
 * dist/, `originReader` for a served origin (production, the preview target).
 * ops/contract/check-surface.mjs is the command CI and the deploy run.
 *
 * What counts as kept:
 *   - endpoint   the path still answers, or a deprecation whose sunset has
 *                passed, announced by the release before with the promised
 *                notice, withdraws it;
 *   - operation  the path's operationId in /openapi.json is unchanged;
 *   - field      the field is still in the payload or still declared by the
 *                path's response schema (an optional field with no value
 *                today is still promised), or a deprecation withdraws it;
 *   - service    the id is still in /api/services.json;
 *   - page       the URL still resolves: the page, or a redirect left at it;
 *   - enum       the value is still declared for that field.
 * New identifiers are always allowed (`additiveChanges`).
 */

/** The six promise kinds, in the order /api/stability.json `stable[]` lists them. */
export const PROMISE_KINDS = ['endpoint', 'operation', 'field', 'service', 'page', 'enum'];

/**
 * @typedef {{ kind: string, path?: string, field?: string, value?: string, key: string }} Promise_
 * @typedef {{ path: string, field?: string, replacement: string, deprecatedOn: string, sunset: string }} Deprecation
 * @typedef {{ promises: Map<string, Promise_>, deprecations: Deprecation[], noticeDays: number, publishedAt: string | null }} Surface
 * @typedef {{ read: (path: string) => Promise<string | null>, resolves: (url: string) => Promise<boolean>, name: string }} SiteReader
 */

/** @param {Omit<Promise_, 'key'>} p */
function promise(p) {
  const key = [p.kind, p.path, p.field, p.value].filter((part) => part !== undefined).join(' ');
  return { ...p, key };
}

/** Every key path in a JSON value: `services[].priceFrom`, `address.postalCode`. */
export function fieldPaths(value, prefix = '', out = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) fieldPaths(item, `${prefix}[]`, out);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const path = prefix ? `${prefix}.${key}` : key;
      out.add(path);
      fieldPaths(child, path, out);
    }
  }
  return out;
}

/** Resolve a local `#/components/...` $ref, or return the node itself. */
function deref(node, spec) {
  if (!node || typeof node !== 'object') return {};
  if (typeof node.$ref !== 'string' || !node.$ref.startsWith('#/')) return node;
  let target = spec;
  for (const part of node.$ref.slice(2).split('/')) target = target?.[part];
  return target && typeof target === 'object' ? target : {};
}

/**
 * The fields a response schema declares (same path syntax as `fieldPaths`),
 * and the enum values it publishes for each. Unions (`oneOf`/`anyOf`) declare
 * the fields of every branch.
 */
export function schemaFields(schema, spec, prefix = '', out = { fields: new Set(), enums: new Map() }, seen = new Set()) {
  const node = deref(schema, spec);
  if (seen.has(node)) return out;
  seen.add(node);
  const values = Array.isArray(node.enum) ? node.enum : node.const !== undefined ? [node.const] : [];
  if (prefix && values.length) out.enums.set(prefix, new Set(values.map(String)));
  for (const branch of [...(node.oneOf ?? []), ...(node.anyOf ?? []), ...(node.allOf ?? [])]) {
    schemaFields(branch, spec, prefix, out, seen);
  }
  if (node.items) schemaFields(node.items, spec, `${prefix}[]`, out, seen);
  for (const [key, child] of Object.entries(node.properties ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.fields.add(path);
    schemaFields(child, spec, path, out, seen);
  }
  seen.delete(node);
  return out;
}

/** @param {string | null} raw @param {string} what */
function json(raw, what) {
  if (raw === null) throw new Error(`${what} is not served`);
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${what} is not JSON`);
  }
}

/** The response schema /openapi.json declares for a path's GET 200. */
function responseSchema(spec, path) {
  return spec.paths?.[path]?.get?.responses?.['200']?.content?.['application/json']?.schema;
}

/**
 * Everything a copy of the site promises, keyed for comparison.
 * @param {SiteReader} site
 * @returns {Promise<Surface>}
 */
export async function readSurface(site) {
  const policy = json(await site.read('/api/stability.json'), `${site.name}/api/stability.json`);
  const spec = json(await site.read('/openapi.json'), `${site.name}/openapi.json`);
  const pages = json(await site.read('/api/pages.json'), `${site.name}/api/pages.json`);
  const services = json(await site.read('/api/services.json'), `${site.name}/api/services.json`);

  /** @type {Map<string, Promise_>} */
  const promises = new Map();
  const add = (p) => {
    const made = promise(p);
    promises.set(made.key, made);
  };

  for (const path of policy.endpointPaths ?? []) {
    // An endpoint the policy lists but the site does not serve keeps nothing.
    const raw = await site.read(path);
    if (raw === null) continue;
    add({ kind: 'endpoint', path });
    const operationId = spec.paths?.[path]?.get?.operationId;
    if (operationId) add({ kind: 'operation', path, value: operationId });
    const declared = schemaFields(responseSchema(spec, path), spec);
    const served = fieldPaths(json(raw, `${site.name}${path}`));
    for (const field of new Set([...declared.fields, ...served])) add({ kind: 'field', path, field });
    for (const [field, values] of declared.enums) {
      for (const value of values) add({ kind: 'enum', path, field, value });
    }
  }
  // The ids a consumer keys on are the ones /api/services.json serves
  // (tests/developer-surface.test.ts holds `stableServiceIds` to the same list).
  for (const service of services.services ?? []) add({ kind: 'service', value: service.id });
  for (const page of pages.pages ?? []) add({ kind: 'page', value: new URL(page.url).pathname });

  return {
    promises,
    deprecations: policy.deprecations ?? [],
    noticeDays: policy.deprecation?.minimumNoticeDays ?? 90,
    publishedAt: typeof policy.generatedAt === 'string' ? policy.generatedAt : null,
  };
}

const DAY = 86_400_000;

/**
 * The deprecation that lets `p` go, if one does: listed by the release before
 * (so it was announced), for this path (and field, if it names one), with a
 * sunset that has passed and at least the promised notice before it.
 * @param {Promise_} p @param {Surface} before @param {Date} today
 */
function withdrawnBy(p, before, today) {
  if (p.kind !== 'endpoint' && p.kind !== 'field' && p.kind !== 'operation' && p.kind !== 'enum') return null;
  return (
    before.deprecations.find((d) => {
      if (d.path !== p.path) return false;
      // A deprecation of a whole path withdraws everything under it; one
      // naming a field withdraws that field and the fields inside it.
      if (d.field && !(p.field === d.field || p.field?.startsWith(`${d.field}.`) || p.field?.startsWith(`${d.field}[]`))) return false;
      const sunset = Date.parse(d.sunset);
      const announced = Date.parse(d.deprecatedOn);
      if (!Number.isFinite(sunset) || !Number.isFinite(announced)) return false;
      return sunset <= today.getTime() && sunset - announced >= before.noticeDays * DAY;
    }) ?? null
  );
}

/**
 * Every promise `before` makes that `after` breaks, with why. Additions are
 * never breaks. A page is kept while its URL resolves in `after` (the page, or
 * a redirect left behind), whether or not the inventory still lists it;
 * `resolves` answers that for `after`.
 * @param {Surface} before @param {Surface} after
 * @param {{ today?: Date, resolves?: (url: string) => Promise<boolean> }} [options]
 * @returns {Promise<Array<Promise_ & { why: string }>>}
 */
export async function brokenPromises(before, after, { today = new Date(), resolves = async () => false } = {}) {
  const broken = [];
  for (const p of before.promises.values()) {
    // A page is kept only by a URL that still resolves (the page, or a
    // redirect left at it), whatever the inventory says.
    if (p.kind === 'page') {
      if (await resolves(p.value)) continue;
    } else if (after.promises.has(p.key)) continue;
    if (withdrawnBy(p, before, today)) continue;
    let why;
    switch (p.kind) {
      case 'endpoint':
        why = `${p.path} is no longer served: keep it, or publish its replacement and list it in deprecations[] for ${before.noticeDays} days first`;
        break;
      case 'operation': {
        const now = [...after.promises.values()].find((q) => q.kind === 'operation' && q.path === p.path);
        why = now
          ? `${p.path} operationId changed from ${p.value} to ${now.value}: a function-calling client binds to the old name`
          : `${p.path} lost operationId ${p.value}`;
        break;
      }
      case 'field':
        why = `${p.path} no longer serves or declares "${p.field}": restore it, or list it in deprecations[] for ${before.noticeDays} days before removing it`;
        break;
      case 'service':
        why = `service id "${p.value}" is no longer published: a service may be renamed, its id may not change`;
        break;
      case 'page':
        why = `page ${p.value} no longer resolves: leave a redirect at the old URL`;
        break;
      case 'enum':
        why = `${p.path} ${p.field} no longer declares the value "${p.value}"`;
        break;
      default:
        why = 'no longer published';
    }
    broken.push({ ...p, why });
  }
  return broken;
}

/** Counts per promise kind, in `PROMISE_KINDS` order. @param {Surface} surface */
export function countByKind(surface) {
  const counts = Object.fromEntries(PROMISE_KINDS.map((kind) => [kind, 0]));
  for (const p of surface.promises.values()) counts[p.kind] += 1;
  return counts;
}
