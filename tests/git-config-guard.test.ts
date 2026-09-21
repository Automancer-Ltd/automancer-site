/**
 * `git config` inside a LINKED WORKTREE writes to the primary checkout's
 * shared config — silently. On 31 Aug 2026 an agent on this estate disarmed a
 * working checkout's hooks that way (see docs/PLAN.md item 4). The whole
 * hazard is that the write SUCCEEDS and lands somewhere you did not intend.
 *
 * scripts/safe-git-config.sh guards the write with the only test that matters:
 * `.git` a FILE means linked worktree (shared config); `.git` a DIRECTORY
 * means standalone clone (local config).
 *
 * These tests build three real fixtures in a temp dir — a standalone clone, a
 * real linked worktree made with `git worktree add`, and a bare directory —
 * and assert the guard classifies and refuses correctly. One test runs the
 * dangerous command BY HAND (the bypass) and asserts the write lands on the
 * primary's config: that is the proof the refusal is guarding something real,
 * not guarding against nothing.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const GUARD = join(__dirname, '..', 'scripts', 'safe-git-config.sh');

function git(cwd: string, args: string[]) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
}

function run(cwd: string, args: string[], env: Record<string, string> = {}) {
  return spawnSync(GUARD, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
}

/** A temp dir holding: standalone clone, primary repo + linked worktree, plain dir. */
function fixtures() {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'git-guard-')));
  git(base, ['init', '-q', 'standalone']);
  git(base, ['init', '-q', 'primary']);
  git(join(base, 'primary'), [
    '-c', 'user.email=t@t', '-c', 'user.name=t',
    'commit', '-qm', 'init', '--allow-empty',
  ]);
  git(join(base, 'primary'), ['worktree', 'add', '-q', join(base, 'linked')]);
  mkdirSync(join(base, 'plain'));
  return {
    standalone: join(base, 'standalone'),
    primary: join(base, 'primary'),
    linked: join(base, 'linked'),
    plain: join(base, 'plain'),
  };
}

describe('safe-git-config.sh', () => {
  it('classifies standalone clone, linked worktree and non-git dir correctly', () => {
    const f = fixtures();
    for (const [dir, text, code] of [
      [f.standalone, 'standalone', 0],
      [f.linked, 'linked-worktree', 1],
      [f.plain, 'not-git', 2],
    ] as const) {
      const r = run(dir, ['--classify']);
      expect(r.stdout.trim()).toBe(text);
      expect(r.status).toBe(code);
    }
  });

  it('passes config writes through in a standalone clone', () => {
    const f = fixtures();
    const r = run(f.standalone, ['guard.probe', 'kept']);
    expect(r.status).toBe(0);
    expect(git(f.standalone, ['config', 'guard.probe'])).toBe('kept');
  });

  it('refuses a config write in a linked worktree', () => {
    const f = fixtures();
    const r = run(f.linked, ['guard.probe', 'oops']);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('linked worktree');
    // And the primary's config really is untouched.
    const check = spawnSync('git', ['config', 'guard.probe'], {
      cwd: f.primary, encoding: 'utf8',
    });
    expect(check.status).not.toBe(0);
  });

  it('refuses outside any git repository', () => {
    const f = fixtures();
    const r = run(f.plain, ['guard.probe', 'x']);
    expect(r.status).toBe(2);
  });

  it('the bypass proves the hazard is real: a plain git config in the worktree writes the PRIMARY config', () => {
    const f = fixtures();
    // Bypassing the guard entirely — exactly what the 31 Aug incident was.
    git(f.linked, ['config', 'guard.probe', 'leaked']);
    // The value is readable from the linked worktree...
    expect(git(f.linked, ['config', 'guard.probe'])).toBe('leaked');
    // ...but it physically landed in the primary checkout's shared config,
    // which is why the guard refuses instead of warning-and-continuing.
    expect(git(f.primary, ['config', 'guard.probe'])).toBe('leaked');
  });

  it('honours the explicit env bypass for deliberate shared writes', () => {
    const f = fixtures();
    const r = run(f.linked, ['guard.probe', 'shared'], {
      ALLOW_LINKED_WORKTREE_CONFIG: '1',
    });
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('PRIMARY');
    expect(git(f.primary, ['config', 'guard.probe'])).toBe('shared');
  });
});
