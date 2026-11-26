import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, type Run } from '@support/exec';
import { sandbox } from '@support/sandbox';
import { fresh, seed } from '@support/snapshot';
import { CORPUS, PLUGIN } from '../support/corpus';
import { git, gitCommit, gitInit } from '../support/git';

// the corpus's declared folder, never docs: the plain install keeps it in the drawer, and an
// install under the alias kb keeps it under kb, so every git path the check and the gate
// compare or build for the corpus translates between that folder and the logical address
// docs/<repo>/<slug>.md, split by source: the gate's git halves count a doc at its path under
// the folder alone, a caller's list at its logical address too

interface Install {
  name: string;
  verb: string;
  root: string;
  as: string[];
  ignore: (ignoreCorpus: boolean) => string;
}

const INSTALLS: Install[] = [
  {
    name: 'the plain install, its corpus in the drawer',
    verb: 'docs',
    root: CORPUS,
    as: [],
    ignore: (ignoreCorpus) => (ignoreCorpus ? '.contexture/\n' : `.contexture/*\n!/${CORPUS}/\n`),
  },
  {
    name: 'an alias install',
    verb: 'kb',
    root: 'kb',
    as: ['--as=docs=kb'],
    ignore: (ignoreCorpus) => (ignoreCorpus ? '.contexture/\n/kb/\n' : '.contexture/\n'),
  },
];

async function must(r: Promise<Run>, what: string): Promise<Run> {
  const run = await r;
  if (run.code !== 0) throw new Error(`${what}: rc ${run.code}: ${run.stderr}`);
  return run;
}

const head = async (sb: string): Promise<string> => (await git(sb, 'rev-parse', 'HEAD')).stdout.trim();

