import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { driverOp, driverPath } from '../support/driver';
import { KEY_VALUE, type Profile, UNIT_SHAPED, blindSpots, calls, firstDifference, genSequence, replay, side } from '../support/fuzz';
import { ROOT_USER } from '../support/plants';
import { sqlite } from '../support/sqlite';
import { fts5Available } from '../support/stage';

const SEED = 20261102;
const STEPS = 16;

async function differential(profile: Profile, plant: (posix: string, fts5: string) => Promise<void> | void = () => undefined) {
  const plan = calls(genSequence(SEED, STEPS), profile);
  const [posix, fts5] = [side('posix', profile), side('fts5', profile)];
  await plant(posix, fts5);
  const [a, b] = await Promise.all([replay(posix, 'posix', plan), replay(fts5, 'fts5', plan)]);
  return { plan, a, b, diff: firstDifference(a, b) };
}

describe.skipIf(!fts5Available())('the differential store fuzzer, posix against fts5', { concurrent: true }, () => {
  it('generates the seeded Lehmer sequence deterministically, every product under 2^53', () => {
    const seq = genSequence(SEED, STEPS);
    expect(seq).toEqual(genSequence(SEED, STEPS));
    expect(seq.slice(0, 2)).toEqual(['put|a/k1|p1', 'put|a/k2|p6']);
    expect(seq.length).toBe(STEPS);
    expect(2147483646 * 48271).toBeLessThan(2 ** 53);
    expect(genSequence(SEED + 1, STEPS)).not.toEqual(seq);
  });

  it.each([['the key-value profile', KEY_VALUE], ['the unit-shaped profile', UNIT_SHAPED]] as const)(
    'reads SAME over %s, and the run is not blind', async (_, profile) => {
      const { plan, a, b, diff } = await differential(profile);
      expect(diff, diff >= 0 ? `${plan[diff].fn} ${plan[diff].args.join(' ')}: posix [${a[diff].code} ${a[diff].stdout}${a[diff].stderr}] fts5 [${b[diff].code} ${b[diff].stdout}${b[diff].stderr}]` : '').toBe(-1);
      expect(blindSpots(plan, a)).toEqual([]);
      expect(blindSpots(plan, b)).toEqual([]);
    });

  it.skipIf(ROOT_USER)('a run whose every put fails reads blind, so a SAME verdict alone never passes', async () => {
    const { plan, a, b } = await differential(KEY_VALUE, async (posix, fts5) => {
      await driverOp(fts5, 'fts5', 'store.put', ['unit', 'lay/state'], 'x\n');
      mkdirSync(join(posix, 'fuzz-root'), { recursive: true });
      chmodSync(join(posix, 'fuzz-root'), 0o555);
      sqlite(join(fts5, '.contexture/sessions.db'), "CREATE TRIGGER blind BEFORE INSERT ON store WHEN NEW.namespace = 'fuzz' BEGIN SELECT RAISE(ABORT, 'blind'); END;");
    });
    expect(blindSpots(plan, a)).toContain('a successful put');
    expect(blindSpots(plan, b)).toContain('a successful put');
  });

  it('a planted extra byte on the fts5 store.list reads DIFF at the first list', async () => {
    const { plan, diff } = await differential(KEY_VALUE, (_, fts5) => {
      const drv = driverPath(fts5, 'fts5');
      renameSync(drv, `${drv}.real`);
      writeFileSync(drv, '#!/bin/sh\ncase "$1" in store.list) out=$("$0.real" "$@"); rc=$?; printf \'%sX\\n\' "$out"; exit $rc ;; esac\nexec "$0.real" "$@"\n', { mode: 0o755 });
    });
    expect(diff).toBeGreaterThanOrEqual(0);
    expect(plan[diff].fn).toBe('store.list');
    expect(diff).toBe(plan.findIndex((c) => c.fn === 'store.list'));
  });
});
