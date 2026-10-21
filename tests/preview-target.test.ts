/**
 * The preview target's own guarantees — the properties docs/DEPLOYMENT.md
 * promises a rehearsal can rely on.
 *
 * These are the four claims that make the target safe to rehearse against:
 *   1. it refuses to sit on a public web port;
 *   2. a release is only servable once `mark` has stamped it;
 *   3. an unmarked root serves a placeholder, never a site;
 *   4. what it does serve carries noindex and reports its own revision.
 *
 * The tests drive the real server and the real marker on a temporary fixture,
 * not a mock, because the thing that must hold in an incident is the behaviour
 * of the code systemd actually starts.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  BANNER_ID,
  STAMP_FILE,
  markHtml,
  markRelease,
  readPort,
  startServer,
} from '../ops/preview/preview.mjs';

const SHA = 'a'.repeat(40);
const servers: Server[] = [];
const dirs: string[] = [];

async function fixture({ marked }: { marked: boolean }) {
  const dir = await mkdtemp(join(tmpdir(), 'site-preview-test-'));
  dirs.push(dir);
  await mkdir(join(dir, 'services'), { recursive: true });
  await writeFile(
    join(dir, 'index.html'),
    '<!DOCTYPE html><html lang="en-GB"><head><title>Automancer</title></head><body><span>build:</span><b>abcdef0</b></body></html>',
  );
  await writeFile(join(dir, 'services', 'index.html'), '<html><body>services</body></html>');
  await writeFile(join(dir, '404.html'), '<html><body>not found here</body></html>');
  if (marked) {
    await markRelease(dir, { ref: 'preview/rehearsal', sha: SHA, url: 'http://example.invalid' });
  }
  const server = await startServer({ root: dir, host: '127.0.0.1', port: 0, silent: true });
  servers.push(server);
  const { port } = server.address() as AddressInfo;
  return { dir, url: `http://127.0.0.1:${port}` };
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((done) => s.close(() => done()))),
  );
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('preview target port', () => {
  it('refuses a public web port and anything privileged', () => {
    expect(() => readPort('443', 4174)).toThrow(/public web port/);
    expect(() => readPort('80', 4174)).toThrow(/public web port/);
    expect(() => readPort('1023', 4174)).toThrow(/1024\.\.65535/);
    expect(() => readPort('70000', 4174)).toThrow(/1024\.\.65535/);
    expect(readPort('4174', 4174)).toBe(4174);
    expect(readPort(undefined, 4174)).toBe(4174);
    expect(readPort('0', 4174)).toBe(0);
  });
});

describe('marking a release', () => {
  it('stamps noindex and a visible banner into every html file, idempotently', async () => {
    const html = '<html><head><title>t</title></head><body><h1>hi</h1></body></html>';
    const stamp = { ref: 'preview/x', short: 'abc1234' };
    const once = markHtml(html, stamp);
    expect(once).toContain('<meta name="robots" content="noindex, nofollow, noarchive">');
    expect(once).toContain(BANNER_ID);
    expect(once).toContain('PREVIEW TARGET');
    expect(once.indexOf('<meta name="robots"')).toBeLessThan(once.indexOf('<body'));
    expect(markHtml(once, stamp)).toBe(once);
  });

  it('writes the marker the server requires, naming the ref and revision', async () => {
    const { dir } = await fixture({ marked: true });
    const stamp = JSON.parse(await readFile(join(dir, STAMP_FILE), 'utf8'));
    expect(stamp.target).toBe('automancer-site-preview');
    expect(stamp.ref).toBe('preview/rehearsal');
    expect(stamp.sha).toBe(SHA);
    expect(stamp.short).toBe('aaaaaaa');
    expect(await readFile(join(dir, 'index.html'), 'utf8')).toContain(BANNER_ID);
  });

  it('refuses a directory with no built pages', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'site-preview-empty-'));
    dirs.push(dir);
    await expect(markRelease(dir, { ref: 'preview/x', sha: SHA })).rejects.toThrow(/no \*\.html/);
  });
});

describe('serving a marked release', () => {
  it('answers with noindex, the banner, and a real 404 body', async () => {
    const { url } = await fixture({ marked: true });
    const home = await fetch(`${url}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get('x-robots-tag')).toBe('noindex, nofollow, noarchive');
    expect(home.headers.get('cache-control')).toContain('no-store');
    expect(home.headers.get('x-preview-target')).toBe('preview/rehearsal@aaaaaaa');
    expect(await home.text()).toContain(BANNER_ID);

    const missing = await fetch(`${url}/definitely-not-a-page`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain('not found here');
  });

  it('redirects directory paths the way GitHub Pages does', async () => {
    const { url } = await fixture({ marked: true });
    const hop = await fetch(`${url}/services`, { redirect: 'manual' });
    expect(hop.status).toBe(301);
    expect(hop.headers.get('location')).toBe('/services/');
    const direct = await fetch(`${url}/services/`);
    expect(direct.status).toBe(200);
    expect(await direct.text()).toContain('services');
  });

  it('keeps redirects on its own origin and survives a hostile path', async () => {
    const { url } = await fixture({ marked: true });
    // Decodes to `//evil.example/../services`: a Location built from the
    // decoded path sent browsers to evil.example.
    const hop = await fetch(`${url}/%2Fevil.example%2F..%2Fservices`, { redirect: 'manual' });
    expect(hop.status).toBe(301);
    expect(hop.headers.get('location')).toMatch(/^\/[^/]/);
    // Decodes to a character writeHead cannot put in a header; it crashed the process.
    await fetch(`${url}/%C4%80%2F..%2Fservices`, { redirect: 'manual' });
    expect((await fetch(`${url}/`)).status).toBe(200);
  });

  it('never escapes its root', async () => {
    const { url } = await fixture({ marked: true });
    for (const path of ['/../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/..%2fetc%2fpasswd']) {
      const res = await fetch(`${url}${path}`);
      expect(res.status).toBe(404);
      expect(await res.text()).not.toContain('root:');
    }
  });
});

describe('serving an unmarked root', () => {
  it('serves a placeholder instead of a site', async () => {
    const { url } = await fixture({ marked: false });
    const home = await fetch(`${url}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain('preview target');
    expect(home.headers.get('x-preview-target')).toBe('placeholder');
    const page = await fetch(`${url}/services/`);
    expect(page.status).toBe(404);
    expect(await page.text()).not.toContain('services');
  });

  // `current` is a symlink that deploy-preview.sh flips after a release is
  // published, so a release must take effect without restarting the service.
  it('picks up a release published after the server started', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'site-preview-late-'));
    dirs.push(dir);
    await writeFile(
      join(dir, 'index.html'),
      '<html><body><span>build:</span><b>abcdef0</b></body></html>',
    );
    const server = await startServer({ root: dir, host: '127.0.0.1', port: 0, silent: true });
    servers.push(server);
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    expect(await (await fetch(`${url}/`)).text()).toContain('preview target');

    await markRelease(dir, { ref: 'preview/late', sha: SHA });

    const res = await fetch(`${url}/`);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(res.headers.get('x-preview-target')).toBe('preview/late@aaaaaaa');
    expect(body).toContain(BANNER_ID);
    expect(body).toContain('abcdef0');
  });
});
