import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { driverPath } from '../support/driver';
import { launch } from '../support/exec';
import { lockPath, namespaceLock, readOnlyLockShim } from '../support/locks';
import { ROOT_USER, chmodPlant, mktempPlant, pathPlant } from '../support/plants';
import { sandbox } from '../support/sandbox';
import { fresh } from '../support/snapshot';
import { DRIVERS, type Driver, fts5Available } from '../support/stage';
import { batchPayload, docsStore, plantScript, store } from '../support/store';
import { answer, refused, refusedLike } from '../support/wire';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? [join(dir, e.name), ...walk(join(dir, e.name))] : [join(dir, e.name)]));
}

const stages = (sb: string) => walk(sb).filter((p) => /\/\.stage/.test(p));
const scratch = (sb: string) => readdirSync(join(sb, '.contexture/tmp')).filter((n) => n !== 'locks').sort();

async function seeded(snapshot: string, driver: Driver, keys: Record<string, string>): Promise<string> {
  const sb = fresh(snapshot);
  const s = store(sb, driver);
  for (const [key, value] of Object.entries(keys)) answer(await s.put('docs', key, value), 'store.put');
  return sb;
}

async function bytesOf(sb: string, driver: Driver, keys: string[]): Promise<string[]> {
  return Promise.all(keys.map(async (k) => (await store(sb, driver).get('docs', k)).stdout));
}

const OLD = { 'workspace/x': 'old x\n', 'workspace/y': 'old y\n' };
const NEW = [{ action: 'put', key: 'workspace/x', value: 'new x\n' }, { action: 'put', key: 'workspace/y', value: 'new y\n' }] as const;

const scratchPlant = (entry: string): Record<string, string> =>
  mktempPlant(`case "$p" in\n  */store-batch.*|*/fts5-ws.*) /bin/mkdir "$p/${entry}" ;;\n  */store-keys.*) chmod 400 "$p" ;;\nesac`);

