import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, type Run } from '@support/exec';
import { sandbox } from '@support/sandbox';
import { fresh, seed } from '@support/snapshot';
import { sqliteAvailable } from '@support/stage';
import { CORPUS, docs, PLUGIN, SAMPLE } from '../support/corpus';
import { git, gitCommit, gitInit } from '../support/git';

// the docs namespace rooted in the drawer: an adopter's own docs folder is never the corpus,
// and the one time move of a corpus written at the old root docs, guarded by the install hook
// until the move is done

const ctx = (sb: string, args: readonly string[]): Promise<Run> =>
  exec('./.contexture/ctx', args, { cwd: sb, env: { GIT_CEILING_DIRECTORIES: dirname(sb) } });

const install = (sb: string, pkg: string = PLUGIN): Promise<Run> => ctx(sb, ['package', 'install', pkg]);

async function must(r: Promise<Run>, what: string): Promise<Run> {
  const run = await r;
  if (run.code !== 0) throw new Error(`${what}: rc ${run.code}: ${run.stdout}${run.stderr}`);
  return run;
}

// the package as an earlier release shipped it: the same module, its corpus at root docs
function oldPackage(): string {
  const pkg = join(sandbox('docs-old-root'), 'docs-discipline');
  cpSync(PLUGIN, pkg, { recursive: true, filter: (src) => src !== join(PLUGIN, 'tests') });
  writeFileSync(join(pkg, '.contexture/extensions/modules/docs/data'), 'root: docs\nsuffix: .md\nkey: <repo>/<slug>\n');
  return pkg;
}

function files(dir: string, base = dir): Record<string, string> {
  if (!existsSync(dir)) return {};
  const out: Record<string, string> = {};
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) Object.assign(out, files(path, base));
    else out[path.slice(base.length + 1)] = readFileSync(path, 'utf8');
  }
  return out;
}

async function views(sb: string): Promise<Record<string, string>> {
  const index = await must(docs(sb, ['query', '--index']), 'index');
  const out: Record<string, string> = { index: index.stdout };
  for (const line of index.stdout.split('\n').filter((l) => !l.startsWith('index complete') && l.trim())) {
    const [repo, slug] = line.split(/\s+/);
    out[`${repo}/${slug}`] = (await must(docs(sb, ['query', repo, slug]), `${repo}/${slug}`)).stdout;
  }
  return out;
}

const MOVE = 'test ! -e .contexture/docs/workspace && mkdir -p .contexture/docs && mv docs/workspace .contexture/docs/';
const HOOK_REFUSAL = /^docs install: the corpus still sits at its old place \(docs\/<repo>\/ for (.+)\) while the corpus this module serves holds no doc; move each of those folders once, as docs\/adoption\.md \(Updating\) shows, then install again$/m;

