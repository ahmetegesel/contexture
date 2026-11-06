import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sandbox } from '@support/sandbox';
import { fresh } from '@support/snapshot';
import { docs, gwWorkspace, stageSeed } from '../support/corpus';
import { git, gitCommit } from '../support/git';

let staged: string;
let gw: string;
let gwIgnored: string;
beforeAll(async () => {
  [staged, gw, gwIgnored] = await Promise.all([stageSeed('posix', 'gate-staged'), gwWorkspace('posix', 'gw-posix'), gwWorkspace('posix', 'gw-ignored', { ignoreCorpus: true })]);
});

const committed = async (from = gw): Promise<[string, string]> => {
  const sb = fresh(from);
  await git(sb, 'add', '-A');
  return [sb, await gitCommit(sb, 'h1', '--allow-empty')];
};

const codeChange = (sb: string): void => writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');

describe('the gate through ctx on posix', { concurrent: true }, () => {
  it('RS13 --test-matrix passes all 8 scenarios and leaves TMPDIR empty', async () => {
    const watch = sandbox('gate-tmp-watch');
    const r = await docs(fresh(staged), ['gate', '--test-matrix'], { env: { TMPDIR: watch } });
    expect(r.code, r.stdout.slice(-400)).toBe(0);
    expect(r.stdout).toContain('TEST MATRIX VERDICT: ALL 8 SCENARIOS PASSED');
    expect(readdirSync(watch)).toEqual([]);
  });

  it('S18 changes refuses on the files driver, naming git', async () => {
    const r = await docs(fresh(gw), ['changes']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('the corpus delta comes from git');
  });

  it('S19 git mode: a code change alone reads STALE once the doc is committed', async () => {
    const [sb] = await committed();
    codeChange(sb);
    const r = await docs(sb, ['gate']);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('STALE DOC: workspace/gw-unit');
  });

  it('S20 git mode: the doc file modified by the write rides git', async () => {
    const [sb] = await committed();
    codeChange(sb);
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH: workspace > gw-unit');
  });

  it('warns about a branch other than main', async () => {
    const [sb] = await committed();
    await git(sb, 'checkout', '-q', '-b', 'feature');
    const r = await docs(sb, ['gate']);
    expect(r.stderr).toMatch(/\[DRIFT WARNING\] \S+ is on branch 'feature' \(not main\)/);
  });

  it('--drift checks the incoming remote delta, and the gate warns how far behind the branch is', async () => {
    const [sb] = await committed();
    const remote = sandbox('gate-remote');
    await git(remote, 'init', '-q', '--bare', '-b', 'main');
    await git(sb, 'remote', 'add', 'origin', remote);
    await git(sb, 'push', '-q', 'origin', 'main');
    const parent = sandbox('gate-clone');
    await git(parent, 'clone', '-q', remote, 'clone');
    const other = join(parent, 'clone');
    writeFileSync(join(other, 'src/gw.sh'), 'echo incoming\n');
    await gitCommit(other, 'incoming', '-a');
    await git(other, 'push', '-q', 'origin', 'main');
    expect((await docs(sb, ['gate', '--drift'])).code).toBe(0);
    await git(sb, 'fetch', '-q', 'origin');
    const drift = await docs(sb, ['gate', '--drift']);
    expect(drift.code).toBe(1);
    expect(drift.stdout + drift.stderr).toContain('STALE DOC: workspace/gw-unit');
    const gate = await docs(sb, ['gate']);
    expect(gate.stderr).toMatch(/\[DRIFT WARNING\] \S+ is 1 commit\(s\) behind origin\/main/);
  });

  it('the default delta governs a shebang script and leaves a plain extensionless file out', async () => {
    const [sb] = await committed();
    writeFileSync(join(sb, 'src/tool'), '#!/bin/sh\necho tool\n');
    writeFileSync(join(sb, 'src/NOTES'), 'notes\n');
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout.match(/^UNCOVERED: .*$/gm)).toEqual(['UNCOVERED: src/tool']);
  });

  it('a clean tree reads 0 modified files and names its limit in a notice', async () => {
    const [sb] = await committed();
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe('docs-check: 0 modified files provided on stdin.\n');
    expect(r.stderr).toMatch(/^\[GATE NOTICE\] the delta is empty \(a clean tree\): .*ctx docs gate --since=<rev>/m);
  });
});