describe.skipIf(ROOT_USER)('posix write faults', { concurrent: true }, () => {
  let empty: string;
  beforeAll(async () => {
    empty = await docsStore('posix', false);
  });

  it('[the-engine-r18, the-engine-r19] a put that cannot create its temp refuses rc 2 and leaves the old value whole', async ({ onTestFinished }) => {
    const sb = await seeded(empty, 'posix', { 'workspace/atomic': 'atomic-old\n' });
    chmodPlant(join(sb, 'docs/workspace'), 0o500, 0o700, onTestFinished);
    refused(await store(sb, 'posix').put('docs', 'workspace/atomic', 'atomic-new\n'), 'store.put', 2, 'ERR_STORAGE_WRITE', "the storage write of key 'workspace/atomic' failed");
    expect((await store(sb, 'posix').get('docs', 'workspace/atomic')).stdout).toBe('atomic-old\n');
  });

  it('[the-engine-r19] a landed put leaves no temp under the store root', async () => {
    const sb = await seeded(empty, 'posix', { 'workspace/a': 'a\n', 'workspace/b': 'b\n' });
    answer(await store(sb, 'posix').put('docs', 'workspace/a', 'a2\n'), 'store.put');
    expect(walk(join(sb, 'docs')).map((p) => p.slice(sb.length))).toEqual(['/docs/workspace', '/docs/workspace/a.md', '/docs/workspace/b.md']);
  });

  it('[the-engine-r18, the-engine-r19, the-engine-r21] a second action failing its write rolls the first back, names action 2, and removes the folder action 1 made', async ({ onTestFinished }) => {
    const sb = fresh(empty);
    mkdirSync(join(sb, 'docs/ro'), { recursive: true });
    chmodPlant(join(sb, 'docs/ro'), 0o500, 0o700, onTestFinished);
    const s = store(sb, 'posix');
    refused(await s.batch('docs', [{ action: 'put', key: 'a/new', head: 'none', value: 'one\n' }, { action: 'put', key: 'ro/x', head: 'none', value: 'ro\n' }]),
      'store.batch', 2, 'ERR_STORAGE_WRITE', "action 2 (put 'ro/x'): the storage write of key 'ro/x' failed");
    refused(await s.get('docs', 'a/new'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'a/new' not found in namespace 'docs'");
    expect(existsSync(join(sb, 'docs/a'))).toBe(false);
  });

  it('[the-engine-r18, the-engine-r19] a rename failing between the batch renames rolls the first back and leaves no stage', async () => {
    const sb = await seeded(empty, 'posix', OLD);
    const mv = pathPlant('mv', 'for a in "$@"; do last=$a; done\ncase "$last" in */y.md) exit 1 ;; esac\nexec /bin/mv "$@"');
    const r = await store(sb, 'posix', mv).batch('docs', NEW);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^store\.batch: error: .*\(ERR_STORAGE_WRITE\)\n$/);
    expect(await bytesOf(sb, 'posix', Object.keys(OLD))).toEqual(Object.values(OLD));
    expect(stages(sb)).toEqual([]);
  });

  it('[the-engine-r18, the-engine-r19, the-engine-r21] a batch whose undo log cannot be written refuses rc 2 before its first rename, so a later failing rename leaves nothing written', async () => {
    const sb = await seeded(empty, 'posix', OLD);
    const mv = pathPlant('mv', 'for a in "$@"; do last=$a; done\ncase "$last" in */y.md) exit 1 ;; esac\nexec /bin/mv "$@"');
    const undo = mktempPlant('case "$p" in */store-batch.*) /bin/mkdir "$p/undo" ;; esac');
    const r = await store(sb, 'posix', { PATH: `${undo.PATH.split(':')[0]}:${mv.PATH}` }).batch('docs', NEW);
    expect(await bytesOf(sb, 'posix', Object.keys(OLD)), `rc ${r.code} [${r.stderr}]`).toEqual(Object.values(OLD));
    refusedLike(r, 'store.batch', 2, 'ERR_STORAGE_WRITE', "action 1 (put 'workspace/x'): ");
  });

  it('[the-engine-r21] a list whose key listing cannot be written refuses rc 2 with its one line, never an empty answer', async () => {
    const sb = await seeded(empty, 'posix', OLD);
    refusedLike(await store(sb, 'posix', mktempPlant('case "$p" in */store-keys.*) chmod 400 "$p" ;; esac')).list('docs'), 'store.list', 2, 'ERR_STORAGE_WRITE');
  });

  it('[the-engine-r18] a TERM between the batch renames leaves both keys whole, no stage, and the lock released', async () => {
    const sb = await seeded(empty, 'posix', OLD);
    const mark = join(sandbox('wa-mark'), 'mark');
    const mv = pathPlant('mv', `for a in "$@"; do last=$a; done\ncase "$last" in */y.md) : > "${mark}"; sleep 2 ;; esac\nexec /bin/mv "$@"`);
    const { child, result } = launch(driverPath(sb, 'posix'), ['store.batch', 'docs'], { cwd: sb, input: batchPayload(NEW), env: mv });
    for (let i = 0; i < 100 && !existsSync(mark); i++) await wait(50);
    expect(existsSync(mark)).toBe(true);
    child.kill('SIGTERM');
    expect((await result).code).not.toBe(0);
    await wait(2500);
    const after = await bytesOf(sb, 'posix', Object.keys(OLD));
    expect([Object.values(OLD), NEW.map((a) => a.value)]).toContainEqual(after);
    expect(stages(sb)).toEqual([]);
    expect(existsSync(lockPath(sb, namespaceLock('docs')))).toBe(false);
  });
});

for (const driver of DRIVERS) {
  describe.skipIf(ROOT_USER || (driver === 'fts5' && !fts5Available()))(`a read-only store on ${driver}`, () => {
    it('[the-engine-r18, the-engine-r21] refuses put, delete, and batch rc 2 with one line each and keeps its bytes; writable again, it serves', async ({ onTestFinished }) => {
      const sb = await seeded(await docsStore(driver, false), driver, OLD);
      const s = store(sb, driver);
      const ro = driver === 'fts5' ? [join(sb, '.contexture/sessions.db')] : [join(sb, 'docs/workspace/x.md'), join(sb, 'docs/workspace/y.md'), join(sb, 'docs/workspace')];
      for (const p of ro) chmodPlant(p, p.endsWith('workspace') ? 0o555 : 0o444, p.endsWith('workspace') ? 0o755 : 0o644, onTestFinished);
      for (const [fn, r] of [
        ['store.put', await s.put('docs', 'workspace/x', 'never lands\n')],
        ['store.delete', await s.del('docs', 'workspace/y')],
        ['store.batch', await s.batch('docs', NEW)],
      ] as const) {
        expect(r.code, `${fn} rc [${r.stderr}]`).toBe(2);
        expect(r.stdout).toBe('');
        expect(r.stderr).toMatch(new RegExp(`^${fn.replace('.', '\\.')}: error: [^\\n]+ \\(ERR_STORAGE_[A-Z]+\\)\\n$`));
      }
      expect(await bytesOf(sb, driver, Object.keys(OLD))).toEqual(Object.values(OLD));
      for (const p of ro) chmodSync(p, p.endsWith('workspace') ? 0o755 : 0o644);
      for (const side of ['-wal', '-shm']) if (existsSync(`${ro[0]}${side}`)) chmodSync(`${ro[0]}${side}`, 0o644);
      answer(await s.put('docs', 'workspace/x', 'lands\n'), 'store.put');
      expect((await s.get('docs', 'workspace/x')).stdout).toBe('lands\n');
    });
  });
}

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'fts5' && !fts5Available())(`an interrupt while the ${driver} driver reads the namespace declaration`, { concurrent: true }, () => {
    let empty: string;
    beforeAll(async () => {
      empty = await docsStore(driver, false);
    });

    it.each([
      ['store.put', 'SIGHUP'],
      ['store.put', 'SIGINT'],
      ['store.put', 'SIGTERM'],
      ['store.get', 'SIGTERM'],
    ] as const)('[the-engine-r28] %s under a group %s leaves no store-data scratch', async (fn, sig) => {
      const sb = fresh(empty);
      const mark = join(sandbox('store-data-mark'), 'mark');
      plantScript(sb, 'store-data', `: > "${mark}"\nexec sleep 30`);
      const before = scratch(sb);
      const { result, signal } = launch(driverPath(sb, driver), [fn, 'docs', 'workspace/x'], { cwd: sb, input: fn === 'store.put' ? 'never lands\n' : '', group: true });
      for (let i = 0; i < 200 && !existsSync(mark); i++) await wait(50);
      expect(existsSync(mark)).toBe(true);
      expect(scratch(sb).filter((n) => !before.includes(n))).toEqual([expect.stringMatching(/^store-data\./)]);
      signal(sig);
      expect((await result).code).not.toBe(0);
      expect(scratch(sb)).toEqual(before);
    });
  });
}

