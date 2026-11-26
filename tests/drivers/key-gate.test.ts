import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { RECORD_ROOT } from '../support/drawer';
import { driverOp } from '../support/driver';
import { exec, launch } from '../support/exec';
import { shimPath } from '../support/plants';
import { alive } from '../support/procs';
import { moduleCall } from '../support/sh';
import { DRIVERS, sqliteAvailable, stage } from '../support/stage';
import { batchPayload, listAnswer, store } from '../support/store';
import { waitFor } from '../support/unit';
import { answer, refused } from '../support/wire';

const CAP = 16 * 1024 * 1024;
const DEEP = 'key: <p...>\nsuffix: .md\n';
const LIBRARY = '.contexture/storage/scripts/library';
const resolver = (sb: string) => join(sb, '.contexture/storage/scripts/driver-resolver');
const rsv = (sb: string, args: readonly string[], input: string | Buffer = '', env: Record<string, string> = {}) =>
  exec(resolver(sb), args, { cwd: sb, input, env: { CTX_ROOT: sb, ...env } });
const staged = (dir: string) => (existsSync(dir) ? readdirSync(dir).filter((n) => n.startsWith('store-gate.')) : []);

// a recording driver at the extension tier, configured for the sandbox: it answers the card the
// handshake reads, logs every call it serves, and keeps the stdin a store call hands it
function recorder(label: string): { sb: string; log: () => string[]; stdin: () => Buffer } {
  const sb = stage('posix', label);
  dataFile(sb, 'modules', 'deep', DEEP);
  dataFile(sb, 'modules', 'flat', 'key: <c>/<id>\n');
  const dir = join(sb, '.contexture/extensions/storage/drivers/rec');
  mkdirSync(dir, { recursive: true });
  const card = '{"driver":"rec","version":"4.0.0","contract":"4","store":["list","get","put","delete","batch","scan"],"search_modes":[{"name":"exact","description":"a substring"}],"optional":["store"]}';
  writeFileSync(join(dir, 'driver'), [
    '#!/bin/sh',
    `case "$1" in capability) printf '%s\\n' '${card}'; exit 0 ;; esac`,
    `printf '%s\\n' "$*" >> '${join(sb, 'rec.log')}'`,
    `cat > '${join(sb, 'rec.stdin')}'`,
    "printf '{}\\n'",
    '',
  ].join('\n'), { mode: 0o755 });
  writeFileSync(join(sb, '.contexture/config'), 'storage.driver: rec\n');
  const log = () => (existsSync(join(sb, 'rec.log')) ? readFileSync(join(sb, 'rec.log'), 'utf8').split('\n').filter(Boolean) : []);
  const stdin = () => readFileSync(join(sb, 'rec.stdin'));
  return { sb, log, stdin };
}

// a put whose stdin stays open, signalled (its whole group, or the resolver alone) once its copy
// holds the bytes written so far: the code, stdout, the staged files, the driver calls, and
// whether its group emptied
async function signalStaging(label: string, sig: NodeJS.Signals, group: boolean): Promise<unknown[]> {
  const r = recorder(label);
  const run = launch(resolver(r.sb), ['store.put', 'deep', 'u/a'], { cwd: r.sb, input: null, group, timeout: 30_000, env: { CTX_ROOT: r.sb } });
  run.child.stdin?.write('partial');
  const tmp = join(r.sb, '.contexture/tmp');
  const copied = () => staged(tmp).some((n) => statSync(join(tmp, n)).size === 'partial'.length);
  expect(await waitFor(copied, 20_000, 25), 'the copy holds the bytes written so far').toBe(true);
  run.signal(sig);
  const done = await run.result;
  return [done.code, done.stdout, staged(tmp), r.log(), await waitFor(() => !alive(-(run.child.pid as number)), 5_000)];
}

