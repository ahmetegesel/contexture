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
  it('RS13 [docs-module-r16, docs-module-r25] --test-matrix passes all 8 scenarios and leaves TMPDIR empty', async () => {
    const watch = sandbox('gate-tmp-watch');
    const r = await docs(fresh(staged), ['gate', '--test-matrix'], { env: { TMPDIR: watch } });
    expect(r.code, r.stdout.slice(-400)).toBe(0);
    expect(r.stdout).toContain('TEST MATRIX VERDICT: ALL 8 SCENARIOS PASSED');
    expect(readdirSync(watch)).toEqual([]);
  });

  it('S18 [docs-module-r15] changes refuses on the files driver, naming git', async () => {
    const r = await docs(fresh(gw), ['changes']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('the corpus delta comes from git');
  });

  it('S19 [docs-module-r16] git mode: a code change alone reads STALE once the doc is committed', async () => {
    const [sb] = await committed();
    codeChange(sb);
    const r = await docs(sb, ['gate']);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('STALE DOC: workspace/gw-unit');
  });

  it('S20 [docs-module-r15, docs-module-r16] git mode: the doc file modified by the write rides git', async () => {
    const [sb] = await committed();
    codeChange(sb);
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH: workspace > gw-unit');
  });

  it('[docs-module-r16, docs-module-r17] warns about a branch other than main', async () => {
    const [sb] = await committed();
    await git(sb, 'checkout', '-q', '-b', 'feature');
    const r = await docs(sb, ['gate']);
    expect(r.stderr).toMatch(/\[DRIFT WARNING\] \S+ is on branch 'feature' \(not main\)/);
  });

  it('[docs-module-r16, docs-module-r17] --drift checks the incoming remote delta, and the gate warns how far behind the branch is', async () => {
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

  it('[docs-module-r10] the default delta governs a shebang script and leaves a plain extensionless file out', async () => {
    const [sb] = await committed();
    writeFileSync(join(sb, 'src/tool'), '#!/bin/sh\necho tool\n');
    writeFileSync(join(sb, 'src/NOTES'), 'notes\n');
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout.match(/^UNCOVERED: .*$/gm)).toEqual(['UNCOVERED: src/tool']);
  });

  it('[docs-module-r17] a clean tree reads 0 modified files and names its limit in a notice', async () => {
    const [sb] = await committed();
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe('docs-check: 0 modified files provided on stdin.\n');
    expect(r.stderr).toMatch(/^\[GATE NOTICE\] the delta is empty \(a clean tree\): .*ctx docs gate --since=<rev>/m);
  });

  it('[docs-module-r16] the default delta reads a non-ASCII path byte for byte, at the root and in a child repository, as its plain twin', async () => {
    const [sb] = await committed();
    writeFileSync(join(sb, 'src/café.sh'), 'echo cafe\n');
    writeFileSync(join(sb, 'src/plain.sh'), 'echo plain\n');
    const child = join(sb, 'child');
    mkdirSync(child);
    writeFileSync(join(child, 'lib.sh'), 'echo lib\n');
    await git(child, 'init', '-q', '-b', 'main');
    await git(child, 'add', '-A');
    await gitCommit(child, 'c1');
    writeFileSync(join(child, 'naïve.sh'), 'echo naive\n');
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout.match(/^UNCOVERED: .*$/gm)?.sort()).toEqual(['UNCOVERED: child/naïve.sh', 'UNCOVERED: src/café.sh', 'UNCOVERED: src/plain.sh']);
  });

  it('[docs-module-r16, docs-module-r17] a path with a quote and a backslash reads right, and a path with a tab is named in a notice', async () => {
    const [sb] = await committed();
    writeFileSync(join(sb, 'src/q"b\\c.sh'), 'echo q\n');
    writeFileSync(join(sb, 'src/t\tb.sh'), 'echo t\n');
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout.match(/^UNCOVERED: .*$/gm)).toEqual(['UNCOVERED: src/q"b\\c.sh']);
    expect(r.stderr).toMatch(/^\[GATE NOTICE\] 1 delta path\(s\) hold a control character \(a tab, a newline\) that a status line cannot carry; the check does not read them: "src\/t\\tb\.sh"$/m);
  });

  it('[docs-module-r16] --stdin reads a path git quotes in the caller delta', async () => {
    const [sb] = await committed();
    const r = await docs(sb, ['gate', '--stdin'], { input: 'A\t"src/caf\\303\\251.sh"\n' });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('UNCOVERED: src/café.sh');
  });

  it('[docs-module-r16] --drift reads an incoming non-ASCII path byte for byte', async () => {
    const [sb] = await committed();
    const remote = sandbox('gate-remote-quoted');
    await git(remote, 'init', '-q', '--bare', '-b', 'main');
    await git(sb, 'remote', 'add', 'origin', remote);
    await git(sb, 'push', '-q', 'origin', 'main');
    const parent = sandbox('gate-clone-quoted');
    await git(parent, 'clone', '-q', remote, 'clone');
    const other = join(parent, 'clone');
    writeFileSync(join(other, 'src/café.sh'), 'echo incoming\n');
    await git(other, 'add', '-A');
    await gitCommit(other, 'incoming');
    await git(other, 'push', '-q', 'origin', 'main');
    await git(sb, 'fetch', '-q', 'origin');
    const r = await docs(sb, ['gate', '--drift']);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('UNCOVERED: src/café.sh');
  });

  it('[docs-module-r16] an untracked, unignored corpus doc rides no working delta: its claimed file reads UNTRACKED CLAIMANT, as an ignored one does', async () => {
    const sb = fresh(gw);
    codeChange(sb);
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('UNTRACKED CLAIMANT: workspace/gw-unit');
    expect(r.stdout).toContain('docs-check: CLEAN (PROCESS-OWNED)');
    expect(r.stdout).not.toContain('FRESH: workspace > gw-unit');
  });
});

