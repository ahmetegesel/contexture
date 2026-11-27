import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { driverPath } from '../support/driver';
import { exec } from '../support/exec';
import { holdMove, moveToken } from '../support/locks';
import { ROOT_USER, chmodPlant } from '../support/plants';
import { sandbox } from '../support/sandbox';
import { fresh, seed } from '../support/snapshot';
import { DRIVERS, sqliteAvailable } from '../support/stage';
import { batchPayload, listAnswer } from '../support/store';
import { answer, overridden } from '../support/wire';

const SIX = ['list', 'get', 'put', 'delete', 'batch', 'scan'];
const SEVEN = ['list', 'get', 'put', 'delete', 'changes', 'batch', 'scan'];
const PAST = new Date('2020-01-01T00:00:00Z');
const FUTURE = new Date('2030-01-01T00:00:00Z');
const MID = new Date('2025-01-01T00:00:00Z');
const EXT = '.contexture/extensions/storage/drivers';

const resolver = (sb: string) => join(sb, '.contexture/storage/scripts/driver-resolver');
const rsv = (sb: string, args: string[], input = '', env: Record<string, string> = {}) => exec(resolver(sb), args, { cwd: sb, input, env: { CTX_ROOT: sb, ...env } });
const extPath = (sb: string, name: string) => join(sb, EXT, name, 'driver');
const notFound = (name: string) => `driver-resolver: ERROR: storage driver '${name}' is neither the core posix driver nor an installed driver package (ERR_DRIVER_NOT_FOUND)\n`;
const malformed = (name: string) => `driver-resolver: ERROR: malformed storage driver name '${name}' (letters, digits, dot, underscore, hyphen; not opening with a dot) (ERR_INVALID_ARGUMENT)\n`;

interface Card {
  optional?: string[];
  contract?: string;
  store?: string[];
  mode?: string;
  modes?: string;
  extra?: string;
}

function wrap(path: string, target: string, { optional = [], contract = '4', store = SIX, mode = 'exact', modes, extra = '' }: Card = {}): string {
  const list = modes ?? `[{"name":"${mode}","description":"the ${mode} rule"}]`;
  const card = `{"driver":"planted","version":"4.0.0","contract":"${contract}","store":[${store.map((s) => `"${s}"`).join(',')}],"search_modes":${list},"optional":[${optional.map((s) => `"${s}"`).join(',')}]${extra}}`;
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `#!/bin/sh\nif [ "\${1:-}" = capability ]; then\n  echo '${card}'\n  exit 0\nfi\nexec "${target}" "$@"\n`, { mode: 0o755 });
  utimesSync(path, PAST, PAST);
  return path;
}

// plant: a wrapper card at the extension root under a name, no install record, serving the target
function plant(sb: string, name: string, target: string, card: Card = {}): string {
  wrap(extPath(sb, name), target, card);
  return name;
}

// recording: a driver at the extension root under a name that logs each function it serves
// (the card aside) and serves the posix driver's answers
function recording(sb: string, name: string): () => string[] {
  const log = join(sb, `${name}.log`);
  const path = wrap(extPath(sb, name), driverPath(sb, 'posix'));
  const body = readFileSync(path, 'utf8').replace('exec "', `printf '%s\\n' "$1" >> '${log}'\nexec "`);
  writeFileSync(path, body, { mode: 0o755 });
  return () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);
}

const verdicts = (sb: string) => {
  const dir = join(sb, '.contexture/tmp/driver-verdicts');
  return existsSync(dir) ? readdirSync(dir).sort() : [];
};

