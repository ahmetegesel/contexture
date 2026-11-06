import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { DATE, mk, ok, rec } from '../support/record';
import { answer, answerLine, payload, refused } from '../support/wire';
import { at, SUNIT, TUNIT } from './chain';

interface Listed {
  unit: string;
  status: string;
  repos: string[] | null;
  [key: string]: unknown;
}

const byUnit = (units: Listed[], unit: string): Listed => {
  const found = units.find((u) => u.unit === unit);
  expect(found, `the listing holds ${unit}`).toBeDefined();
  return found as Listed;
};
const SUMMARY_KEYS = ['unit', 'status', 'current_anchor', 'objective', 'repos', 'ref_sessions', 'extra_fields', 'extra_lines'];

describe.concurrent('the listings and references through the unit data script', () => {
  it('TC28: session.create refuses a held unit; session.list counts the active units; an absent unit refuses rc1', async () => {
    const sb = await at('T0');
    expect(answer(await mk(sb, SUNIT, 'store'), 'session.create').state.unit).toBe('compliance-store');
    refused(await mk(sb, SUNIT, 'store'), 'session.create', 1, 'ERR_ENTITY_EXISTS', "unit 'compliance-store' already exists");
    const list = await ok(sb, 'session.list', []);
    expect(list.store).toBe('present');
    expect(list.units.filter((u: Listed) => u.status === 'ACTIVE').length).toBe(2);
    const absent = "unit 'no-such-unit' not found";
    for (const [fn, ...args] of [['session.load'], ['session.board'], ['session.audit'], ['task.list', 'all'], ['entry.list'], ['finding.list', 'all'], ['task.get', 't1']]) {
      refused(await data(sb, fn, ['no-such-unit', ...args]), fn, 1, 'ERR_ENTITY_NOT_FOUND', absent);
    }
    refused(await data(sb, 'task.add', ['no-such-unit', 't1'], payload().kv('objective', 'never lands').toString()), 'task.add', 1, 'ERR_ENTITY_NOT_FOUND', absent);
  });

  it('TC54: session.active derives the first IN_PROGRESS task and reads no journal', async () => {
    const sb = await at('empty');
    const u = 'tc54-u';
    answer(await mk(sb, u), 'session.create');
    for (const [slug, objective] of [['tc54-todo', 'todo before the active task'], ['tc54-first', 'first active'], ['tc54-second', 'second active'], ['tc54-done', 'done']]) {
      await ok(sb, 'task.add', [u, slug], payload().kv('objective', objective));
    }
    await ok(sb, 'task.start', [u, 'tc54-first']);
    await ok(sb, 'task.start', [u, 'tc54-second']);
    await ok(sb, 'task.complete', [u, 'tc54-done'], payload().kv('evidence', 'tc54 done').kv('date', DATE));
    answer(await rec(sb, u, 1790000540, 'the open question', { thread: 'the human', with: payload().kv('slug', '2026-09-27-tc54-open') }), 'entry.record');
    answer(await rec(sb, u, 1790000541, 'the resolved question', { thread: 'a lane', with: payload().kv('slug', '2026-09-27-tc54-resolved') }), 'entry.record');
    answer(await rec(sb, u, 1790000542, 'the answer', { with: payload().kv('closers.count', '1').kcl(1, 'CLOSES', 'done', 'answered', '2026-09-27-tc54-resolved') }), 'entry.record');
    const r = await data(sb, 'session.active');
    const active = byUnit(answer(r, 'session.active').units, u);
    expect([active.next_task, active.task_count, active.backlog_present]).toEqual([{ slug: 'tc54-first', status: 'IN_PROGRESS' }, 4, true]);
    expect(active).not.toHaveProperty('next_action');
    expect(r.stdout).not.toContain('"open_threads"');
    expect(r.stdout).not.toContain('"last_event"');
  });

  it('UD-5: session.active derives the first open TODO task when none is in progress, with no journal or stored pointer fields', async () => {
    const sb = await at('empty');
    answer(await mk(sb, 'ud5-u'), 'session.create');
    await ok(sb, 'task.add', ['ud5-u', 't1'], payload().kv('objective', 'a needle in the first task'));
    await ok(sb, 'task.add', ['ud5-u', 't2'], payload().kv('objective', 'a second task'));
    const r = await data(sb, 'session.active');
    const active = byUnit(answer(r, 'session.active').units, 'ud5-u');
    expect([active.next_task, active.task_count, active.backlog_present]).toEqual([{ slug: 't1', status: 'TODO' }, 2, true]);
    for (const absent of ['"open_threads"', '"last_event"', '"next_action"']) expect(r.stdout).not.toContain(absent);
  });

  it('TC65: session.refs checks every named unit; load and refload answer the references', async () => {
    const sb = await at('T37');
    answer(await mk(sb, 'tc65-u'), 'session.create');
    const empty = await ok(sb, 'session.load', ['tc65-u']);
    expect([empty.state.ref_sessions, empty.refs]).toEqual([null, []]);
    refused(await data(sb, 'session.refs', ['tc65-u', 'no-such-ref']), 'session.refs', 1, 'ERR_ENTITY_NOT_FOUND', "unit 'no-such-ref' not found");
    answer(await mk(sb, 'tc65-ref'), 'session.create');
    expect(answerLine(await data(sb, 'session.refs', ['tc65-u', 'tc65-ref', TUNIT]), 'session.refs')).toBe('{"unit":"tc65-u","ref_sessions":["tc65-ref","compliance-tasks"]}');
    const load = await ok(sb, 'session.load', ['tc65-u']);
    expect(load.state.ref_sessions).toEqual(['tc65-ref', TUNIT]);
    expect(load.refs.map((r: { unit: string }) => r.unit)).toEqual(['tc65-ref', TUNIT]);
    expect([load.refs[0].present, Object.keys(load.refs[0].knowledge), load.refs[0].knowledge.preamble, load.refs[0].board.unit]).toEqual([true, ['preamble', 'findings'], '', 'tc65-ref']);
    const refload = await ok(sb, 'session.refload', ['tc65-ref', TUNIT]);
    expect(refload.refs.map((r: { unit: string }) => r.unit)).toEqual(['tc65-ref', TUNIT]);
    expect(refload.refs[1].knowledge.findings.map((f: { name: string }) => f.name)).toEqual(['FINDING_ALPHA', 'FINDING_BETA']);
    refused(await data(sb, 'session.refload', ['tc65-ref', 'no-such-ref']), 'session.refload', 1, 'ERR_ENTITY_NOT_FOUND', "unit 'no-such-ref' not found");
    expect(answerLine(await data(sb, 'session.refs', ['tc65-u']), 'session.refs')).toBe('{"unit":"tc65-u","ref_sessions":[]}');
    const cleared = await ok(sb, 'session.load', ['tc65-u']);
    expect([cleared.state.ref_sessions, cleared.refs]).toEqual([[], []]);
  });

  it('TC67: session.units and session.refs_to answer the three-unit fixture', async () => {
    const sb = await at('empty');
    const create = (u: string, objective: string, ...repos: string[]) => ok(sb, 'session.create', [u], payload().kv('objective', objective).kl('repos', ...repos).kv('attention', `${u} fixture`));
    await create('tc67-c', 'Unit c of three', 'tc67-gamma', 'tc67-aardvark');
    await create('tc67-a', 'Unit a of three', 'tc67-alpha', 'tc67-beta');
    await create('tc67-b', 'Unit b of three', 'tc67-beta');
    await ok(sb, 'session.refs', ['tc67-a', 'tc67-c']);
    await ok(sb, 'session.refs', ['tc67-b', 'tc67-a', 'tc67-c']);
    expect((await ok(sb, 'session.close', ['tc67-b'])).status).toBe('CLOSED');
    const listed: Listed[] = (await ok(sb, 'session.list', [])).units;
    const known = [...new Set(listed.flatMap((u) => u.repos ?? []))].sort();
    expect(known.join(' ')).toContain('tc67-alpha tc67-beta tc67-gamma');
    const beta = await ok(sb, 'session.units', ['tc67-beta']);
    expect([beta.repo, beta.units.map((u: Listed) => u.unit), beta.units.map((u: Listed) => u.status)]).toEqual(['tc67-beta', ['tc67-a', 'tc67-b'], ['ACTIVE', 'CLOSED']]);
    expect(Object.keys(beta.units[0])).toEqual(SUMMARY_KEYS);
    expect([beta.units[0].repos, beta.units[1].ref_sessions, beta.known_repos]).toEqual([['tc67-alpha', 'tc67-beta'], ['tc67-a', 'tc67-c'], known]);
    const gamma = await ok(sb, 'session.units', ['tc67-gamma']);
    expect([gamma.units.map((u: Listed) => u.unit), gamma.units[0].ref_sessions]).toEqual([['tc67-c'], null]);
    const nowhere = await ok(sb, 'session.units', ['tc67-nowhere']);
    expect([nowhere.units, nowhere.known_repos]).toEqual([[], known]);
    expect(answerLine(await data(sb, 'session.refs_to', ['tc67-c']), 'session.refs_to')).toBe('{"unit":"tc67-c","referrers":["tc67-a","tc67-b"]}');
    expect(answerLine(await data(sb, 'session.refs_to', ['tc67-a']), 'session.refs_to')).toBe('{"unit":"tc67-a","referrers":["tc67-b"]}');
    expect(answerLine(await data(sb, 'session.refs_to', ['tc67-b']), 'session.refs_to')).toBe('{"unit":"tc67-b","referrers":[]}');
  });

  it('TC80: session.list answers UnitListing with last_event last (anchor and entry dates, null; lane journals excluded), bytewise; session.units stays UnitSummary', async () => {
    const sb = await at('T0');
    answer(await mk(sb, 'tc80-null', 'recency null fixture'), 'session.create');
    await ok(sb, 'session.create', ['tc80-entry'], payload().kv('objective', 'recency entry fixture').kl('repos', 'tc80-repo').kv('attention', 'recency fixture'));
    answer(await rec(sb, 'tc80-entry', 1790000801, 'a dated entry', { with: payload().kv('slug', '2026-09-27-tc80-entry') }), 'entry.record');
    answer(await mk(sb, 'tc80-stamp', 'recency stamp fixture'), 'session.create');
    answer(await rec(sb, 'tc80-stamp', 1790000802, 'the entry before the stamp'), 'entry.record');
    await ok(sb, 'session.stamp', ['tc80-stamp'], payload().kv('date', '2026-09-28'));
    answer(await mk(sb, 'tc80-dateless', 'recency dateless fixture'), 'session.create');
    answer(await rec(sb, 'tc80-dateless', 1790000803, 'a dateless last entry', { with: payload().kv('slug', 'dateless-tc80') }), 'entry.record');
    answer(await mk(sb, 'tc80-zulu', 'bytewise probe zulu'), 'session.create');
    answer(await mk(sb, 'tc80-alpha', 'bytewise probe alpha'), 'session.create');
    const units: Listed[] = (await ok(sb, 'session.list', [])).units;
    const last = (u: string) => byUnit(units, u).last_event;
    expect([last('tc80-null'), last('tc80-entry'), last('tc80-stamp'), last('tc80-dateless')]).toEqual([null, '2026-09-27', '2026-09-28', null]);
    expect(Object.keys(byUnit(units, 'tc80-entry'))).toEqual([...SUMMARY_KEYS, 'last_event']);
    const order = units.map((u) => u.unit);
    expect(order).toEqual([...order].sort());
    const repo = await ok(sb, 'session.units', ['tc80-repo']);
    expect([repo.units[0].unit, Object.keys(repo.units[0])]).toEqual(['tc80-entry', SUMMARY_KEYS]);
    await ok(sb, 'lane.create', ['tc80-entry', 'recency-lane'], 'recency lane recipe\n');
    await ok(sb, 'lane.record', ['tc80-entry', 'recency-lane'], payload().kv('what', 'a newer lane trace').kv('thread', 'none').kv('date', '2026-10-05').kv('epoch', '1790000804'));
    expect(byUnit((await ok(sb, 'session.list', [])).units, 'tc80-entry').last_event).toBe('2026-09-27');
  });
});