const realBin = (name: string): string => spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' }).stdout.trim();

const readBlock = (cmd: string, temps: readonly string[], mark: string): Record<string, string> =>
  pathPlant(cmd, `for t in ${temps.map((t) => `.contexture/tmp/${t}.*`).join(' ')}; do\n  [ -e "$t" ] && { : > "${mark}"; exec sleep 30; }\ndone\nexec "${realBin(cmd)}" "$@"`);

const READS = [
  ['posix', 'store.list', 'SIGHUP', [], 'find', ['store-keys']],
  ['posix', 'store.list', 'SIGINT', [], 'find', ['store-keys']],
  ['posix', 'store.list', 'SIGTERM', [], 'find', ['store-keys']],
  ['posix', 'store.scan', 'SIGTERM', [], 'find', ['store-scan', 'store-scan-out']],
  ['posix', 'store.search', 'SIGTERM', ['exact', '20'], 'find', ['store-search', 'store-search-err']],
  ['fts5', 'store.list', 'SIGHUP', [], 'sqlite3', ['store-keys']],
  ['fts5', 'store.list', 'SIGINT', [], 'sqlite3', ['store-keys']],
  ['fts5', 'store.list', 'SIGTERM', [], 'sqlite3', ['store-keys']],
] as const;

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'fts5' && !fts5Available())(`an interrupt while the ${driver} driver reads the store`, { concurrent: true }, () => {
    let keyed: string;
    beforeAll(async () => {
      keyed = await docsStore(driver, true);
    });

    it.each(READS.filter((r) => r[0] === driver).map((r) => r.slice(1) as unknown as [string, NodeJS.Signals, readonly string[], string, readonly string[]]))(
      '[the-engine-r28] %s under a group %s leaves none of its read temps', async (fn, sig, args, cmd, temps) => {
        const sb = fresh(keyed);
        const mark = join(sandbox('read-mark'), 'mark');
        const before = scratch(sb);
        const { result, signal } = launch(driverPath(sb, driver), [fn, 'docs', ...args], { cwd: sb, input: fn === 'store.search' ? 'query=a\n' : '', group: true, env: readBlock(cmd, temps, mark) });
        for (let i = 0; i < 200 && !existsSync(mark); i++) await wait(50);
        expect(existsSync(mark)).toBe(true);
        expect(scratch(sb).filter((n) => !before.includes(n)).map((n) => n.replace(/\.[^.]+$/, '')).sort()).toEqual([...temps].sort());
        signal(sig);
        expect((await result).code).not.toBe(0);
        expect(scratch(sb)).toEqual(before);
      });
  });
}

