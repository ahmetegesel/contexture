import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { COMPLIANCE, DATE, ok, plantUnit, rec } from '../support/record';
import { answer, answerLine, payload, refused, refusedLike } from '../support/wire';
import { at, TUNIT } from './chain';

const query = (q: string) => payload().kv('query', q).toString();

function answers(file: string): { q: string; flags: string[]; want: string }[] {
  return readFileSync(join(COMPLIANCE, file), 'utf8')
    .split('\n')
    .filter((l) => l !== '')
    .map((line) => {
      const [q, limit, entity, ...want] = line.split('|');
      const flags = ['--mode=exact', ...(limit ? [`--limit=${limit}`] : []), ...(entity ? [`--entity=${entity}`] : [])];
      return { q, flags, want: want.join('|') };
    });
}

describe.concurrent('the exact search through the unit data script', () => {
  it('TC20: search.query --mode=exact answers exact results in the shared shape', async () => {
    const sb = await at('T13');
    expect(answerLine(await data(sb, 'search.query', [TUNIT, '--mode=exact'], query('architectural')), 'search.query')).toBe(
      '{"unit":"compliance-tasks","query":"architectural","mode":"exact","total_matches":1,"results":[{"entity_type":"finding","entity_id":"FINDING_ALPHA","section":"knowledge","snippet":"Alpha architectural decision summary","score":0}]}',
    );
  });

  it('TC38: search.query answers one shape, honors --limit and --entity, refuses an empty query', async () => {
    const sb = await at('T37');
    const one = answer(await data(sb, 'search.query', [TUNIT, '--mode=exact', '--limit=1'], query('objective')), 'search.query');
    expect(Object.keys(one)).toEqual(['unit', 'query', 'mode', 'total_matches', 'results']);
    expect([one.mode, one.total_matches, one.results.length]).toEqual(['exact', 4, 1]);
    expect(Object.keys(one.results[0])).toEqual(['entity_type', 'entity_id', 'section', 'snippet', 'score']);
    expect([one.results[0].entity_type, one.results[0].snippet, one.results[0].score]).toEqual(['session', 'objective: "Task verification session"', 0]);
    const tasks = answer(await data(sb, 'search.query', [TUNIT, '--mode=exact', '--entity=task', '--limit=50'], query('objective')), 'search.query');
    expect(tasks.total_matches).toBe(3);
    expect(tasks.results.map((r: { entity_id: string; snippet: string }) => [r.entity_id, r.snippet])).toEqual([
      ['task-keeper', 'Keeper objective'],
      ['task-sample', 'Re-declared objective'],
      ['task-refs', 'Refs task'],
    ]);
    refusedLike(await data(sb, 'search.query', [TUNIT, '--mode=exact'], query('')), 'search.query', 1, 'ERR_INVALID_ARGUMENT');
  });

  it('TC39: --mode=exact answers one row per matching entity and section over the exact fixture; an undeclared mode refuses', async () => {
    const sb = await at('empty');
    const EX = 'compliance-exact';
    await ok(sb, 'session.create', [EX], payload().kv('objective', 'exact fixture, find the Needle in the state').kl('repos').kv('attention', 'plain'));
    await ok(sb, 'session.refs', [EX]);
    await ok(sb, 'task.add', [EX, 't-one'], payload().kv('objective', 'a needle in the objective').kv('desc', 'a second NEEDLE line of the same task'));
    await ok(sb, 'task.add', [EX, 't-two'], payload().kv('objective', 'needlework, a substring'));
    await ok(sb, 'task.add', [EX, 't-three'], payload().kv('objective', 'no match here'));
    await ok(sb, 'finding.add', [EX, 'F_ONE'], payload().kv('summary', 'one needle'));
    await ok(sb, 'finding.add', [EX, 'F_TWO'], payload().kv('summary', 'none at all'));
    answer(await rec(sb, EX, 1790000391, 'the needle event', { with: payload().kv('slug', '2026-09-25-e-one') }), 'entry.record');
    answer(await rec(sb, EX, 1790000392, 'nothing to see', { thread: 'a needle awaits', with: payload().kv('slug', '2026-09-25-e-two') }), 'entry.record');
    answer(await rec(sb, EX, 1790000393, 'quiet', { with: payload().kv('slug', '2026-09-25-e-three') }), 'entry.record');
    await ok(sb, 'lane.create', [EX, 'ex-lane'], '# needle in a grammar comment never matches\nMISSION\n  GOAL: "thread the needle"\n');
    await ok(sb, 'lane.record', [EX, 'ex-lane'], payload().kv('what', 'a lane needle').kv('thread', 'none').kv('slug', '2026-09-25-l-one').kv('date', DATE).kv('epoch', '1790000394'));
    await ok(sb, 'lane.write_report', [EX, 'ex-lane'], '# report\n\n@orientation\n  VERDICT: "needle one"\n  NOTE: "needle two"\n');
    const set = answers('tc39-exact.answers');
    expect(set.length).toBeGreaterThan(0);
    for (const { q, flags, want } of set) expect(answerLine(await data(sb, 'search.query', [EX, ...flags], query(q)), `search.query ${q}`)).toBe(want);
    refused(await data(sb, 'search.query', [EX, '--mode=nosuchmode'], query('needle')), 'search.query', 1, 'ERR_CAPABILITY_UNSUPPORTED', "mode 'nosuchmode' is not supported; declared modes: exact");
  });

  it('TC69: the exact query set over legacy text answers its fixed results under --mode=exact (posix plant)', async () => {
    const sb = await at('empty');
    plantUnit(sb, 'legacy-u');
    const set = answers('tc69-exact.answers');
    expect(set.length).toBe(8);
    for (const { q, flags, want } of set) expect(answerLine(await data(sb, 'search.query', ['legacy-u', ...flags], query(q)), `search.query ${q}`)).toBe(want);
  });
});