describe('the docs namespace rooted in the drawer, beside an adopter\'s own docs folder', () => {
  it('[docs-module-r2, docs-module-r5] a tracked guide and an adopter\'s nested pages are never corpus docs, keys, or strays', async () => {
    const sb = await seed(async (s) => {
      await must(install(s), 'install');
      mkdirSync(join(s, 'src'));
      writeFileSync(join(s, 'src/demo.sh'), '#!/bin/sh\necho demo\n');
      await must(docs(s, ['new', 'workspace', 'demo', '--kind=capability', '--description=The demo unit.', '--sources=src/demo.sh', '--keywords=demo']), 'demo');
      mkdirSync(join(s, 'docs/guides'), { recursive: true });
      mkdirSync(join(s, 'docs/notes'), { recursive: true });
      writeFileSync(join(s, 'docs/guide.md'), '# The guide\n\nA tracked human guide.\n');
      writeFileSync(join(s, 'docs/guides/intro.md'), '# Intro\n\nAn adopter\'s own nested page.\n');
      writeFileSync(join(s, 'docs/notes/backlog.md'), '@task t\n  STATUS: TODO\n');
      writeFileSync(join(s, '.gitignore'), '.contexture/\n');
      await gitInit(s, '.gitignore', 'docs/guide.md');
      await gitCommit(s, 'h0');
    }, 'posix', 'root-adopter');
    expect(CORPUS).toBe('.contexture/docs');
    expect(existsSync(join(sb, CORPUS, 'workspace/demo.md'))).toBe(true);
    expect((await git(sb, 'ls-files', 'docs/guide.md')).stdout).toBe('docs/guide.md\n');
    const audit = await docs(sb, ['audit']);
    expect([audit.code, audit.stdout, audit.stderr]).toEqual([0, '', '']);
    const index = await docs(sb, ['query', '--index']);
    expect(index.code, index.stderr).toBe(0);
    expect(index.stdout.split('\n').filter((l) => l.trim() && !l.startsWith('index complete')).map((l) => l.split(/\s+/).slice(0, 2).join('/'))).toEqual(['workspace/demo']);
    expect(index.stdout).toContain('index complete: 1 entries');
    const get = await docs(sb, ['get', 'guides/intro/header']);
    expect([get.code, get.stdout]).toEqual([1, '']);
    expect(get.stderr).toContain('no such doc: guides/intro');
    for (const fn of [['storage.leftovers', 'docs'], ['storage.sweep', 'docs', '--dry-run']]) {
      const r = await exec('./.contexture/storage/scripts/driver-resolver', fn, { cwd: sb });
      expect(r.code, r.stderr).toBe(0);
      const answer = JSON.parse(r.stdout) as { root: { state: string; kinds: Record<string, { count: number; bytes: number }> } };
      expect(answer.root.state).toBe('walked');
      expect(Object.keys(answer.root.kinds).length).toBeGreaterThan(0);
      for (const [kind, { count, bytes }] of Object.entries(answer.root.kinds)) expect([fn[0], kind, count, bytes]).toEqual([fn[0], kind, 0, 0]);
    }
  });
});

