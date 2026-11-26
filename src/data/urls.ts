/**
 * URL normalisation — the ONE definition of this site's page URLs.
 *
 * Static pages are emitted as directories (build.format 'directory'), so a
 * page's canonical form carries a trailing slash (/services/, not /services);
 * file-like routes (.md, .xml, .json, .txt) never do. Every consumer —
 * <link rel=canonical>, JSON-LD @ids, API payloads, Markdown twins,
 * llms-full.txt, feeds — normalises through here so they cannot disagree.
 */
import { business } from './business';

/** Normalise a path to the site's canonical page-path form. */
export function pagePath(path: string): string {
  if (path === '/' || path === '') return '/';
  const last = path.split('/').pop() ?? '';
  if (last.includes('.')) return path; // file-like route: keep exactly as-is
  return path.endsWith('/') ? path : `${path}/`;
}

/** Absolute canonical URL for a path. */
export function abs(path: string): string {
  return new URL(pagePath(path), business.url).toString();
}

/** Absolute URL for a link that may carry a query or fragment (`/contact/#service=…`), the path normalised as abs() does. */
export function absHref(href: string): string {
  const at = href.search(/[?#]/);
  return at < 0 ? abs(href) : abs(href.slice(0, at)) + href.slice(at);
}
