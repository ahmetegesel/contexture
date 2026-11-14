import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec, type Run } from '../support/exec';
import { addModule, extPath, newPkg, recordPath, writeManifest } from '../support/packages';
import { stage } from '../support/stage';
import { put, treeState } from '../support/tree';

const sandbox = () => stage('posix', 'pkg-decl');
const ctx = (sb: string, args: string[]): Promise<Run> => exec('./.contexture/ctx', args, { cwd: sb });
const conf = (sb: string): string => join(sb, '.contexture/config');
const confText = (sb: string): string => (existsSync(conf(sb)) ? readFileSync(conf(sb), 'utf8') : '');

function pkg(sb: string, name: string, module = name.replace(/^pkg-/, '')): string {
  const p = newPkg(sb, name);
  addModule(p, module);
  writeManifest(p);
  return p;
}

const PRESET = '# the workspace configuration\nstorage.driver: posix\n\n# a trailing note\n';

describe.concurrent('the package declaration in the workspace configuration', () => {
  it('[the-engine-r22] an install writes its package line, a path inside the workspace relative to its root, every alias the record holds; a re-install replaces it in place; every other line stays byte for byte', async () => {
    const sb = sandbox();
    writeFileSync(conf(sb), PRESET);
    pkg(sb, 'pkg-alpha');
    expect((await ctx(sb, ['package', 'install', 'catalog/pkg-alpha'])).code).toBe(0);
    expect(confText(sb)).toBe(`${PRESET}package.pkg-alpha: ./catalog/pkg-alpha\n`);
    expect((await ctx(sb, ['package', 'install', '--as=alpha=alpha2', 'catalog/pkg-alpha'])).code).toBe(0);
    expect(confText(sb)).toBe(`${PRESET}package.pkg-alpha: ./catalog/pkg-alpha --as=alpha=alpha2\n`);
    expect((await ctx(sb, ['package', 'install', 'catalog/pkg-alpha'])).code).toBe(0);
    expect(confText(sb)).toBe(`${PRESET}package.pkg-alpha: ./catalog/pkg-alpha --as=alpha=alpha2\n`);
    expect(existsSync(extPath(sb, 'modules/alpha2/module'))).toBe(true);
  });

  it('[the-engine-r22] a catalog name is declared by its name, the file made when absent; an uninstall removes the line alone', async () => {
    const sb = sandbox();
    pkg(sb, 'pkg-beta');
    put(join(sb, 'plugins/pkg-gamma/README.md'), '# gamma\n');
    addModule(join(sb, 'plugins/pkg-gamma'), 'gamma');
    writeManifest(join(sb, 'plugins/pkg-gamma'));
    expect(existsSync(conf(sb))).toBe(false);
    expect((await ctx(sb, ['package', 'install', 'pkg-gamma'])).code).toBe(0);
    expect(confText(sb)).toBe('package.pkg-gamma: pkg-gamma\n');
    writeFileSync(conf(sb), `${PRESET}${confText(sb)}`);
    expect((await ctx(sb, ['package', 'install', 'catalog/pkg-beta'])).code).toBe(0);
    expect((await ctx(sb, ['package', 'uninstall', 'pkg-gamma'])).code).toBe(0);
    expect(confText(sb)).toBe(`${PRESET}package.pkg-beta: ./catalog/pkg-beta\n`);
  });

  it('[the-engine-r22] an uninstall the configuration holds no line for writes nothing: an absent file stays absent, and a file lacking the line stays byte for byte', async () => {
    const sb = sandbox();
    pkg(sb, 'pkg-delta');
    expect((await ctx(sb, ['package', 'install', 'catalog/pkg-delta'])).code).toBe(0);
    rmSync(conf(sb));
    expect((await ctx(sb, ['package', 'uninstall', 'pkg-delta'])).code).toBe(0);
    expect(existsSync(conf(sb))).toBe(false);
    expect((await ctx(sb, ['package', 'install', 'catalog/pkg-delta'])).code).toBe(0);
    writeFileSync(conf(sb), 'storage.driver: posix');
    expect((await ctx(sb, ['package', 'uninstall', 'pkg-delta'])).code).toBe(0);
    expect(confText(sb)).toBe('storage.driver: posix');
  });

  it('[the-engine-r22, plugins-r6] the bare install installs every declared package the record lacks, with its declared flags, and a second bare install prints one line and writes nothing', async () => {
    const sb = sandbox();
    pkg(sb, 'pkg-one');
    pkg(sb, 'pkg-two', 'two');
    expect((await ctx(sb, ['package', 'install', 'catalog/pkg-one'])).code).toBe(0);
    writeFileSync(conf(sb), `${confText(sb)}package.pkg-two: ./catalog/pkg-two --as=two=second # the second one\n`);
    const bare = await ctx(sb, ['package', 'install']);
    expect(bare.code).toBe(0);
    expect(bare.stdout).toContain('package-install: installed pkg-two');
    expect(bare.stdout).not.toContain('installed pkg-one');
    expect(existsSync(extPath(sb, 'modules/second/module'))).toBe(true);
    expect(existsSync(recordPath(sb, 'pkg-two'))).toBe(true);
    const before = treeState(sb);
    const again = await ctx(sb, ['package', 'install']);
    expect([again.code, again.stdout, again.stderr]).toEqual([0, 'package install: nothing to install: every declared package is installed\n', '']);
    expect(treeState(sb)).toBe(before);
  });

  it('[the-engine-r22] a bare install with nothing declared prints one plain line rc 0 and writes nothing, and the compose never installs a declared package', async () => {
    const sb = sandbox();
    writeFileSync(conf(sb), PRESET);
    const before = treeState(sb);
    const r = await ctx(sb, ['package', 'install']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'package install: no package is declared (the workspace configuration holds no package.<name> line)\n', '']);
    expect(treeState(sb)).toBe(before);
    pkg(sb, 'pkg-lazy');
    writeFileSync(conf(sb), `${PRESET}package.pkg-lazy: ./catalog/pkg-lazy\n`);
    expect((await ctx(sb, ['compose'])).code).toBe(0);
    expect(existsSync(recordPath(sb, 'pkg-lazy'))).toBe(false);
    expect(existsSync(extPath(sb, 'modules/lazy'))).toBe(false);
  });

  it.each([
    ['package.pkg-x: ./catalog/pkg-x --as=x\n', "ctx: package install: package.pkg-x: malformed --as '--as=x' (--as=<module>=<alias>)"],
    ['package.pkg-x: ./catalog/pkg-x --as=x=Upper\n', "ctx: package install: package.pkg-x: malformed --as '--as=x=Upper': a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit"],
    ['package.pkg-x: ./catalog/pkg-x --as=x=-dash\n', "ctx: package install: package.pkg-x: malformed --as '--as=x=-dash': a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit"],
    ['package.pkg-x: ./catalog/absent\n', 'ctx: package install: package.pkg-x: no package at ./catalog/absent'],
    ['package.pkg-y: ./catalog/pkg-x\n', "ctx: package install: package.pkg-y names the package 'pkg-x' at ./catalog/pkg-x"],
    ['package.pkg-x:\n', 'ctx: package install: package.pkg-x declares no source'],
    ['package.pkg-x: ./catalog/pkg-x\npackage.pkg-x: ./catalog/pkg-x\n', "ctx: package install: package 'pkg-x' is declared twice in the workspace configuration"],
  ])('[the-engine-r22] a bare install refuses the declaration %j rc 1 with one line before any install, writing nothing', async (lines, line) => {
    const sb = sandbox();
    pkg(sb, 'pkg-x');
    pkg(sb, 'pkg-ok', 'ok');
    writeFileSync(conf(sb), `package.pkg-ok: ./catalog/pkg-ok\n${lines}`);
    const before = treeState(sb);
    const r = await ctx(sb, ['package', 'install']);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `${line}\n`]);
    expect(treeState(sb)).toBe(before);
  });

  it('[the-engine-r22] a declared install that fails stops naming the package, the packages before it staying installed', async () => {
    const sb = sandbox();
    pkg(sb, 'pkg-first', 'first');
    pkg(sb, 'pkg-clash', 'first');
    writeFileSync(conf(sb), 'package.pkg-first: ./catalog/pkg-first\npackage.pkg-clash: ./catalog/pkg-clash\n');
    const r = await ctx(sb, ['package', 'install']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("package-install: another package's module: .contexture/extensions/modules/first (recorded by pkg-first; install it under another name: --as=first=<name>)");
    expect(r.stderr).toMatch(/^ctx: package install: the declared package 'pkg-clash' did not install \(rc 1\); the packages before it stay installed$/m);
    expect(existsSync(recordPath(sb, 'pkg-first'))).toBe(true);
    expect(existsSync(recordPath(sb, 'pkg-clash'))).toBe(false);
  });

  it('[the-engine-r22] a bare install with a pending declaration and no package installer refuses rc 2 with one line naming the package installer alone, writing nothing', async () => {
    const sb = sandbox();
    pkg(sb, 'pkg-x');
    writeFileSync(conf(sb), 'package.pkg-x: ./catalog/pkg-x\n');
    rmSync(join(sb, '.contexture/package-install'));
    const before = treeState(sb);
    const r = await ctx(sb, ['package', 'install']);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', 'ctx: package install: missing package installer\n']);
    expect(treeState(sb)).toBe(before);
  });

  it('[the-engine-r25] the configuration\'s value readers stay undisturbed by package lines: the resolver still takes the storage driver line', async () => {
    const sb = sandbox();
    writeFileSync(conf(sb), 'package.pkg-z: ./catalog/pkg-z --as=z=y\nstorage.driver: nosuchdriver\n');
    const r = await exec('.contexture/storage/scripts/driver-resolver', ['resolve'], { cwd: sb });
    expect(r.code).not.toBe(0);
    expect(r.stderr).toContain('nosuchdriver');
    writeFileSync(conf(sb), 'package.pkg-z: ./catalog/pkg-z --as=z=y\nstorage.driver: posix\n');
    const ok = await exec('.contexture/storage/scripts/driver-resolver', ['resolve'], { cwd: sb });
    expect([ok.code, ok.stdout.trim()]).toEqual([0, expect.stringMatching(/\/drivers\/posix\/driver$/)]);
  });
});