for (const install of INSTALLS) {
  const root = install.root;
  const verb = (sb: string, args: readonly string[], input = ''): Promise<Run> =>
    exec('./.contexture/ctx', [install.verb, ...args], { cwd: sb, input, env: { GIT_CEILING_DIRECTORIES: dirname(sb) } });

  const workspace = (label: string, ignoreCorpus: boolean): Promise<string> =>
    seed(async (sb) => {
      await must(exec('./.contexture/ctx', ['package', 'install', ...install.as, PLUGIN], { cwd: sb, env: { GIT_CEILING_DIRECTORIES: dirname(sb) } }), 'install');
      mkdirSync(join(sb, 'src'));
      writeFileSync(join(sb, 'src/gw.sh'), 'echo gw\n');
      writeFileSync(join(sb, 'src/notes.sh'), 'echo notes\n');
      mkdirSync(join(sb, 'docs/workspace'), { recursive: true });
      writeFileSync(join(sb, 'docs/workspace/gw-unit.md'), 'an adopter file at the logical address of a doc\n');
      writeFileSync(join(sb, '.gitignore'), install.ignore(ignoreCorpus));
      await must(verb(sb, ['new', 'workspace', 'gw-unit', '--kind=capability', '--description=the gw unit', '--sources=src/gw.sh', '--keywords=gw']), 'gw-unit');
      await must(verb(sb, ['new', 'workspace', 'notes', '--kind=capability', '--description=the notes unit', '--sources=src/notes.sh', '--keywords=notes']), 'notes');
      await gitInit(sb);
      await git(sb, 'add', '-A');
      await gitCommit(sb, 'h0');
    }, 'posix', `${install.verb}-${label}`);

  describe(`the corpus at a declared folder other than docs, ${install.name}`, { concurrent: true }, () => {
    let tracked: string;
    let ignored: string;
    beforeAll(async () => {
      [tracked, ignored] = await Promise.all([workspace('root-tracked', false), workspace('root-ignored', true)]);
    });

    it('[docs-module-r12, docs-module-r16] a tracked corpus reads STALE DOC on a code change alone and FRESH once its doc is written', async () => {
      const sb = fresh(tracked);
      expect((await git(sb, 'ls-files', `${root}/workspace/gw-unit.md`)).stdout).toBe(`${root}/workspace/gw-unit.md\n`);
      writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
      const stale = await verb(sb, ['gate']);
      expect(stale.code, stale.stdout + stale.stderr).toBe(1);
      expect(stale.stdout).toContain('STALE DOC: workspace/gw-unit');
      expect((await verb(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
      const fresh_ = await verb(sb, ['gate']);
      expect(fresh_.code, fresh_.stdout + fresh_.stderr).toBe(0);
      expect(fresh_.stdout).toContain('FRESH: workspace > gw-unit');
    });

    it('[docs-module-r14] an untracked corpus reads UNTRACKED CLAIMANT and the process-owned clean on a code change', async () => {
      const sb = fresh(ignored);
      expect((await git(sb, 'ls-files', root)).stdout).toBe('');
      writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
      const r = await verb(sb, ['gate']);
      expect(r.code, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain('UNTRACKED CLAIMANT: workspace/gw-unit');
      expect(r.stdout).toContain('docs-check: CLEAN (PROCESS-OWNED):');
    });

    it('[docs-module-r12] the check over a caller\'s stdin delta takes a doc at its path under the declared folder and at its logical address', async () => {
      const sb = fresh(tracked);
      for (const doc of [`${root}/workspace/gw-unit.md`, 'docs/workspace/gw-unit.md']) {
        const r = await verb(sb, ['check', 'workspace'], `M\tsrc/gw.sh\nM\t${doc}\n`);
        expect([doc, r.code], r.stdout + r.stderr).toEqual([doc, 0]);
        expect(r.stdout).toContain('FRESH: workspace > gw-unit (doc updated in change delta)');
      }
      const alone = await verb(sb, ['check', 'workspace'], 'M\tsrc/gw.sh\n');
      expect([alone.code, alone.stdout.includes('STALE DOC: workspace/gw-unit')]).toEqual([1, true]);
    });

    it('[docs-module-r12, docs-module-r14] an untracked doc beside a tracked claimant never rides: the tracked claimant keeps the delta rule', async () => {
      const sb = fresh(tracked);
      expect((await verb(sb, ['new', 'workspace', 'extra', '--kind=capability', '--description=the extra unit', '--sources=src/notes.sh', '--keywords=extra'])).code).toBe(0);
      writeFileSync(join(sb, 'src/notes.sh'), 'echo notes2\n');
      const r = await verb(sb, ['gate']);
      expect(r.code, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toMatch(/STALE DOC: .*workspace\/notes/);
      expect(r.stdout).not.toContain('FRESH: workspace > extra');
      expect(r.stdout).not.toContain('UNTRACKED CLAIMANT');
    });

    it('[docs-module-r16, docs-module-r17] --since counts the docs git does not track at the declared folder: none for a tracked corpus, every doc for an ignored one', async () => {
      const t = fresh(tracked);
      const t0 = await head(t);
      writeFileSync(join(t, 'src/gw.sh'), 'echo gw2\n');
      expect((await verb(t, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
      await gitCommit(t, 'h1', '-a');
      const tr = await verb(t, ['gate', `--since=${t0}`]);
      expect(tr.code, tr.stdout + tr.stderr).toBe(0);
      expect(tr.stdout).toContain('FRESH: workspace > gw-unit');
      expect(tr.stderr).not.toContain('the corpus is untracked here');
      const u = fresh(ignored);
      const u0 = await head(u);
      writeFileSync(join(u, 'src/gw.sh'), 'echo gw2\n');
      await gitCommit(u, 'h1', '-a');
      const ur = await verb(u, ['gate', `--since=${u0}`]);
      expect(ur.code, ur.stdout + ur.stderr).toBe(0);
      expect(ur.stderr).toMatch(/\[GATE NOTICE\] the corpus is untracked here \((\d+) of \1 docs not tracked by git\)/);
      expect(ur.stdout).toContain('UNTRACKED CLAIMANT: workspace/gw-unit');
    });

    it('[docs-module-r12] in the gate\'s git halves a tracked adopter file at a doc\'s logical address is an ordinary file, never the doc', async () => {
      const sb = fresh(tracked);
      writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
      writeFileSync(join(sb, 'docs/workspace/gw-unit.md'), 'the adopter file changed beside the code\n');
      const r = await verb(sb, ['gate']);
      expect(r.code, r.stdout + r.stderr).toBe(1);
      expect(r.stdout).toContain('STALE DOC: workspace/gw-unit');
      expect(r.stdout).not.toContain('FRESH: workspace > gw-unit');
    });

    it('[docs-module-r16, the-engine-r21] roots the storage core cannot list refuse the gate and the check rc 2 with the library\'s line', async () => {
      const sb = fresh(tracked);
      mkdirSync(join(sb, '.contexture/modules/broken'), { recursive: true });
      writeFileSync(join(sb, '.contexture/modules/broken/data'), 'root: /outside\nkey: <a>\n');
      const line = /^store\.roots: error: a module's data file cannot be read, so no root list is answered \(.+\) \(ERR_STORAGE_READ\)$/m;
      const gate = await verb(sb, ['gate']);
      expect([gate.code, gate.stdout]).toEqual([2, '']);
      expect(gate.stderr).toMatch(line);
      const check = await verb(sb, ['check', 'workspace'], 'M\tsrc/gw.sh\n');
      expect([check.code, check.stdout]).toEqual([2, '']);
      expect(check.stderr).toMatch(line);
    });
  });
}

describe('a declared folder holding a dollar sign and glob brackets', () => {
  const root = '.contexture/do$c[s]';
  const docs = (sb: string, args: readonly string[]): Promise<Run> =>
    exec('./.contexture/ctx', ['docs', ...args], { cwd: sb, env: { GIT_CEILING_DIRECTORIES: dirname(sb) } });

  it('[docs-module-r12, docs-module-r14, docs-module-r17] reaches git as its own bytes: the tracked claimant reads STALE DOC, then FRESH, and --since counts no untracked doc', async () => {
    const sb = await seed(async (s) => {
      const pkg = join(sandbox('docs-literal-root'), 'docs-discipline');
      cpSync(PLUGIN, pkg, { recursive: true, filter: (src) => src !== join(PLUGIN, 'tests') });
      writeFileSync(join(pkg, '.contexture/extensions/modules/docs/data'), `root: ${root}\nsuffix: .md\nkey: <repo>/<slug>\n`);
      await must(exec('./.contexture/ctx', ['package', 'install', pkg], { cwd: s, env: { GIT_CEILING_DIRECTORIES: dirname(s) } }), 'install');
      mkdirSync(join(s, 'src'));
      writeFileSync(join(s, 'src/gw.sh'), 'echo gw\n');
      writeFileSync(join(s, '.gitignore'), '.contexture/*\n!/.contexture/do$c\\[s\\]/\n');
      await must(docs(s, ['new', 'workspace', 'gw-unit', '--kind=capability', '--description=the gw unit', '--sources=src/gw.sh', '--keywords=gw']), 'gw-unit');
      await gitInit(s);
      await git(s, 'add', '-A');
      await gitCommit(s, 'h0');
    }, 'posix', 'literal-root');
    expect((await git(sb, 'ls-files', `:(literal)${root}`)).stdout).toContain(`${root}/workspace/gw-unit.md\n`);
    const h0 = await head(sb);
    writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
    const stale = await docs(sb, ['gate']);
    expect(stale.code, stale.stdout + stale.stderr).toBe(1);
    expect(stale.stdout).toContain('STALE DOC: workspace/gw-unit');
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    await gitCommit(sb, 'h1', '-a');
    const since = await docs(sb, ['gate', `--since=${h0}`]);
    expect(since.code, since.stdout + since.stderr).toBe(0);
    expect(since.stdout).toContain('FRESH: workspace > gw-unit');
    expect(since.stderr).not.toContain('the corpus is untracked here');
  });
});
