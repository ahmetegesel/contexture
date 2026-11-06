import { existsSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { driverOp } from '../support/driver';
import { holdLock, lockPath, sleepShim } from '../support/locks';
import { DRIVERS, fts5Available, stage } from '../support/stage';
import { answer, payload, refused } from '../support/wire';

const WAIT_S = 60;
const SHIMMED_MS = (WAIT_S * 1000 * 3) / 4;

async function timed<T>(call: () => Promise<T>): Promise<[T, number]> {
  const t0 = performance.now();
  const r = await call();
  return [r, performance.now() - t0];
}

const unitPayload = () => payload().kv('objective', 'lock wait').kv('attention', 'lock wait').kv('date', '2026-11-06').toString();
const taskPayload = () => payload().kv('objective', 'a task under the lock').toString();

async function lockedUnit(): Promise<string> {
  const sb = stage();
  answer(await data(sb, 'session.create', ['lw-unit'], unitPayload()), 'session.create');
  return sb;
}

describe.concurrent('the unit lock wait', () => {
  it(`a live holder refuses the next writer ERR_STORAGE_LOCKED after its ${WAIT_S} s wait, in seconds under the sleep shim, and nothing lands`, async () => {
    const sb = await lockedUnit();
    const release = holdLock(sb, 'lw-unit.lock', 'live');
    const [r, ms] = await timed(() => data(sb, 'task.add', ['lw-unit', 'lw-task'], taskPayload(), sleepShim()));
    refused(r, 'task.add', 2, 'ERR_STORAGE_LOCKED', `the unit lock of 'lw-unit' is held (${WAIT_S} s timeout)`);
    expect(ms).toBeLessThan(SHIMMED_MS);
    expect(existsSync(lockPath(sb, 'lw-unit.lock'))).toBe(true);
    release();
    refused(await data(sb, 'task.get', ['lw-unit', 'lw-task']), 'task.get', 1, 'ERR_ENTITY_NOT_FOUND', "task 'lw-task' not found in unit 'lw-unit'");
  });

  it('a lock whose holder pid is gone is removed at once and the write lands', async () => {
    const sb = await lockedUnit();
    holdLock(sb, 'lw-unit.lock', 'dead');
    answer(await data(sb, 'task.add', ['lw-unit', 'lw-task'], taskPayload()), 'task.add');
    expect(existsSync(lockPath(sb, 'lw-unit.lock'))).toBe(false);
  });

  it('a pid-less lock is removed after its grace and the write lands', async () => {
    const sb = await lockedUnit();
    holdLock(sb, 'lw-unit.lock', 'pidless');
    answer(await data(sb, 'task.add', ['lw-unit', 'lw-task'], taskPayload(), sleepShim()), 'task.add');
    expect(existsSync(lockPath(sb, 'lw-unit.lock'))).toBe(false);
  });
});

describe.concurrent('the namespace lock wait', () => {
  for (const driver of DRIVERS) {
    describe.skipIf(driver === 'fts5' && !fts5Available())(driver, () => {
      it(`a live holder refuses store.put ERR_STORAGE_LOCKED after its ${WAIT_S} s wait, in seconds under the sleep shim, and nothing lands`, async () => {
        const sb = stage(driver);
        const release = holdLock(sb, 'store-unit.lock', 'live');
        const [r, ms] = await timed(() => driverOp(sb, driver, 'store.put', ['unit', 'lw-unit/note'], 'never lands\n', sleepShim()));
        refused(r, 'store.put', 2, 'ERR_STORAGE_LOCKED', `the store namespace 'unit' is locked (${WAIT_S} s timeout)`);
        expect(ms).toBeLessThan(SHIMMED_MS);
        release();
        refused(await driverOp(sb, driver, 'store.get', ['unit', 'lw-unit/note']), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'lw-unit/note' not found in namespace 'unit'");
      });

      it('a lock whose holder pid is gone is removed at once and store.put lands', async () => {
        const sb = stage(driver);
        holdLock(sb, 'store-unit.lock', 'dead');
        answer(await driverOp(sb, driver, 'store.put', ['unit', 'lw-unit/note'], 'lands\n'), 'store.put');
        expect(existsSync(lockPath(sb, 'store-unit.lock'))).toBe(false);
      });

      it('a pid-less lock is removed after its grace and store.put lands', async () => {
        const sb = stage(driver);
        holdLock(sb, 'store-unit.lock', 'pidless');
        answer(await driverOp(sb, driver, 'store.put', ['unit', 'lw-unit/note'], 'lands\n', sleepShim()), 'store.put');
        expect(existsSync(lockPath(sb, 'store-unit.lock'))).toBe(false);
      });
    });
  }
});
