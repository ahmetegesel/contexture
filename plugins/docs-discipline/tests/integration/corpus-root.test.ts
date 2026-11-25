import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, type Run } from '@support/exec';
import { fresh, seed } from '@support/snapshot';
import { PLUGIN } from '../support/corpus';
import { git, gitCommit, gitInit } from '../support/git';

// the corpus's declared folder: the docs module installed under the alias kb stores its corpus
// under kb, never docs, so every git path the check and the gate compare or build for the
// corpus translates between that folder and the logical address docs/<repo>/<slug>.md, split
// by source: the gate's git halves count a doc at its path under kb alone, a caller's list
// at its logical address too

const kb = (sb: string, args: readonly string[], input = ''): Promise<Run> =>
  exec('./.contexture/ctx', ['kb', ...args], { cwd: sb, input, env: { GIT_CEILING_DIRECTORIES: dirname(sb) } });

async function must(r: Promise<Run>, what: string): Promise<Run> {
  const run = await r;
  if (run.code !== 0) throw new Error(`${what}: rc ${run.code}: ${run.stderr}`);
  return run;
}

function aliasWorkspace(label: string, ignoreCorpus: boolean): Promise<string> {
  return seed(async (sb) => {
    await must(exec('./.contexture/ctx', ['package', 'install', '--as=docs=kb', PLUGIN], { cwd: sb, env: { GIT_CEILING_DIRECTORIES: dirname(sb) } }), 'install');
    mkdirSync(join(sb, 'src'));
    writeFileSync(join(sb, 'src/gw.sh'), 'echo gw\n');
    writeFileSync(join(sb, 'src/notes.sh'), 'echo notes\n');
    mkdirSync(join(sb, 'docs/workspace'), { recursive: true });
    writeFileSync(join(sb, 'docs/workspace/gw-unit.md'), 'an adopter file at the logical address of a doc\n');
    writeFileSync(join(sb, '.gitignore'), ignoreCorpus ? '.contexture/\n/kb/\n' : '.contexture/\n');
    await must(kb(sb, ['new', 'workspace', 'gw-unit', '--kind=capability', '--description=the gw unit', '--sources=src/gw.sh', '--keywords=gw']), 'gw-unit');
    await must(kb(sb, ['new', 'workspace', 'notes', '--kind=capability', '--description=the notes unit', '--sources=src/notes.sh', '--keywords=notes']), 'notes');
    await gitInit(sb);
    await git(sb, 'add', '-A');
    await gitCommit(sb, 'h0');
  }, 'posix', label);
}

const head = async (sb: string): Promise<string> => (await git(sb, 'rev-parse', 'HEAD')).stdout.trim();

