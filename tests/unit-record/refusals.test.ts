import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { DATE, mk, ok, plantUnit, reads, rec } from '../support/record';
import { answer, payload, refused, refusedLike } from '../support/wire';
import { at, BETA, RECIPE, REPORT, SUNIT, TUNIT, UNIT } from './chain';

const dated = (key: string, value: string) => payload().kv(key, value).kv('date', DATE).toString();

describe.concurrent('the refusals through the unit data script', () => {
  it('TC21: every refused write leaves the unit\'s read answers byte-identical', async () => {
    const sb = await at('T17');
    const before = await reads(sb, TUNIT);
    expect(before).toContain('"slug":"task-keeper"');
    const closers = payload().kv('closers.count', '2').kcl(1, 'CLOSES', 'done', 'valid', BETA).kcl(2, 'CLOSES', 'done', 'absent', '2026-01-01-absent');
    refused(await rec(sb, TUNIT, 1790000021, 'two closers, the second absent', { with: closers }), 'entry.record', 1, 'ERR_ENTITY_NOT_FOUND', "entry '2026-01-01-absent' not found in unit 'compliance-tasks'");
    refused(await data(sb, 'finding.supersede', [TUNIT, 'FINDING_BETA', 'FINDING_ALPHA'], payload().kv('summary', 'never lands').toString()), 'finding.supersede', 1, 'ERR_ENTITY_EXISTS', "finding 'FINDING_ALPHA' already exists in unit 'compliance-tasks'");
    refused(await data(sb, 'task.add', [TUNIT, 'task-keeper'], payload().kv('objective', 'never lands').toString()), 'task.add', 1, 'ERR_ENTITY_EXISTS', "task 'task-keeper' already exists in unit 'compliance-tasks'");
    expect(await reads(sb, TUNIT)).toBe(before);
  });

  it('TC23: a missing task refuses rc1 with the fixed ERR_ENTITY_NOT_FOUND line', async () => {
    const sb = await at('T0');
    refused(await data(sb, 'task.get', [TUNIT, 'nonexistent-task-slug']), 'task.get', 1, 'ERR_ENTITY_NOT_FOUND', "task 'nonexistent-task-slug' not found in unit 'compliance-tasks'");
  });

  it('TC32: a repeated finding NAME and lane entry slug refuse rc1 ERR_ENTITY_EXISTS', async () => {
    const sb = await at('SS31');
    await ok(sb, 'finding.add', [SUNIT, 'STORE_F'], payload().kv('summary', 'First'));
    refused(await data(sb, 'finding.add', [SUNIT, 'STORE_F'], payload().kv('summary', 'Repeat').toString()), 'finding.add', 1, 'ERR_ENTITY_EXISTS', "finding 'STORE_F' already exists in unit 'compliance-store'");
    const entry = (what: string, epoch: string) => payload().kv('what', what).kv('thread', 'none').kv('slug', '2026-09-25-s-l1').kv('date', DATE).kv('epoch', epoch).toString();
    expect((await ok(sb, 'lane.record', [SUNIT, 's-lane'], entry('First', '1790000032'))).entry.slug).toBe('2026-09-25-s-l1');
    refused(await data(sb, 'lane.record', [SUNIT, 's-lane'], entry('Repeat', '1790000033')), 'lane.record', 1, 'ERR_ENTITY_EXISTS', "lane entry 's-lane/2026-09-25-s-l1' already exists in unit 'compliance-store'");
    expect((await ok(sb, 'finding.get', [SUNIT, 'STORE_F'])).finding.summary).toBe('First');
    const journal = await ok(sb, 'lane.get', [SUNIT, 's-lane', 'journal']);
    expect(journal.items.map((i: { what: string }) => i.what)).toEqual(['First']);
  });

  it('TC52: every write function refuses a CLOSED unit rc1 ERR_UNIT_CLOSED and changes nothing', async () => {
    const sb = await at('empty');
    const u = 'tc52-u';
    answer(await mk(sb, u), 'session.create');
    await ok(sb, 'task.add', [u, 't52'], payload().kv('objective', 'open task'));
    await ok(sb, 'task.add', [u, 't52d'], payload().kv('objective', 'done task'));
    await ok(sb, 'task.complete', [u, 't52d'], dated('evidence', 'landed'));
    await ok(sb, 'finding.add', [u, 'F52'], payload().kv('summary', 'a finding'));
    await ok(sb, 'lane.create', [u, 'l52'], RECIPE);
    answer(await rec(sb, u, 1790000520, 'an entry before the close'), 'entry.record');
    expect((await ok(sb, 'session.close', [u])).status).toBe('CLOSED');
    const snapshot = async () => [
      (await data(sb, 'task.list', [u, 'all'])).stdout,
      (await data(sb, 'entry.list', [u])).stdout,
      (await data(sb, 'finding.list', [u, 'all'])).stdout,
      (await data(sb, 'lane.get', [u, 'l52', 'journal'])).stdout,
    ];
    const before = await snapshot();
    const writes: [string, string[], string][] = [
      ['session.stamp', [u], payload().kv('date', DATE).toString()],
      ['session.refs', [u], ''],
      ['task.add', [u, 't52b'], payload().kv('objective', 'new').toString()],
      ['task.update', [u, 't52'], payload().kv('objective', 'changed').toString()],
      ['task.start', [u, 't52'], ''],
      ['task.complete', [u, 't52'], dated('evidence', 'closed')],
      ['task.reopen', [u, 't52d'], ''],
      ['task.drop', [u, 't52'], dated('reason', 'closed')],
      ['entry.record', [u], payload().kv('what', 'after the close').kv('thread', 'none').kv('date', DATE).kv('epoch', '1790000521').toString()],
      ['finding.add', [u, 'F52B'], payload().kv('summary', 'new').toString()],
      ['finding.update', [u, 'F52'], payload().kv('summary', 'changed').toString()],
      ['finding.supersede', [u, 'F52', 'F52C'], payload().kv('summary', 'successor').toString()],
      ['finding.drop', [u, 'F52'], ''],
      ['lane.create', [u, 'l52b'], RECIPE],
      ['lane.record', [u, 'l52'], payload().kv('what', 'closed').kv('thread', 'none').kv('date', DATE).kv('epoch', '1790000522').toString()],
      ['lane.write_report', [u, 'l52'], REPORT],
    ];
    expect(writes.length).toBe(16);
    for (const [fn, args, input] of writes) {
      refused(await data(sb, fn, args, input), fn, 1, 'ERR_UNIT_CLOSED', "unit 'tc52-u' is CLOSED; a closed unit takes no writes");
    }
    expect(await snapshot()).toEqual(before);
  });

  it('TC75: refusals print one fixed stderr line and nothing on stdout', async () => {
    const sb = await at('T37');
    refused(await data(sb, 'task.get', [TUNIT, 'no-such-task']), 'task.get', 1, 'ERR_ENTITY_NOT_FOUND', "task 'no-such-task' not found in unit 'compliance-tasks'");
    refused(await mk(sb, TUNIT), 'session.create', 1, 'ERR_ENTITY_EXISTS', "unit 'compliance-tasks' already exists");
    refused(await rec(sb, UNIT, 1790000750, 'into a closed unit'), 'entry.record', 1, 'ERR_UNIT_CLOSED', "unit 'compliance-u1' is CLOSED; a closed unit takes no writes");
  });

  it('TC78: a malformed stored anchor refuses rc2 on session.stamp, entry.record, and the receipts, the unit unchanged (posix plant)', async () => {
    const sb = await at('empty');
    const u = 'tc73-u';
    plantUnit(sb, u);
    refusedLike(await data(sb, 'session.stamp', [u], payload().kv('date', DATE).toString()), 'session.stamp', 2, 'ERR_STORAGE_CORRUPT');
    expect((await ok(sb, 'session.load', [u])).state.current_anchor).toBe('Ax');
    await ok(sb, 'task.add', [u, 't73-a'], payload().kv('objective', 'anchor probe'));
    await ok(sb, 'task.add', [u, 't73-b'], payload().kv('objective', 'anchor probe two'));
    const before = await reads(sb, u);
    refusedLike(await rec(sb, u, 1790000730, 'never lands'), 'entry.record', 2, 'ERR_STORAGE_CORRUPT');
    refusedLike(await data(sb, 'task.complete', [u, 't73-a'], dated('evidence', 'never lands')), 'task.complete', 2, 'ERR_STORAGE_CORRUPT');
    refusedLike(await data(sb, 'task.drop', [u, 't73-b'], dated('reason', 'never lands')), 'task.drop', 2, 'ERR_STORAGE_CORRUPT');
    expect(await reads(sb, u)).toBe(before);
  });
});
