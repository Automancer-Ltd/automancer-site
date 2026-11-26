// Search engines hear about a release's changed pages as soon as it is live (IndexNow, t26811).
//
// ops/indexnow.mjs plans the announcement in the build job, against what production serves, and
// posts it once the release is live. These tests run it against the built dist/ served through the
// edge Worker, as production serves it. They fail when engines would refuse the key (403: the
// key file missing or holding anything else), when a change would go unannounced, when an
// unchanged release would announce every page, or when an engine outage would stop a release.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INDEXNOW_KEY, KEY_PATH, SITE, planRelease, sitemapUrls, submit } from '../ops/indexnow.mjs';
import { siteFromDist } from '../ops/edge/local.mjs';
import { DIST } from './support/dist';

const quiet = () => {};
const site = siteFromDist(DIST);
type Fetch = typeof fetch;
const production: Fetch = (input, init) => site(new Request(input, init));
const urlOf = (input: Parameters<Fetch>[0]) => (input instanceof Request ? input.url : input instanceof URL ? input.href : input);
const builtIndex = JSON.parse(readFileSync(join(DIST, 'api', 'pages.json'), 'utf8')) as {
  pages: { url: string; contentSha256: string }[];
};

/** Production serving this build, with its page index and key file answered as given. */
function servedWith(pagesJson: unknown, key: string | null): Fetch {
  return async (input, init) => {
    const url = new URL(urlOf(input));
    if (url.pathname === '/api/pages.json') {
      return pagesJson === null ? new Response('down', { status: 503 }) : Response.json(pagesJson);
    }
    if (url.pathname === KEY_PATH) return key === null ? new Response('gone', { status: 404 }) : new Response(key);
    return production(input, init);
  };
}

describe('IndexNow', () => {
  it('serves the key file engines check, holding exactly the key', async () => {
    expect(INDEXNOW_KEY).toMatch(/^[a-zA-Z0-9-]{8,128}$/);
    const res = await production(`${SITE}${KEY_PATH}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    expect((await res.text()).trim()).toBe(INDEXNOW_KEY);
  });

  it('announces nothing when the release changes no page words', async () => {
    const { urls } = await planRelease({ dist: DIST, fetchImpl: production, log: quiet });
    expect(urls).toEqual([]);
  });

  it('announces exactly the pages whose words changed, were added or were removed', async () => {
    const [changed, added, ...rest] = builtIndex.pages;
    const removed = `${SITE}/field-notes/a-note-this-release-removed/`;
    const served = {
      pages: [
        { ...changed, contentSha256: '0'.repeat(64) },
        ...rest,
        { url: removed, contentSha256: '1'.repeat(64) },
      ],
    };
    const { urls } = await planRelease({ dist: DIST, fetchImpl: servedWith(served, INDEXNOW_KEY), log: quiet });
    const byText = (a: string, b: string) => a.localeCompare(b);
    expect(urls.sort(byText)).toEqual([changed.url, added.url, removed].sort(byText));
  });

  it('announces every sitemap page when production does not serve the key yet, or cannot be read', async () => {
    const all = sitemapUrls(DIST);
    expect(all).toContain(`${SITE}/`);
    for (const fetchImpl of [servedWith(builtIndex, null), servedWith(builtIndex, 'another-key'), servedWith(null, null)]) {
      expect((await planRelease({ dist: DIST, fetchImpl, log: quiet })).urls).toEqual(all);
    }
  });

  it('posts the URLs with the key, and never stops a release for an engine outage', async () => {
    const urls = [`${SITE}/`, `${SITE}/services/`];
    let posted: { host: string; key: string; keyLocation: string; urlList: string[] } | undefined;
    const engine =
      (status: number): Fetch =>
      async (input, init) => {
        if (urlOf(input).startsWith('https://api.indexnow.org/')) {
          posted = JSON.parse(init?.body as string);
          return new Response('', { status });
        }
        return production(input, init);
      };
    expect(await submit({ urls, fetchImpl: engine(200) })).toMatchObject({ ok: true, status: 200 });
    expect(posted).toEqual({ host: 'automancer.uk', key: INDEXNOW_KEY, keyLocation: `${SITE}${KEY_PATH}`, urlList: urls });
    expect(await submit({ urls, fetchImpl: engine(202) })).toMatchObject({ ok: true, status: 202 });
    expect(await submit({ urls, fetchImpl: engine(429) })).toMatchObject({ ok: true, warn: true });
    expect(await submit({ urls, fetchImpl: engine(503) })).toMatchObject({ ok: true, warn: true });
    expect(await submit({ urls, fetchImpl: engine(403) })).toMatchObject({ ok: false, status: 403 });
    // Without the key on production, nothing is posted: the engines would refuse it.
    posted = undefined;
    const noKey: Fetch = async (input, init) =>
      urlOf(input).includes(KEY_PATH) ? new Response('', { status: 404 }) : engine(200)(input, init);
    expect(await submit({ urls, fetchImpl: noKey })).toMatchObject({ ok: false });
    expect(posted).toBeUndefined();
    expect(await submit({ urls: ['https://example.com/'], fetchImpl: engine(200) })).toMatchObject({ ok: false });
  });
});
