import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec, type Run } from '../support/exec';
import { addModule, extPath, newPkg, recordPath, recordText, writeManifest } from '../support/packages';
import { stage } from '../support/stage';
import { put, treeState } from '../support/tree';

const sandbox = (label: string) => stage('posix', `pkg-verb-${label}`);
const verb = (sb: string, args: string[], opts: { cwd?: string; env?: Record<string, string> } = {}): Promise<Run> =>
  exec(join(sb, '.contexture/ctx'), ['package', ...args], { cwd: opts.cwd ?? sb, env: opts.env });
const direct = (sb: string, script: 'install' | 'uninstall', arg: string, env: Record<string, string> = { CTX_ROOT: sb }): Promise<Run> =>
  exec('sh', [join(sb, `.contexture/package-${script}`), arg], { cwd: sb, env });
const fixture = (sb: string, name: string, root = join(sb, 'catalog')): string => {
  const p = join(root, name);
  mkdirSync(join(p, '.contexture/extensions'), { recursive: true });
  put(join(p, 'README.md'), '# fixture package\n');
  addModule(p, name.replace(/^pkg/, 'm'));
  writeManifest(p);
  return p;
};
const lines = (r: Run) => ({ code: r.code, stdout: r.stdout, stderr: r.stderr });
const GO = /on the human's explicit go at the act$/;

