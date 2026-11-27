import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec, type Run } from '../support/exec';
import { addModule, extPath, newPkg, recordText, uninstall, writeManifest } from '../support/packages';
import { stage } from '../support/stage';
import { put, treeState } from '../support/tree';

const sandbox = () => stage('posix', 'pkg-alias');
const install = (sb: string, pkg: string, ...flags: string[]): Promise<Run> => exec('./.contexture/ctx', ['package', 'install', ...flags, pkg], { cwd: sb });

// memosPkg: a package carrying one module named memos whose verbs write and name the module's
// own namespace through the storage library, its law slug the package's own
function memosPkg(sb: string, name: string): string {
  const p = newPkg(sb, name);
  const dir = join(p, '.contexture/extensions/modules/memos');
  put(join(dir, 'module'), `# summary: the memos module of ${name}\n# version: 1.0.0\n# description:\n# A memo fixture module.\n`);
  put(join(dir, 'laws'), `@append @laws\n  ${name}-law: a memo fixture law\n`);
  put(join(dir, 'data'), 'key: <a>/<b>\n');
  put(join(dir, 'scripts/put'), '#!/bin/sh\n# summary: save a memo\n. "$CTX_ROOT/.contexture/storage/scripts/library"\nstore_put "$1" > /dev/null && store_namespace\n', 0o755);
  writeManifest(p);
  return p;
}

const say = (sb: string, args: string[], input = ''): Promise<Run> => exec('./.contexture/ctx', args, { cwd: sb, input });

// rootedPkg: a package carrying one module whose data file declares the root shared, its put
// verb writing through the storage library and naming the namespace it wrote
function rootedPkg(sb: string, name: string, module: string): string {
  const p = newPkg(sb, name);
  const dir = join(p, '.contexture/extensions/modules', module);
  put(join(dir, 'module'), `# summary: the ${module} module of ${name}\n# version: 1.0.0\n# description:\n# A rooted fixture module.\n`);
  put(join(dir, 'data'), 'root: shared\nkey: <a>/<b>\n');
  put(join(dir, 'scripts/put'), '#!/bin/sh\n# summary: save a value\n. "$CTX_ROOT/.contexture/storage/scripts/library"\nstore_put "$1" > /dev/null && store_namespace\n', 0o755);
  writeManifest(p);
  return p;
}

