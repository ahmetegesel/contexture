import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec, type Run } from '../support/exec';
import { holdMove } from '../support/locks';
import { addFile, extPath, newPkg, recordPath, uninstall, writeManifest } from '../support/packages';
import { sandbox as scratch } from '../support/sandbox';
import { stage } from '../support/stage';
import { put, treeState } from '../support/tree';

const sandbox = () => stage('posix', 'pkg-data');
const ctx = (sb: string, args: readonly string[], input = '', env: Record<string, string> = {}): Promise<Run> =>
  exec('./.contexture/ctx', args, { cwd: sb, input, env });
const install = (sb: string, pkg: string, ...flags: string[]): Promise<Run> => ctx(sb, ['package', 'install', ...flags, pkg]);
const keptDir = (sb: string, ns: string): string => extPath(sb, `.state/retained/${ns}`);
const config = (sb: string): string => (existsSync(join(sb, '.contexture/config')) ? readFileSync(join(sb, '.contexture/config'), 'utf8') : '');
// tree: the workspace's fingerprint, the drawer's scratch and the fixture catalog aside
const tree = (sb: string): string => treeState(sb).split('\n').filter((l) => !l.startsWith('.contexture/tmp') && !l.startsWith('catalog/')).join('\n');
const DATA = 'key: <a>/<b>\n';
const ASK = "this needs the human's answer, keep (--keep-data) or delete (--delete-data): relay the question and run it again with the flag the human chooses (the answer is the human's, never a default)";

// memosPkg: a package carrying one module named memos that declares data, with verbs that put
// and list its own namespace through the storage library, and a package uninstall hook that
// notes whether the kept declaration existed when it ran
function memosPkg(sb: string, name = 'pkg-memos', module = 'memos', data = DATA, version = '1.0.0'): string {
  const p = newPkg(sb, name);
  const dir = join(p, '.contexture/extensions/modules', module);
  put(join(dir, 'module'), `# summary: the ${module} module of ${name}\n# version: 1.0.0\n# description:\n# A memo fixture module.\n`);
  put(join(dir, 'data'), data);
  put(join(dir, 'scripts/put'), '#!/bin/sh\n# summary: save a memo\n. "$CTX_ROOT/.contexture/storage/scripts/library"\nstore_put "$1" > /dev/null && store_namespace\n', 0o755);
  put(join(dir, 'scripts/ls'), '#!/bin/sh\n# summary: list memos\n. "$CTX_ROOT/.contexture/storage/scripts/library"\nstore_list\n', 0o755);
  put(join(p, 'hooks/uninstall'), `#!/bin/sh\nif [ -e "$CTX_ROOT/.contexture/extensions/.state/retained" ]; then echo kept > "$CTX_ROOT/hook-saw"; else echo none > "$CTX_ROOT/hook-saw"; fi\n`, 0o755);
  writeManifest(p, version);
  return p;
}

// twoPkg: pkg-two, carrying the data modules alpha and beta, each with its put and ls verbs
function twoPkg(sb: string): string {
  const p = memosPkg(sb, 'pkg-two', 'alpha');
  const dir = join(p, '.contexture/extensions/modules/beta');
  put(join(dir, 'module'), '# summary: the beta module of pkg-two\n# version: 1.0.0\n# description:\n# A second memo fixture module.\n');
  put(join(dir, 'data'), DATA);
  put(join(dir, 'scripts/put'), '#!/bin/sh\n# summary: save a memo\n. "$CTX_ROOT/.contexture/storage/scripts/library"\nstore_put "$1" > /dev/null && store_namespace\n', 0o755);
  writeManifest(p);
  return p;
}

async function memos(sb: string, as = '', keys = ['a/b', 'c/d']): Promise<string> {
  const p = memosPkg(sb);
  expect((await install(sb, p, ...(as ? [`--as=memos=${as}`] : []))).code).toBe(0);
  for (const k of keys) expect((await ctx(sb, [as || 'memos', 'put', k], `${k}\n`)).code).toBe(0);
  return p;
}

