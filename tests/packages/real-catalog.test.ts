import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { exec } from '../support/exec';
import { compose, count, layer, layerBytes, lineOf } from '../support/laws';
import { catalogCopy, extPath, install, isExec, out, uninstall } from '../support/packages';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { firstByteDifference, put } from '../support/tree';

const sandbox = () => stage('posix', 'pkg-catalog');
const PLUGINS = ['docs-discipline', 'ast-doc-graph', 'storage-sqlite', 'toolchain-filters', 'starter-rhythms', 'git'] as const;
const manifest = (p: string): string => join(ROOT, 'plugins', p, 'manifest');
const SQLITE = join(ROOT, 'plugins/storage-sqlite/.contexture/extensions/storage/drivers/sqlite');
const SELECT = "select: match the request against each use when; a propose match is proposed and waits for the human's confirm, an auto match applies and says so; no match runs the design loop (@rhythms default); read a rhythm with ctx rhythm show <name>";

describe.concurrent('the real catalog installs by catalog name through ctx package', () => {
  it('[plugins-r1, plugins-r2, plugins-r6, modules-r13, modules-r10] docs-discipline lands its module, grammar, and rhythms under the extension root, seeds the corpus, and serves its store; starter-rhythms owns work.md', async () => {
    const sb = sandbox();
    const docs = catalogCopy(sb, 'docs-discipline');
    expect((await install(sb, docs)).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/docs/module'))).toBe(true);
    expect(existsSync(extPath(sb, 'modules/docs/scripts/doc.grammar'))).toBe(true);
    expect(existsSync(extPath(sb, 'templates/doc.md'))).toBe(false);
    expect(existsSync(extPath(sb, 'templates'))).toBe(false);
    expect(existsSync(extPath(sb, 'rhythms/docs-authoring.md'))).toBe(true);
    expect(existsSync(extPath(sb, 'rhythms/docs-drift.md'))).toBe(true);
    expect(existsSync(extPath(sb, 'rhythms/work.md'))).toBe(false);
    expect(existsSync(join(sb, '.contexture/docs/workspace/conventions.md'))).toBe(true);
    expect(existsSync(join(sb, 'docs/workspace'))).toBe(false);
    const sd = (await exec('./.contexture/storage/scripts/store-data', ['docs'], { cwd: sb })).stdout.split('\n');
    expect(sd.slice(0, 4)).toEqual(['docs', '.contexture/docs', '.md', '<repo>/<slug>']);
    expect(sd[4]).toBe(join(realpathSync(sb), '.contexture/extensions/modules/docs/data'));
    expect((await ctx(sb, 'docs', 'query', 'workspace', 'conventions')).stdout).toContain('conventions: conventions');
    const starter = catalogCopy(sb, 'starter-rhythms');
    expect((await install(sb, starter)).code).toBe(0);
    expect(existsSync(extPath(sb, 'rhythms/work.md'))).toBe(true);
    expect(readFileSync(extPath(sb, 'rhythms/work.md'), 'utf8')).toContain('a work request arrives');
    expect((await uninstall(sb, starter)).code).toBe(0);
    expect(existsSync(extPath(sb, 'rhythms/work.md'))).toBe(false);
    expect((await uninstall(sb, docs)).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/docs/module'))).toBe(false);
  });

  it('[plugins-r6, modules-r20] starter-rhythms puts work and debug in the rhythm list with their use-when and activation', async () => {
    const sb = sandbox();
    expect(out(await ctx(sb, 'rhythm', 'list'))).toBe(SELECT);
    expect((await install(sb, catalogCopy(sb, 'starter-rhythms'))).code).toBe(0);
    const listed = await ctx(sb, 'rhythm', 'list');
    expect([listed.code, listed.stderr]).toEqual([0, '']);
    expect(out(listed).split('\n')).toEqual([
      'debug | extension | use when: a failure needs root-cause: a bug, a flaky test, an unexpected behavior | activation: propose',
      'work | extension | use when: a work request arrives and no other rhythm matches | activation: auto',
      SELECT,
    ]);
  });

  it('[the-engine-r19, the-engine-r23, plugins-r6] storage-sqlite resolves from the extension root ahead of the transitional module tier, never lists, and uninstalls, while the retired driver name fts5 resolves nothing', async () => {
    const sb = sandbox();
    const sqlitePkg = catalogCopy(sb, 'storage-sqlite');
    expect((await install(sb, sqlitePkg)).code).toBe(0);
    expect(isExec(extPath(sb, 'storage/drivers/sqlite/driver'))).toBe(true);
    put(join(sb, '.contexture/modules/storage-sqlite/drivers/sqlite'), '#!/bin/sh\nexit 0\n', 0o755);
    const got = await exec('./.contexture/storage/scripts/driver-resolver', ['resolve'], { cwd: sb, env: { CTX_STORAGE_DRIVER: 'sqlite' } });
    expect(out(got)).toBe(join(realpathSync(sb), '.contexture/extensions/storage/drivers/sqlite/driver'));
    const retired = await exec('./.contexture/storage/scripts/driver-resolver', ['resolve'], { cwd: sb, env: { CTX_STORAGE_DRIVER: 'fts5' } });
    expect([retired.code === 0, retired.stdout]).toEqual([false, '']);
    expect((await ctx(sb, 'help', '--all')).stdout).not.toContain('storage-sqlite');
    expect((await uninstall(sb, sqlitePkg)).code).toBe(0);
    expect(existsSync(extPath(sb, 'storage/drivers/sqlite/driver'))).toBe(false);
  });

  it.each([
    ['ast-doc-graph', 'modules/ast-doc-graph/module'],
    ['toolchain-filters', 'modules/toolchain-filters/filters'],
    ['starter-rhythms', 'rhythms/work.md'],
  ])('[plugins-r6] %s installs and uninstalls by its catalog name, leaving nothing of its own', async (plugin, landed) => {
    const sb = sandbox();
    const p = catalogCopy(sb, plugin);
    expect((await install(sb, p)).code).toBe(0);
    expect((await uninstall(sb, p)).code).toBe(0);
    expect(existsSync(extPath(sb, landed))).toBe(false);
  });

  it('[plugins-r6, modules-r19] git lands its module and laws, creates the @git section after @update with both clauses, appends the boot ground clause, and uninstalls to the pre-install layer bytes', async () => {
    const sb = sandbox();
    expect((await compose(sb)).code).toBe(0);
    const before = layerBytes(sb);
    expect(before).toBeDefined();
    const git = catalogCopy(sb, 'git');
    expect((await install(sb, git)).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/git/module'))).toBe(true);
    expect(existsSync(extPath(sb, 'modules/git/laws'))).toBe(true);
    const g = layer(sb);
    expect(count(g, /^@module git$/)).toBe(1);
    expect(count(g, /^@git$/)).toBe(1);
    expect(lineOf(g, /^@git$/)).toBeGreaterThan(lineOf(g, /^@update$/));
    expect(count(g, /^ {2}the gitignore strategy is decided per topology/)).toBe(1);
    expect(count(g, /^ {2}branch\/worktree on demand/)).toBe(1);
    expect(count(g, /^ {2}ground check \(a git workspace\)/)).toBe(1);
    expect((await uninstall(sb, git)).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/git/module'))).toBe(false);
    expect(firstByteDifference(layerBytes(sb)!, before!)).toBe(-1);
  });
});

describe.concurrent('the real package manifests', () => {
  let sb: string;
  beforeAll(() => {
    sb = sandbox();
  });
  const pkgv = async (p: string, field: string) => out(await ctx(sb, '_package', manifest(p), field));

  it.each(PLUGINS)('[plugins-r9, modules-r16] %s carries a package manifest that validates', async (p) => {
    expect(existsSync(manifest(p))).toBe(true);
    expect((await ctx(sb, '_package', manifest(p), 'validate')).code).toBe(0);
  });

  it('[plugins-r9, modules-r16] the kinds, parts, driver name, and storage format read as declared', async () => {
    expect(await pkgv('docs-discipline', 'kind')).toBe('feature');
    expect(await pkgv('docs-discipline', 'parts')).toBe('module modules/docs\nrhythms rhythms');
    expect(await pkgv('ast-doc-graph', 'kind')).toBe('feature');
    expect(await pkgv('toolchain-filters', 'parts')).toBe('filters modules/toolchain-filters/filters');
    expect(await pkgv('starter-rhythms', 'parts')).toBe('rhythms rhythms');
    expect(await pkgv('git', 'kind')).toBe('feature');
    expect(await pkgv('git', 'parts')).toBe('module modules/git');
    expect(await pkgv('storage-sqlite', 'kind')).toBe('driver');
    expect(await pkgv('storage-sqlite', 'driver')).toBe('sqlite');
    expect(await pkgv('storage-sqlite', 'format')).toBe('6');
    expect(await pkgv('storage-sqlite', 'parts')).toBe('driver storage/drivers/sqlite');
    for (const p of PLUGINS.filter((n) => n !== 'storage-sqlite')) expect(await pkgv(p, 'format')).toBe('');
  });

  it('[plugins-r9, the-engine-r23] the sqlite driver sits at its extension-relative driver path with no module file and declares sqlite, 4.0.0, contract 4', async () => {
    expect(existsSync(join(SQLITE, 'module'))).toBe(false);
    expect(isExec(join(SQLITE, 'driver'))).toBe(true);
    const cap = (await exec('sh', [join(SQLITE, 'driver'), 'capability'], { cwd: sb })).stdout;
    expect(cap).toContain('"driver":"sqlite"');
    expect(cap).toContain('"version":"4.0.0"');
    expect(cap).toContain('"contract":"4"');
  });

  it('[plugins-r9, modules-r16] every real catalog plugin carries rich optional metadata and passes ctx package catalog and info', async () => {
    const sb = sandbox();
    for (const p of PLUGINS) {
      catalogCopy(sb, p);
      expect(await pkgv(p, 'category')).not.toBe('');
      expect(await pkgv(p, 'pitch')).not.toBe('');
      expect(await pkgv(p, 'when')).not.toBe('');
      expect(await pkgv(p, 'needs')).not.toBe('');
      expect(await pkgv(p, 'tags')).not.toBe('');
      expect(await pkgv(p, 'description')).not.toBe('');
    }
    const names = await ctx(sb, 'package', 'catalog', '--names');
    expect([names.code, names.stderr]).toEqual([0, '']);
    expect(out(names).split('\n')).toEqual([...PLUGINS].sort());

    const catNoProbe = await ctx(sb, 'package', 'catalog', '--no-probe', '--json');
    expect([catNoProbe.code, catNoProbe.stderr]).toEqual([0, '']);
    const parsedCat = JSON.parse(catNoProbe.stdout);
    expect(parsedCat.packages.map((p: any) => p.name)).toEqual([...PLUGINS].sort());
    expect(parsedCat.packages.every((p: any) => p.probe.status === 'skipped')).toBe(true);

    const catLive = await ctx(sb, 'package', 'catalog', '--json');
    expect([catLive.code, catLive.stderr]).toEqual([0, '']);
    const parsedLive = JSON.parse(catLive.stdout);
    const starter = parsedLive.packages.find((p: any) => p.name === 'starter-rhythms');
    expect(starter.version).toBe('1.1.1');
    expect(starter.probe).toEqual({ status: 'ready', code: 0, detail: '' });

    for (const p of PLUGINS) {
      const info = await ctx(sb, 'package', 'info', p, '--json');
      expect([info.code, info.stderr]).toEqual([0, '']);
      const obj = JSON.parse(info.stdout);
      expect(obj.name).toBe(p);
      expect(obj.category).toBeTruthy();
      expect(obj.tags.length).toBeGreaterThan(0);
      expect(obj.description).toBeTruthy();
      expect(obj.lifecycle).toEqual(p === 'starter-rhythms' ? [] : ['probe']);
    }
  });

  it('[plugins-r9, modules-r12] the lane-isolation package is retired into the lane module laws', () => {
    expect(existsSync(join(ROOT, 'plugins/lane-isolation'))).toBe(false);
    expect(readFileSync(join(ROOT, 'base/.contexture/modules/lane/laws'), 'utf8')).toContain('branch/worktree');
  });
});
