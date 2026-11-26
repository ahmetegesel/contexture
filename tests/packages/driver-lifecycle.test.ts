import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { lockPath, moveMarker, RECORD_ROOT } from '../support/drawer';
import { describe, expect, it } from 'vitest';
import { exec, launch, type Run } from '../support/exec';
import { holdMove } from '../support/locks';
import { addFile, newPkg, recordText, writeManifest } from '../support/packages';
import { alive } from '../support/procs';
import { sandbox as scratch } from '../support/sandbox';
import { stage } from '../support/stage';
import { put, treeState } from '../support/tree';
import { hookEnv, seam, twinPkg } from '../support/twin';

const SLOW = { timeout: 1_200_000 };
const sandbox = (label = 'drv') => stage('posix', label);
const ctx = (sb: string, args: readonly string[], env: Record<string, string> = {}, input = ''): Promise<Run> =>
  exec('./.contexture/ctx', args, { cwd: sb, env, input, timeout: 600_000 });
const install = (sb: string, pkg: string, ...flags: string[]) => ctx(sb, ['package', 'install', pkg, ...flags]);
const uninstall = (sb: string, pkg: string, ...flags: string[]) => ctx(sb, ['package', 'uninstall', pkg, ...flags]);
const resolver = (sb: string, args: readonly string[], input = '') =>
  exec('./.contexture/storage/scripts/driver-resolver', args, { cwd: sb, input, env: { CTX_ROOT: sb } });
const keys = async (sb: string, driver: string, ns: string): Promise<string[]> =>
  JSON.parse((await resolver(sb, [`--driver=${driver}`, 'store.list', ns])).stdout).keys;
const scan = async (sb: string, driver: string, ns: string): Promise<string> => (await resolver(sb, [`--driver=${driver}`, 'store.scan', ns])).stdout;
const moveState = async (sb: string): Promise<string> => (await resolver(sb, ['move-state'])).stdout.trim();
const conf = (sb: string): string => (existsSync(join(sb, '.contexture/config')) ? readFileSync(join(sb, '.contexture/config'), 'utf8') : '');
// tree: the workspace's fingerprint, the drawer's scratch and the fixture catalog aside
const tree = (sb: string): string => treeState(sb).split('\n').filter((l) => !l.startsWith('.contexture/tmp') && !l.startsWith('catalog/')).join('\n');
const runs = (sb: string): string[] => readdirSync(join(sb, '.contexture/tmp')).filter((n) => n.startsWith('driver-run.'));
const ANSWER = "this needs the human's answer, backup (--backup-old) or delete (--delete-old): relay the question and run it again with the flag the human chooses (the answer is the human's, never a default)";

async function seed(sb: string): Promise<void> {
  expect((await ctx(sb, ['unit', 'bootstrap', 'demo', 'a unit to move'])).code).toBe(0);
  expect((await ctx(sb, ['unit', 'record', 'demo', '--what=an event to move'])).code).toBe(0);
}

async function waitFor(path: string, ms = 240_000): Promise<number> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (existsSync(path)) {
      const pid = Number(readFileSync(path, 'utf8').trim());
      if (pid > 0) return pid;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`waitFor: ${path} never appeared`);
}

// unchanged: the run that failed left the workspace as it found it: the fingerprint, no
// freeze, no run folder
async function unchanged(sb: string, before: string): Promise<void> {
  expect(tree(sb)).toBe(before);
  expect(await moveState(sb)).toBe('free');
  expect(runs(sb)).toEqual([]);
}

