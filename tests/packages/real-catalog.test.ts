import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { exec } from '../support/exec';
import { catalogCopy, extPath, isExec, out, wrapper } from '../support/packages';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { put } from '../support/tree';

const sandbox = () => stage('posix', 'pkg-catalog');
const PLUGINS = ['docs-discipline', 'ast-doc-graph', 'storage-fts5', 'toolchain-filters', 'starter-rhythms'] as const;
const manifest = (p: string): string => join(ROOT, 'plugins', p, 'manifest');
const FTS5 = join(ROOT, 'plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5');

describe.concurrent('the real catalog installs through its own wrappers', () => {
  it('[plugins-r1, plugins-r2, plugins-r6, modules-r13, modules-r10] docs-discipline lands its module, grammar, and rhythms under the extension root, seeds the corpus, and serves its store; starter-rhythms owns work.md', async () => {
    const sb = sandbox();
    const docs = catalogCopy(sb, 'docs-discipline');
    expect((await wrapper(sb, docs, 'install')).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/docs/module'))).toBe(true);
    expect(existsSync(extPath(sb, 'modules/docs/scripts/doc.grammar'))).toBe(true);
    expect(existsSync(extPath(sb, 'templates/doc.md'))).toBe(false);
    expect(existsSync(extPath(sb, 'templates'))).toBe(false);
    expect(existsSync(extPath(sb, 'rhythms/docs-authoring.md'))).toBe(true);
    expect(existsSync(extPath(sb, 'rhythms/docs-drift.md'))).toBe(true);
    expect(existsSync(extPath(sb, 'rhythms/work.md'))).toBe(false);
    expect(existsSync(join(sb, 'docs/workspace/conventions.md'))).toBe(true);
    const sd = (await exec('./.contexture/storage/scripts/store-data', ['docs'], { cwd: sb })).stdout.split('\n');
    expect(sd.slice(0, 5)).toEqual(['docs', 'docs', '.md', '<repo>/<slug>', 'true']);
    expect(sd[5]).toBe(join(realpathSync(sb), '.contexture/extensions/modules/docs/data'));
    expect((await ctx(sb, 'docs', 'query', 'workspace', 'conventions')).stdout).toContain('conventions: conventions');
    const starter = catalogCopy(sb, 'starter-rhythms');
    expect((await wrapper(sb, starter, 'install')).code).toBe(0);
    expect(existsSync(extPath(sb, 'rhythms/work.md'))).toBe(true);
    expect(readFileSync(extPath(sb, 'rhythms/work.md'), 'utf8')).toContain('a work request arrives');
    expect((await wrapper(sb, starter, 'uninstall')).code).toBe(0);
    expect(existsSync(extPath(sb, 'rhythms/work.md'))).toBe(false);
    expect((await wrapper(sb, docs, 'uninstall')).code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/docs/module'))).toBe(false);
  });

  it('[plugins-r6, modules-r20] starter-rhythms puts work and debug in the rhythm index with their use-when and activation', async () => {
    const sb = sandbox();
    expect(out(await ctx(sb, 'unit', 'index'))).toBe('');
    expect((await wrapper(sb, catalogCopy(sb, 'starter-rhythms'), 'install')).code).toBe(0);
    expect(out(await ctx(sb, 'unit', 'index')).split('\n')).toEqual([
      'debug (.contexture/extensions/rhythms/debug.md) | use when: a failure needs root-cause: a bug, a flaky test, an unexpected behavior | activation: propose',
      'work (.contexture/extensions/rhythms/work.md) | use when: a work request arrives and no other rhythm matches | activation: auto',
    ]);
  });

  it('[the-engine-r19, the-engine-r23, plugins-r6] storage-fts5 resolves from the extension root ahead of the transitional module tier, never lists, and uninstalls', async () => {
    const sb = sandbox();
    const fts5 = catalogCopy(sb, 'storage-fts5');
    expect((await wrapper(sb, fts5, 'install')).code).toBe(0);
    expect(isExec(extPath(sb, 'storage/drivers/fts5/driver'))).toBe(true);
    put(join(sb, '.contexture/modules/storage-fts5/drivers/fts5'), '#!/bin/sh\nexit 0\n', 0o755);
    const got = await exec('./.contexture/storage/scripts/driver-resolver', ['resolve'], { cwd: sb, env: { CTX_STORAGE_DRIVER: 'fts5' } });
    expect(out(got)).toBe(join(realpathSync(sb), '.contexture/extensions/storage/drivers/fts5/driver'));
    expect((await ctx(sb, 'help', '--all')).stdout).not.toContain('storage-fts5');
    expect((await wrapper(sb, fts5, 'uninstall')).code).toBe(0);
    expect(existsSync(extPath(sb, 'storage/drivers/fts5/driver'))).toBe(false);
  });

  it.each([
    ['ast-doc-graph', 'modules/ast-doc-graph/module'],
    ['toolchain-filters', 'modules/toolchain-filters/filters'],
    ['starter-rhythms', 'rhythms/work.md'],
  ])('[plugins-r6] %s installs and uninstalls through its wrappers, leaving nothing of its own', async (plugin, landed) => {
    const sb = sandbox();
    const p = catalogCopy(sb, plugin);
    expect((await wrapper(sb, p, 'install')).code).toBe(0);
    expect((await wrapper(sb, p, 'uninstall')).code).toBe(0);
    expect(existsSync(extPath(sb, landed))).toBe(false);
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

  it('[plugins-r9, modules-r16] the kinds, parts, and driver name read as declared', async () => {
    expect(await pkgv('docs-discipline', 'kind')).toBe('feature');
    expect(await pkgv('docs-discipline', 'parts')).toBe('module modules/docs\nrhythms rhythms');
    expect(await pkgv('ast-doc-graph', 'kind')).toBe('feature');
    expect(await pkgv('toolchain-filters', 'parts')).toBe('filters modules/toolchain-filters/filters');
    expect(await pkgv('starter-rhythms', 'parts')).toBe('rhythms rhythms');
    expect(await pkgv('storage-fts5', 'kind')).toBe('driver');
    expect(await pkgv('storage-fts5', 'driver')).toBe('fts5');
    expect(await pkgv('storage-fts5', 'parts')).toBe('driver storage/drivers/fts5');
  });

  it('[plugins-r9, the-engine-r23] the fts5 driver sits at its extension-relative driver path with no module file and declares fts5, 3.0.0, contract 3', async () => {
    expect(existsSync(join(FTS5, 'module'))).toBe(false);
    expect(isExec(join(FTS5, 'driver'))).toBe(true);
    const cap = (await exec('sh', [join(FTS5, 'driver'), 'capability'], { cwd: sb })).stdout;
    expect(cap).toContain('"driver":"fts5"');
    expect(cap).toContain('"version":"3.0.0"');
    expect(cap).toContain('"contract":"3"');
  });

  it('[plugins-r9, modules-r12] the lane-isolation package is retired into the lane module laws', () => {
    expect(existsSync(join(ROOT, 'plugins/lane-isolation'))).toBe(false);
    expect(readFileSync(join(ROOT, 'base/.contexture/extensions/modules/lane/laws'), 'utf8')).toContain('branch/worktree');
  });
});
