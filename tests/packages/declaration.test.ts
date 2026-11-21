import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec, type Run } from '../support/exec';
import { addModule, extPath, newPkg, recordPath, recordText, writeManifest } from '../support/packages';
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

describe.concurrent('ctx package list: the declared packages against the installed ones', () => {
  it('[the-engine-r22] names nothing declared or installed in one line rc 0', async () => {
    const r = await ctx(sandbox(), ['package', 'list']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'package list: no package is declared or installed\n', '']);
  });

  it('[the-engine-r22] lists versions, modules, and aliases in name order and flags the three drifts, read only, its text naming no storage or implementation path', async () => {
    const sb = sandbox();
    pkg(sb, 'pkg-ok', 'okmod');
    pkg(sb, 'pkg-alias', 'memo');
    pkg(sb, 'pkg-stray', 'stray');
    pkg(sb, 'pkg-bumped', 'bumped');
    pkg(sb, 'pkg-old', 'old');
    for (const args of [['catalog/pkg-ok'], ['--as=memo=memo2', 'catalog/pkg-alias'], ['catalog/pkg-stray'], ['catalog/pkg-bumped'], ['catalog/pkg-old']]) {
      expect((await ctx(sb, ['package', 'install', ...args])).code).toBe(0);
    }
    writeManifest(join(sb, 'catalog/pkg-bumped'), '1.1.0');
    const rec = recordPath(sb, 'pkg-old');
    writeFileSync(rec, readFileSync(rec, 'utf8').split('\n').filter((l) => !l.startsWith('module ')).join('\n'));
    writeFileSync(conf(sb), confText(sb).split('\n').filter((l) => !l.startsWith('package.pkg-stray:')).join('\n') + 'package.pkg-ghost: ./catalog/pkg-ghost\n');
    const before = treeState(sb);
    const r = await ctx(sb, ['package', 'list']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe([
      'pkg-alias: installed 1.0.0, declared; modules: memo2 (alias of memo)',
      'pkg-bumped: installed 1.0.0, declared, the declared source holds 1.1.0 (drift); modules: bumped',
      'pkg-ghost: declared, not installed (drift)',
      'pkg-ok: installed 1.0.0, declared; modules: okmod',
      'pkg-old: installed 1.0.0, declared; modules: old',
      'pkg-stray: installed 1.0.0, not declared (drift); modules: stray',
      'package list: 5 declared, 5 installed, 3 drift',
      '',
    ].join('\n'));
    expect(r.stdout).not.toMatch(/\.contexture|\.state|\.files/);
    expect(treeState(sb)).toBe(before);
  });

  it('[the-engine-r22] an install record area or record that exists but cannot be read refuses rc 2 with one line naming no path, never answering that nothing is installed', async () => {
    const sb = sandbox();
    pkg(sb, 'pkg-ok', 'okmod');
    expect((await ctx(sb, ['package', 'install', 'catalog/pkg-ok'])).code).toBe(0);
    const state = join(sb, '.contexture/extensions/.state');
    chmodSync(state, 0o000);
    try {
      const r = await ctx(sb, ['package', 'list']);
      expect([r.code, r.stdout, r.stderr]).toEqual([2, '', 'ctx: package list: the install record area cannot be read\n']);
    } finally {
      chmodSync(state, 0o755);
    }
    chmodSync(recordPath(sb, 'pkg-ok'), 0o000);
    try {
      const r = await ctx(sb, ['package', 'list']);
      expect([r.code, r.stdout, r.stderr]).toEqual([2, '', "ctx: package list: the install record of 'pkg-ok' cannot be read\n"]);
    } finally {
      chmodSync(recordPath(sb, 'pkg-ok'), 0o644);
    }
    expect((await ctx(sb, ['package', 'list'])).code).toBe(0);
  });

  it('[the-engine-r22] .contexture/plugins/<name> takes precedence over ./plugins/<name> for bare declared install and list drift detection', async () => {
    const sb = sandbox();
    put(join(sb, 'plugins/pkg-shadow/README.md'), '# fallback\n');
    addModule(join(sb, 'plugins/pkg-shadow'), 'fb');
    writeManifest(join(sb, 'plugins/pkg-shadow'), '1.0.0');

    put(join(sb, '.contexture/plugins/pkg-shadow/README.md'), '# primary\n');
    addModule(join(sb, '.contexture/plugins/pkg-shadow'), 'pri');
    writeManifest(join(sb, '.contexture/plugins/pkg-shadow'), '1.2.0');

    writeFileSync(conf(sb), 'package.pkg-shadow: pkg-shadow\n');
    const bare = await ctx(sb, ['package', 'install']);
    expect(bare.code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/pri/module'))).toBe(true);
    expect(existsSync(extPath(sb, 'modules/fb/module'))).toBe(false);
    expect(recordText(sb, 'pkg-shadow')).toContain('version 1.2.0');

    writeManifest(join(sb, '.contexture/plugins/pkg-shadow'), '1.3.0');
    const listed = await ctx(sb, ['package', 'list']);
    expect(listed.code).toBe(0);
    expect(listed.stdout).toContain('pkg-shadow: installed 1.2.0, declared, the declared source holds 1.3.0 (drift)');
  });
});