describe('the gate --since=<rev> on posix: the root repository from <rev> to the working tree', { concurrent: true }, () => {
  it('a code-only commit on a clean tree reads STALE', async () => {
    const [sb, h1] = await committed();
    codeChange(sb);
    await gitCommit(sb, 'h2', '-a');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code, r.stderr).toBe(1);
    expect(r.stdout).toContain('STALE DOC: workspace/gw-unit');
    expect(r.stderr).not.toContain('[GATE NOTICE]');
  });

  it('the doc in the same commit reads FRESH', async () => {
    const [sb, h1] = await committed();
    codeChange(sb);
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    await gitCommit(sb, 'h2', '-a');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH: workspace > gw-unit');
  });

  it('a rename in the range reads its old path as a dead source and its new path as uncovered', async () => {
    const [sb, h1] = await committed();
    await git(sb, 'mv', 'src/gw.sh', 'src/gw2.sh');
    await gitCommit(sb, 'h2');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('UNCOVERED: src/gw2.sh');
    expect(r.stdout).toContain("DEAD SOURCE: workspace/gw-unit still explicitly lists deleted file 'src/gw.sh'");
  });

  it('an untracked corpus reads UNTRACKED CLAIMANT and names the limit in a notice', async () => {
    const [sb, h1] = await committed(gwIgnored);
    codeChange(sb);
    await gitCommit(sb, 'h2', '-a');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('UNTRACKED CLAIMANT: workspace/gw-unit');
    expect(r.stdout).toContain('docs-check: CLEAN (PROCESS-OWNED)');
    expect(r.stderr).toMatch(/^\[GATE NOTICE\] the corpus is untracked here \(1 of 1 docs ignored by git\)/m);
  });

  it('an empty range names its limit in a notice', async () => {
    const [sb, h1] = await committed();
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe('docs-check: 0 modified files provided on stdin.\n');
    expect(r.stderr).toMatch(new RegExp(`^\\[GATE NOTICE\\] the delta since ${h1} is empty`, 'm'));
  });

  it('a child repository keeps its working delta, and the notice names it', async () => {
    const [sb, h1] = await committed();
    const child = join(sb, 'child');
    mkdirSync(child);
    writeFileSync(join(child, 'lib.sh'), 'echo lib\n');
    await git(child, 'init', '-q', '-b', 'main');
    await git(child, 'add', '-A');
    await gitCommit(child, 'c1');
    writeFileSync(join(child, 'lib.sh'), 'echo lib2\n');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('UNCOVERED: child/lib.sh');
    expect(r.stderr).toMatch(new RegExp(`^\\[GATE NOTICE\\] --since=${h1} reaches the workspace root's repository only; the child repositories \\(child\\) keep their working delta`, 'm'));
  });

  it.each([
    ['an unknown revision', ['--since=nosuch'], 'ctx docs gate: unknown revision: nosuch\n'],
    ['an empty revision', ['--since='], 'ctx docs gate: --since needs a revision (--since=<rev>)\n'],
    ['--since beside --stdin', ['--stdin', '--since=HEAD'], 'ctx docs gate: --since=<rev> takes no other argument (not --stdin, --drift, or --test-matrix)\n'],
    ['--since beside --drift', ['--since=HEAD', '--drift'], 'ctx docs gate: --since=<rev> takes no other argument (not --stdin, --drift, or --test-matrix)\n'],
  ])('refuses %s rc 1', async (_, args, message) => {
    const [sb] = await committed();
    const r = await docs(sb, ['gate', ...args]);
    expect([r.code, r.stderr]).toEqual([1, message]);
    expect(r.stdout).toBe('');
  });

  it('refuses --since outside a repository rc 1', async () => {
    const r = await docs(fresh(staged), ['gate', '--since=HEAD']);
    expect([r.code, r.stderr]).toEqual([1, 'ctx docs gate: --since needs the workspace to be a git repository with a commit\n']);
  });
});
