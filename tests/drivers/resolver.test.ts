import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { driverPath } from '../support/driver';
import { exec } from '../support/exec';
import { ROOT_USER, chmodPlant } from '../support/plants';
import { sandbox } from '../support/sandbox';
import { fresh, seed } from '../support/snapshot';
import { DRIVERS, type Driver, fts5Available, stage } from '../support/stage';
import { answer } from '../support/wire';

const SEVEN = ['list', 'get', 'put', 'delete', 'changes', 'batch', 'scan'];
const PAST = new Date('2020-01-01T00:00:00Z');
const FUTURE = new Date('2030-01-01T00:00:00Z');
const MID = new Date('2025-01-01T00:00:00Z');

const resolver = (sb: string) => join(sb, '.contexture/storage/scripts/driver-resolver');
const rsv = (sb: string, args: string[], input = '', env: Record<string, string> = {}) => exec(resolver(sb), args, { cwd: sb, input, env: { CTX_ROOT: sb, ...env } });

interface Card {
  optional?: string[];
  contract?: string;
  store?: string[];
  mode?: string;
  extra?: string;
}

function wrap(path: string, target: string, { optional = [], contract = '3', store = SEVEN, mode = 'exact', extra = '' }: Card = {}): string {
  const card = `{"driver":"planted","version":"3.0.0","contract":"${contract}","store":[${store.map((s) => `"${s}"`).join(',')}],"search_modes":["${mode}"],"optional":[${optional.map((s) => `"${s}"`).join(',')}]${extra}}`;
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `#!/bin/sh\nif [ "\${1:-}" = capability ]; then\n  echo '${card}'\n  exit 0\nfi\nexec "${target}" "$@"\n`, { mode: 0o755 });
  utimesSync(path, PAST, PAST);
  return path;
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

  it('the storage core is no module: ctx help --all never lists it', async () => {
    const r = await ctx(fresh(posix), 'help', '--all');
    expect(r.code).toBe(0);
    expect(r.stdout).not.toContain('module storage:');
  });

  it.each([
    ['require store', ['require', 'store'], 0],
    ['require store.changelog', ['require', 'store.changelog'], 2],
    ['has store', ['has', 'store'], 0],
    ['has store.changelog', ['has', 'store.changelog'], 1],
    ['has search.mode.exact', ['has', 'search.mode.exact'], 0],
    ['has search.mode.hybrid', ['has', 'search.mode.hybrid'], 1],
    ['require with no capability', ['require'], 1],
    ['has with two capabilities', ['has', 'store', 'store.changelog'], 1],
    ['require a malformed token', ['require', 'Bad!'], 1],
  ])('answers %s on the configured posix driver', async (_, args, rc) => {
    expect((await rsv(fresh(posix), args)).code).toBe(rc);
  });

  it.each([
    ['no store family', { store: [] }, ['require', 'store'], 2],
    ['no store family', { store: [] }, ['has', 'store'], 1],
    ['the store token alone', { optional: ['store'], store: [] }, ['require', 'store.changelog'], 2],
    ['a change log', { optional: ['store.changelog'] }, ['require', 'store.changelog'], 0],
    ['the store family', {}, ['require', 'store', 'store.changelog'], 2],
    ['the store family', {}, ['require', 'search.mode.hybrid'], 2],
    ['the store family', {}, ['has', 'search.schema'], 1],
  ] as const)('a planted card with %s answers %j rc %i', async (_, card, args, rc) => {
    const sb = fresh(posix);
    const w = wrap(join(sb, 'w/driver'), driverPath(sb, 'posix'), card as Card);
    const r = await rsv(sb, [`--driver=${w}`, ...args]);
    expect(r.code).toBe(rc);
    if (rc === 1) expect(r.stdout + r.stderr).toBe('');
    if (rc === 2) expect(r.stderr).toMatch(/\(ERR_CAPABILITY_UNSUPPORTED\)\n$/);
  });

  it('caches a require verdict per driver path and capability set, apart from the dispatch verdict, and re-takes it for a touched driver', async () => {
    const sb = fresh(posix);
    const w = wrap(join(sb, 'w-store'), driverPath(sb, 'posix'));
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
    const dispatch = verdicts(sb).filter((v) => !v.includes('.require.'));
    expect(dispatch.length).toBe(1);
    const before = readFileSync(join(sb, '.contexture/tmp/driver-verdicts', dispatch[0]));
    for (const caps of [['store'], ['search.mode.exact', 'store'], ['store', 'search.mode.exact']]) expect((await rsv(sb, [`--driver=${w}`, 'require', ...caps])).code).toBe(0);
    expect(verdicts(sb).filter((v) => v.includes('.require.')).map((v) => v.replace(/^.*\.require\./, ''))).toEqual(['search.mode.exact+store', 'store']);
    expect(readFileSync(join(sb, '.contexture/tmp/driver-verdicts', dispatch[0])).equals(before)).toBe(true);
    wrap(w, driverPath(sb, 'posix'), { store: [] });
    expect((await rsv(sb, [`--driver=${w}`, 'require', 'store'])).code).toBe(0);
    utimesSync(w, FUTURE, FUTURE);
    expect((await rsv(sb, [`--driver=${w}`, 'require', 'store'])).code).toBe(2);
  });

  it('takes the dispatch verdict again when the workspace configuration changes', async () => {
    const sb = fresh(posix);
    const w = wrap(join(sb, 'w-conf'), driverPath(sb, 'posix'));
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
    const file = join(sb, '.contexture/tmp/driver-verdicts', verdicts(sb)[0]);
    utimesSync(file, MID, MID);
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
    expect(statSync(file).mtime.getTime()).toBe(MID.getTime());
    writeFileSync(join(sb, '.contexture/config'), '# touched\n');
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
    expect(statSync(file).mtime.getTime()).toBeGreaterThan(MID.getTime());
  });

  function unwritableDrawer(onTestFinished: (fn: () => void) => void): [string, string] {
    const sb = fresh(posix);
    const w = wrap(join(sb, 'w-ro'), driverPath(sb, 'posix'));
    mkdirSync(join(sb, '.contexture/tmp/driver-verdicts'), { recursive: true });
    chmodPlant(join(sb, '.contexture/tmp/driver-verdicts'), 0o555, 0o755, onTestFinished);
    return [sb, w];
  }

  it.skipIf(ROOT_USER)('caches nothing when the drawer is unwritable, and still verifies every call', async ({ onTestFinished }) => {
    const [sb, w] = unwritableDrawer(onTestFinished);
    const r = await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']);
    expect([r.code, r.stdout]).toEqual([0, '{"namespace":"unit","keys":[]}\n']);
    expect(verdicts(sb)).toEqual([]);
    wrap(w, driverPath(sb, 'posix'), { store: [] });
    expect((await rsv(sb, [`--driver=${w}`, 'store.list', 'unit'])).code).toBe(2);
  });

  it.skipIf(ROOT_USER)('answers with a clean stderr when the drawer is unwritable', async ({ onTestFinished }) => {
    const [sb, w] = unwritableDrawer(onTestFinished);
    answer(await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']), 'store.list');
  });

  it.skipIf(ROOT_USER)('answers a require with a clean stderr and caches nothing when the drawer is unwritable', async ({ onTestFinished }) => {
    const [sb, w] = unwritableDrawer(onTestFinished);
    const r = await rsv(sb, [`--driver=${w}`, 'require', 'store']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
    expect(verdicts(sb)).toEqual([]);
  });

  it('passes the driver\'s own capability refusal line through the handshake', async () => {
    const sb = fresh(posix);
    const w = join(sb, 'w-refuses');
    writeFileSync(w, '#!/bin/sh\nprintf \'capability: error: planted refusal (ERR_STORAGE_READ)\\n\' >&2\nexit 2\n', { mode: 0o755 });
    const r = await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toContain('planted refusal (ERR_STORAGE_READ)');
  });

  it('keeps its own ERROR line for a driver found nowhere, the one shape exception', async () => {
    const r = await rsv(fresh(posix), ['resolve', 'no-such-driver']);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toBe("driver-resolver: ERROR: storage driver 'no-such-driver' not found in the core drivers, the extension drivers, workspace drivers, module drivers, or PATH (ERR_DRIVER_NOT_FOUND)\n");
  });

  describe('the tiers and the name precedence', () => {
    const resolved = async (sb: string, args: string[], env: Record<string, string> = {}) => {
      const r = await rsv(sb, ['resolve', ...args], '', env);
      expect(r.stderr).toBe('');
      return r.stdout.trim();
    };

    it('finds a driver in each tier: workspace, core, extension, module, base mirror, PATH, and by path', async () => {
      const sb = fresh(posix);
      const target = driverPath(sb, 'posix');
      const ws = wrap(join(sb, '.contexture/drivers/tierone/driver'), target);
      const ext = wrap(join(sb, '.contexture/extensions/storage/drivers/tierthree/driver'), target);
      const mod = wrap(join(sb, '.contexture/modules/zz-plant/drivers/tierfour/driver'), target);
      wrap(join(sb, 'base/.contexture/storage/drivers/tierfive/driver'), target);
      const mirror = `${sb}/.contexture/../base/.contexture/storage/drivers/tierfive/driver`;
      const bin = sandbox('path-tier');
      const onPath = wrap(join(bin, 'ctx-storage-tiersix'), target);
      const env = { PATH: `${bin}:${process.env.PATH ?? ''}` };
      expect(await resolved(sb, ['tierone'])).toBe(ws);
      expect(await resolved(sb, ['posix'])).toBe(target);
      expect(await resolved(sb, ['tierthree'])).toBe(ext);
      expect(await resolved(sb, ['tierfour'])).toBe(mod);
      expect(await resolved(sb, ['tierfive'])).toBe(mirror);
      expect(await resolved(sb, ['tiersix'], env)).toBe(onPath);
      expect(await resolved(sb, [ws])).toBe(ws);
    });

    it('takes the name from --driver, then -d, then CTX_STORAGE_DRIVER, then the config, the legacy key, storage.conf, else posix', async () => {
      const sb = fresh(posix);
      const target = driverPath(sb, 'posix');
      for (const n of ['one', 'two', 'three', 'four', 'five', 'six']) wrap(join(sb, `.contexture/drivers/${n}/driver`), target);
      const at = (n: string) => join(sb, `.contexture/drivers/${n}/driver`);
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
  });
});

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'fts5' && !fts5Available())(`the dispatch handshake serving ${driver}`, { concurrent: true }, () => {
    let snap: string;
    beforeAll(async () => {
      snap = await seed(async () => undefined, driver, 'handshake');
    });

    it('resolves the configured driver and answers its optional capabilities', async () => {
      const sb = fresh(snap);
      expect((await rsv(sb, ['resolve'])).stdout).toBe(`${driverPath(sb, driver)}\n`);
      expect((await rsv(sb, ['has', 'store.changelog'])).code).toBe(driver === 'fts5' ? 0 : 1);
      expect((await rsv(sb, ['has', 'search.schema'])).code).toBe(driver === 'fts5' ? 0 : 1);
    });

    it('serves a complete store card and lands a write through it', async () => {
      const sb = fresh(snap);
      const w = wrap(join(sb, 'w-store'), driverPath(sb, driver), { optional: ['store.changelog'] });
      answer(await rsv(sb, [`--driver=${w}`, 'store.put', 'unit', 'unit/probe/x'], 'resolver fixture\n'), 'store.put');
      expect((await rsv(sb, [`--driver=${w}`, 'store.list', 'unit'])).stdout).toBe('{"namespace":"unit","keys":["unit/probe/x"]}\n');
    });

    it.each([
      ['a record-only card', { store: [] }, ['no store family', 'contract 3 serves the store alone']],
      ['contract 2', { contract: '2' }, ['contract', 'not 3']],
      ['a functions field', { extra: ',"functions":["session.list"]' }, ['record function family']],
      ['the store token without the family', { optional: ['store'], store: [] }, ['no store family']],
      ['no exact mode', { mode: 'hybrid' }, ['exact']],
      ['a partial family', { optional: ['store'], store: SEVEN.filter((s) => s !== 'batch') }, ['seven data names']],
      ['a name outside the seven', { optional: ['store'], store: [...SEVEN, 'store.search'] }, ['seven data names']],
      ['an optional token outside the card', { optional: ['store', 'retired.token'] }, ['optional capability']],
    ] as const)('halts %s rc 2 ERR_DRIVER_PROTOCOL, naming what is wrong', async (_, card, words) => {
      const sb = fresh(snap);
      const w = wrap(join(sb, 'w-bad'), driverPath(sb, driver), card as Card);
      const r = await rsv(sb, [`--driver=${w}`, 'store.list', 'unit']);
      expect([r.code, r.stdout]).toEqual([2, '']);
      expect(r.stderr).toMatch(/\(ERR_DRIVER_PROTOCOL\)\n$/);
      for (const word of words) expect(r.stderr).toContain(word);
    });
  });
}

