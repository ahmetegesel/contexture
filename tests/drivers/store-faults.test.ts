import { chmodSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { driverPath } from '../support/driver';
import { launch } from '../support/exec';
import { lockPath, namespaceLock } from '../support/locks';
import { ROOT_USER, chmodPlant, pathPlant } from '../support/plants';
import { sandbox } from '../support/sandbox';
import { fresh } from '../support/snapshot';
import { DRIVERS, type Driver, fts5Available } from '../support/stage';
import { batchPayload, docsStore, store } from '../support/store';
import { answer, refused } from '../support/wire';

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? [join(dir, e.name), ...walk(join(dir, e.name))] : [join(dir, e.name)]));
}

const stages = (sb: string) => walk(sb).filter((p) => /\/\.stage/.test(p));

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

describe.skipIf(ROOT_USER)('posix write faults', { concurrent: true }, () => {
  let empty: string;
  beforeAll(async () => {
    empty = await docsStore('posix', false);
  });

  it('a put that cannot create its temp refuses rc 2 and leaves the old value whole', async ({ onTestFinished }) => {
    const sb = await seeded(empty, 'posix', { 'workspace/atomic': 'atomic-old\n' });
    chmodPlant(join(sb, 'docs/workspace'), 0o500, 0o700, onTestFinished);
    refused(await store(sb, 'posix').put('docs', 'workspace/atomic', 'atomic-new\n'), 'store.put', 2, 'ERR_STORAGE_WRITE', "the storage write of key 'workspace/atomic' failed");
    expect((await store(sb, 'posix').get('docs', 'workspace/atomic')).stdout).toBe('atomic-old\n');
  });

  it('a landed put leaves no temp under the store root', async () => {
    const sb = await seeded(empty, 'posix', { 'workspace/a': 'a\n', 'workspace/b': 'b\n' });
    answer(await store(sb, 'posix').put('docs', 'workspace/a', 'a2\n'), 'store.put');
    expect(walk(join(sb, 'docs')).map((p) => p.slice(sb.length))).toEqual(['/docs/workspace', '/docs/workspace/a.md', '/docs/workspace/b.md']);
  });

  it('a second action failing its write rolls the first back, names action 2, and removes the folder action 1 made', async ({ onTestFinished }) => {
    const sb = fresh(empty);
    mkdirSync(join(sb, 'docs/ro'), { recursive: true });
    chmodPlant(join(sb, 'docs/ro'), 0o500, 0o700, onTestFinished);
    const s = store(sb, 'posix');
    refused(await s.batch('docs', [{ action: 'put', key: 'a/new', head: 'none', value: 'one\n' }, { action: 'put', key: 'ro/x', head: 'none', value: 'ro\n' }]),
      'store.batch', 2, 'ERR_STORAGE_WRITE', "action 2 (put 'ro/x'): the storage write of key 'ro/x' failed");
    refused(await s.get('docs', 'a/new'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'a/new' not found in namespace 'docs'");
    expect(existsSync(join(sb, 'docs/a'))).toBe(false);
  });

  it('a rename failing between the batch renames rolls the first back and leaves no stage', async () => {
    const sb = await seeded(empty, 'posix', OLD);
    const mv = pathPlant('mv', 'for a in "$@"; do last=$a; done\ncase "$last" in */y.md) exit 1 ;; esac\nexec /bin/mv "$@"');
    const r = await store(sb, 'posix', mv).batch('docs', NEW);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^store\.batch: error: .*\(ERR_STORAGE_WRITE\)\n$/);
    expect(await bytesOf(sb, 'posix', Object.keys(OLD))).toEqual(Object.values(OLD));
    expect(stages(sb)).toEqual([]);
  });

  it('a TERM between the batch renames leaves both keys whole, no stage, and the lock released', async () => {
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
    it('refuses put, delete, and batch rc 2 with one line each and keeps its bytes; writable again, it serves', async ({ onTestFinished }) => {
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