describe('the key and value gate at the resolver\'s dispatch', { concurrent: true }, () => {
  it.each([
    ['store.get', ['deep', 'ok/a', 'bad key'], '', "malformed key 'bad key'"],
    ['store.get', ['deep', 'a\nb'], '', "malformed key 'a\\nb'"],
    ['store.put', ['deep', '.x'], 'v', "malformed key '.x'"],
    ['store.put', ['deep', 'u/a.md/x'], 'v', "malformed key 'u/a.md/x'"],
    ['store.put', ['deep', `a/${'s'.repeat(201)}`], 'v', `malformed key 'a/${'s'.repeat(201)}'`],
    ['store.put', ['deep', `${'a'.repeat(200)}/${'b'.repeat(200)}/${'c'.repeat(111)}`], 'v', `malformed key '${'a'.repeat(200)}/${'b'.repeat(200)}/${'c'.repeat(111)}'`],
    ['store.delete', ['deep', 'a/_b'], '', "malformed key 'a/_b'"],
    ['store.delete', ['flat', 'c/Σ'], '', "malformed key 'c/Σ'"],
    ['store.list', ['deep', 'a/.b'], '', "malformed key prefix 'a/.b'"],
    ['store.list', ['deep', 'u/a.md/'], '', "malformed key prefix 'u/a.md/'"],
    ['store.promote', ['deep', 'a/b'], '', "malformed key prefix 'a/b'"],
    ['store.promote', ['deep', 'a/-b/'], '', "malformed key prefix 'a/-b/'"],
    ['storage.sweep', ['deep', '--dry-run', '--prefix=a b/'], '', "malformed key prefix 'a b/'"],
  ] as const)('[the-engine-r-kvr01, the-engine-r21] %s %j refuses rc 1 with its own one line, and no driver runs', async (fn, args, input, message) => {
    const r = recorder('gate-refuse');
    refused(await rsv(r.sb, [fn, ...args], input), fn, 1, 'ERR_INVALID_ARGUMENT', message);
    expect(r.log(), 'the recording driver never ran').toEqual([]);
    expect(staged(join(r.sb, '.contexture/tmp')), 'no staged payload is left').toEqual([]);
  });

  it('[the-engine-r-kvr01] a batch names its first action outside the rule, its key written with the payload escape, and no driver runs; the exec arm meets the same gate', async () => {
    const r = recorder('gate-batch');
    const payload = 'action=put\nkey=a/b\nvalue_b64=eA==\naction=delete\nkey=a/b\\nc\naction=put\nkey=.z\nvalue_b64=eA==\n';
    refused(await rsv(r.sb, ['store.batch', 'deep'], payload), 'store.batch', 1, 'ERR_INVALID_ARGUMENT', "action 2 (delete 'a/b\\nc'): malformed key 'a/b\\nc'");
    refused(await rsv(r.sb, ['exec', 'store.put', 'deep', 'a/.b'], 'v'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', "malformed key 'a/.b'");
    expect(r.log()).toEqual([]);
    expect(staged(join(r.sb, '.contexture/tmp'))).toEqual([]);
  });

  it('[the-engine-r-kvr01] a line outside the wire\'s shape ends the gate\'s check there, so the driver names it first', async () => {
    const r = recorder('gate-structure');
    answer(await rsv(r.sb, ['store.batch', 'deep'], 'action=put\nkey=a/b\nbogus=1\naction=put\nkey=.z\nvalue_b64=eA==\n'), 'store.batch');
    answer(await rsv(r.sb, ['store.batch', 'deep'], 'action=put\nkey=a/b\nhead=none\naction=put\nkey=.z\nvalue_b64=eA==\n'), 'store.batch');
    expect(r.log()).toEqual(['store.batch deep', 'store.batch deep']);
  });

  it('[the-engine-r-kvr01] a call inside the rule reaches the driver, a put\'s and a batch\'s stdin handed on byte for byte from a staged file that is gone after the exec', async () => {
    const r = recorder('gate-pass');
    const scratch = join(r.sb, '.contexture/tmp/verb');
    const bytes = Buffer.from([0, 1, 2, 0xff, 0x0a, 0x0d]);
    answer(await rsv(r.sb, ['store.put', 'deep', 'u/a.md'], bytes, { CTX_SCRATCH_ROOT: scratch }), 'store.put');
    expect(r.stdin().equals(bytes)).toBe(true);
    const payload = batchPayload([{ action: 'put', key: 'u/b', value: 'b' }, { action: 'delete', key: 'u/a' }]);
    answer(await rsv(r.sb, ['store.batch', 'deep'], payload), 'store.batch');
    expect(r.stdin().toString()).toBe(payload);
    for (const [fn, args] of [['store.get', ['deep', 'u/a', 'A0.z_-9/x']], ['store.list', ['deep', 'u/a']], ['store.list', ['deep', 'u/']], ['store.promote', ['deep', 'u/']], ['storage.sweep', ['deep', '--prefix=u/']], ['store.delete', ['flat', 'c/1']], ['store.scan', ['deep']]] as const) {
      answer(await rsv(r.sb, [fn, ...args]), fn);
    }
    expect(r.log()).toEqual(['store.put deep u/a.md', 'store.batch deep', 'store.get deep u/a A0.z_-9/x', 'store.list deep u/a', 'store.list deep u/',
      'store.promote deep u/', 'storage.sweep deep --prefix=u/', 'store.delete flat c/1', 'store.scan deep']);
    expect([staged(scratch), staged(join(r.sb, '.contexture/tmp'))]).toEqual([[], []]);
  });

  it('[the-engine-r-kvr01] a value past 16 MiB refuses at the gate naming the key and the cap, a put by its stdin and a batch put by its decoded size; a value at the cap passes', async () => {
    const r = recorder('gate-cap');
    refused(await rsv(r.sb, ['store.put', 'deep', 'u/big'], Buffer.alloc(CAP + 1, 0x61)), 'store.put', 1, 'ERR_INVALID_ARGUMENT',
      "the value of key 'u/big' is 16777217 bytes, past the 16 MiB cap (16777216 bytes)");
    const over = batchPayload([{ action: 'put', key: 'u/small', value: 'x' }, { action: 'put', key: 'u/big', value: Buffer.alloc(CAP + 1, 0x62) }]);
    refused(await rsv(r.sb, ['store.batch', 'deep'], over), 'store.batch', 1, 'ERR_INVALID_ARGUMENT',
      "action 2 (put 'u/big'): the value of key 'u/big' is 16777217 bytes, past the 16 MiB cap (16777216 bytes)");
    expect(r.log()).toEqual([]);
    answer(await rsv(r.sb, ['store.put', 'deep', 'u/big'], Buffer.alloc(CAP, 0x61)), 'store.put');
    expect(r.stdin().length).toBe(CAP);
    answer(await rsv(r.sb, ['store.batch', 'deep'], batchPayload([{ action: 'put', key: 'u/big', value: Buffer.alloc(CAP, 0x62) }])), 'store.batch');
    expect(staged(join(r.sb, '.contexture/tmp'))).toEqual([]);
  });

  it('[the-engine-r-kvr01] a batch value past the cap refuses at the gate under an extra padding character or a NUL byte in its line, and a NUL never reaches the driver', async () => {
    const r = recorder('gate-cap-wire');
    const b64 = Buffer.alloc(CAP + 1, 0x63).toString('base64');
    const over = "action 1 (put 'u/big'): the value of key 'u/big' is 16777217 bytes, past the 16 MiB cap (16777216 bytes)";
    const nul = (...parts: string[]) => Buffer.concat(parts.flatMap((p, i) => (i ? [Buffer.from([0]), Buffer.from(p)] : [Buffer.from(p)])));
    refused(await rsv(r.sb, ['store.batch', 'deep'], `action=put\nkey=u/big\nvalue_b64=${b64}=\n`), 'store.batch', 1, 'ERR_INVALID_ARGUMENT', over);
    refused(await rsv(r.sb, ['store.batch', 'deep'], nul('action=put\nkey=u/big\nvalue_b64=', `${b64}\n`)), 'store.batch', 1, 'ERR_INVALID_ARGUMENT', over);
    expect(r.log()).toEqual([]);
    answer(await rsv(r.sb, ['store.batch', 'deep'], nul('action=put\nkey=u/a', 'b\nvalue_b64=eA==\n')), 'store.batch');
    expect(r.stdin().toString()).toBe('action=put\nkey=u/ab\nvalue_b64=eA==\n');
    expect(staged(join(r.sb, '.contexture/tmp'))).toEqual([]);
  });

  it.each([['SIGHUP', 129], ['SIGINT', 130], ['SIGTERM', 143]] as const)('[the-engine-r-kvr01, the-engine-r28] a %s while the gate stages a put removes the staged file and exits %d, no driver run and nothing left in its group', async (sig, rc) => {
    expect(await signalStaging('gate-signal', sig, true)).toEqual([rc, '', [], [], true]);
  });

  it.each([['SIGHUP', 129], ['SIGINT', 130], ['SIGTERM', 143]] as const)('[the-engine-r-kvr01, the-engine-r28] a %s to the resolver alone while its copy waits on an open stdin ends the copy, removes the staged file, and exits %d', async (sig, rc) => {
    expect(await signalStaging('gate-signal-alone', sig, false)).toEqual([rc, '', [], [], true]);
  });

  it('[the-engine-r-kvr01, the-engine-r26] a module call through the library meets the same line, and no driver runs', async () => {
    const r = recorder('gate-library');
    const call = (fn: string, ...args: string[]) => moduleCall(r.sb, 'deep', join(r.sb, LIBRARY), fn, args, { input: 'v', env: { CTX_STORE_ROOT: r.sb } });
    refused(await call('store_put', 'a/.b'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', "malformed key 'a/.b'");
    refused(await call('store_list', 'Bad prefix'), 'store.list', 1, 'ERR_INVALID_ARGUMENT', "malformed key prefix 'Bad prefix'");
    expect(r.log()).toEqual([]);
    answer(await call('store_put', 'a/b'), 'store.put');
    expect(r.log()).toEqual(['store.put deep a/b']);
  });
});

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'sqlite' && !sqliteAvailable())(`the key and value rule at its boundaries on ${driver}, through the resolver`, { concurrent: true }, () => {
    const seg = (c: string, n: number) => c.repeat(n);
    const sandboxOf = (label: string) => {
      const sb = stage(driver, label);
      dataFile(sb, 'modules', 'deep', DEEP);
      return sb;
    };

    it('[the-engine-r-kvr01] a 200 byte segment and a 512 byte key hold, a 201 byte segment and a 513 byte key refuse, and every allowed byte holds', async () => {
      const sb = sandboxOf('kv-caps');
      const held = [`${seg('a', 200)}/${seg('f', 200)}`, `k/${seg('b', 200)}/${seg('c', 200)}/${seg('d', 108)}`, 'A.Z_a-z.09/0-1_2.3'];
      expect(held[1]!.length).toBe(512);
      for (const key of held) answer(await rsv(sb, ['store.put', 'deep', key], `${key.length}\n`), 'store.put');
      for (const key of [`${seg('e', 201)}/x`, `k/${seg('b', 200)}/${seg('c', 200)}/${seg('d', 109)}`]) {
        refused(await rsv(sb, ['store.put', 'deep', key], 'v'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', `malformed key '${key}'`);
      }
      expect((await rsv(sb, ['store.list', 'deep'])).stdout).toBe(listAnswer('deep', [...held].sort()));
      for (const key of held) expect((await rsv(sb, ['store.get', 'deep', key])).stdout).toBe(`${key.length}\n`);
    });

    it('[the-engine-r-kvr01] a leading dot, a non final segment ending with the suffix, and a prefix run twin refuse; a final segment ending with the suffix holds', async () => {
      const sb = sandboxOf('kv-shapes');
      for (const key of ['.x/y', 'x/.y', 'u/a.md/x']) refused(await rsv(sb, ['store.put', 'deep', key], 'v'), 'store.put', 1, 'ERR_INVALID_ARGUMENT', `malformed key '${key}'`);
      answer(await rsv(sb, ['store.put', 'deep', 'u/a.md'], 'v'), 'store.put');
      answer(await rsv(sb, ['store.put', 'deep', 'a/x'], 'v'), 'store.put');
      refused(await rsv(sb, ['store.put', 'deep', 'A/y'], 'v'), 'store.put', 1, 'ERR_ENTITY_EXISTS',
        "key 'A/y' folds onto 'a' under ASCII case at its leading segments 'A'; keys whose leading segments differ only by case never coexist in namespace 'deep'");
      expect((await rsv(sb, ['store.list', 'deep'])).stdout).toBe(listAnswer('deep', ['a/x', 'u/a.md']));
    });

    it('[the-engine-r-kvr01] values round trip byte for byte empty and at 16 MiB, and one byte past it refuses with nothing written', async () => {
      const sb = sandboxOf('kv-values');
      answer(await rsv(sb, ['store.put', 'deep', 'v/empty'], ''), 'store.put');
      expect((await rsv(sb, ['store.get', 'deep', 'v/empty'])).bytes.length).toBe(0);
      const big = Buffer.alloc(CAP);
      for (let i = 0; i < CAP; i++) big[i] = (i * 131 + (i >> 16)) % 256 === 10 ? 0 : (i * 131 + (i >> 16)) % 256;
      answer(await rsv(sb, ['store.put', 'deep', 'v/big'], big), 'store.put');
      expect((await rsv(sb, ['store.get', 'deep', 'v/big'])).bytes.equals(big)).toBe(true);
      refused(await rsv(sb, ['store.put', 'deep', 'v/over'], Buffer.concat([big, Buffer.from('x')])), 'store.put', 1, 'ERR_INVALID_ARGUMENT',
        "the value of key 'v/over' is 16777217 bytes, past the 16 MiB cap (16777216 bytes)");
      expect((await rsv(sb, ['store.list', 'deep'])).stdout).toBe(listAnswer('deep', ['v/big', 'v/empty']));
    });
  });
}

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'sqlite' && !sqliteAvailable())(`the twin check in one pass per batch on ${driver}`, () => {
    let shims: string;
    beforeAll(() => {
      shims = shimPath();
    });

    async function batchCalls(label: string, keys: number, puts: number): Promise<string[]> {
      const sb = stage(driver, label);
      dataFile(sb, 'modules', 'deep', DEEP);
      const seeds = Array.from({ length: keys }, (_, i) => ({ action: 'put' as const, key: `seed/k${i}`, value: 'v' }));
      answer(await store(sb, driver).batch('deep', seeds), 'store.batch');
      const log = join(sb, 'calls.log');
      const payload = batchPayload(Array.from({ length: puts }, (_, i) => ({ action: 'put' as const, key: `new/n${i}`, value: 'v' })));
      answer(await driverOp(sb, driver, 'store.batch', ['deep'], payload, { PATH: shims, SHIM_LOG: log }), 'store.batch');
      return readFileSync(log, 'utf8').split('\n').filter(Boolean).sort();
    }

    it('[the-engine-r-kvr01] a batch\'s external commands do not grow with the namespace\'s key count, and no sort or grep runs per action', async () => {
      const [small, large] = await Promise.all([batchCalls('pass-small', 5, 3), batchCalls('pass-large', 80, 3)]);
      expect(small.length, 'the instrument counts the batch\'s commands').toBeGreaterThan(3);
      expect(large).toEqual(small);
      const [few, many] = await Promise.all([batchCalls('pass-few', 20, 2), batchCalls('pass-many', 20, 12)]);
      const per = (calls: string[], name: string) => calls.filter((c) => c === name).length;
      expect(per(many, 'awk'), 'the instrument sees the per action work').toBeGreaterThan(per(few, 'awk'));
      for (const name of ['sort', 'grep']) expect([name, per(many, name)]).toEqual([name, per(few, name)]);
    });
  });
}

// the unit namespace as the posix driver stores it under the record root: units of 30 keys
// each, the four unit artifacts and nine lanes, eight of three artifacts and the ninth of two
function plantUnits(sb: string, units: number): void {
  for (let u = 1; u <= units; u++) {
    const unit = join(sb, RECORD_ROOT, `u${String(u).padStart(4, '0')}`);
    mkdirSync(unit, { recursive: true });
    for (const a of ['state', 'backlog', 'knowledge', 'journal']) writeFileSync(join(unit, `${a}.md`), 'v\n');
    for (let l = 1; l <= 9; l++) {
      const lane = join(unit, 'lanes', `l${l}`);
      mkdirSync(lane, { recursive: true });
      for (const a of ['recipe', 'journal', 'report'].slice(0, l < 9 ? 3 : 2)) writeFileSync(join(lane, `${a}.md`), 'v\n');
    }
  }
}

describe('the posix batch reads the folders its keys touch, never the namespace', () => {
  const KEYS = 33_510;
  let shims: string;
  let large: string;
  const listed = (stdout: string): string[] => JSON.parse(stdout).keys;
  beforeAll(async () => {
    shims = shimPath(['find']);
    large = stage('posix', 'walk-large');
    plantUnits(large, KEYS / 30);
    expect(listed((await rsv(large, ['store.list', 'unit'])).stdout)).toHaveLength(KEYS);
  }, 180_000);

  // every external command of one call by name, a find with its folder and its arguments
  async function calls(sb: string, args: readonly string[], input = ''): Promise<string[]> {
    const log = join(sb, 'calls.log');
    writeFileSync(log, '');
    const r = await rsv(sb, args, input, { PATH: shims, SHIM_LOG: log });
    expect(r.code, r.stderr).toBe(0);
    return readFileSync(log, 'utf8').split('\n').filter(Boolean);
  }
  const names = (log: string[]) => log.map((l) => l.split('\t')[0]).sort();
  // a find that walks the namespace root: one starting at the root that prunes nothing
  const walksRoot = (sb: string, line: string): boolean => {
    const [name, cwd, ...args] = line.split('\t');
    const root = realpathSync(join(sb, RECORD_ROOT));
    return name === 'find' && !args.includes('-prune') && args.some((a) => existsSync(resolve(cwd, a)) && realpathSync(resolve(cwd, a)) === root);
  };
  const put = (key: string) => batchPayload([{ action: 'put', key, value: 'v\n' }]);

  it('[the-engine-r-kvr01] a one action unit batch into 33510 keys runs no find over the namespace root and the external commands of the same batch into a namespace of 0 keys', { timeout: 120_000 }, async () => {
    const zero = stage('posix', 'walk-zero');
    answer(await rsv(zero, ['store.put', 'unit', 'seed/state'], 'v\n'), 'store.put');
    answer(await rsv(zero, ['store.delete', 'unit', 'seed/state']), 'store.delete');
    expect(listed((await rsv(zero, ['store.list', 'unit'])).stdout)).toEqual([]);
    expect(existsSync(join(zero, RECORD_ROOT)), 'the emptied namespace keeps its root').toBe(true);
    const none = await calls(zero, ['store.batch', 'unit'], put('zbench/state'));
    const full = await calls(large, ['store.batch', 'unit'], put('zbench/state'));
    expect(none.length, 'the instrument counts the batch\'s commands').toBeGreaterThan(3);
    expect(names(full)).toEqual(names(none));
    const finds = full.filter((l) => l.startsWith('find\t'));
    expect(finds.length, 'the batch lists its folders').toBeGreaterThan(0);
    for (const line of finds) {
      expect(line.split('\t'), 'each find lists one level').toContain('-prune');
      expect(walksRoot(large, line), line).toBe(false);
    }
    const list = await calls(large, ['store.list', 'unit']);
    expect(list.some((l) => walksRoot(large, l)), 'the instrument sees a walk of the namespace root').toBe(true);
  });

  it('[the-engine-r-kvr01] a one action write into a stored unit\'s lane runs the same external commands at 30 keys and at 33510', { timeout: 120_000 }, async () => {
    const small = stage('posix', 'walk-small');
    plantUnits(small, 1);
    const one = await calls(small, ['store.batch', 'unit'], put('u0001/lanes/l9/report'));
    const full = await calls(large, ['store.batch', 'unit'], put('u0001/lanes/l9/report'));
    expect(names(full)).toEqual(names(one));
    expect(full.filter((l) => walksRoot(large, l))).toEqual([]);
  });
});

// keys of 160 two byte segments under a top segment of their own, each naming some 40 KB of
// folders for the posix listing, so a batch of them names twice the system's argument limit
describe('the posix listing of deep keys past the argument limit', () => {
  const tail = '/aa'.repeat(160);
  const deepKey = (top: string) => `${top}${tail}/x`;
  async function deepStore(label: string): Promise<{ sb: string; keys: string[] }> {
    const sb = stage('posix', label);
    dataFile(sb, 'modules', 'deep', DEEP);
    answer(await rsv(sb, ['store.put', 'deep', deepKey('k0000')], 'v\n'), 'store.put');
    answer(await rsv(sb, ['store.put', 'deep', 'K999/x'], 'v\n'), 'store.put');
    const max = Number((await exec('getconf', ['ARG_MAX'], { cwd: sb, input: '' })).stdout.trim());
    expect(max, 'the argument limit reads').toBeGreaterThan(0);
    let folders = 0;
    for (let i = 0; i <= 160; i++) folders += `./k0001${'/aa'.repeat(i)}/.`.length + 1;
    const n = Math.ceil((2 * max) / folders);
    return { sb, keys: Array.from({ length: n }, (_, i) => deepKey(`k${String(i + 1).padStart(4, '0')}`)) };
  }

  it('[the-engine-r-kvr01] a batch finds a stored deep key for its delete and refuses the put twin of a stored folder at its own action, as a batch of those two actions alone does', { timeout: 120_000 }, async () => {
    const { sb, keys } = await deepStore('args-batch');
    const pair = [{ action: 'delete' as const, key: deepKey('k0000') }, { action: 'put' as const, key: 'k999/y', value: 'v\n' }];
    const twin = (n: number) => `action ${n} (put 'k999/y'): key 'k999/y' folds onto 'K999' under ASCII case at its leading segments 'k999'; keys whose leading segments differ only by case never coexist in namespace 'deep'`;
    refused(await rsv(sb, ['store.batch', 'deep'], batchPayload(pair)), 'store.batch', 1, 'ERR_ENTITY_EXISTS', twin(2));
    const actions = [...keys.map((key) => ({ action: 'put' as const, key, value: 'v\n' })), ...pair];
    refused(await rsv(sb, ['store.batch', 'deep'], batchPayload(actions)), 'store.batch', 1, 'ERR_ENTITY_EXISTS', twin(keys.length + 2));
    expect((await rsv(sb, ['store.list', 'deep'])).stdout).toBe(listAnswer('deep', ['K999/x', deepKey('k0000')]));
  });

  it('[the-engine-r-kvr01] a batched get reads a stored deep key among them', { timeout: 120_000 }, async () => {
    const { sb, keys } = await deepStore('args-get');
    const items = answer(await rsv(sb, ['store.get', 'deep', deepKey('k0000'), ...keys]), 'store.get').items;
    expect(items[0]).toEqual({ key: deepKey('k0000'), value: 'v\n' });
    expect(items.slice(1).every((i: { missing?: boolean }) => i.missing === true)).toBe(true);
  });
});