describe.concurrent('a driver package install: the answers up front', () => {
  it('[the-engine-r17, the-engine-r22] with posix holding records and no answer, no terminal refuses rc 1 with one line naming the package, what the answer decides, both flags, and that the answer is the human\'s; nothing is written', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    const p = twinPkg(sb);
    const before = tree(sb);
    const r = await install(sb, p);
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toBe(`package-install: installing 'twin-pkg' moves the record from posix into the 'twin' driver and leaves its old posix copy: unit (4 keys); back it up or delete it; ${ANSWER}\n`);
    await unchanged(sb, before);
  });

  it('[the-engine-r22] the flags refuse rc 1 before anything is written: both answers, a driver setting on an uninstall, on a bare install, on a feature package, an undeclared key, a bad value, a storage variable, and a required setting with no default left unanswered', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    const p = twinPkg(sb, { config: 'limit: optional integer min 1 default 5\n  A test setting.\n' });
    const f = newPkg(sb, 'pkg-feature');
    addFile(f, 'rhythms/r.md', '# r');
    writeManifest(f);
    const req = twinPkg(sb, { name: 'twin-req', driver: 'twinreq', config: 'token: required string\n  A required setting with no default.\n' });
    const before = tree(sb);
    const cases: [Promise<Run>, string][] = [
      [install(sb, p, '--backup-old', '--delete-old'), 'ctx: package install: --backup-old and --delete-old together; give the one answer the human chose\n'],
      [uninstall(sb, 'twin-pkg', '--driver-config=limit=2'), 'ctx: package uninstall: --driver-config sets a driver package\'s setting at its install; an uninstall takes none\n'],
      [ctx(sb, ['package', 'install', '--driver-config=limit=2']), 'ctx: package install: --driver-config sets one driver package\'s setting; name that package\n'],
      [install(sb, f, '--driver-config=limit=2'), "package-install: --driver-config sets a driver package's setting, and 'pkg-feature' is a feature package\n"],
      [install(sb, p, '--backup-old', '--driver-config=size=2'), "package-install: --driver-config=size=2: the 'twin' driver's config schema declares no key 'size'\n"],
      [install(sb, p, '--backup-old', '--driver-config=limit=zero'), "package-install: --driver-config=limit=zero: key 'limit': takes an integer, not 'zero' (ERR_SCHEMA_VIOLATION)\n"],
      [ctx(sb, ['package', 'install', p, '--backup-old'], { CTX_STORAGE_DRIVER: 'posix' }), 'package-install: the environment sets CTX_STORAGE_DRIVER; a storage variable can point a driver elsewhere, so unset it and run again\n'],
      [install(sb, req, '--backup-old'), "package-install: installing 'twin-req' needs the 'twinreq' driver's setting 'token', which has no default; this needs the human's answer, a value given as --driver-config=token=<value>: relay the question and run it again with the value the human chooses (the answer is the human's, never a default)\n"],
    ];
    for (const [run, line] of cases) {
      const r = await run;
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', line]);
    }
    await unchanged(sb, before);
  });

  it('[the-engine-r22] the question goes through the CTX_PACKAGE_TTY seam once, re-asks an unknown answer, and backs the old copy up; end of input refuses rc 1 writing nothing', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    const p = twinPkg(sb);
    const before = tree(sb);
    const ended = await ctx(sb, ['package', 'install', p], { CTX_PACKAGE_TTY: put(join(scratch('seam'), 'none'), '') });
    expect(ended.code).toBe(1);
    expect(ended.stderr).toContain('package-install: no answer was read; answer backup or delete, or run it again with --backup-old or --delete-old as the human chooses');
    await unchanged(sb, before);
    const posixScan = await scan(sb, 'posix', 'unit');
    const r = await ctx(sb, ['package', 'install', p], { CTX_PACKAGE_TTY: put(join(scratch('seam'), 'answers'), 'maybe\nbackup\n') });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toContain("answer backup or delete: package-install: 'maybe' is no answer; answer backup or delete: ");
    const stamp = /^retired 4 keys in \d+ namespaces, backup stamped ([0-9]{8}-[0-9]{6}-[0-9]+)$/m.exec(r.stdout)?.[1];
    expect(stamp, r.stdout).toBeDefined();
    expect(readFileSync(join(sb, `.contexture/backups/move-${stamp}/unit/scan`), 'utf8')).toBe(posixScan);
    expect(await keys(sb, 'posix', 'unit')).toEqual([]);
    expect(await scan(sb, 'twin', 'unit')).toBe(posixScan);
    expect(conf(sb)).toMatch(/^storage\.driver: twin$/m);
    expect(recordText(sb, 'twin-pkg')).toMatch(/^driver twin\nformat 1\n/m);
    expect(runs(sb)).toEqual([]);
    expect(await moveState(sb)).toBe('free');
  });

  it('[the-engine-r17, the-engine-r22] --delete-old deletes the old posix copy with no backup, a second driver package is refused while one is installed, and a source listing no key needs no answer, a configured driver line that resolves nothing taking the install from posix', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    const posixScan = await scan(sb, 'posix', 'unit');
    const r = await install(sb, twinPkg(sb), '--delete-old');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('unit: 4 keys copied, dumps equal\n');
    expect(r.stdout).toMatch(/^retired 4 keys in \d+ namespaces, no backup kept$/m);
    expect(r.stdout).toMatch(/; the record reads from the 'twin' driver\n$/);
    expect(existsSync(join(sb, '.contexture/backups'))).toBe(false);
    expect(await keys(sb, 'posix', 'unit')).toEqual([]);
    expect(await scan(sb, 'twin', 'unit')).toBe(posixScan);
    const before = tree(sb);
    const second = await install(sb, twinPkg(sb, { name: 'twin2-pkg', driver: 'twin2', root: 'twin2' }), '--delete-old');
    expect([second.code, second.stdout, second.stderr]).toEqual([1, '', "package-install: the driver package 'twin-pkg' is installed, and one driver package is installed at a time: uninstall it first (ctx package uninstall twin-pkg)\n"]);
    await unchanged(sb, before);
    const empty = sandbox();
    writeFileSync(join(empty, '.contexture/config'), 'storage.driver: twin\n');
    const e = await install(empty, twinPkg(empty));
    expect(e.code, e.stderr).toBe(0);
    expect(e.stdout).toMatch(/^retired 0 keys in \d+ namespaces, nothing to back up$/m);
    expect(conf(empty).match(/^storage\.driver: /gm)).toEqual(['storage.driver: ']);
    expect(conf(empty)).toMatch(/^storage\.driver: twin$/m);
  });
});