const listed = async (sb: string, ns: string): Promise<string[]> =>
  JSON.parse((await exec('./.contexture/storage/scripts/driver-resolver', ['store.list', ns], { cwd: sb, env: { CTX_ROOT: sb } })).stdout).keys;

describe.concurrent('ctx package uninstall: the data answer', () => {
  it('[modules-r13, the-engine-r22] with no answer and no terminal the uninstall refuses rc 1 before any hook, one line naming the package, each namespace with its key count, both flags, and that the answer is the human\'s; nothing is written and the declaration line stays', async () => {
    const sb = sandbox();
    await memos(sb);
    const before = tree(sb);
    const r = await uninstall(sb, 'pkg-memos');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `package-uninstall: uninstalling 'pkg-memos' leaves its data: memos (2 keys); ${ASK}\n`]);
    expect(tree(sb)).toBe(before);
    expect(existsSync(join(sb, 'hook-saw'))).toBe(false);
    expect(config(sb)).toMatch(/^package\.pkg-memos: /m);
  });

  it('[modules-r13] the question goes through the CTX_PACKAGE_TTY seam once, re-asks an unknown answer, and acts on keep; end of input refuses rc 1 writing nothing', async () => {
    const sb = sandbox();
    await memos(sb);
    const seam = put(join(scratch('seam'), 'answers'), 'maybe\nkeep\n');
    const r = await uninstall(sb, 'pkg-memos', '', { CTX_PACKAGE_TTY: seam });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain("package-uninstall: uninstalling 'pkg-memos' leaves its data: memos (2 keys); answer keep or delete: package-uninstall: 'maybe' is no answer; answer keep or delete: ");
    expect(existsSync(keptDir(sb, 'memos'))).toBe(true);
    const ended = sandbox();
    await memos(ended);
    const before = tree(ended);
    const eof = await uninstall(ended, 'pkg-memos', '', { CTX_PACKAGE_TTY: put(join(scratch('seam-eof'), 'answers'), 'maybe\n') });
    expect([eof.code, eof.stdout]).toEqual([1, '']);
    expect(eof.stderr.endsWith('\npackage-uninstall: no answer was read; answer keep or delete, or run it again with --keep-data or --delete-data as the human chooses\n')).toBe(true);
    expect(tree(ended)).toBe(before);
  });

  it('[modules-r13, the-engine-r-cj0ey, the-engine-r22] keep: after the hooks and before the files go, the data declaration is kept under the installed name with its origin, the keys stay listed through the resolver, and the outcome follows the removal line', async () => {
    const sb = sandbox();
    await memos(sb);
    const declared = readFileSync(extPath(sb, 'modules/memos/data'));
    const r = await uninstall(sb, 'pkg-memos', '--keep-data');
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/error|refus/);
    expect(r.stdout.split('\n').slice(-3)).toEqual([
      'package-uninstall: removed pkg-memos from .contexture/extensions (4 removed, 0 preserved, 0 already absent)',
      'package-uninstall: kept the data of memos (2 keys); install pkg-memos again to use it',
      '',
    ]);
    expect(readFileSync(join(sb, 'hook-saw'), 'utf8')).toBe('none\n');
    expect(readdirSync(keptDir(sb, 'memos')).sort()).toEqual(['data', 'origin']);
    expect(readFileSync(join(keptDir(sb, 'memos'), 'data'))).toEqual(declared);
    expect(readFileSync(join(keptDir(sb, 'memos'), 'origin'), 'utf8')).toBe('package pkg-memos\nversion 1.0.0\nmodule memos memos\n');
    expect(existsSync(extPath(sb, 'modules/memos'))).toBe(false);
    expect(existsSync(recordPath(sb, 'pkg-memos'))).toBe(false);
    expect(config(sb)).not.toMatch(/package\.pkg-memos/);
    expect(await listed(sb, 'memos')).toEqual(['a/b', 'c/d']);
    const sd = (args: string[]) => exec('./.contexture/storage/scripts/store-data', args, { cwd: sb });
    expect((await sd(['--list'])).stdout).toContain('memos\tmemos\n');
    expect(await sd(['--retained'])).toMatchObject({ code: 0, stdout: 'memos\tpkg-memos\tmemos\n' });
  });

  it('[modules-r13, modules-r15] keep moves a changed data file into the kept declaration and reports it, and replaces a stale kept declaration of the name', async () => {
    const sb = sandbox();
    await memos(sb);
    writeFileSync(extPath(sb, 'modules/memos/data'), `# edited\n${DATA}`);
    mkdirSync(keptDir(sb, 'memos'), { recursive: true });
    writeFileSync(join(keptDir(sb, 'memos'), 'origin'), 'package pkg-memos\nversion 0.1.0\nmodule memos memos\n');
    const r = await uninstall(sb, 'pkg-memos', '--keep-data');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('package-uninstall: removed .contexture/extensions/modules/memos/data (changed since install; its bytes are the kept data declaration)\n');
    expect(readFileSync(join(keptDir(sb, 'memos'), 'data'), 'utf8')).toBe(`# edited\n${DATA}`);
    expect(readFileSync(join(keptDir(sb, 'memos'), 'origin'), 'utf8')).toBe('package pkg-memos\nversion 1.0.0\nmodule memos memos\n');
    expect(existsSync(extPath(sb, 'modules/memos'))).toBe(false);
  });

  it('[modules-r13, modules-r15, the-engine-r22] keep under an alias, then the same package returns: the module comes back under its kept name, the kept declaration leaves, and its verbs read the kept keys', async () => {
    const sb = sandbox();
    await memos(sb, 'notebook');
    const kept = await uninstall(sb, 'pkg-memos', '--keep-data');
    expect(kept.stdout).toContain('kept the data of notebook (2 keys); install pkg-memos again to use it');
    expect(readFileSync(join(keptDir(sb, 'notebook'), 'origin'), 'utf8')).toBe('package pkg-memos\nversion 1.0.0\nmodule notebook memos\n');
    expect((await exec('./.contexture/storage/scripts/store-data', ['notebook'], { cwd: sb })).stdout.split('\n')[1]).toBe('notebook');
    const back = await install(sb, join(sb, 'catalog/pkg-memos'));
    expect(back.code).toBe(0);
    expect(back.stderr).not.toMatch(/error|refus/);
    expect(back.stdout).toContain('package-install: took back the kept data of notebook (module memos under its kept name)\n');
    expect(existsSync(keptDir(sb, 'notebook'))).toBe(false);
    expect(existsSync(extPath(sb, '.state/retained'))).toBe(false);
    expect(readFileSync(recordPath(sb, 'pkg-memos'), 'utf8')).toMatch(/^module notebook memos$/m);
    expect(config(sb)).toMatch(/^package\.pkg-memos: \.\/catalog\/pkg-memos --as=memos=notebook$/m);
    expect(JSON.parse((await ctx(sb, ['notebook', 'ls'])).stdout).keys).toEqual(['a/b', 'c/d']);
  });

  it('[modules-r15] a failed install over kept data leaves the kept declaration in place, and the retry takes it back', async () => {
    const sb = sandbox();
    await memos(sb);
    expect((await uninstall(sb, 'pkg-memos', '--keep-data')).code).toBe(0);
    const keptBefore = treeState(keptDir(sb, 'memos'));
    mkdirSync(extPath(sb, 'modules'), { recursive: true });
    chmodSync(extPath(sb, 'modules'), 0o555);
    try {
      const failed = await install(sb, join(sb, 'catalog/pkg-memos'));
      expect(failed.code).toBe(2);
      expect(treeState(keptDir(sb, 'memos'))).toBe(keptBefore);
    } finally {
      chmodSync(extPath(sb, 'modules'), 0o755);
    }
    const retry = await install(sb, join(sb, 'catalog/pkg-memos'));
    expect(retry.code).toBe(0);
    expect(existsSync(keptDir(sb, 'memos'))).toBe(false);
  });

  it('[modules-r13] delete: every key of the namespace goes through the configured driver after the hooks, and nothing outside its keys is touched', async () => {
    const sb = sandbox();
    await memos(sb);
    put(join(sb, 'memos/README'), 'not a key\n');
    put(join(sb, 'memos/x/y/deeper'), 'not a key either\n');
    put(join(sb, 'guide.md'), 'a page\n');
    const r = await uninstall(sb, 'pkg-memos', '--delete-data');
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/error|refus/);
    expect(r.stdout.endsWith('package-uninstall: deleted 2 keys of memos\n')).toBe(true);
    expect(readFileSync(join(sb, 'hook-saw'), 'utf8')).toBe('none\n');
    expect(existsSync(join(sb, 'memos/c/d'))).toBe(false);
    expect(readFileSync(join(sb, 'memos/README'), 'utf8')).toBe('not a key\n');
    expect(readFileSync(join(sb, 'memos/x/y/deeper'), 'utf8')).toBe('not a key either\n');
    expect(readFileSync(join(sb, 'guide.md'), 'utf8')).toBe('a page\n');
    expect(existsSync(keptDir(sb, 'memos'))).toBe(false);
    expect(existsSync(recordPath(sb, 'pkg-memos'))).toBe(false);
  });

  it('[modules-r13] a delete that fails stops the uninstall rc 2 naming the namespace and the keys deleted so far, with no file and no record removed, and a rerun finishes', async () => {
    const sb = sandbox();
    await memos(sb);
    const release = holdMove(sb, 'posix', 'live');
    let failed: Run;
    try {
      failed = await uninstall(sb, 'pkg-memos', '--delete-data');
    } finally {
      release();
    }
    expect([failed.code, failed.stdout]).toEqual([2, '']);
    expect(failed.stderr).toBe("package-uninstall: deleting the data of 'memos' stopped (deleting the keys of namespace 'memos' stopped after 0 of 2 keys: storage is being moved to another driver; retry after the move ends (ERR_STORAGE_LOCKED)); no file and no record removed, so the package stays installed: run the uninstall again to finish\n");
    expect(existsSync(recordPath(sb, 'pkg-memos'))).toBe(true);
    expect(existsSync(extPath(sb, 'modules/memos/data'))).toBe(true);
    expect(config(sb)).toMatch(/^package\.pkg-memos: /m);
    expect(await listed(sb, 'memos')).toEqual(['a/b', 'c/d']);
    const rerun = await uninstall(sb, 'pkg-memos', '--delete-data');
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain('deleted 2 keys of memos');
    expect(existsSync(recordPath(sb, 'pkg-memos'))).toBe(false);
  });

  it('[modules-r13] a namespace whose key count fails counts as holding data: the refusal names it with an unknown count, and keep retains it', async () => {
    const sb = sandbox();
    await memos(sb);
    writeFileSync(extPath(sb, 'modules/memos/data'), `${DATA}bogus: x\n`);
    const r = await uninstall(sb, 'pkg-memos');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `package-uninstall: uninstalling 'pkg-memos' leaves its data: memos (key count unknown); ${ASK}\n`]);
    const kept = await uninstall(sb, 'pkg-memos', '--keep-data');
    expect(kept.code).toBe(0);
    expect(kept.stdout).toContain('package-uninstall: kept the data of memos (key count unknown); install pkg-memos again to use it\n');
    expect(readFileSync(join(keptDir(sb, 'memos'), 'data'), 'utf8')).toBe(`${DATA}bogus: x\n`);
  });

  it('[modules-r13] a data carrying module whose namespace holds no key is neither asked about nor kept', async () => {
    const sb = sandbox();
    await memos(sb, '', []);
    const r = await uninstall(sb, 'pkg-memos');
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/error|refus/);
    expect(r.stdout).not.toMatch(/kept|deleted/);
    expect(existsSync(extPath(sb, '.state'))).toBe(false);
  });

  it.each([
    [['uninstall', 'pkg-memos', '--keep-data', '--delete-data'], 'ctx: package uninstall: --keep-data and --delete-data together; give the one answer the human chose'],
    [['uninstall', 'pkg-memos', '--delete-data', '--delete-data'], 'ctx: package uninstall: --delete-data is given twice'],
    [['install', '--keep-data', 'catalog/pkg-memos'], "ctx: package install: --keep-data answers an uninstall's data question; an install takes no data answer"],
    [['install', 'catalog/pkg-memos', '--delete-data'], "ctx: package install: --delete-data answers an uninstall's data question; an install takes no data answer"],
  ])('[the-engine-r22] ctx package %j refuses rc 1 with one line before the package script runs, writing nothing', async (args, line) => {
    const sb = sandbox();
    await memos(sb);
    const before = tree(sb);
    const r = await ctx(sb, ['package', ...args]);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `${line}\n`]);
    expect(tree(sb)).toBe(before);
  });

  it('[the-engine-r22] either flag on a package with no data carrying module is accepted and changes nothing beyond the uninstall', async () => {
    for (const flag of ['--keep-data', '--delete-data'] as const) {
      const sb = sandbox();
      const p = newPkg(sb, 'pkg-plain');
      addFile(p, 'rhythms/plain.md', 'a plain rhythm');
      writeManifest(p);
      expect((await install(sb, p)).code).toBe(0);
      const r = await uninstall(sb, 'pkg-plain', flag);
      expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/error|refus/);
      expect(r.stdout).not.toMatch(/kept|deleted/);
      expect(existsSync(extPath(sb, '.state'))).toBe(false);
    }
  });

  it('[modules-r13, the-engine-r22] kept data of a package that is not installed: no answer refuses, --keep-data changes nothing rc 0, --delete-data deletes it by the package name', async () => {
    const sb = sandbox();
    await memos(sb);
    expect((await uninstall(sb, 'pkg-memos', '--keep-data')).code).toBe(0);
    const before = tree(sb);
    const asked = await uninstall(sb, 'pkg-memos');
    expect([asked.code, asked.stdout, asked.stderr]).toEqual([1, '', `package-uninstall: 'pkg-memos' is not installed and keeps its data: memos (2 keys); ${ASK}\n`]);
    const keep = await uninstall(sb, 'pkg-memos', '--keep-data');
    expect([keep.code, keep.stdout, keep.stderr]).toEqual([0, "package-uninstall: kept the data of memos (2 keys); install pkg-memos again to use it\npackage-uninstall: 'pkg-memos' is not installed; its kept data stays\n", '']);
    expect(tree(sb)).toBe(before);
    const del = await uninstall(sb, 'pkg-memos', '--delete-data');
    expect([del.code, del.stdout, del.stderr]).toEqual([0, "package-uninstall: deleted 2 keys of memos\npackage-uninstall: deleted the kept data of 'pkg-memos', which is not installed\n", '']);
    expect(existsSync(extPath(sb, '.state'))).toBe(false);
    expect(existsSync(join(sb, 'memos/a/b'))).toBe(false);
    const again = await uninstall(sb, 'pkg-memos', '--delete-data');
    expect([again.code, again.stderr]).toEqual([1, 'package-uninstall: package \'pkg-memos\' is not installed (no record at .contexture/extensions/.state/pkg-memos.files)\n']);
  });

  it('[the-engine-r22] ctx package list prints one line per kept namespace before the closing line: the package that kept it, its key count (unknown when the count fails), and the two ways forward, naming no storage path', async () => {
    const sb = sandbox();
    await memos(sb, 'notebook');
    expect((await uninstall(sb, 'pkg-memos', '--keep-data')).code).toBe(0);
    const lone = await ctx(sb, ['package', 'list']);
    expect([lone.code, lone.stderr]).toEqual([0, '']);
    expect(lone.stdout).toBe('kept data notebook: kept by pkg-memos, module memos (2 keys); install pkg-memos again to use it, or delete it with ctx package uninstall pkg-memos --delete-data\npackage list: no package is declared or installed\n');
    const p = newPkg(sb, 'pkg-plain');
    addFile(p, 'rhythms/plain.md', 'a plain rhythm');
    writeManifest(p);
    expect((await install(sb, p)).code).toBe(0);
    writeFileSync(join(keptDir(sb, 'notebook'), 'data'), 'key: <a>/<b>\nbogus: x\n');
    const r = await ctx(sb, ['package', 'list']);
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/error|refus/);
    expect(r.stdout.split('\n').slice(-3)).toEqual([
      'kept data notebook: kept by pkg-memos, module memos (key count unknown); install pkg-memos again to use it, or delete it with ctx package uninstall pkg-memos --delete-data',
      'package list: 1 declared, 1 installed, 0 drift',
      '',
    ]);
    expect(r.stdout).not.toMatch(/\.state|retained|\.contexture/);
  });

  it('[modules-r15] another package installing a module under a kept name refuses rc 1 naming the name, the package that kept it, and --as; a root over kept data refuses as kept data; an --as naming another name for a kept module refuses naming the kept one; each writes nothing', async () => {
    const sb = sandbox();
    await memos(sb);
    expect((await uninstall(sb, 'pkg-memos', '--keep-data')).code).toBe(0);
    const other = memosPkg(sb, 'pkg-other');
    const before = tree(sb);
    const r = await install(sb, other);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', "package-install: module name 'memos' holds data that package 'pkg-memos' kept at its uninstall (install it under another name: --as=memos=<name>)\n"]);
    const rooted = memosPkg(sb, 'pkg-rooted', 'jots', 'root: memos\nkey: <a>/<b>\n');
    const clash = await install(sb, rooted);
    expect([clash.code, clash.stderr]).toEqual([1, "package-install: module 'jots' would store under the root 'memos', which holds the data of namespace 'memos' that package 'pkg-memos' kept at its uninstall (install it under another name: --as=jots=<name>)\n"]);
    const elsewhere = await install(sb, join(sb, 'catalog/pkg-memos'), '--as=memos=other');
    expect([elsewhere.code, elsewhere.stderr]).toEqual([1, "package-install: module 'memos' has kept data under the name 'memos', so it returns under that name: --as=memos=memos (or delete the kept data first: ctx package uninstall pkg-memos --delete-data)\n"]);
    expect(tree(sb)).toBe(before);
    expect((await install(sb, other, '--as=memos=memos2')).code).toBe(0);
  });

  it('[modules-r15] a re-install that would leave an installed module\'s data undeclared refuses rc 1 before any write, naming the module, its namespace, and the way forward: an --as moving it, and a version dropping it', async () => {
    const sb = sandbox();
    const p = await memos(sb, 'notebook', ['a/b']);
    const line = "package-install: the re-install would leave the data of module 'memos' (namespace 'notebook', 1 key) undeclared; uninstall the package with --keep-data or --delete-data as the human answers, then install it\n";
    const before = tree(sb);
    const moved = await install(sb, p, '--as=memos=journal');
    expect([moved.code, moved.stdout, moved.stderr]).toEqual([1, '', line]);
    rmSync(join(p, '.contexture/extensions/modules/memos'), { recursive: true });
    addFile(p, 'rhythms/plain.md', 'a plain rhythm');
    writeManifest(p, '2.0.0');
    const dropped = await install(sb, p);
    expect([dropped.code, dropped.stdout, dropped.stderr]).toEqual([1, '', line]);
    expect(tree(sb)).toBe(before);
  });

  it('[modules-r13, modules-r15] a kept declaration the storage core cannot read names its one repair: another data package\'s install and the delete by name both say to install the package that kept it again, writing nothing', async () => {
    const sb = sandbox();
    await memos(sb, '', ['a/b']);
    expect((await uninstall(sb, 'pkg-memos', '--keep-data')).code).toBe(0);
    writeFileSync(join(keptDir(sb, 'memos'), 'data'), `${DATA}bogus: x\n`);
    const other = memosPkg(sb, 'pkg-jots', 'jots');
    const before = tree(sb);
    const r = await install(sb, other);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', "package-install: the data package 'pkg-memos' kept under namespace 'memos' has a declaration the storage core cannot read (unknown field 'bogus' in the data file), so the storage roots cannot be checked; install pkg-memos again to take it back, which repairs it\n"]);
    const del = await uninstall(sb, 'pkg-memos', '--delete-data');
    expect([del.code, del.stdout, del.stderr]).toEqual([2, '', "package-uninstall: deleting the kept data of 'memos' cannot list its keys, since its kept declaration cannot be read (unknown field 'bogus' in the data file); install pkg-memos again to take it back, which repairs it, then uninstall it with --delete-data\n"]);
    expect(tree(sb)).toBe(before);
  });

  it('[the-engine-r22, modules-r13, modules-r15] a direct call of the uninstaller or the installer without CTX_ROOT counts and deletes in the workspace its package path names, never in the workspace it runs from', async () => {
    const sb = sandbox();
    await memos(sb);
    const other = sandbox();
    await memos(other, '', ['a/b', 'c/d', 'e/f']);
    const direct = (script: string, env: Record<string, string>): Promise<Run> =>
      exec('sh', [join(sb, '.contexture', script), join(sb, 'catalog/pkg-memos')], { cwd: other, env });
    const asked = await direct('package-uninstall', {});
    expect([asked.code, asked.stderr]).toEqual([1, `package-uninstall: uninstalling 'pkg-memos' leaves its data: memos (2 keys); ${ASK}\n`]);
    const del = await direct('package-uninstall', { CTX_PACKAGE_DATA: 'delete' });
    expect(del.code).toBe(0);
    expect(del.stdout.endsWith('package-uninstall: deleted 2 keys of memos\n')).toBe(true);
    expect(existsSync(join(sb, 'memos/a/b'))).toBe(false);
    expect(await listed(other, 'memos')).toEqual(['a/b', 'c/d', 'e/f']);
    const held = sandbox();
    const p = await memos(held, 'notebook', ['a/b']);
    const empty = sandbox();
    await memos(empty, 'notebook', []);
    const moved = await exec('sh', [join(held, '.contexture/package-install'), p], { cwd: empty, env: { CTX_PACKAGE_AS: 'memos=journal' } });
    expect([moved.code, moved.stderr]).toEqual([1, "package-install: the re-install would leave the data of module 'memos' (namespace 'notebook', 1 key) undeclared; uninstall the package with --keep-data or --delete-data as the human answers, then install it\n"]);
  });

  it('[modules-r15] the same package returns over its kept data only while the returning module declares it under the kept roots: a version without its data file, or storing it under another root, refuses rc 1 before any write and the kept data stays', async () => {
    const sb = sandbox();
    const p = memosPkg(sb, 'pkg-memos', 'memos', 'root: memos-v1\nkey: <a>/<b>\n');
    expect((await install(sb, p)).code).toBe(0);
    expect((await ctx(sb, ['memos', 'put', 'a/b'], 'a/b\n')).code).toBe(0);
    expect((await uninstall(sb, 'pkg-memos', '--keep-data')).code).toBe(0);
    const before = tree(sb);
    const way = 'so its verbs would not read the kept keys; install the version that kept it (1.0.0), or delete the kept data first: ctx package uninstall pkg-memos --delete-data';
    memosPkg(sb, 'pkg-memos', 'memos', 'root: memos-v2\nkey: <a>/<b>\n', '2.0.0');
    const moved = await install(sb, p);
    expect([moved.code, moved.stdout, moved.stderr]).toEqual([1, '', `package-install: module 'memos' returns over the data kept under 'memos', but this version stores it under 'memos-v2' where the kept data lies under 'memos-v1', ${way}\n`]);
    rmSync(join(p, '.contexture/extensions/modules/memos/data'));
    const bare = await install(sb, p);
    expect([bare.code, bare.stdout, bare.stderr]).toEqual([1, '', `package-install: module 'memos' returns over the data kept under 'memos', but this version carries no data file for it, ${way}\n`]);
    expect(tree(sb)).toBe(before);
    memosPkg(sb, 'pkg-memos', 'memos', 'root: memos-v1\nkey: <a>/<b>\n', '3.0.0');
    expect((await install(sb, p)).code).toBe(0);
    expect(JSON.parse((await ctx(sb, ['memos', 'ls'])).stdout).keys).toEqual(['a/b']);
  });

  it('[modules-r15] a kept declaration the reader refuses is repaired by the same package\'s return, which takes it back', async () => {
    const sb = sandbox();
    const p = await memos(sb, '', ['a/b']);
    expect((await uninstall(sb, 'pkg-memos', '--keep-data')).code).toBe(0);
    writeFileSync(join(keptDir(sb, 'memos'), 'data'), `${DATA}bogus: x\n`);
    expect((await exec('./.contexture/storage/scripts/store-data', ['--list'], { cwd: sb })).code).toBe(1);
    const back = await install(sb, p);
    expect(back.code).toBe(0);
    expect(back.stderr).not.toMatch(/error|refus/);
    expect((await exec('./.contexture/storage/scripts/store-data', ['--list'], { cwd: sb })).code).toBe(0);
    expect(JSON.parse((await ctx(sb, ['memos', 'ls'])).stdout).keys).toEqual(['a/b']);
  });

  it('[modules-r15] a take back that fails part way restores the kept declarations it already took, and the retry takes both', async () => {
    const sb = sandbox();
    const p = twoPkg(sb);
    expect((await install(sb, p)).code).toBe(0);
    expect((await ctx(sb, ['alpha', 'put', 'a/b'], 'a/b\n')).code).toBe(0);
    expect((await ctx(sb, ['beta', 'put', 'c/d'], 'c/d\n')).code).toBe(0);
    expect((await uninstall(sb, 'pkg-two', '--keep-data')).code).toBe(0);
    const before = tree(sb);
    chmodSync(keptDir(sb, 'beta'), 0o555);
    let failed: Run;
    try {
      failed = await install(sb, p);
    } finally {
      chmodSync(keptDir(sb, 'beta'), 0o755);
    }
    expect(failed.code).toBe(2);
    expect(failed.stderr).toContain("package-install: cannot take back the kept data of 'beta'\n");
    expect(tree(sb)).toBe(before);
    expect((await install(sb, p)).code).toBe(0);
    expect(existsSync(extPath(sb, '.state/retained'))).toBe(false);
    expect(JSON.parse((await ctx(sb, ['alpha', 'ls'])).stdout).keys).toEqual(['a/b']);
  });

  it('[modules-r13] a delete that stops at a later namespace first names the keys the earlier namespaces lost, so no deletion goes unreported', async () => {
    const sb = sandbox();
    const p = twoPkg(sb);
    expect((await install(sb, p)).code).toBe(0);
    for (const k of ['a/b', 'c/d']) expect((await ctx(sb, ['alpha', 'put', k], `${k}\n`)).code).toBe(0);
    expect((await ctx(sb, ['beta', 'put', 'e/f'], 'e/f\n')).code).toBe(0);
    chmodSync(join(sb, 'beta/e'), 0o555);
    let failed: Run;
    try {
      failed = await uninstall(sb, 'pkg-two', '--delete-data');
    } finally {
      chmodSync(join(sb, 'beta/e'), 0o755);
    }
    expect([failed.code, failed.stdout]).toEqual([2, 'package-uninstall: deleted 2 keys of alpha\n']);
    expect(failed.stderr).toMatch(/^package-uninstall: deleting the data of 'beta' stopped \(deleting the keys of namespace 'beta' stopped after 0 of 1 keys: .*\); no file and no record removed, so the package stays installed: run the uninstall again to finish\n$/);
    expect(existsSync(recordPath(sb, 'pkg-two'))).toBe(true);
    const rerun = await uninstall(sb, 'pkg-two', '--delete-data');
    expect(rerun.code).toBe(0);
    expect(rerun.stdout).toContain('package-uninstall: deleted 1 key of beta\n');
  });

  it('[the-engine-r22] ctx package uninstall --help and the package table name both data flags', async () => {
    const sb = sandbox();
    const help = await ctx(sb, ['package', 'uninstall', '--help']);
    expect(help.stdout).toMatch(/^--keep-data, --delete-data: the answer given ahead;/m);
    const table = await ctx(sb, ['package']);
    expect(table.stdout).toMatch(/^ {2}ctx package uninstall <package> \[--keep-data\|--delete-data\] +\S/m);
  });
});