describe('the corpus at a declared folder other than docs, under an alias install', { concurrent: true }, () => {
  let tracked: string;
  let ignored: string;
  beforeAll(async () => {
    [tracked, ignored] = await Promise.all([aliasWorkspace('root-tracked', false), aliasWorkspace('root-ignored', true)]);
  });

  it('[docs-module-r12, docs-module-r16] a tracked corpus under the alias reads STALE DOC on a code change alone and FRESH once its doc is written', async () => {
    const sb = fresh(tracked);
    expect((await git(sb, 'ls-files', 'kb/workspace/gw-unit.md')).stdout).toBe('kb/workspace/gw-unit.md\n');
    writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
    const stale = await kb(sb, ['gate']);
    expect(stale.code, stale.stdout + stale.stderr).toBe(1);
    expect(stale.stdout).toContain('STALE DOC: workspace/gw-unit');
    expect((await kb(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    const fresh_ = await kb(sb, ['gate']);
    expect(fresh_.code, fresh_.stdout + fresh_.stderr).toBe(0);
    expect(fresh_.stdout).toContain('FRESH: workspace > gw-unit');
  });

  it('[docs-module-r12] the check over a caller\'s stdin delta takes a doc at its path under the declared folder and at its logical address', async () => {
    const sb = fresh(tracked);
    for (const doc of ['kb/workspace/gw-unit.md', 'docs/workspace/gw-unit.md']) {
      const r = await kb(sb, ['check', 'workspace'], `M\tsrc/gw.sh\nM\t${doc}\n`);
      expect([doc, r.code], r.stdout + r.stderr).toEqual([doc, 0]);
      expect(r.stdout).toContain('FRESH: workspace > gw-unit (doc updated in change delta)');
    }
    const alone = await kb(sb, ['check', 'workspace'], 'M\tsrc/gw.sh\n');
    expect([alone.code, alone.stdout.includes('STALE DOC: workspace/gw-unit')]).toEqual([1, true]);
  });

  it('[docs-module-r12, docs-module-r14] an untracked doc beside a tracked claimant never rides: the tracked claimant keeps the delta rule', async () => {
    const sb = fresh(tracked);
    expect((await kb(sb, ['new', 'workspace', 'extra', '--kind=capability', '--description=the extra unit', '--sources=src/notes.sh', '--keywords=extra'])).code).toBe(0);
    writeFileSync(join(sb, 'src/notes.sh'), 'echo notes2\n');
    const r = await kb(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toMatch(/STALE DOC: .*workspace\/notes/);
    expect(r.stdout).not.toContain('FRESH: workspace > extra');
    expect(r.stdout).not.toContain('UNTRACKED CLAIMANT');
  });

  it('[docs-module-r16, docs-module-r17] --since counts the docs git does not track at the declared folder: none for a tracked corpus, every doc for an ignored one', async () => {
    const t = fresh(tracked);
    const t0 = await head(t);
    writeFileSync(join(t, 'src/gw.sh'), 'echo gw2\n');
    expect((await kb(t, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    await gitCommit(t, 'h1', '-a');
    const tr = await kb(t, ['gate', `--since=${t0}`]);
    expect(tr.code, tr.stdout + tr.stderr).toBe(0);
    expect(tr.stdout).toContain('FRESH: workspace > gw-unit');
    expect(tr.stderr).not.toContain('the corpus is untracked here');
    const u = fresh(ignored);
    const u0 = await head(u);
    writeFileSync(join(u, 'src/gw.sh'), 'echo gw2\n');
    await gitCommit(u, 'h1', '-a');
    const ur = await kb(u, ['gate', `--since=${u0}`]);
    expect(ur.code, ur.stdout + ur.stderr).toBe(0);
    expect(ur.stderr).toMatch(/\[GATE NOTICE\] the corpus is untracked here \((\d+) of \1 docs not tracked by git\)/);
    expect(ur.stdout).toContain('UNTRACKED CLAIMANT: workspace/gw-unit');
  });

  it('[docs-module-r12] in the gate\'s git halves a tracked adopter file at a doc\'s logical address is an ordinary file, never the doc', async () => {
    const sb = fresh(tracked);
    writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
    writeFileSync(join(sb, 'docs/workspace/gw-unit.md'), 'the adopter file changed beside the code\n');
    const r = await kb(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('STALE DOC: workspace/gw-unit');
    expect(r.stdout).not.toContain('FRESH: workspace > gw-unit');
  });

  it('[docs-module-r16, the-engine-r21] roots the storage core cannot list refuse the gate and the check rc 2 with the library\'s line', async () => {
    const sb = fresh(tracked);
    mkdirSync(join(sb, '.contexture/modules/broken'), { recursive: true });
    writeFileSync(join(sb, '.contexture/modules/broken/data'), 'root: /outside\nkey: <a>\n');
    const line = /^store\.roots: error: a module's data file cannot be read, so no root list is answered \(.+\) \(ERR_STORAGE_READ\)$/m;
    const gate = await kb(sb, ['gate']);
    expect([gate.code, gate.stdout]).toEqual([2, '']);
    expect(gate.stderr).toMatch(line);
    const check = await kb(sb, ['check', 'workspace'], 'M\tsrc/gw.sh\n');
    expect([check.code, check.stdout]).toEqual([2, '']);
    expect(check.stderr).toMatch(line);
  });
});