describe.concurrent('ctx package: the group and its help', () => {
  it('[the-engine-r22] ctx package bare, help, --help, and -h each list the five sub-verbs, install and uninstall with the go clause, list, catalog, and info read only, rc 0', async () => {
    const sb = sandbox('group');
    for (const args of [[], ['help'], ['--help'], ['-h']]) {
      const r = await verb(sb, args);
      expect(r.code, args.join(' ')).toBe(0);
      expect(r.stderr).toBe('');
      expect(r.stdout).toMatch(/^ {2}ctx package install \[<package>\] +\S.*on the human's explicit go at the act$/m);
      expect(r.stdout).toMatch(/^ {2}ctx package uninstall <package> +\S.*on the human's explicit go at the act$/m);
      expect(r.stdout).toMatch(/^ {2}ctx package list +\S.*read only$/m);
      expect(r.stdout).toMatch(/^ {2}ctx package catalog .*read only$/m);
      expect(r.stdout).toMatch(/^ {2}ctx package info <package> .*read only$/m);
    }
  });

  it('[the-engine-r22] an unknown sub-verb refuses rc 1 with one line naming the five', async () => {
    const r = await verb(sandbox('unknown'), ['nosuch']);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe('ctx: package: unknown sub-verb: nosuch (ctx package install, ctx package uninstall, ctx package list, ctx package catalog, or ctx package info)\n');
  });

  it('[the-engine-r22] ctx help prints one usage line per sub-verb, install and uninstall carrying the go clause, list, catalog, and info read only', async () => {
    const r = await exec('./.contexture/ctx', ['help'], { cwd: sandbox('tophelp') });
    expect(r.code).toBe(0);
    for (const prefix of ['  ctx package install [<package>] ', '  ctx package uninstall <package> ']) {
      const hits = r.stdout.split('\n').filter((l) => l.startsWith(prefix));
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatch(GO);
    }
    for (const prefix of ['  ctx package list ', '  ctx package catalog ', '  ctx package info ']) {
      const hits = r.stdout.split('\n').filter((l) => l.startsWith(prefix));
      expect(hits).toHaveLength(1);
      expect(hits[0]).toMatch(/read only$/);
    }
  });

  it.each([
    ['install', '--help'],
    ['install', '-h'],
    ['uninstall', '--help'],
    ['uninstall', '-h'],
  ])('[the-engine-r22] ctx package %s %s prints the usage, the naming forms, the go line, and the exit codes rc 0', async (sub, flag) => {
    const sb = sandbox('subhelp');
    rmSync(join(sb, `.contexture/package-${sub}`));
    const r = await verb(sb, [sub, flag]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout.split('\n')[0]).toBe(sub === 'install' ? 'usage: ctx package install [<package>] [--as=<module>=<alias>]...' : `usage: ctx package ${sub} <package>`);
    expect(r.stdout).toContain('a value holding a slash is a package root path');
    expect(r.stdout).toMatch(sub === 'install' ? /a catalog name .*\.contexture\/plugins\/<name>.*plugins\/<name>/ : /the installed package's name/);
    expect(r.stdout).toMatch(/^an (un)?install runs only on the human's explicit go at the act; this verb checks no go/m);
    expect(r.stdout).toMatch(/^exit codes: 0 /m);
  });
});

describe.concurrent('ctx package list: its help and its argument refusal', () => {
  it.each(['--help', '-h'])('[the-engine-r22] ctx package list %s prints its usage, the drift classes, and the read only line rc 0 on stdout', async (flag) => {
    const r = await verb(sandbox('listhelp'), ['list', flag]);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.split('\n')[0]).toBe('usage: ctx package list');
    expect(r.stdout).toMatch(/^drift: a package declared but not installed, installed but not declared, or installed at a version other than its declared source's/m);
    expect(r.stdout).toMatch(/^read only: it writes nothing and installs nothing/m);
  });

  it('[the-engine-r22] ctx package list with an argument refuses rc 1 with one line, writing nothing', async () => {
    const sb = sandbox('listarg');
    const before = treeState(sb);
    const r = await verb(sb, ['list', 'extra']);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', 'ctx: package list: takes no argument (ctx package list --help prints its detail)\n']);
    expect(treeState(sb)).toBe(before);
  });
});

describe.concurrent('ctx package: the refusals before the exec', () => {
  it.each([
    ['install', ['--as=m=n'], 1, 'ctx: package install: usage: ctx package install <package>'],
    ['install', ['a', 'b'], 1, 'ctx: package install: usage: ctx package install <package>'],
    ['uninstall', [], 1, 'ctx: package uninstall: usage: ctx package uninstall <package>'],
    ['install', ['.hidden'], 1, "ctx: package install: malformed package name '.hidden' (letters, digits, dot, underscore, hyphen; not starting with a dot)"],
    ['uninstall', ['bad name'], 1, "ctx: package uninstall: malformed package name 'bad name' (letters, digits, dot, underscore, hyphen; not starting with a dot)"],
    ['install', ['nosuch'], 1, 'ctx: package install: no package at .contexture/plugins/nosuch or plugins/nosuch (name a package root path, a value holding a slash, instead)'],
    ['install', ['catalog/absent'], 1, 'ctx: package install: no package root at catalog/absent'],
  ] as const)('[the-engine-r22] ctx package %s %j refuses rc %i with one line, writing nothing', async (sub, args, rc, line) => {
    const sb = sandbox('refuse');
    const before = treeState(sb);
    const r = await verb(sb, [sub, ...args]);
    expect(r.code).toBe(rc);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(`${line}\n`);
    expect(treeState(sb)).toBe(before);
  });

  it('[the-engine-r22] the group answers before discovery: a broken module adds no warning to its refusal or its help, while ctx help on the same sandbox warns', async () => {
    const sb = sandbox('nodiscovery');
    mkdirSync(join(sb, '.contexture/modules/orphan/scripts'), { recursive: true });
    const refusal = await verb(sb, ['install', 'nosuch']);
    expect(refusal.code).toBe(1);
    expect(refusal.stderr).toBe('ctx: package install: no package at .contexture/plugins/nosuch or plugins/nosuch (name a package root path, a value holding a slash, instead)\n');
    const help = await verb(sb, ['--help']);
    expect(help.code).toBe(0);
    expect(help.stderr).toBe('');
    const top = await exec('./.contexture/ctx', ['help'], { cwd: sb });
    expect(top.code).toBe(0);
    expect(top.stderr).toContain('skipping module orphan: scripts/ without a module file');
  });

  it.each([
    ['install', 'missing package installer'],
    ['uninstall', 'missing package uninstaller'],
  ] as const)('[the-engine-r22] ctx package %s refuses rc 2 naming its missing package installer alone, never its private path, writing nothing', async (sub, missing) => {
    const sb = sandbox('noscript');
    const p = fixture(sb, 'pkgnoscript');
    rmSync(join(sb, `.contexture/package-${sub}`));
    const before = treeState(sb);
    const r = await verb(sb, [sub, p]);
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(`ctx: package ${sub}: ${missing}\n`);
    expect(treeState(sb)).toBe(before);
  });
});

describe.concurrent('ctx package: the exec into the private installers', () => {
  it('[the-engine-r22] install by path and uninstall by name pass through byte for byte: stdout, stderr, rc, and record equal a direct private call', async () => {
    const a = sandbox('twin-verb');
    const b = sandbox('twin-direct');
    const viaVerb = await verb(a, ['install', fixture(a, 'pkgtwin')]);
    const viaDirect = await direct(b, 'install', fixture(b, 'pkgtwin'));
    expect(viaVerb.code).toBe(0);
    expect(lines(viaVerb)).toEqual(lines(viaDirect));
    expect(recordText(a, 'pkgtwin')).toBe(recordText(b, 'pkgtwin'));
    expect(treeState(extPath(a))).toBe(treeState(extPath(b)));
    const outVerb = await verb(a, ['uninstall', 'pkgtwin']);
    const outDirect = await direct(b, 'uninstall', 'pkgtwin');
    expect(outVerb.code).toBe(0);
    expect(lines(outVerb)).toEqual(lines(outDirect));
    expect(existsSync(recordPath(a, 'pkgtwin'))).toBe(false);
  });

  it('[the-engine-r22] a catalog name installs plugins/<name> at the workspace root, and uninstalls by that name', async () => {
    const sb = sandbox('catalog');
    fixture(sb, 'pkgcat', join(sb, 'plugins'));
    const r = await verb(sb, ['install', 'pkgcat']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('package-install: installed pkgcat');
    expect(existsSync(extPath(sb, 'modules/mcat/module'))).toBe(true);
    const u = await verb(sb, ['uninstall', 'pkgcat']);
    expect(u.code).toBe(0);
    expect(u.stdout).toContain('package-uninstall: removed pkgcat');
    expect(existsSync(recordPath(sb, 'pkgcat'))).toBe(false);
  });

  it('[the-engine-r22] a package root path is read from the working folder, then the package lands in the workspace root', async () => {
    const sb = sandbox('relpath');
    fixture(sb, 'pkgrel');
    mkdirSync(join(sb, 'sub'), { recursive: true });
    const r = await verb(sb, ['install', '../catalog/pkgrel'], { cwd: join(sb, 'sub') });
    expect(r.code).toBe(0);
    expect(existsSync(recordPath(sb, 'pkgrel'))).toBe(true);
    expect(existsSync(join(sb, 'sub/.contexture/extensions'))).toBe(false);
  });

  it("[the-engine-r22] an inherited CTX_ROOT is overridden: the package lands in the engine's own workspace", async () => {
    const sb = sandbox('ctxroot');
    const other = sandbox('ctxroot-other');
    const before = treeState(other);
    const r = await verb(sb, ['install', fixture(sb, 'pkgenv')], { env: { CTX_ROOT: other } });
    expect(r.code).toBe(0);
    expect(existsSync(recordPath(sb, 'pkgenv'))).toBe(true);
    expect(treeState(other)).toBe(before);
  });

  it("[the-engine-r22] a package root outside the workspace installs into the engine's workspace, while a direct call without CTX_ROOT lands in the root's ../..", async () => {
    const sb = sandbox('outside');
    const other = sandbox('outside-other');
    const p = fixture(other, 'pkgout');
    const r = await verb(sb, ['install', p]);
    expect(r.code).toBe(0);
    expect(existsSync(recordPath(sb, 'pkgout'))).toBe(true);
    expect(existsSync(recordPath(other, 'pkgout'))).toBe(false);
    const nullCheck = await direct(sb, 'install', fixture(other, 'pkgout2'), {});
    expect(nullCheck.code).toBe(0);
    expect(existsSync(recordPath(other, 'pkgout2'))).toBe(true);
    expect(existsSync(recordPath(sb, 'pkgout2'))).toBe(false);
  });

  it('[the-engine-r22] .contexture/plugins/<name> resolves ahead of ./plugins/<name> on install and uninstall, and direct script fallback handles .contexture/plugins/<name> without CTX_ROOT', async () => {
    const sb = sandbox('ctxplugins-precedence');
    fixture(sb, 'pkgprec', join(sb, 'plugins'));
    const shadow = join(sb, '.contexture/plugins/pkgprec');
    mkdirSync(join(shadow, '.contexture/extensions'), { recursive: true });
    addModule(shadow, 'mprec-shadow');
    writeManifest(shadow, '2.0.0');
    const r = await verb(sb, ['install', 'pkgprec']);
    expect(r.code).toBe(0);
    expect(recordText(sb, 'pkgprec')).toContain('version 2.0.0');
    expect(existsSync(extPath(sb, 'modules/mprec-shadow/module'))).toBe(true);
    expect(existsSync(extPath(sb, 'modules/mprec/module'))).toBe(false);
    expect((await verb(sb, ['uninstall', 'pkgprec'])).code).toBe(0);
    expect(existsSync(recordPath(sb, 'pkgprec'))).toBe(false);

    const directInst = await direct(sb, 'install', shadow, {});
    expect(directInst.code).toBe(0);
    expect(existsSync(recordPath(sb, 'pkgprec'))).toBe(true);
    const directUninst = await direct(sb, 'uninstall', shadow, {});
    expect(directUninst.code).toBe(0);
    expect(existsSync(recordPath(sb, 'pkgprec'))).toBe(false);
  });
});
