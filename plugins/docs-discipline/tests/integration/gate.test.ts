import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sandbox } from '@support/sandbox';
import { fresh } from '@support/snapshot';
import { docs, gwWorkspace, stageSeed } from '../support/corpus';
import { git, gitCommit } from '../support/git';

let staged: string;
let gw: string;
beforeAll(async () => {
  [staged, gw] = await Promise.all([stageSeed('posix', 'gate-staged'), gwWorkspace('posix', 'gw-posix')]);
});

const committed = async (): Promise<string> => {
  const sb = fresh(gw);
  await git(sb, 'add', '-A');
  await gitCommit(sb, 'h1');
  return sb;
};

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
    const sb = await committed();
    writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
    const r = await docs(sb, ['gate']);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('STALE DOC: workspace/gw-unit');
  });

  it('S20 git mode: the doc file modified by the write rides git', async () => {
    const sb = await committed();
    writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH: workspace > gw-unit');
  });

  it('warns about a branch other than main', async () => {
    const sb = await committed();
    await git(sb, 'checkout', '-q', '-b', 'feature');
    const r = await docs(sb, ['gate']);
    expect(r.stderr).toMatch(/\[DRIFT WARNING\] \S+ is on branch 'feature' \(not main\)/);
  });

  it('--drift checks the incoming remote delta, and the gate warns how far behind the branch is', async () => {
    const sb = await committed();
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
});