describe('the resolver', { concurrent: true }, () => {
  let posix: string;
  beforeAll(async () => {
    posix = await seed(async () => undefined, 'posix', 'resolver');
  });

  it('[the-engine-r8] modes prints the registry, one name TAB description line per mode, from the posix card', async () => {
    const r = await rsv(fresh(posix), ['modes']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe('exact\ta case-insensitive substring of one line, the first matching line as the snippet, alike on every driver\n');
  });

  it('[the-engine-r8] the pair reader reads a description holding a bracket, a brace, a comma, and an escaped quote whole, its keys in either order', async () => {
    const sb = fresh(posix);
    const modes = '[{"description":"one ] line, with {a} \\"quote\\"","name":"exact"}]';
    const w = plant(sb, 'pairs', driverPath(sb, 'posix'), { modes });
    const r = await rsv(sb, [`--driver=${w}`, 'modes']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'exact\tone ] line, with {a} "quote"\n', '']);
    expect((await rsv(sb, [`--driver=${w}`, 'has', 'search.mode.exact'])).code).toBe(0);
  });

  it('[modules-r1] the storage core is no module: ctx help --all never lists it', async () => {
    const r = await ctx(fresh(posix), 'help', '--all');
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('module storage:');
  });

  it.each([
    ['require store', ['require', 'store'], 0],
    ['require store.promote', ['require', 'store.promote'], 0],
    ['require store.changelog', ['require', 'store.changelog'], 2],
    ['has store', ['has', 'store'], 0],
    ['has store.changelog', ['has', 'store.changelog'], 1],
    ['has search.schema', ['has', 'search.schema'], 1],
    ['has search.mode.exact', ['has', 'search.mode.exact'], 0],
    ['has search.mode.hybrid', ['has', 'search.mode.hybrid'], 1],
    ['require with no capability', ['require'], 1],
    ['has with two capabilities', ['has', 'store', 'store.promote'], 1],
    ['require a malformed token', ['require', 'Bad!'], 1],
  ])('[the-engine-r15] answers %s on the configured posix driver', async (_, args, rc) => {
    expect((await rsv(fresh(posix), args)).code).toBe(rc);
  });

  it.each([
    ['no store family', { store: [] }, ['require', 'store'], 2],
    ['no store family', { store: [] }, ['has', 'store'], 1],
    ['the store token alone', { optional: ['store'], store: [] }, ['require', 'store.promote'], 2],
    ['the promote token', { optional: ['store.promote'] }, ['require', 'store.promote'], 0],
    ['the store family', {}, ['require', 'store', 'store.promote'], 2],
    ['the store family', {}, ['require', 'search.mode.hybrid'], 2],
    ['the store family', {}, ['has', 'store.promote'], 1],
  ] as const)('[the-engine-r15] a planted card with %s (%j) answers %j rc %i', async (_, card, args, rc) => {
    const sb = fresh(posix);
    const w = plant(sb, 'card', driverPath(sb, 'posix'), card as Card);
    const r = await rsv(sb, [`--driver=${w}`, ...args]);
    expect(r.code).toBe(rc);
    if (rc === 1) expect(r.stdout + r.stderr).toBe('');
    if (rc === 2) expect(r.stderr).toMatch(/\(ERR_CAPABILITY_UNSUPPORTED\)\n$/);
  });

  it('[the-engine-r8, the-engine-r15] caches a require verdict per driver path and capability set, apart from the dispatch verdict, and re-takes it for a touched driver', async () => {
    const sb = fresh(posix);
    const w = plant(sb, 'store', driverPath(sb, 'posix'));
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
    const dispatch = verdicts(sb).filter((v) => !v.includes('.require.'));
    expect(dispatch.length).toBe(1);
    const before = readFileSync(join(sb, '.contexture/tmp/driver-verdicts', dispatch[0]));
    for (const caps of [['store'], ['search.mode.exact', 'store'], ['store', 'search.mode.exact']]) expect((await rsv(sb, [`--driver=${w}`, 'require', ...caps])).code).toBe(0);
    expect(verdicts(sb).filter((v) => v.includes('.require.')).map((v) => v.replace(/^.*\.require\./, ''))).toEqual(['search.mode.exact+store', 'store']);
    expect(readFileSync(join(sb, '.contexture/tmp/driver-verdicts', dispatch[0])).equals(before)).toBe(true);
    wrap(extPath(sb, w), driverPath(sb, 'posix'), { store: [] });
    expect((await rsv(sb, [`--driver=${w}`, 'require', 'store'])).code).toBe(0);
    utimesSync(extPath(sb, w), FUTURE, FUTURE);
    expect((await rsv(sb, [`--driver=${w}`, 'require', 'store'])).code).toBe(2);
  });

  it('[the-engine-r15, the-engine-r21] refuses require and has rc 2 ERR_DRIVER_NOT_FOUND for a removed bundled driver, whatever fresh verdict it cached', async () => {
    const sb = fresh(posix);
    expect((await rsv(sb, ['require', 'store'])).code).toBe(0);
    const cached = verdicts(sb).filter((v) => v.endsWith('.require.store'));
    expect(cached).toHaveLength(1);
    utimesSync(join(sb, '.contexture/tmp/driver-verdicts', cached[0]), FUTURE, FUTURE);
    const driver = driverPath(sb, 'posix');
    rmSync(driver);
    for (const args of [['require', 'store'], ['has', 'store']]) {
      const r = await rsv(sb, args);
      expect([r.code, r.stdout, r.stderr], args.join(' ')).toEqual([2, '', `driver-resolver: ERROR: driver executable '${driver}' not found or not executable (ERR_DRIVER_NOT_FOUND)\n`]);
    }
  });

  it('[the-engine-r8] takes the dispatch verdict again when the workspace configuration changes', async () => {
    const sb = fresh(posix);
    utimesSync(resolver(sb), PAST, PAST);
    const w = plant(sb, 'conf', driverPath(sb, 'posix'));
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
    const file = join(sb, '.contexture/tmp/driver-verdicts', verdicts(sb)[0]);
    utimesSync(file, MID, MID);
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
    expect(statSync(file).mtime.getTime()).toBe(MID.getTime());
    writeFileSync(join(sb, '.contexture/config'), '# touched\n');
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
    expect(statSync(file).mtime.getTime()).toBeGreaterThan(MID.getTime());
  });

  it('[the-engine-r8] a core update expires the dispatch verdict: a fresh verdict of a contract 3 driver serves until the resolver is newer, then the handshake refuses it', async () => {
    const sb = fresh(posix);
    utimesSync(resolver(sb), PAST, PAST);
    if (existsSync(join(sb, '.contexture/config'))) utimesSync(join(sb, '.contexture/config'), PAST, PAST);
    const w = plant(sb, 'old', driverPath(sb, 'posix'), { contract: '3', store: SEVEN });
    const dir = join(sb, '.contexture/tmp/driver-verdicts');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, extPath(sb, w).replace(/\//g, '_'));
    writeFileSync(file, `verified ${extPath(sb, w)}\n`);
    utimesSync(file, MID, MID);
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
    utimesSync(resolver(sb), FUTURE, FUTURE);
    const r = await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', `driver-resolver: ERROR: driver '${w}' declares contract '3', not 4 (ERR_DRIVER_PROTOCOL)\n`]);
    expect(statSync(file).mtime.getTime()).toBe(MID.getTime());
  });

  function unwritableDrawer(onTestFinished: (fn: () => void) => void): [string, string] {
    const sb = fresh(posix);
    const w = plant(sb, 'ro', driverPath(sb, 'posix'));
    mkdirSync(join(sb, '.contexture/tmp/driver-verdicts'), { recursive: true });
    chmodPlant(join(sb, '.contexture/tmp/driver-verdicts'), 0o555, 0o755, onTestFinished);
    return [sb, w];
  }

  it.skipIf(ROOT_USER)('[the-engine-r8] caches nothing when the drawer is unwritable, and still verifies every call', async ({ onTestFinished }) => {
    const [sb, w] = unwritableDrawer(onTestFinished);
    const r = await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']);
    expect([r.code, r.stdout]).toEqual([0, '{"namespace":"unit","keys":[]}\n']);
    expect(verdicts(sb)).toEqual([]);
    wrap(extPath(sb, w), driverPath(sb, 'posix'), { store: [] });
    expect((await rsv(sb, [`--driver=${w}`, 'store.list', 'unit'])).code).toBe(2);
  });

  it.skipIf(ROOT_USER)('[the-engine-r8] answers with a clean stderr when the drawer is unwritable', async ({ onTestFinished }) => {
    const [sb, w] = unwritableDrawer(onTestFinished);
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
  });

  it.skipIf(ROOT_USER)('[the-engine-r8] answers a require with a clean stderr and caches nothing when the drawer is unwritable', async ({ onTestFinished }) => {
    const [sb, w] = unwritableDrawer(onTestFinished);
    const r = await rsv(sb, [`--driver=${w}`, 'require', 'store']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
    expect(verdicts(sb)).toEqual([]);
  });

  it('[the-engine-r8] passes the driver\'s own capability refusal line through the handshake', async () => {
    const sb = fresh(posix);
    mkdirSync(join(sb, EXT, 'refuses'), { recursive: true });
    writeFileSync(extPath(sb, 'refuses'), '#!/bin/sh\nprintf \'capability: error: planted refusal (ERR_STORAGE_READ)\\n\' >&2\nexit 2\n', { mode: 0o755 });
    const r = await rsv(sb, ['--driver=refuses', 'store.list', 'unit']);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toContain('planted refusal (ERR_STORAGE_READ)');
  });

  it('[the-engine-r21] keeps its own ERROR line for a driver found nowhere, the one shape exception, naming the core posix driver and the installed driver packages and no place', async () => {
    const r = await rsv(fresh(posix), ['resolve', 'no-such-driver']);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', notFound('no-such-driver')]);
  });

  it.for(['store.put', 'store.delete', 'store.batch', 'store.promote', 'storage.sweep'])('[the-engine-r-helpm] in help mode (CTX_HELP=1) %s refuses rc 1 with one line before the driver runs, in the direct and the exec form', async (method) => {
    const sb = fresh(posix);
    const line = `driver-resolver: ERROR: ${method} refused in help mode: help writes nothing (ERR_INVALID_ARGUMENT)\n`;
    for (const args of [[method, 'unit', 'unit/probe/x'], ['exec', method, 'unit', 'unit/probe/x']]) {
      const r = await rsv(sb, args, 'help mode probe\n', { CTX_HELP: '1' });
      expect([r.code, r.stdout, r.stderr], args.join(' ')).toEqual([1, '', line]);
    }
  });

  it('[the-engine-r-helpm] in help mode a read passes and nothing is written; null check: the same put lands outside help mode', async () => {
    const sb = fresh(posix);
    expect((await rsv(sb, ['store.put', 'unit', 'unit/probe/x'], 'help mode probe\n', { CTX_HELP: '1' })).code).toBe(1);
    const absent = await rsv(sb, ['store.get', 'unit', 'unit/probe/x'], '', { CTX_HELP: '1' });
    expect(absent.stderr).not.toContain('help mode');
    expect(absent.stdout).not.toContain('help mode probe');
    answer(await rsv(sb, ['store.put', 'unit', 'unit/probe/x'], 'help mode probe\n'), 'store.put');
    const landed = await rsv(sb, ['store.get', 'unit', 'unit/probe/x'], '', { CTX_HELP: '1' });
    expect([landed.code, landed.stderr]).toEqual([0, '']);
    expect(landed.stdout).toContain('help mode probe');
  });

  it("[the-engine-r-helpm, the-engine-r-mvf01] help mode refuses ahead of the storage moving freeze and the override rule: under a live holder's marker a help mode put refuses with the help line, the move's own token and an override included, and lands nothing; null check: outside help mode the same marker refuses ERR_STORAGE_LOCKED and the holder's own put lands", async () => {
    const sb = fresh(posix);
    const help = 'driver-resolver: ERROR: store.put refused in help mode: help writes nothing (ERR_INVALID_ARGUMENT)\n';
    const release = holdMove(sb, 'posix', 'live', 'posix');
    try {
      for (const env of [{ CTX_HELP: '1' }, { CTX_HELP: '1', ...moveToken() }, { CTX_HELP: '1', CTX_STORAGE_DRIVER: 'nosuch' }]) {
        const r = await rsv(sb, ['store.put', 'unit', 'unit/probe/x'], 'frozen help probe\n', env);
        expect([r.code, r.stdout, r.stderr], JSON.stringify(env)).toEqual([1, '', help]);
      }
      const frozen = await rsv(sb, ['store.put', 'unit', 'unit/probe/x'], 'frozen probe\n');
      expect([frozen.code, frozen.stdout, frozen.stderr]).toEqual([2, '', 'store.put: error: storage is being moved to another driver; retry after the move ends (ERR_STORAGE_LOCKED)\n']);
      expect((await rsv(sb, ['store.get', 'unit', 'unit/probe/x'])).stdout).not.toContain('probe');
      answer(await rsv(sb, ['store.put', 'unit', 'unit/probe/x'], 'holder probe\n', moveToken()), 'store.put');
    } finally {
      release();
    }
    expect((await rsv(sb, ['store.get', 'unit', 'unit/probe/x'])).stdout).toContain('holder probe');
  });

  describe('the two places and the name precedence', () => {
    const resolved = async (sb: string, args: string[], env: Record<string, string> = {}) => {
      const r = await rsv(sb, ['resolve', ...args], '', env);
      expect(r.stderr).toBe('');
      return r.stdout.trim();
    };

    it('[the-engine-r19] finds posix in the storage core and any other name at the extension root by its path, folder or single file, no install record read: configured, it serves', async () => {
      const sb = fresh(posix);
      const target = driverPath(sb, 'posix');
      plant(sb, 'tierext', target);
      wrap(join(sb, EXT, 'single'), target);
      expect(existsSync(join(sb, '.contexture/extensions/.state'))).toBe(false);
      expect(await resolved(sb, ['posix'])).toBe(target);
      expect(await resolved(sb, ['tierext'])).toBe(extPath(sb, 'tierext'));
      expect(await resolved(sb, ['single'])).toBe(join(sb, EXT, 'single'));
      writeFileSync(join(sb, '.contexture/config'), 'storage.driver: tierext\n');
      const check = await rsv(sb, ['check']);
      expect([check.code, check.stdout, check.stderr]).toEqual([0, `OK: storage driver 'tierext' verified at ${extPath(sb, 'tierext')}\n`, '']);
      answer(await rsv(sb, ['store.put', 'unit', 'unit/probe/x'], 'served\n'), 'store.put');
      expect((await rsv(sb, ['store.list', 'unit'])).stdout).toBe(listAnswer('unit', ['unit/probe/x']));
    });

    it('[the-engine-r19] a driver planted in a retired place resolves nothing: the workspace drivers, the storage core\'s other names, a module\'s drivers, the base mirror\'s other names and places, and PATH', async () => {
      const sb = fresh(posix);
      const target = driverPath(sb, 'posix');
      wrap(join(sb, '.contexture/drivers/ws/driver'), target);
      wrap(join(sb, '.contexture/drivers/wsfile'), target);
      wrap(join(sb, '.contexture/storage/drivers/core/driver'), target);
      wrap(join(sb, '.contexture/modules/zz-plant/drivers/mod/driver'), target);
      wrap(join(sb, 'base/.contexture/storage/drivers/mirror/driver'), target);
      wrap(join(sb, 'base/.contexture/extensions/storage/drivers/mirrorext/driver'), target);
      wrap(join(sb, 'base/.contexture/modules/zz-plant/drivers/mirrormod/driver'), target);
      const bin = sandbox('path-tier');
      wrap(join(bin, 'ctx-storage-onpath'), target);
      const env = { PATH: `${bin}:${process.env.PATH ?? ''}` };
      for (const name of ['ws', 'wsfile', 'core', 'mod', 'mirror', 'mirrorext', 'mirrormod', 'onpath']) {
        const r = await rsv(sb, ['resolve', name], '', env);
        expect([r.code, r.stdout, r.stderr], name).toEqual([2, '', notFound(name)]);
        const read = await rsv(sb, [`--driver=${name}`, 'store.list', 'unit'], '', env);
        expect([read.code, read.stdout, read.stderr], name).toEqual([2, '', notFound(name)]);
      }
      writeFileSync(join(sb, '.contexture/config'), 'storage.driver: ws\n');
      const configured = await rsv(sb, ['store.list', 'unit']);
      expect([configured.code, configured.stdout, configured.stderr]).toEqual([2, '', notFound('ws')]);
    });

    it('[the-engine-r19] a name outside the installer\'s driver name rule refuses rc 1 before any path is built: a path, a dot dot walk, a leading dot, a blank', async () => {
      const sb = fresh(posix);
      const target = driverPath(sb, 'posix');
      wrap(join(sb, '.contexture/drivers/ws/driver'), target);
      plant(sb, 'kept', target);
      for (const name of [target, extPath(sb, 'kept'), '../../drivers/ws', '../../../drivers/ws', 'kept/../kept', '.kept', 'a b']) {
        const r = await rsv(sb, ['resolve', name]);
        expect([r.code, r.stdout, r.stderr], name).toEqual([1, '', malformed(name)]);
        const read = await rsv(sb, [`--driver=${name}`, 'store.list', 'unit']);
        expect([read.code, read.stdout, read.stderr], name).toEqual([1, '', malformed(name)]);
        const check = await rsv(sb, ['check', name]);
        expect([check.code, check.stderr], name).toEqual([1, malformed(name)]);
      }
      writeFileSync(join(sb, '.contexture/config'), 'storage.driver: ../../drivers/ws\n');
      const configured = await rsv(sb, ['store.list', 'unit']);
      expect([configured.code, configured.stdout, configured.stderr]).toEqual([1, '', malformed('../../drivers/ws')]);
    });

    it('[the-engine-r19] a workspace driver or an extension driver named posix never shadows the core posix driver', async () => {
      const sb = fresh(posix);
      const target = driverPath(sb, 'posix');
      wrap(join(sb, '.contexture/drivers/posix/driver'), target);
      plant(sb, 'posix', target);
      expect(await resolved(sb, ['posix'])).toBe(target);
      expect(await resolved(sb, [])).toBe(target);
    });

    it('[the-engine-r19] the base mirror\'s posix driver serves a drawer without its storage core beside a base folder, and refuses once that posix is gone', async () => {
      const sb = fresh(posix);
      mkdirSync(join(sb, 'base/.contexture'), { recursive: true });
      renameSync(join(sb, '.contexture/storage'), join(sb, 'base/.contexture/storage'));
      const mirror = join(sb, 'base/.contexture/storage/scripts/driver-resolver');
      const run = (args: string[], input = '') => exec(mirror, args, { cwd: sb, input, env: { CTX_ROOT: sb } });
      const r = await run(['resolve', 'posix']);
      expect([r.code, r.stdout, r.stderr]).toEqual([0, `${sb}/.contexture/../base/.contexture/storage/drivers/posix/driver\n`, '']);
      answer(await run(['store.put', 'unit', 'unit/probe/x'], 'mirrored\n'), 'store.put');
      expect((await run(['store.list', 'unit'])).stdout).toBe(listAnswer('unit', ['unit/probe/x']));
      rmSync(join(sb, 'base/.contexture/storage/drivers/posix/driver'));
      const gone = await run(['store.list', 'unit']);
      expect([gone.code, gone.stdout]).toEqual([2, '']);
      expect(gone.stderr).toMatch(/^driver-resolver: ERROR: driver 'posix' executable not found at .* \(ERR_DRIVER_NOT_FOUND\)\n$/);
    });

    it('[the-engine-r25] takes the name from --driver, then -d, then CTX_STORAGE_DRIVER, then the config, the legacy key, storage.conf, else posix', async () => {
      const sb = fresh(posix);
      const target = driverPath(sb, 'posix');
      for (const n of ['one', 'two', 'three', 'four', 'five', 'six']) plant(sb, n, target);
      const at = (n: string) => extPath(sb, n);
      expect(await resolved(sb, [])).toBe(target);
      writeFileSync(join(sb, '.contexture/storage.conf'), 'storage.driver=six\n');
      expect(await resolved(sb, [])).toBe(at('six'));
      writeFileSync(join(sb, '.contexture/config'), 'session.storage.driver: "five" # legacy\n');
      expect(await resolved(sb, [])).toBe(at('five'));
      writeFileSync(join(sb, '.contexture/config'), "storage.driver: 'four'   # quoted, commented\n");
      expect(await resolved(sb, [])).toBe(at('four'));
      expect(await resolved(sb, [], { CTX_STORAGE_DRIVER: 'three' })).toBe(at('three'));
      expect((await rsv(sb, ['-d', 'two', 'resolve'], '', { CTX_STORAGE_DRIVER: 'three' })).stdout.trim()).toBe(at('two'));
      expect((await rsv(sb, ['--driver=one', 'resolve'], '', { CTX_STORAGE_DRIVER: 'three' })).stdout.trim()).toBe(at('one'));
    });

    it('[the-engine-r25] ignores storage.driver subkeys and reads quoted, commented, = or : separated keys with first non-empty match precedence', async () => {
      const sb = fresh(posix);
      const target = driverPath(sb, 'posix');
      for (const n of ['four', 'five', 'six']) plant(sb, n, target);
      const at = (n: string) => extPath(sb, n);
      writeFileSync(join(sb, '.contexture/config'), 'storage.driver.foo: six\nsession.storage.driver.bar = six\n');
      expect(await resolved(sb, [])).toBe(target);
      writeFileSync(join(sb, '.contexture/config'), 'storage.driver: ""\nstorage.driver = "four" # inline comment\nstorage.driver: five\n');
      expect(await resolved(sb, [])).toBe(at('four'));
      writeFileSync(join(sb, '.contexture/config'), "session.storage.driver: 'five' # legacy\nstorage.driver = four\n");
      expect(await resolved(sb, [])).toBe(at('four'));
      writeFileSync(join(sb, '.contexture/config'), 'storage.driver.foo: five\n');
      writeFileSync(join(sb, '.contexture/storage.conf'), 'storage.driver.foo=five\nsession.storage.driver = six # legacy conf\n');
      expect(await resolved(sb, [])).toBe(at('six'));
    });

    it('[the-engine-r25] resolves configured driver from a nested subdirectory and via inline fallback when config-lib is absent', async () => {
      const sb = fresh(posix);
      const target = driverPath(sb, 'posix');
      plant(sb, 'nested', target);
      plant(sb, 'fallback', target);
      writeFileSync(join(sb, '.contexture/config'), 'storage.driver = "nested" # from subdir\n');

      const deep = join(sb, 'sub/deep/folder');
      mkdirSync(deep, { recursive: true });
      const subRes = await exec('sh', ['-c', 'cd sub/deep/folder && exec "$0" resolve', resolver(sb)], { cwd: sb });
      expect([subRes.code, subRes.stderr]).toEqual([0, '']);
      expect(subRes.stdout.trim()).toBe(extPath(sb, 'nested'));

      // Remove config-lib so read_conf_driver executes its inline fallback
      rmSync(join(sb, '.contexture/config-lib'));
      writeFileSync(join(sb, '.contexture/config'), "storage.driver = 'fallback' # inline fallback\n");
      const fbRes = await rsv(sb, ['resolve']);
      expect([fbRes.code, fbRes.stderr]).toEqual([0, '']);
      expect(fbRes.stdout.trim()).toBe(extPath(sb, 'fallback'));

      writeFileSync(join(sb, '.contexture/config'), '');
      writeFileSync(join(sb, '.contexture/storage.conf'), 'session.storage.driver: "nested" # legacy fallback\n');
      const confRes = await rsv(sb, ['resolve']);
      expect([confRes.code, confRes.stderr]).toEqual([0, '']);
      expect(confRes.stdout.trim()).toBe(extPath(sb, 'nested'));
    });
  });

  describe('the one off overrides read; a write goes through the configured driver', () => {
    const FORMS: readonly [form: string, args: string[], env: Record<string, string>][] = [
      ['--driver=rec', ['--driver=rec'], {}],
      ['-d rec', ['-d', 'rec'], {}],
      ['CTX_STORAGE_DRIVER=rec', [], { CTX_STORAGE_DRIVER: 'rec' }],
    ];
    const READS: readonly [fn: string, args: string[], input: string][] = [
      ['store.list', ['store.list', 'unit'], ''],
      ['store.get', ['store.get', 'unit', 'unit/probe/one'], ''],
      ['store.scan', ['store.scan', 'unit'], ''],
      ['store.search', ['store.search', 'unit', 'exact', '0'], 'query=one\n'],
      ['storage.health', ['storage.health', 'unit'], ''],
      ['storage.leftovers', ['storage.leftovers', 'unit'], ''],
      ['capability', ['exec', 'capability'], ''],
      ['storage.sweep', ['storage.sweep', 'unit', '--dry-run'], ''],
    ];
    const WRITES: readonly [fn: string, args: string[], input: string][] = [
      ['store.put', ['store.put', 'unit', 'unit/probe/two'], 'two\n'],
      ['store.put', ['exec', 'store.put', 'unit', 'unit/probe/two'], 'two\n'],
      ['store.delete', ['store.delete', 'unit', 'unit/probe/one'], ''],
      ['store.batch', ['store.batch', 'unit'], batchPayload([{ action: 'put', key: 'unit/probe/two', value: 'two\n' }])],
      ['store.batch', ['store.batch', 'unit'], batchPayload([{ action: 'delete', key: 'unit/probe/one' }])],
      ['storage.sweep', ['storage.sweep', 'unit'], ''],
      ['store.frobnicate', ['store.frobnicate', 'unit'], ''],
    ];
    const ONE = listAnswer('unit', ['unit/probe/one']);
    const staged = (sb: string) => readdirSync(join(sb, '.contexture/tmp')).filter((n) => n.startsWith('store-gate.'));

    async function workspace(): Promise<{ sb: string; log: () => string[] }> {
      const sb = fresh(posix);
      const log = recording(sb, 'rec');
      answer(await rsv(sb, ['store.put', 'unit', 'unit/probe/one'], 'one\n'), 'store.put');
      return { sb, log };
    }

    for (const [form, flag, env] of FORMS) {
      it(`[the-engine-r25] under ${form} every read passes through the named driver`, async () => {
        const { sb, log } = await workspace();
        for (const [fn, args, input] of READS) {
          const r = await rsv(sb, [...flag, ...args], input, env);
          expect([r.code, r.stderr], fn).toEqual([0, '']);
        }
        expect(log()).toEqual(READS.map(([fn]) => fn).filter((fn) => fn !== 'capability'));
      });

      it(`[the-engine-r25, the-engine-r21] under ${form} a put, a delete, a batch, a sweep, and an unknown function refuse rc 1 with their own line, no driver run, nothing written`, async () => {
        const { sb, log } = await workspace();
        for (const [fn, args, input] of WRITES) overridden(await rsv(sb, [...flag, ...args], input, env), fn, 'rec', 'posix');
        expect(log(), 'the named driver never ran').toEqual([]);
        expect(staged(sb)).toEqual([]);
        expect((await rsv(sb, ['store.list', 'unit'])).stdout).toBe(ONE);
      });
    }

    it('[the-engine-r25] an override naming the configured driver writes, by flag and by environment, and so does the configured driver named otherwise', async () => {
      const { sb, log } = await workspace();
      answer(await rsv(sb, ['--driver=posix', 'store.put', 'unit', 'unit/probe/a'], 'a\n'), 'store.put');
      answer(await rsv(sb, ['-d', 'posix', 'store.delete', 'unit', 'unit/probe/a']), 'store.delete');
      answer(await rsv(sb, ['store.put', 'unit', 'unit/probe/b'], 'b\n', { CTX_STORAGE_DRIVER: 'posix' }), 'store.put');
      expect((await rsv(sb, ['store.list', 'unit'])).stdout).toBe(listAnswer('unit', ['unit/probe/b', 'unit/probe/one']));
      writeFileSync(join(sb, '.contexture/config'), 'storage.driver: rec\n');
      overridden(await rsv(sb, ['--driver=posix', 'store.put', 'unit', 'unit/probe/c'], 'c\n'), 'store.put', 'posix', 'rec');
      overridden(await rsv(sb, ['store.put', 'unit', 'unit/probe/c'], 'c\n', { CTX_STORAGE_DRIVER: 'posix' }), 'store.put', 'posix', 'rec');
      answer(await rsv(sb, ['--driver=rec', 'store.put', 'unit', 'unit/probe/c'], 'c\n'), 'store.put');
      answer(await rsv(sb, ['store.put', 'unit', 'unit/probe/d'], 'd\n'), 'store.put');
      expect(log()).toEqual(['store.put', 'store.put']);
    });

    it('[the-engine-r25, the-engine-r-mvf01] the holder\'s token passes toward the target alone while its freeze lives: a dead holder\'s marker and a wrong token pass nothing', async () => {
      const { sb, log } = await workspace();
      const release = holdMove(sb, 'rec', 'dead', 'posix');
      overridden(await rsv(sb, ['--driver=rec', 'store.put', 'unit', 'unit/probe/two'], 'two\n', moveToken()), 'store.put', 'rec', 'posix');
      overridden(await rsv(sb, ['store.batch', 'unit'], batchPayload([{ action: 'delete', key: 'unit/probe/one' }]), { ...moveToken(), CTX_STORAGE_DRIVER: 'rec' }), 'store.batch', 'rec', 'posix');
      release();
      holdMove(sb, 'rec', 'live', 'posix');
      const wrong = await rsv(sb, ['--driver=rec', 'store.put', 'unit', 'unit/probe/two'], 'two\n', { CTX_STORAGE_MOVE: '1' });
      expect([wrong.code, wrong.stdout, wrong.stderr]).toEqual([2, '', 'store.put: error: storage is being moved to another driver; retry after the move ends (ERR_STORAGE_LOCKED)\n']);
      expect(log()).toEqual([]);
      answer(await rsv(sb, ['--driver=rec', 'store.put', 'unit', 'unit/probe/two'], 'two\n', moveToken()), 'store.put');
      expect(log()).toEqual(['store.put']);
    });

    it('[the-engine-r25] a ctx unit write and a ctx store put under CTX_STORAGE_DRIVER naming a driver that is not the configured one refuse rc 1 under their own labels with the override line', async () => {
      const { sb, log } = await workspace();
      const env = { CTX_STORAGE_DRIVER: 'rec' };
      const unit = await exec('./.contexture/ctx', ['unit', 'bootstrap', 'ov-unit', 'the override unit'], { cwd: sb, env });
      overridden(unit, 'session.create', 'rec', 'posix');
      const store = await exec('./.contexture/ctx', ['store', 'put', 'containers/ov', '--description=the override container', '--minting=given'], { cwd: sb, env });
      overridden(store, 'store put', 'rec', 'posix');
      expect(log().filter((fn) => fn !== 'store.list' && fn !== 'store.get' && fn !== 'store.scan')).toEqual([]);
    });
  });
});

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'sqlite' && !sqliteAvailable())(`the dispatch handshake serving ${driver}`, { concurrent: true }, () => {
    let snap: string;
    beforeAll(async () => {
      snap = await seed(async () => undefined, driver, 'handshake');
    });

    it('[the-engine-r15] resolves the configured driver and answers its optional capabilities', async () => {
      const sb = fresh(snap);
      expect((await rsv(sb, ['resolve'])).stdout).toBe(`${driverPath(sb, driver)}\n`);
      expect((await rsv(sb, ['has', 'store'])).code).toBe(0);
      expect((await rsv(sb, ['has', 'search.mode.exact'])).code).toBe(0);
      for (const retired of ['store.changelog', 'search.schema', 'search.mode.hybrid', 'search.mode.trigram']) expect([retired, (await rsv(sb, ['has', retired])).code]).toEqual([retired, 1]);
      expect((await rsv(sb, ['has', 'store.promote'])).code).toBe(driver === 'posix' ? 0 : 1);
    });

    it('[the-engine-r8] serves a card declaring the store.promote token, and the check of the configured driver passes', async () => {
      const sb = fresh(snap);
      const w = plant(sb, 'promote', driverPath(sb, driver), { optional: ['store', 'store.promote'] });
      answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
      const check = await rsv(sb, ['check']);
      expect([check.code, check.stderr]).toEqual([0, '']);
      expect(check.stdout).toBe(`OK: storage driver '${driver}' verified at ${driverPath(sb, driver)}\n`);
    });

    it('[the-engine-r8] serves a complete store card, configured, and lands a write through it', async () => {
      const sb = fresh(snap);
      const w = plant(sb, 'storecard', driverPath(sb, driver), { optional: ['store'] });
      writeFileSync(join(sb, '.contexture/config'), `storage.driver: ${w}\n`);
      answer(await rsv(sb, ['store.put', 'unit', 'unit/probe/x'], 'resolver fixture\n'), 'store.put');
      expect((await rsv(sb, [`--driver=${w}`, 'store.list', 'unit'])).stdout).toBe('{"namespace":"unit","keys":["unit/probe/x"]}\n');
    });

    it.each([
      ['a record-only card', { store: [] }, ['no store family', 'contract 4 serves the store family alone']],
      ['contract 2', { contract: '2' }, ["declares contract '2', not 4"]],
      ['contract 3', { contract: '3' }, ["declares contract '3', not 4"]],
      ['a functions field', { extra: ',"functions":["session.list"]' }, ['record function family']],
      ['the store token without the family', { optional: ['store'], store: [] }, ['no store family']],
      ['no exact mode', { mode: 'hybrid' }, ['declares the search modes [hybrid], not the exact mode alone']],
      ['a ranked mode beside exact', { modes: '[{"name":"exact","description":"x"},{"name":"hybrid","description":"y"}]' }, ['declares the search modes [exact hybrid], not the exact mode alone']],
      ['no mode at all', { modes: '[]' }, ['declares the search modes [], not the exact mode alone']],
      ['a bare name mode list', { modes: '["exact"]' }, ['not a list of name and description objects']],
      ['a mode without a description', { modes: '[{"name":"exact"}]' }, ['not a list of name and description objects']],
      ['a partial family', { optional: ['store'], store: SIX.filter((s) => s !== 'batch') }, ['six data names in the fixed order (list get put delete batch scan)']],
      ['a name outside the six', { optional: ['store'], store: [...SIX, 'store.search'] }, ['six data names']],
      ['the contract 3 family, changes among the names', { optional: ['store'], store: SEVEN }, ['six data names']],
      ['an optional token outside the card', { optional: ['store', 'retired.token'] }, ['optional capability']],
      ['the retired change log token', { optional: ['store', 'store.changelog'] }, ["optional capability 'store.changelog' outside store, store.promote"]],
      ['the retired search schema token', { optional: ['search.schema'] }, ["optional capability 'search.schema' outside store, store.promote"]],
    ] as const)('[the-engine-r8] halts %s rc 2 ERR_DRIVER_PROTOCOL, naming what is wrong', async (_, card, words) => {
      const sb = fresh(snap);
      const w = plant(sb, 'bad', driverPath(sb, driver), card as Card);
      const r = await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']);
      expect([r.code, r.stdout]).toEqual([2, '']);
      expect(r.stderr).toMatch(/\(ERR_DRIVER_PROTOCOL\)\n$/);
      for (const word of words) expect(r.stderr).toContain(word);
    });
  });
}