for (const driver of DRIVERS) {
  describe.skipIf(ROOT_USER || (driver === 'fts5' && !fts5Available()))(`a write into a folder the ${driver} driver just made fails with its one refusal line`, { concurrent: true }, () => {
    let empty: string;
    beforeAll(async () => {
      empty = await docsStore(driver, false);
    });

    it('[the-engine-r18, the-engine-r21] a put whose lock holder pid cannot be written refuses with nothing else on stderr and leaves no lock', async () => {
      const sb = await seeded(empty, driver, OLD);
      refused(await store(sb, driver, readOnlyLockShim()).put('docs', 'workspace/x', 'never lands\n'), 'store.put', 2, 'ERR_STORAGE_WRITE', 'cannot write the store lock holder pid');
      expect(existsSync(lockPath(sb, namespaceLock('docs')))).toBe(false);
      expect(await bytesOf(sb, driver, Object.keys(OLD))).toEqual(Object.values(OLD));
    });

    it('[the-engine-r21] a batch whose value cannot be staged refuses rc 2 ERR_STORAGE_WRITE naming its action, with nothing else on stderr', async () => {
      const sb = await seeded(empty, driver, OLD);
      const r = await store(sb, driver, scratchPlant(driver === 'fts5' ? 'batch-val.1' : 'val.1')).batch('docs', NEW);
      refused(r, 'store.batch', 2, 'ERR_STORAGE_WRITE', "action 1 (put 'workspace/x'): cannot stage the value");
      expect(await bytesOf(sb, driver, Object.keys(OLD))).toEqual(Object.values(OLD));
    });

    it('[the-engine-r18, the-engine-r21] a batch value both malformed and unstageable refuses as the input it is, rc 1 ERR_INVALID_ARGUMENT', async () => {
      const sb = await seeded(empty, driver, OLD);
      const r = await store(sb, driver, scratchPlant(driver === 'fts5' ? 'batch-val.1' : 'val.1')).batch('docs', 'action=put\nkey=workspace/x\nvalue_b64=***\n');
      refused(r, 'store.batch', 1, 'ERR_INVALID_ARGUMENT', "action 1 (put 'workspace/x'): malformed base64 value");
      expect(await bytesOf(sb, driver, Object.keys(OLD))).toEqual(Object.values(OLD));
    });
  });
}

const BASE64 = ['/usr/bin/base64', '/bin/base64'].find((p) => existsSync(p));

const manifestPlant = (): Record<string, string> => {
  if (!BASE64) throw new Error('no base64 binary for the manifest plant');
  return pathPlant('base64', `for m in .contexture/tmp/store-batch.*/man .contexture/tmp/fts5-ws.*/man; do\n  [ -f "$m" ] && [ "$(wc -l < "$m")" -eq 1 ] && chmod 400 "$m"\ndone\nexec "${BASE64}" "$@"`);
};

for (const driver of DRIVERS) {
  describe.skipIf(ROOT_USER || (driver === 'fts5' && !fts5Available()))(`a batch on ${driver} whose manifest append fails after its first action`, { concurrent: true }, () => {
    let empty: string;
    beforeAll(async () => {
      empty = await docsStore(driver, false);
    });

    it('[the-engine-r18, the-engine-r21] lands whole or refuses rc 2 with its one line and nothing written', async () => {
      const sb = await seeded(empty, driver, OLD);
      const r = await store(sb, driver, manifestPlant()).batch('docs', NEW);
      const after = await bytesOf(sb, driver, Object.keys(OLD));
      expect([Object.values(OLD), NEW.map((a) => a.value)], `rc ${r.code} [${r.stdout}] [${r.stderr}]`).toContainEqual(after);
      if (r.code === 0) {
        answer(r, 'store.batch');
        expect(after).toEqual(NEW.map((a) => a.value));
      } else {
        refusedLike(r, 'store.batch', 2, 'ERR_STORAGE_WRITE', "action 2 (put 'workspace/y'): ");
        expect(after).toEqual(Object.values(OLD));
      }
    });
  });
}

describe.skipIf(ROOT_USER || !fts5Available())('an fts5 key listing into a scratch the call just made fails with its one refusal line', { concurrent: true }, () => {
  let keyed: string;
  beforeAll(async () => {
    keyed = await docsStore('fts5', true);
  });

  it.each([
    ['store.list', ['docs'], ''],
    ['store.scan', ['docs'], ''],
    ['store.search', ['docs', 'exact', '20'], 'query=a\n'],
  ] as const)('[the-engine-r21] %s refuses rc 2 with nothing else on stderr', async (fn, args, input) => {
    const sb = fresh(keyed);
    refusedLike(await store(sb, 'fts5', scratchPlant('keys')).op(fn, args, input), fn, 2, 'ERR_STORAGE_READ');
  });

  it('[the-engine-r21] store.list whose filtered keys cannot be written refuses rc 2 with its one line, never a short answer', async () => {
    const sb = fresh(keyed);
    refusedLike(await store(sb, 'fts5', mktempPlant('case "$p" in */store-keys-out.*) chmod 400 "$p" ;; esac')).list('docs'), 'store.list', 2, 'ERR_STORAGE_WRITE');
  });
});
