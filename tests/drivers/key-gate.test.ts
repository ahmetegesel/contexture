import { accessSync, constants, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { driverOp } from '../support/driver';
import { exec, launch } from '../support/exec';
import { alive } from '../support/procs';
import { sandbox } from '../support/sandbox';
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

// a PATH of one shim per command the real PATH resolves, each logging its name to SHIM_LOG
// before it runs the real command, so a run's external commands are counted by name
function shimPath(): string {
  const bin = join(sandbox('shim-path'), 'bin');
  mkdirSync(bin);
  const seen = new Set<string>();
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (!dir || !existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (seen.has(name) || !/^[A-Za-z0-9._+-]+$/.test(name)) continue;
      const real = join(dir, name);
      try {
        accessSync(real, constants.X_OK);
        if (!statSync(real).isFile()) continue;
      } catch {
        continue;
      }
      seen.add(name);
      writeFileSync(join(bin, name), `#!/bin/sh\nprintf '%s\\n' '${name}' >> "$SHIM_LOG"\nexec '${real}' "$@"\n`, { mode: 0o755 });
    }
  }
  return bin;
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
