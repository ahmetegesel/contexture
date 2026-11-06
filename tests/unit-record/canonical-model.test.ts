import { describe, it } from 'vitest';
import { data } from '../support/data';
import { plantUnit } from '../support/record';
import { fresh } from '../support/snapshot';
import { at } from './chain';
import { holdsGoldens, verbBuilt, VU } from './goldens';

describe.concurrent('the canonical data model through the unit data script', () => {
  it('TC60: the legacy fixture answers the golden JSON of every item, the board, the load, and the lanes (posix plant)', async () => {
    const sb = await at('empty');
    plantUnit(sb, 'legacy-u');
    await holdsGoldens('legacy-u', 'legacy-u', (fn, args) => data(sb, fn, args));
  });

  it('TC76: the verb-built unit answers the golden JSON of every item, the lists, the board, the load, and the lanes', async () => {
    const sb = fresh(await verbBuilt(VU));
    await holdsGoldens(VU, 'verb-u', (fn, args) => data(sb, fn, args));
  });
});
