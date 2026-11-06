import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { driverPath } from '../support/driver';
import { launch } from '../support/exec';
import { holdLock, lockPath, namespaceLock } from '../support/locks';
import { pathPlant } from '../support/plants';
import { sandbox } from '../support/sandbox';
import { fresh } from '../support/snapshot';
import { DRIVERS, fts5Available } from '../support/stage';
import { docsStore, listAnswer, store } from '../support/store';
import { answer, refused } from '../support/wire';

const LOCK = namespaceLock('docs');

async function until(check: () => boolean, ms = 10_000): Promise<boolean> {
  for (const t0 = Date.now(); Date.now() - t0 < ms; await wait(20)) if (check()) return true;
  return check();
}

const scratch = (sb: string) => readdirSync(join(sb, '.contexture/tmp')).filter((n) => n !== 'locks').sort();
const residue = (sb: string) => readdirSync(join(sb, 'docs/workspace')).filter((n) => !/^[^.][^/]*\.md$/.test(n));

const PARTIAL = 'the first chunk of a payload the TERM cuts short\n';

function reading(sb: string): boolean {
  try {
    return ['docs', '.contexture/tmp'].map((dir) => join(sb, dir)).filter((dir) => existsSync(dir))
      .some((dir) => readdirSync(dir, { recursive: true, encoding: 'utf8' })
        .some((name) => statSync(join(dir, name)).isFile() && readFileSync(join(dir, name), 'utf8') === PARTIAL));
  } catch {
    return false;
  }
}

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'fts5' && !fts5Available())(`the namespace lock on ${driver}`, { concurrent: true }, () => {
    let empty: string;
    beforeAll(async () => {
      empty = await docsStore(driver, false);
    });

    it('a put holds the lock while it reads its payload and releases it once the key lands', async () => {
      const sb = fresh(empty);
      const { child, result } = launch(driverPath(sb, driver), ['store.put', 'docs', 'workspace/locked'], { cwd: sb, input: null });
      expect(await until(() => existsSync(lockPath(sb, LOCK)))).toBe(true);
      child.stdin!.end('locked\n');
      answer(await result, 'store.put');
      expect(existsSync(lockPath(sb, LOCK))).toBe(false);
      expect((await store(sb, driver).get('docs', 'workspace/locked')).stdout).toBe('locked\n');
    });

    it('a TERM while holding the lock releases it and lands nothing', async () => {
      const sb = fresh(empty);
      const before = scratch(sb);
      const { child, result, signal } = launch(driverPath(sb, driver), ['store.put', 'docs', 'workspace/held'], { cwd: sb, input: null, group: true });
      child.stdin!.write(PARTIAL);
      expect(await until(() => reading(sb))).toBe(true);
      expect(existsSync(lockPath(sb, LOCK))).toBe(true);
      signal('SIGTERM');
      expect((await result).code).not.toBe(0);
      expect(await until(() => !existsSync(lockPath(sb, LOCK)))).toBe(true);
      expect(scratch(sb)).toEqual(before);
      if (driver === 'posix') expect(residue(sb)).toEqual([]);
      refused(await store(sb, driver).get('docs', 'workspace/held'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/held' not found in namespace 'docs'");
    });

    async function termWaiter(sb: string): Promise<void> {
      const mark = join(sandbox('waiting'), 'mark');
      const env = pathPlant('sleep', `: > "${mark}"\nexec /bin/sleep "$@"`);
      const { result, signal } = launch(driverPath(sb, driver), ['store.put', 'docs', 'workspace/waiter'], { cwd: sb, input: 'never lands\n', env, group: true });
      expect(await until(() => existsSync(mark))).toBe(true);
      signal('SIGTERM');
      expect((await result).code).not.toBe(0);
      await wait(200);
    }

    it('a TERM while waiting on a live holder exits nonzero, lands nothing, and leaves no scratch of its own', async () => {
      const sb = fresh(empty);
      holdLock(sb, LOCK, 'live');
      const before = scratch(sb);
      await termWaiter(sb);
      expect(scratch(sb)).toEqual(before);
      refused(await store(sb, driver).get('docs', 'workspace/waiter'), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/waiter' not found in namespace 'docs'");
    });

    it('a TERM while waiting leaves the live holder\'s lock in place', async () => {
      const sb = fresh(empty);
      holdLock(sb, LOCK, 'live');
      await termWaiter(sb);
      expect(existsSync(join(lockPath(sb, LOCK), 'pid'))).toBe(true);
    });

    it('a write refused under the lock releases it', async () => {
      const sb = fresh(empty);
      const s = store(sb, driver);
      refused(await s.batch('docs', [{ action: 'delete', key: 'workspace/absent' }]), 'store.batch', 1, 'ERR_ENTITY_NOT_FOUND',
        "action 1 (delete 'workspace/absent'): key 'workspace/absent' not found in namespace 'docs'");
      expect(existsSync(lockPath(sb, LOCK))).toBe(false);
      answer(await s.put('docs', 'workspace/after', 'x\n'), 'store.put');
    });

    it('two concurrent deletes of one key answer one success and one not found', async () => {
      const sb = fresh(empty);
      const s = store(sb, driver);
      answer(await s.put('docs', 'workspace/conc', 'x\n'), 'store.put');
      const runs = await Promise.all([s.del('docs', 'workspace/conc'), s.del('docs', 'workspace/conc')]);
      const [won, lost] = [...runs].sort((a, b) => a.code - b.code);
      answer(won, 'store.delete');
      refused(lost, 'store.delete', 1, 'ERR_ENTITY_NOT_FOUND', "key 'workspace/conc' not found in namespace 'docs'");
    });

    it('eight concurrent batches on distinct keys all land with no residue, and a planted residue is seen', async () => {
      const sb = fresh(empty);
      const s = store(sb, driver);
      const keys = Array.from({ length: 8 }, (_, i) => [`workspace/c${i}a`, `workspace/c${i}b`]);
      const runs = await Promise.all(keys.map((pair) => s.batch('docs', pair.map((key) => ({ action: 'put' as const, key, value: `${key}\n` })))));
      for (const r of runs) expect(r.stdout).toBe('{"namespace":"docs","actions":2}\n');
      expect((await s.list('docs')).stdout).toBe(listAnswer('docs', keys.flat().sort()));
      expect(existsSync(lockPath(sb, LOCK))).toBe(false);
      if (driver === 'posix') {
        expect(residue(sb)).toEqual([]);
        await s.put('docs', 'workspace/c0a', 'x\n');
        writeFileSync(join(sb, 'docs/workspace/c0a.md.Ab12Cd'), 'leak');
        expect(residue(sb)).toEqual(['c0a.md.Ab12Cd']);
      }
    });
  });
}
