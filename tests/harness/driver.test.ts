import { describe, expect, it } from 'vitest';
import { driverOp } from '../support/driver';
import { DRIVERS, fts5Available, stage } from '../support/stage';
import { answer, refused } from '../support/wire';

describe('driver operation', () => {
  for (const driver of DRIVERS) {
    describe.skipIf(driver === 'fts5' && !fts5Available())(driver, () => {
      it(`capability, store.put, store.get, and store.list answer through the ${driver} driver`, async () => {
        const sb = stage(driver);
        expect(answer(await driverOp(sb, driver, 'capability'), 'capability').driver).toBe(driver);
        const put = await driverOp(sb, driver, 'store.put', ['unit', 'smoke-unit/note'], 'one note\n');
        answer(put, 'store.put');
        expect(put.stdout).toBe('{"namespace":"unit","key":"smoke-unit/note","op":"write"}\n');
        const got = await driverOp(sb, driver, 'store.get', ['unit', 'smoke-unit/note']);
        expect(got.code, got.stderr).toBe(0);
        expect(got.stdout).toBe('one note\n');
        expect(answer(await driverOp(sb, driver, 'store.list', ['unit']), 'store.list')).toEqual({ namespace: 'unit', keys: ['smoke-unit/note'] });
        refused(
          await driverOp(sb, driver, 'store.get', ['unit', 'smoke-unit/absent']),
          'store.get',
          1,
          'ERR_ENTITY_NOT_FOUND',
          "key 'smoke-unit/absent' not found in namespace 'unit'",
        );
      });
    });
  }
});
