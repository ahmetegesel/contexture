import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { answer, answerLine, refused, refusedLike } from '../support/wire';
import { at, TUNIT } from './chain';

describe.concurrent('the fresh store through the unit data script', () => {
  it('TC74: before any write session.list answers the store absent and no unit', async () => {
    const sb = await at('empty');
    expect(answerLine(await data(sb, 'session.list'), 'session.list')).toBe('{"store":"absent","units":[]}');
  });

  it('TC24: a missing or malformed identifier refuses rc1 ERR_INVALID_ARGUMENT', async () => {
    const sb = await at('empty');
    refusedLike(await data(sb, 'session.create'), 'session.create', 1, 'ERR_INVALID_ARGUMENT');
    refusedLike(await data(sb, 'task.get', [TUNIT, 'bad slug!']), 'task.get', 1, 'ERR_INVALID_ARGUMENT');
    refusedLike(await data(sb, 'session.load', ['../escape']), 'session.load', 1, 'ERR_INVALID_ARGUMENT');
  });

  it('TC25: an unknown function refuses rc2 ERR_CAPABILITY_UNSUPPORTED, unit.export and unit.import among them', async () => {
    const sb = await at('empty');
    refused(await data(sb, 'non_existent_subsystem.method'), 'non_existent_subsystem.method', 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'non_existent_subsystem.method'");
    refused(await data(sb, 'unit.export', [TUNIT]), 'unit.export', 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'unit.export'");
    const dump = '{"kind":"unit","format":"contexture-dump","version":1,"unit":"tc25-u","extras":0}\n';
    refused(await data(sb, 'unit.import', ['tc25-u'], dump), 'unit.import', 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'unit.import'");
    const list = answer(await data(sb, 'session.list'), 'session.list');
    expect(list.units.map((u: { unit: string }) => u.unit)).not.toContain('tc25-u');
  });
});
