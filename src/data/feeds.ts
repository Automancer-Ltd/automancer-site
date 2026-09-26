/**
 * Feed generators shared by /work and /field-notes.
 * RSS 2.0 (full content) and JSON Feed 1.1.
 */
import { business } from './business';
import { getStudies, getNotes } from './site-content';

export interface FeedItem {
  slug: string;
  path: string;
  title: string;
  description: string;
  date: Date;
  /** Full content — raw Markdown, never an excerpt. */
  body: string;
}

/** Feed items for the case-study collection (/work), index order. */
export async function studyFeedItems(): Promise<FeedItem[]> {
  const studies = await getStudies();
  return studies.map((e) => {
    const parts: string[] = [];
    if (e.data.subhead) parts.push(e.data.subhead, '');
    if (e.data.stats.length > 0) parts.push(...e.data.stats.map((s) => `- **${s.v}** — ${s.l}`), '');
    parts.push(e.body ?? '');
    return {
      slug: e.id,
      path: `/work/${e.id}`,
      title: e.data.headline ?? e.data.title,
      description: e.data.description,
      date: e.data.date,
      body: parts.join('\n').trim() + '\n',
    };
  });
}

/** Feed items for the field-notes collection, newest first. */
export async function noteFeedItems(): Promise<FeedItem[]> {
  const notes = await getNotes();
  return notes.map((e) => ({
    slug: e.id,
    path: `/field-notes/${e.id}`,
    title: e.data.title,
    description: e.data.description,
    date: e.data.date,
    body: (e.body ?? '').trim() + '\n',
  }));
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const escCdata = (s: string) => s.replace(/]]>/g, ']]]]><![CDATA[>');

export function rssFeed(opts: {
  collectionTitle: string;
  collectionPath: string;
  items: FeedItem[];
}): string {
  const feedUrl = new URL(`${opts.collectionPath}rss.xml`, business.url).toString();
  const channel = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${esc(`${business.tradingName} — ${opts.collectionTitle}`)}</title>`,
    `<link>${esc(new URL(opts.collectionPath, business.url).toString())}</link>`,
    `<description>${esc(business.description)}</description>`,
    '<language>en-gb</language>',
    `<atom:link href="${esc(feedUrl)}" rel="self" type="application/rss+xml" />`,
  ];
  for (const item of opts.items) {
    channel.push(
      '<item>',
      `<title>${esc(item.title)}</title>`,
      `<link>${esc(new URL(item.path, business.url).toString())}</link>`,
      `<guid>${esc(new URL(item.path, business.url).toString())}</guid>`,
      `<pubDate>${item.date.toUTCString()}</pubDate>`,
      `<description>${esc(item.description)}</description>`,
      `<content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><![CDATA[${escCdata(item.body)}]]></content:encoded>`,
      '</item>'
    );
  }
  channel.push('</channel>', '</rss>');
  return channel.join('\n');
}

export function jsonFeed(opts: {
  collectionTitle: string;
  collectionPath: string;
  items: FeedItem[];
}): object {
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: `${business.tradingName} — ${opts.collectionTitle}`,
    home_page_url: business.url,
    feed_url: new URL(`${opts.collectionPath}feed.json`, business.url).toString(),
    description: business.description,
    language: 'en-GB',
    authors: [{ name: 'Waseem Ilyas', url: new URL('/about', business.url).toString() }],
    items: opts.items.map((item) => ({
      id: new URL(item.path, business.url).toString(),
      url: new URL(item.path, business.url).toString(),
      title: item.title,
      summary: item.description,
      // Raw Markdown is plain-text-safe; full content, not an excerpt.
      content_text: item.body,
      date_published: item.date.toISOString(),
    })),
  };
}
