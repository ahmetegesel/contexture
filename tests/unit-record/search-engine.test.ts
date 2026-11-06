import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineCall } from '../support/engine';
import { COMPLIANCE, plantUnit } from '../support/record';
import { sandbox } from '../support/sandbox';
import { answer, answerLine, payload } from '../support/wire';

const query = (q: string) => payload().kv('query', q).toString();

async function written(): Promise<string> {
  const sb = sandbox('search-engine');
  const call = async (fn: string, argv: string[], input: string) => answer(await engineCall(sb, fn, argv, input), fn);
  await call('session.create', ['se-u'], payload().kv('objective', 'search edges').kv('attention', 'edges').toString());
  await call('task.add', ['se-u', 't-one'], payload().kv('objective', 'a Needle first').kv('desc', 'a second needle line').toString());
  await call('task.add', ['se-u', 't-two'], payload().kv('objective', 'needle again').toString());
  await call('task.add', ['se-u', 't-three'], payload().kv('objective', 'no match').toString());
  await call('lane.create', ['se-u', 'se-lane'], '# a grammar comment holds the needle too\nMISSION\n  GOAL: "thread the needle"\n');
  return sb;
}

describe.concurrent('the exact search rule (search.awk) alone over the posix files', () => {
  it('TC69 [the-record-r13] driver-free: the legacy fixture answers the fixed exact query set', async () => {
    const sb = sandbox('search-engine');
    plantUnit(sb, 'legacy-u');
    const lines = readFileSync(join(COMPLIANCE, 'tc69-exact.answers'), 'utf8').split('\n').filter(Boolean);
    expect(lines.length).toBe(8);
    for (const line of lines) {
      const [q, limit, entity, ...want] = line.split('|');
      const flags = ['--mode=exact', ...(limit ? [`--limit=${limit}`] : []), ...(entity ? [`--entity=${entity}`] : [])];
      expect(answerLine(await engineCall(sb, 'search.query', ['legacy-u', ...flags], query(q)), `search ${q}`)).toBe(want.join('|'));
    }
  });

  it('[the-record-r13] matches case-insensitively, one row per entity and section with its first matching line as the snippet', async () => {
    const sb = await written();
    const a = answer(await engineCall(sb, 'search.query', ['se-u', '--mode=exact', '--entity=task'], query('NEEDLE')), 'search.query');
    expect(a.results.map((r: { entity_id: string; snippet: string; score: number }) => [r.entity_id, r.snippet, r.score])).toEqual([
      ['t-one', 'a Needle first', 0],
      ['t-two', 'needle again', 0],
    ]);
  });

  it('[the-record-r13] never matches a column-0 grammar comment', async () => {
    const sb = await written();
    const comment = answer(await engineCall(sb, 'search.query', ['se-u', '--mode=exact'], query('grammar comment')), 'search.query');
    expect([comment.total_matches, comment.results]).toEqual([0, []]);
    const lane = answer(await engineCall(sb, 'search.query', ['se-u', '--mode=exact', '--entity=lane'], query('needle')), 'search.query');
    expect(lane.results.map((r: { snippet: string }) => r.snippet)).toEqual(['thread the needle']);
  });

  it('[the-record-r13] caps the results with --limit after the complete walk, total_matches counting every row', async () => {
    const sb = await written();
    const all = answer(await engineCall(sb, 'search.query', ['se-u', '--mode=exact'], query('needle')), 'search.query');
    const one = answer(await engineCall(sb, 'search.query', ['se-u', '--mode=exact', '--limit=1'], query('needle')), 'search.query');
    expect(all.total_matches).toBeGreaterThan(1);
    expect([one.total_matches, one.results]).toEqual([all.total_matches, all.results.slice(0, 1)]);
  });
});