describe('the gate --since=<rev> on posix: the root repository from <rev> to the working tree', { concurrent: true }, () => {
  it('[docs-module-r16] a code-only commit on a clean tree reads STALE', async () => {
    const [sb, h1] = await committed();
    codeChange(sb);
    await gitCommit(sb, 'h2', '-a');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code, r.stderr).toBe(1);
    expect(r.stdout).toContain('STALE DOC: workspace/gw-unit');
    expect(r.stderr).not.toContain('[GATE NOTICE]');
  });

  it('[docs-module-r16] the doc in the same commit reads FRESH', async () => {
    const [sb, h1] = await committed();
    codeChange(sb);
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    await gitCommit(sb, 'h2', '-a');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH: workspace > gw-unit');
  });

  it('[docs-module-r8, docs-module-r9] a rename in the range reads its old path as a dead source and its new path as uncovered', async () => {
    const [sb, h1] = await committed();
    await git(sb, 'mv', 'src/gw.sh', 'src/gw2.sh');
    await gitCommit(sb, 'h2');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('UNCOVERED: src/gw2.sh');
    expect(r.stdout).toContain("DEAD SOURCE: workspace/gw-unit still explicitly lists deleted file 'src/gw.sh'");
  });

  it('[docs-module-r14, docs-module-r17] an untracked corpus reads UNTRACKED CLAIMANT and names the limit in a notice', async () => {
    const [sb, h1] = await committed(gwIgnored);
    codeChange(sb);
    await gitCommit(sb, 'h2', '-a');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('UNTRACKED CLAIMANT: workspace/gw-unit');
    expect(r.stdout).toContain('docs-check: CLEAN (PROCESS-OWNED)');
    expect(r.stderr).toMatch(/^\[GATE NOTICE\] the corpus is untracked here \(1 of 1 docs not tracked by git\)/m);
  });

  it('[docs-module-r16, docs-module-r17] an untracked corpus git does not ignore reads as the ignored corpus does: UNTRACKED CLAIMANT, the process-owned clean, and the notice', async () => {
    const sb = fresh(gw);
    const h1 = await gitCommit(sb, 'h1', '--allow-empty');
    codeChange(sb);
    await gitCommit(sb, 'h2', '-a');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('UNTRACKED CLAIMANT: workspace/gw-unit');
    expect(r.stdout).toContain('docs-check: CLEAN (PROCESS-OWNED)');
    expect(r.stdout).not.toContain('FRESH: workspace > gw-unit');
    expect(r.stderr).toMatch(/^\[GATE NOTICE\] the corpus is untracked here \(1 of 1 docs not tracked by git\)/m);
  });

  it('[docs-module-r16] a committed non-ASCII change reads STALE DOC as its plain twin does', async () => {
    const [sb] = await committed();
    writeFileSync(join(sb, 'src/café.sh'), 'echo cafe\n');
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-source=src/café.sh'])).code).toBe(0);
    await git(sb, 'add', '-A');
    const h2 = await gitCommit(sb, 'h2');
    writeFileSync(join(sb, 'src/café.sh'), 'echo cafe2\n');
    codeChange(sb);
    await gitCommit(sb, 'h3', '-a');
    const r = await docs(sb, ['gate', `--since=${h2}`]);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout.match(/^ {2}file: .*$/gm)?.sort()).toEqual(['  file: src/café.sh', '  file: src/gw.sh']);
  });

  it('[docs-module-r17] an empty range names its limit in a notice', async () => {
    const [sb, h1] = await committed();
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe('docs-check: 0 modified files provided on stdin.\n');
    expect(r.stderr).toMatch(new RegExp(`^\\[GATE NOTICE\\] the delta since ${h1} is empty`, 'm'));
  });

  it('[docs-module-r16, docs-module-r17] a child repository keeps its working delta, and the notice names it', async () => {
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
  ])('[docs-module-r16] refuses %s rc 1', async (_, args, message) => {
    const [sb] = await committed();
    const r = await docs(sb, ['gate', ...args]);
    expect([r.code, r.stderr]).toEqual([1, message]);
    expect(r.stdout).toBe('');
  });

  it('[docs-module-r16] refuses --since outside a repository rc 1', async () => {
    const r = await docs(fresh(staged), ['gate', '--since=HEAD']);
    expect([r.code, r.stderr]).toEqual([1, 'ctx docs gate: --since needs the workspace to be a git repository with a commit\n']);
  });
});