describe('the one time root move and the install hook guard', { concurrent: true }, () => {
  let before: string;
  beforeAll(async () => {
    before = await seed(async (sb) => {
      await must(install(sb, oldPackage()), 'the old package');
      mkdirSync(join(sb, 'src'));
      writeFileSync(join(sb, 'src/demo.sh'), '#!/bin/sh\necho demo\n');
      await must(docs(sb, ['new', 'workspace', 'demo', '--kind=capability', '--description=The demo unit.', '--sources=src/demo.sh', '--keywords=demo']), 'demo');
      expect(existsSync(join(sb, 'docs/workspace/demo.md'))).toBe(true);
    }, 'posix', 'root-before');
  });

  it('[plugins-r2, modules-r13] an update before the move refuses in the hook and leaves the corpus at its old place', async () => {
    const sb = fresh(before);
    const old = files(join(sb, 'docs'));
    const r = await install(sb);
    expect(r.code, r.stdout + r.stderr).toBe(2);
    expect(r.stderr).toMatch(HOOK_REFUSAL);
    expect(HOOK_REFUSAL.exec(r.stderr)?.[1]).toBe('workspace');
    expect(r.stderr).toContain("package-install: the 'docs' module's install hook failed (rc 1); the overlay and its record are in place");
    expect(readFileSync(join(sb, '.contexture/extensions/modules/docs/data'), 'utf8')).toMatch(/^root: \.contexture\/docs$/m);
    expect(files(join(sb, 'docs'))).toEqual(old);
    expect(existsSync(join(sb, CORPUS))).toBe(false);
    const empty = await docs(sb, ['query', '--index']);
    expect([empty.code, empty.stderr]).toEqual([1, 'ctx docs query: the corpus is empty\n']);
  });

  it('[plugins-r2] the move after a refused update, then the same install, passes the guard and serves the corpus as before', async () => {
    const sb = fresh(before);
    const saved = await views(sb);
    expect((await install(sb)).code).toBe(2);
    await must(exec('sh', ['-c', MOVE], { cwd: sb }), 'the move');
    const r = await install(sb);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout + r.stderr).not.toContain('docs install');
    expect(await views(sb)).toEqual(saved);
    expect(existsSync(join(sb, 'docs/workspace'))).toBe(false);
    expect((await docs(sb, ['audit'])).code).toBe(0);
  });

  it('[plugins-r2, modules-r13] the move first, then the update, keeps the index, every projection, and every doc byte', async () => {
    const sb = fresh(before);
    const saved = await views(sb);
    const bytes = files(join(sb, 'docs/workspace'));
    await must(exec('sh', ['-c', MOVE], { cwd: sb }), 'the move');
    const r = await install(sb);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout + r.stderr).not.toContain('docs install');
    expect(await views(sb)).toEqual(saved);
    expect(files(join(sb, CORPUS, 'workspace'))).toEqual(bytes);
    const list = await ctx(sb, ['package', 'list']);
    expect(list.stdout).toContain('package list: 1 declared, 1 installed, 0 drift');
  });

  it('[plugins-r2] the move onto an existing target refuses before it moves anything', async () => {
    const sb = fresh(before);
    mkdirSync(join(sb, '.contexture/docs/workspace'), { recursive: true });
    const r = await exec('sh', ['-c', MOVE], { cwd: sb });
    expect(r.code).not.toBe(0);
    expect(existsSync(join(sb, 'docs/workspace/demo.md'))).toBe(true);
    expect(readdirSync(join(sb, '.contexture/docs/workspace'))).toEqual([]);
  });

  it('[plugins-r2, modules-r13] a fresh install beside adopter pages that are no corpus docs passes the guard and seeds nothing', async () => {
    const sb = await seed(async (s) => {
      for (const [path, body] of [
        ['docs/guides/intro.md', '# Intro\n'],
        ['docs/odd/page.md', '@doc capability other\n  repo: odd\n'],
        ['docs/my repo/page.md', '@doc capability page\n  repo: x\n'],
        ['docs/notes/late.md', '\n@doc capability late\n'],
        ['docs/.hidden/dot.md', '@doc capability dot\n'],
      ]) {
        mkdirSync(dirname(join(s, path)), { recursive: true });
        writeFileSync(join(s, path), body);
      }
    }, 'posix', 'root-pages');
    const r = await install(sb);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout + r.stderr).not.toContain('docs install');
    expect(existsSync(join(sb, CORPUS))).toBe(false);
    expect((await docs(sb, ['query', '--index'])).stderr).toBe('ctx docs query: the corpus is empty\n');
  });

  it('[plugins-r2] a fresh install over corpus docs left in two repos names both', async () => {
    const sb = await seed(async (s) => {
      mkdirSync(join(s, 'docs/legacy'), { recursive: true });
      mkdirSync(join(s, 'docs/api'), { recursive: true });
      writeFileSync(join(s, 'docs/legacy/old.md'), '@doc capability old\n  repo: legacy\n  description: "x"\n');
      writeFileSync(join(s, 'docs/api/svc.md'), '@doc structural svc\n  repo: api\n  description: "y"');
    }, 'posix', 'root-plant');
    const r = await install(sb);
    expect(r.code, r.stdout + r.stderr).toBe(2);
    expect(HOOK_REFUSAL.exec(r.stderr)?.[1]).toBe('api, legacy');
    expect(existsSync(join(sb, CORPUS))).toBe(false);
    expect((await docs(sb, ['query', '--index'])).stderr).toBe('ctx docs query: the corpus is empty\n');
  });

  it.skipIf(!sqliteAvailable())('[plugins-r2] under a store driver the guard never runs: a corpus doc stranded at the old place does not refuse the install', async () => {
    const sb = await seed(async (s) => {
      mkdirSync(join(s, 'docs/workspace'), { recursive: true });
      cpSync(join(SAMPLE, 'docs/workspace/conventions.md'), join(s, 'docs/workspace/conventions.md'));
    }, 'sqlite', 'root-store');
    expect((await ctx(sb, ['store', 'config', 'get', 'driver'])).stdout).toBe('sqlite\n');
    const r = await install(sb);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout + r.stderr).not.toContain('docs install');
    expect(existsSync(join(sb, CORPUS))).toBe(false);
    expect((await docs(sb, ['query', '--index'])).stderr).toBe('ctx docs query: the corpus is empty\n');
  });
});