describe.concurrent('a driver package install: a failure at each step unwinds to the workspace it found', () => {
  const cases: [string, (sb: string) => string, RegExp, number][] = [
    ['the probe refusing', (sb) => twinPkg(sb, { probe: 'echo "no twin here"; exit 1' }), /^package-install: the package's readiness probe answers that this host cannot run it: no twin here\n$/, 1],
    ['the probe failing', (sb) => twinPkg(sb, { probe: 'echo "broken"; exit 7' }), /^package-install: the package's readiness probe failed \(rc 7\): broken\n$/, 2],
    ['the behavior test', (sb) => twinPkg(sb, { scanFlip: 'flat' }), /^package-install: the install failed at the behavior test \(driver behavior: differs at step c01 .*\); the install is undone\n$/, 2],
    ['the prepare hook', (sb) => { seam(sb, 'prepare-refuse'); return twinPkg(sb); }, /^package-install: the install failed at the driver's prepare \(it refused: the twin refuses to prepare\); the install is undone\n$/, 2],
    ['the preflight', (sb) => { put(join(sb, '.contexture/twin', RECORD_ROOT, 'old/state.md'), 'x\n'); return twinPkg(sb, { hooks: false }); }, /^package-install: the install failed at the preflight \(store-move preflight: error: the target already holds keys and a move never merges, counted below \(ERR_ENTITY_EXISTS\)\); the install is undone\n$/, 2],
    ['the copy', (sb) => { seam(sb, 'fail-batch'); return twinPkg(sb); }, /^package-install: the install failed at the copy \(store-move copy: error: copying namespace 'unit' stopped after 0 of 4 keys were written: the twin refuses this batch \(ERR_STORAGE_WRITE\)\); unwound: unit 4 written, 0 deleted; the install is undone\n$/, 2],
    ['the switch', (sb) => { writeFileSync(join(sb, '.contexture/config'), Buffer.from('# \xff a note\n', 'latin1')); return twinPkg(sb); }, /^package-install: the install failed at the switch \(config: error: the workspace configuration is not valid UTF-8 \(ERR_STORAGE_READ\)\); unwound: (store 0 written, 0 deleted; )?unit 4 written, 4 deleted; the install is undone\n$/, 2],
    ['the check', (sb) => { seam(sb, 'flip-scan'); return twinPkg(sb); }, /^package-install: the install failed at the check \(store-move check: error: the check of namespace '[a-z]+' fails: the dumps differ \(ERR_STORAGE_WRITE\)\); unwound: unit 4 written, 4 deleted; the install is undone\n$/, 2],
  ];
  it.each(cases)('[the-engine-r17, the-engine-r22] %s', SLOW, async (_label, make, line, rc) => {
    const sb = sandbox();
    await seed(sb);
    const p = make(sb);
    const before = tree(sb);
    const r = await install(sb, p, '--backup-old');
    expect([r.code, r.stdout]).toEqual([rc, '']);
    expect(r.stderr.split('\n').filter((l) => !l.startsWith('compose:')).join('\n')).toMatch(line);
    await unchanged(sb, before);
    expect(existsSync(join(sb, '.contexture/extensions/.state/twin-pkg.files'))).toBe(false);
  });

  it('[the-engine-r17, the-engine-r-mvf01] the freeze refusing (a drawer lock folder that cannot hold the marker) unwinds the prepare through the cleanup hook', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    const p = twinPkg(sb);
    const locks = dirname(lockPath(sb, moveMarker()));
    mkdirSync(locks, { recursive: true });
    const before = tree(sb);
    chmodSync(locks, 0o555);
    try {
      const r = await install(sb, p, '--backup-old');
      expect([r.code, r.stdout]).toEqual([2, '']);
      expect(r.stderr).toMatch(/^package-install: the install failed at the freeze \(driver-resolver: ERROR: the drawer's lock folder cannot hold the storage moving marker \(ERR_STORAGE_WRITE\)\); the install is undone\n$/);
      expect(hookEnv(sb, 'twin-cleanup.env').CTX_DRIVER_DIRECTION).toBe('in');
    } finally {
      chmodSync(locks, 0o755);
    }
    await unchanged(sb, before);
  });
});

describe.concurrent('a driver package install: a hangup or termination during a held step', () => {
  it.each([
    ['SIGTERM', 143, 'slow-prepare', 'twin-prepare.pid'],
    ['SIGHUP', 129, 'slow-batch', 'twin-batch.pid'],
  ] as const)('[the-engine-r17] %s stops the held step, unwinds, exits %i, and leaves no process', SLOW, async (sig, rc, slow, pidFile) => {
    const sb = sandbox();
    await seed(sb);
    const p = twinPkg(sb);
    seam(sb, slow);
    const before = tree(sb);
    const run = launch('sh', ['.contexture/package-install', p], { cwd: sb, input: null, env: { CTX_ROOT: sb, CTX_PACKAGE_OLD: 'backup' }, timeout: 600_000 });
    const held = await waitFor(join(sb, '.contexture/tmp', pidFile));
    run.signal(sig);
    const r = await run.result;
    expect(r.code, r.stderr).toBe(rc);
    expect(r.stderr).toMatch(/stopped by a signal during the (driver's prepare|copy)/);
    expect(alive(held)).toBe(false);
    await unchanged(sb, before);
    expect(existsSync(join(sb, '.contexture/twin'))).toBe(false);
  });
});

describe.concurrent('a driver package uninstall moves the record back into posix', () => {
  it('[the-engine-r17, the-engine-r22] the configured driver\'s record moves back byte equal, its storage backed up by the finish hook into the run\'s backup, its setting and driver line gone', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    const p = twinPkg(sb, { config: 'limit: optional integer min 1 default 5\n  A test setting.\n' });
    expect((await install(sb, p, '--delete-old', '--driver-config=limit=3')).code).toBe(0);
    expect(conf(sb)).toMatch(/^storage\.limit: 3$/m);
    expect((await ctx(sb, ['unit', 'record', 'demo', '--what=written through the twin'])).code).toBe(0);
    const twinScan = await scan(sb, 'twin', 'unit');
    const asked = await uninstall(sb, 'twin-pkg');
    expect([asked.code, asked.stderr]).toEqual([1, `package-uninstall: uninstalling 'twin-pkg' moves the record back into posix and leaves the 'twin' driver's own storage, the old copy: unit (4 keys); back it up or delete it; ${ANSWER}\n`]);
    const r = await uninstall(sb, 'twin-pkg', '--backup-old');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('unit: 4 keys copied, dumps equal\n');
    const stamp = /the 'twin' driver's own storage, the old copy, moved into the backup stamped ([0-9]{8}-[0-9]{6}-[0-9]+)\n/.exec(r.stdout)?.[1];
    expect(stamp, r.stdout).toBeDefined();
    expect(r.stdout).toMatch(/; the record reads from posix\n$/);
    expect(await scan(sb, 'posix', 'unit')).toBe(twinScan);
    expect(existsSync(join(sb, `.contexture/backups/move-${stamp}/@twin/store/${RECORD_ROOT}/demo/journal.md`))).toBe(true);
    expect(existsSync(join(sb, '.contexture/twin'))).toBe(false);
    expect(conf(sb)).not.toMatch(/storage\.(driver|limit)/);
    expect(existsSync(join(sb, '.contexture/extensions/storage/drivers/twin'))).toBe(false);
    const env = hookEnv(sb, 'twin-finish.env.out');
    expect(env).toMatchObject({ CTX_DRIVER: 'twin', CTX_DRIVER_DIRECTION: 'out', CTX_DRIVER_OLD_COPY: 'backup', CTX_PACKAGE_NAME: 'twin-pkg' });
    expect(env.CTX_DRIVER_BACKUP).toMatch(new RegExp(`/backups/move-${stamp}/@twin$`));
    expect(Object.keys(env).filter((k) => k.startsWith('CTX_STORAGE_'))).toEqual([]);
    expect(runs(sb)).toEqual([]);
  });

  it('[the-engine-r17] a failure through the check unwinds: the posix target holding a key refuses the copy, and the driver stays installed and configured with nothing removed', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    expect((await install(sb, twinPkg(sb), '--delete-old')).code).toBe(0);
    expect((await resolver(sb, ['--driver=posix', 'store.put', 'unit', 'stray/state'], 'a stray\n')).code).toBe(0);
    const before = tree(sb);
    const r = await uninstall(sb, 'twin-pkg', '--delete-old');
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toBe("package-uninstall: the move back into posix failed at the copy into posix (store-move copy: error: the target already holds keys and a move never merges, counted below (ERR_ENTITY_EXISTS)); nothing removed, so twin-pkg stays installed and configured\n");
    await unchanged(sb, before);
    expect(conf(sb)).toMatch(/^storage\.driver: twin$/m);
  });

  it('[the-engine-r17] a driver package installed and not configured moves nothing: its finish out runs when its storage lists a key, then its files go', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    expect((await install(sb, twinPkg(sb), '--delete-old')).code).toBe(0);
    expect((await ctx(sb, ['store', 'config', 'unset', 'driver'])).code).toBe(0);
    const r = await uninstall(sb, 'twin-pkg', '--delete-old');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('copied');
    expect(r.stdout).toContain("package-uninstall: the 'twin' driver's own storage, the old copy, deleted\n");
    expect(existsSync(join(sb, '.contexture/twin'))).toBe(false);
    expect(hookEnv(sb, 'twin-finish.env.out').CTX_DRIVER_OLD_COPY).toBe('delete');
  });
});

describe.concurrent('a driver package reinstall', () => {
  it('[the-engine-r17, the-engine-r22] at the same format a plain update lands when every namespace dumps the same, and a forgotten format bump, a scan defect, or a changed setting is refused with the files rolled back', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    const cfg = 'limit: optional integer min 1 default 5\n  A test setting.\n';
    expect((await install(sb, twinPkg(sb, { config: cfg }), '--delete-old')).code).toBe(0);
    const twinScan = await scan(sb, 'twin', 'unit');
    const ok = await install(sb, twinPkg(sb, { config: cfg, version: '1.0.1' }));
    expect(ok.code, ok.stderr).toBe(0);
    expect(ok.stdout).toMatch(/; the record reads as before\n$/);
    expect(recordText(sb, 'twin-pkg')).toContain('version 1.0.1');
    const before = tree(sb);
    const changed = await install(sb, twinPkg(sb, { config: cfg, version: '1.0.2' }), '--driver-config=limit=9');
    expect([changed.code, changed.stderr]).toEqual([1, "package-install: --driver-config=limit=9 changes a setting of the configured driver 'twin', which holds the record: uninstall twin-pkg, then install it with --driver-config=limit=9\n"]);
    for (const o of [{ root: 'twin2' }, { scanFlip: 'unit' }]) {
      const r = await install(sb, twinPkg(sb, { config: cfg, version: '1.1.0', ...o }));
      expect([r.code, r.stdout]).toEqual([2, '']);
      expect(r.stderr).toBe("package-install: the update failed at the compare (namespace 'unit' reads differently through the new version, so a format change went unmarked or its reads changed); its files are rolled back and the record reads as before\n");
      await unchanged(sb, before);
      expect(recordText(sb, 'twin-pkg')).toContain('version 1.0.1');
      expect(await scan(sb, 'twin', 'unit')).toBe(twinScan);
    }
  });

  it('[the-engine-r17, the-engine-r22] at another format the record moves out through posix and back in; a failing move in leaves it verified in posix with the old version installed and not configured, and the next install moves it in', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    expect((await install(sb, twinPkg(sb), '--delete-old')).code).toBe(0);
    const twinScan = await scan(sb, 'twin', 'unit');
    seam(sb, 'fail-batch');
    const failed = await install(sb, twinPkg(sb, { version: '2.0.0', format: 2 }), '--delete-old');
    expect([failed.code]).toEqual([2]);
    expect(failed.stdout).toContain('unit: 4 keys copied, dumps equal\n');
    expect(failed.stdout).toContain("package-install: the 'twin' driver's old storage deleted\n");
    expect(failed.stderr).toMatch(/^package-install: the update's move in failed at the copy \(.*\); unwound: unit 4 written, 0 deleted; the record reads from posix, verified, and twin-pkg stays installed at 1\.0\.0, not configured\n$/m);
    expect(await scan(sb, 'posix', 'unit')).toBe(twinScan);
    expect(conf(sb)).not.toMatch(/storage\.driver/);
    expect(recordText(sb, 'twin-pkg')).toMatch(/version 1\.0\.0\n[^]*format 1\n/);
    rmSync(join(sb, '.contexture/twin-seams'), { recursive: true });
    const again = await install(sb, twinPkg(sb, { version: '2.0.0', format: 2 }), '--backup-old');
    expect(again.code, again.stderr).toBe(0);
    expect(recordText(sb, 'twin-pkg')).toContain('format 2');
    expect(await scan(sb, 'twin', 'unit')).toBe(twinScan);
    expect(await keys(sb, 'posix', 'unit')).toEqual([]);
    const up = await install(sb, twinPkg(sb, { version: '3.0.0', format: 3 }), '--backup-old');
    expect(up.code, up.stderr).toBe(0);
    const stamp = /the 'twin' driver's old storage moved into the backup stamped ([0-9]{8}-[0-9]{6}-[0-9]+)\n/.exec(up.stdout)?.[1];
    expect(stamp, up.stdout).toBeDefined();
    expect(up.stdout).toContain(`backup stamped ${stamp}\npackage-install: installed`);
    expect(existsSync(join(sb, `.contexture/backups/move-${stamp}/@twin/store`))).toBe(true);
    expect(existsSync(join(sb, `.contexture/backups/move-${stamp}/unit/scan`))).toBe(true);
    expect(await scan(sb, 'twin', 'unit')).toBe(twinScan);
  });
});

describe.concurrent('crash recovery from the move state', () => {
  it('[the-engine-r17, the-engine-r-mvf01] a move into a driver stopped before its switch: the driver\'s cleanup removes what the move made and it stays installed, not configured', SLOW, async () => {
    const sb = sandbox();
    expect((await install(sb, twinPkg(sb))).code).toBe(0);
    expect((await ctx(sb, ['store', 'config', 'unset', 'driver'])).code).toBe(0);
    put(join(sb, '.contexture/twin', RECORD_ROOT, 'half/state.md'), 'half a copy\n');
    holdMove(sb, 'twin', 'dead');
    const r = await uninstall(sb, 'twin-pkg');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("package-uninstall: recovered a move into 'twin' stopped before its switch: the record reads from 'posix'; the driver's cleanup removed what the move made; twin-pkg stays installed, not configured\n");
    expect(existsSync(join(sb, '.contexture/twin'))).toBe(false);
    expect(await moveState(sb)).toBe('free');
  });

  it('[the-engine-r17, the-engine-r-mvf01] a move back into posix stopped before its switch: the partial posix copy is deleted under a freeze naming posix, then the run proceeds', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    expect((await install(sb, twinPkg(sb), '--delete-old')).code).toBe(0);
    expect((await resolver(sb, ['--driver=posix', 'store.put', 'unit', 'half/state'], 'half a copy\n')).code).toBe(0);
    holdMove(sb, 'posix', 'dead', 'twin');
    const r = await uninstall(sb, 'twin-pkg', '--delete-old');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain("package-uninstall: recovered a move back into posix stopped before its switch: deleted the 1 keys of its partial posix copy; the record reads from 'twin'\n");
    expect(await keys(sb, 'posix', 'unit')).toEqual(['demo/backlog', 'demo/journal', 'demo/knowledge', 'demo/state']);
  });

  it('[the-engine-r17, the-engine-r-mvf01] a move back into posix stopped after its switch: the driver\'s finish out takes its old storage as answered', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    expect((await install(sb, twinPkg(sb), '--delete-old')).code).toBe(0);
    expect((await ctx(sb, ['store', 'config', 'unset', 'driver'])).code).toBe(0);
    holdMove(sb, 'posix', 'dead', 'twin');
    const r = await uninstall(sb, 'twin-pkg', '--backup-old');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^package-uninstall: recovered a move back into posix stopped after its switch: the record reads from posix; the 'twin' driver's own storage moved into the backup stamped [0-9-]+; twin-pkg stays installed, not configured\n/m);
    expect(existsSync(join(sb, '.contexture/twin'))).toBe(false);
    expect(existsSync(join(sb, '.contexture/extensions/storage/drivers/twin'))).toBe(false);
  });

  it('[the-engine-r17, the-engine-r-mvf01] past the check a failed old copy step warns rc 0 and keeps its run, and a move into the configured driver stopped after its switch is rolled forward by the next install, finishing that step under the stopped run\'s stamp', SLOW, async () => {
    const sb = sandbox();
    await seed(sb);
    const units = join(sb, RECORD_ROOT, 'demo');
    chmodSync(units, 0o555);
    let first: Run;
    try {
      first = await install(sb, twinPkg(sb), '--backup-old');
    } finally {
      chmodSync(units, 0o755);
    }
    expect(first.code, first.stderr).toBe(0);
    expect(first.stderr).toContain('package-install: warning: the old copy step did not run: posix still holds the moved records; install twin-pkg again to finish it\n');
    expect(runs(sb)).toHaveLength(1);
    expect(await keys(sb, 'posix', 'unit')).toHaveLength(4);
    holdMove(sb, 'twin', 'dead');
    const again = await install(sb, twinPkg(sb), '--backup-old');
    expect(again.code, again.stderr).toBe(0);
    expect(again.stdout).toMatch(/^package-install: finished what a stopped run of 'twin-pkg' left after its verify: retired 4 keys in \d+ namespaces, backup stamped [0-9-]+\n/m);
    expect(again.stdout).toMatch(/; the record reads as before\n$/);
    expect(await keys(sb, 'posix', 'unit')).toEqual([]);
    expect(runs(sb)).toEqual([]);
    expect(await moveState(sb)).toBe('free');
  });
});

describe.concurrent('a driver package carries no module part', () => {
  it('[plugins-r9, modules-r16] the manifest reader refuses a driver package declaring a module part', async () => {
    const sb = sandbox();
    const p = twinPkg(sb);
    const mod = join(p, '.contexture/extensions/modules/extra');
    put(join(mod, 'module'), '# summary: an extra module\n# version: 1.0.0\n# description:\n# A module a driver package may not carry.\n');
    writeFileSync(join(p, 'manifest'), `${readFileSync(join(p, 'manifest'), 'utf8')}# part: module modules/extra\n`);
    const r = await install(sb, p, '--backup-old');
    expect([r.code, r.stderr]).toEqual([1, 'package-install: malformed package manifest: package-file: error: a driver package carries no module part (its install and uninstall move the record)\n']);
  });
});