describe.concurrent('package-install: install aliases', () => {
  it('[modules-r15, the-engine-r22, modules-r19] two packages carrying a module of one name coexist: the second refuses naming --as, then installs under the alias with its files, laws, record line, and namespace', async () => {
    const sb = sandbox();
    expect((await install(sb, memosPkg(sb, 'pkg-memos'))).code).toBe(0);
    const pro = memosPkg(sb, 'pkg-memos-pro');
    const clash = await install(sb, pro);
    expect([clash.code, clash.stderr]).toEqual([1, "package-install: another package's module: .contexture/extensions/modules/memos (recorded by pkg-memos; install it under another name: --as=memos=<name>)\n"]);
    const aliased = await install(sb, pro, '--as=memos=memos2');
    expect(aliased.stderr).not.toMatch(/error|refus/);
    expect(aliased.code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/memos2/scripts/put'))).toBe(true);
    const record = recordText(sb, 'pkg-memos-pro');
    expect(record).toMatch(/^module memos2 memos$/m);
    expect(record).toMatch(/^file \S+ \S+ \.contexture\/extensions\/modules\/memos2\/scripts\/put$/m);
    expect(record).toMatch(/^law \.contexture\/extensions\/modules\/memos2\/laws$/m);
    expect(record).not.toMatch(/extensions\/modules\/memos\//);
    expect(recordText(sb, 'pkg-memos')).toMatch(/^module memos memos$/m);
    const generated = readFileSync(join(sb, 'AGENTS.generated.md'), 'utf8');
    expect(generated).toMatch(/^@module memos2$/m);
    expect(generated).toContain('pkg-memos-pro-law');
    expect(await say(sb, ['memos', 'put', 'a/b'], 'first\n')).toMatchObject({ code: 0, stdout: 'memos\n' });
    expect(await say(sb, ['memos2', 'put', 'a/b'], 'second\n')).toMatchObject({ code: 0, stdout: 'memos2\n' });
    expect(readFileSync(join(sb, 'memos/a/b'), 'utf8')).toBe('first\n');
    expect(readFileSync(join(sb, 'memos2/a/b'), 'utf8')).toBe('second\n');
  });

  it('[modules-r15, the-engine-r22] a re-install without --as keeps the recorded alias, and the uninstall removes the alias folder by its recorded paths', async () => {
    const sb = sandbox();
    const p = memosPkg(sb, 'pkg-memos');
    expect((await install(sb, p, '--as=memos=notebook')).code).toBe(0);
    const again = await install(sb, p);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('0 stale removed');
    expect(existsSync(extPath(sb, 'modules/notebook/scripts/put'))).toBe(true);
    expect(existsSync(extPath(sb, 'modules/memos'))).toBe(false);
    expect(recordText(sb, 'pkg-memos')).toMatch(/^module notebook memos$/m);
    const renamed = await install(sb, p, '--as=memos=journalled');
    expect(renamed.code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/journalled/scripts/put'))).toBe(true);
    expect(existsSync(extPath(sb, 'modules/notebook'))).toBe(false);
    const gone = await uninstall(sb, 'pkg-memos', '--delete-data');
    expect(gone.code).toBe(0);
    expect(existsSync(extPath(sb, 'modules/journalled/scripts/put'))).toBe(false);
    expect(existsSync(extPath(sb, '.state/pkg-memos.files'))).toBe(false);
  });

  it('[modules-r15] an alias that collides refuses naming --as, and an alias onto another module of the package refuses, writing nothing', async () => {
    const sb = sandbox();
    put(join(sb, '.contexture/modules/taken/module'), '# summary: a workspace module\n');
    const p = memosPkg(sb, 'pkg-memos');
    const before = treeState(sb);
    const r = await install(sb, p, '--as=memos=taken');
    expect([r.code, r.stderr]).toEqual([1, "package-install: module name 'taken' collides with a workspace module (install it under another name: --as=memos=<name>)\n"]);
    expect(treeState(sb)).toBe(before);
    const two = newPkg(sb, 'pkg-two');
    addModule(two, 'alpha');
    addModule(two, 'beta');
    writeManifest(two);
    const onto = await install(sb, two, '--as=alpha=beta');
    expect([onto.code, onto.stderr]).toEqual([1, "package-install: two modules of the package would install as 'beta' (name each with its own --as=<module>=<name>)\n"]);
    expect(existsSync(extPath(sb, '.state/pkg-two.files'))).toBe(false);
  });

  it.each([
    [['--as=memos'], "ctx: package install: malformed --as '--as=memos' (--as=<module>=<alias>)"],
    [['--as==x'], "ctx: package install: malformed --as '--as==x' (--as=<module>=<alias>)"],
    [['--as=memos=Memos2'], "ctx: package install: malformed --as '--as=memos=Memos2': a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit"],
    [['--as=memos=.hidden'], "ctx: package install: malformed --as '--as=memos=.hidden': a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit"],
    [['--as=memos=_lead'], "ctx: package install: malformed --as '--as=memos=_lead': a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit"],
    [['--as=memos=a', '--as=memos=b'], "ctx: package install: --as names the module 'memos' twice"],
    [['--as=memos=a', '--as=other=a'], "ctx: package install: --as names the alias 'a' twice"],
    [['--as=ghost=g'], "ctx: package install: --as names no module of the package: 'ghost'"],
  ])('[the-engine-r22] ctx package install %j refuses rc 1 with one line before the installer runs, writing nothing', async (flags, line) => {
    const sb = sandbox();
    const p = memosPkg(sb, 'pkg-memos');
    const before = treeState(sb);
    const r = await install(sb, p, ...flags);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `${line}\n`]);
    expect(treeState(sb)).toBe(before);
  });

  it('[modules-r15, modules-r10, the-engine-r22] a module installed under an alias stores under its installed name, so it keeps its store apart from the plain install whose declared root it copies', async () => {
    const sb = sandbox();
    expect((await install(sb, rootedPkg(sb, 'pkg-a', 'memos'))).code).toBe(0);
    const aliased = await install(sb, rootedPkg(sb, 'pkg-b', 'memos'), '--as=memos=memos2');
    expect(aliased.stderr).not.toMatch(/error|refus/);
    expect(aliased.code).toBe(0);
    expect(await say(sb, ['memos', 'put', 'a/b'], 'first\n')).toMatchObject({ code: 0, stdout: 'memos\n' });
    expect(await say(sb, ['memos2', 'put', 'a/b'], 'second\n')).toMatchObject({ code: 0, stdout: 'memos2\n' });
    expect(readFileSync(join(sb, 'shared/a/b'), 'utf8')).toBe('first\n');
    expect(readFileSync(join(sb, 'memos2/a/b'), 'utf8')).toBe('second\n');
  });

  it('[modules-r15, the-engine-r22] a storage root another installed module resolves to refuses naming the root and --as, writing nothing, and installs under an alias; a re-install never collides with itself', async () => {
    const sb = sandbox();
    const a = rootedPkg(sb, 'pkg-a', 'memos');
    expect((await install(sb, a)).code).toBe(0);
    const jots = rootedPkg(sb, 'pkg-c', 'jots');
    const before = treeState(sb);
    const clash = await install(sb, jots);
    expect([clash.code, clash.stdout, clash.stderr]).toEqual([1, '', "package-install: module 'jots' would store under the root 'shared', which the installed module 'memos' stores under (install it under another name: --as=jots=<name>)\n"]);
    expect(treeState(sb)).toBe(before);
    const plain = newPkg(sb, 'pkg-e');
    addModule(plain, 'plain', true);
    writeManifest(plain);
    const withPlain = treeState(sb);
    const onto = await install(sb, plain, '--as=plain=shared');
    expect([onto.code, onto.stderr]).toEqual([1, "package-install: module 'plain' would store under the root 'shared', which the installed module 'memos' stores under (install it under another name: --as=plain=<name>)\n"]);
    expect(treeState(sb)).toBe(withPlain);
    const moved = await install(sb, jots, '--as=jots=jots2');
    expect(moved.stderr).not.toMatch(/error|refus/);
    expect(moved.code).toBe(0);
    expect(await say(sb, ['jots2', 'put', 'a/b'], 'jotted\n')).toMatchObject({ code: 0, stdout: 'jots2\n' });
    expect(readFileSync(join(sb, 'jots2/a/b'), 'utf8')).toBe('jotted\n');
    expect(existsSync(join(sb, 'shared/a/b'))).toBe(false);
    const again = await install(sb, a);
    expect(again.stderr).not.toMatch(/error|refus/);
    expect(again.code).toBe(0);
  });

  it('[modules-r15, the-engine-r22] two modules of one package sharing a storage root refuse naming --as, writing nothing', async () => {
    const sb = sandbox();
    const two = newPkg(sb, 'pkg-two');
    for (const m of ['alpha', 'beta']) {
      addModule(two, m);
      put(join(two, '.contexture/extensions/modules', m, 'data'), 'root: dup\nkey: <a>\n');
    }
    writeManifest(two);
    const before = treeState(sb);
    const r = await install(sb, two);
    expect([r.code, r.stderr]).toEqual([1, "package-install: two modules of the package would store under the root 'dup', 'alpha' and 'beta' (install one under another name: --as=beta=<name>)\n"]);
    expect(treeState(sb)).toBe(before);
    expect((await install(sb, two, '--as=beta=beta2')).code).toBe(0);
  });

  it('[modules-r15, the-engine-r22] a workspace data file that cannot be read beside the good ones refuses an install rc 2 naming that module, writing nothing, since its root cannot be checked; read again, its root collides', async () => {
    const sb = sandbox();
    const broken = join(sb, '.contexture/modules/broken/data');
    put(broken, 'root: shared\nkey: <a>\nbogus: x\n');
    const jots = rootedPkg(sb, 'pkg-c', 'jots');
    const before = treeState(sb);
    const r = await install(sb, jots);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', "package-install: a module data file of the workspace cannot be read, so the storage roots cannot be checked (namespace 'broken': unknown field 'bogus' in the data file); fix that module's data file first\n"]);
    expect(treeState(sb)).toBe(before);
    put(broken, 'root: shared\nkey: <a>\n');
    const clash = await install(sb, jots);
    expect([clash.code, clash.stderr]).toEqual([1, "package-install: module 'jots' would store under the root 'shared', which the installed module 'broken' stores under (install it under another name: --as=jots=<name>)\n"]);
  });

  it('[modules-r15, the-engine-r22] a package whose module data file cannot be read beside a good one refuses rc 1 naming it, writing nothing', async () => {
    const sb = sandbox();
    const two = newPkg(sb, 'pkg-half');
    addModule(two, 'alpha', true);
    addModule(two, 'beta');
    put(join(two, '.contexture/extensions/modules/beta/data'), 'key: <a>\nbogus: x\n');
    writeManifest(two);
    const before = treeState(sb);
    const r = await install(sb, two);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', "package-install: a module data file of the package cannot be read, so its storage roots cannot be checked (namespace 'beta': unknown field 'bogus' in the data file)\n"]);
    expect(treeState(sb)).toBe(before);
  });

  it('[modules-r15, the-engine-r22] a re-install repairs its own installed data file that cannot be read: the replaced copy takes no part in the root check', async () => {
    const sb = sandbox();
    expect((await install(sb, rootedPkg(sb, 'pkg-a', 'memos'))).code).toBe(0);
    const installed = extPath(sb, 'modules/memos/data');
    put(installed, 'root: shared\nkey: <a>/<b>\nbogus: x\n');
    const again = await install(sb, rootedPkg(sb, 'pkg-a', 'memos'));
    expect(again.stderr).not.toMatch(/error|refus|cannot/);
    expect(again.code).toBe(0);
    expect(readFileSync(installed, 'utf8')).toBe('root: shared\nkey: <a>/<b>\n');
  });

  it('[the-engine-r22] an uninstall given --as refuses rc 1 with one line, writing nothing', async () => {
    const sb = sandbox();
    const before = treeState(sb);
    const r = await exec('./.contexture/ctx', ['package', 'uninstall', '--as=memos=x', 'pkg-memos'], { cwd: sb });
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', 'ctx: package uninstall: --as names an install alias; an uninstall takes the installed package alone\n']);
    expect(treeState(sb)).toBe(before);
  });
});
