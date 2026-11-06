import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { COMPLIANCE, DATE, entryJson, mk, ok, plantUnit, readArtifact, rec } from '../support/record';
import { answer, answerLine, payload, refused } from '../support/wire';
import { ALPHA, at, BETA, DELTA, EPS, GAMMA, OTHER, RECIPE, TUNIT } from './chain';

const slugs = (items: { slug: string }[]): string[] => items.map((i) => i.slug);
const closersOf = (kind: string, verdict: string, reason: string, ...targets: string[]) => payload().kv('closers.count', '1').kcl(1, kind, verdict, reason, ...targets);

describe.concurrent('the journal entries through the unit data script', () => {
  it('TC10: entry.record answers the entry with the composed slug and the current anchor', async () => {
    const sb = await at('T9');
    const r = await rec(sb, TUNIT, 1790000010, 'Journal event description', { with: payload().kv('group', 'topic-group') });
    expect(answerLine(r, 'entry.record')).toBe(`{"unit":"compliance-tasks","entry":${entryJson(ALPHA, 1, 4, '"A1"', 'Journal event description', '"topic-group"', '"none"', '[]', '[]', 'null')}}`);
  });

  it('TC11: entry.get answers the entry open; an absent slug refuses rc1 ERR_ENTITY_NOT_FOUND', async () => {
    const sb = await at('T10');
    const open = entryJson(ALPHA, 1, 4, '"A1"', 'Journal event description', '"topic-group"', '"none"', '[]', '[]', 'null', ['false', 'null', 'null']);
    expect(answerLine(await data(sb, 'entry.get', [TUNIT, ALPHA]), 'entry.get')).toBe(`{"unit":"compliance-tasks","entry":${open}}`);
    refused(await data(sb, 'entry.get', [TUNIT, '2026-09-25-event-missing']), 'entry.get', 1, 'ERR_ENTITY_NOT_FOUND', "entry '2026-09-25-event-missing' not found in unit 'compliance-tasks'");
  });

  it('TC12 [the-record-r3, the-record-r4]: a closer closes its target on entry.get and the board; entry.list keeps both', async () => {
    const sb = await at('T10');
    const r = await rec(sb, TUNIT, 1790000011, 'Closer event', { with: payload().kv('group', 'topic-group').kv('closers.count', '1').kcl(1, 'CLOSES', 'done', 'Closer event', ALPHA) });
    const closers = `[{"kind":"CLOSES","targets":["${ALPHA}"],"verdict":"done","reason":"Closer event","extra_text":null}]`;
    expect(answerLine(r, 'entry.record')).toBe(`{"unit":"compliance-tasks","entry":${entryJson(BETA, 1, 5, '"A1"', 'Closer event', '"topic-group"', '"none"', '[]', closers, 'null')}}`);
    const { entry } = await ok(sb, 'entry.get', [TUNIT, ALPHA]);
    expect([entry.closed, entry.closed_by, entry.close_reason, entry.next]).toEqual([true, BETA, 'done: Closer event', 'entry']);
    const board = await ok(sb, 'session.board', [TUNIT]);
    expect(slugs(board.live)).toEqual(['2026-09-27-task-sample-completed', '2026-09-27-task-sample-dropped', BETA]);
    expect([board.open_tasks, board.open_threads]).toEqual([['task-keeper', 'task-sample'], []]);
    expect(slugs((await ok(sb, 'entry.list', [TUNIT])).entries)).toEqual(['2026-09-27-task-sample-completed', '2026-09-27-task-sample-dropped', ALPHA, BETA]);
  });

  it('TC26 [the-record-r6, the-record-r11]: entry.record refuses a repeated given slug; the first entry intact', async () => {
    const sb = await at('T12');
    refused(await rec(sb, TUNIT, 1790000026, 'A second beta', { with: payload().kv('slug', BETA) }), 'entry.record', 1, 'ERR_ENTITY_EXISTS', `entry '${BETA}' already exists in unit 'compliance-tasks'`);
    expect((await ok(sb, 'entry.get', [TUNIT, BETA])).entry.what).toBe('Closer event');
  });

  it('TC27 [the-record-r3, the-record-r4, the-record-r5]: a multi-target closer closes every target and keeps its verdict', async () => {
    const sb = await at('T17');
    answer(await rec(sb, TUNIT, 1790000040, 'Gamma', { thread: 'the human', with: payload().kv('group', 'topic-group') }), 'entry.record');
    answer(await rec(sb, TUNIT, 1790000041, 'Delta'), 'entry.record');
    const { entry } = answer(await rec(sb, TUNIT, 1790000042, 'Folds two', { with: closersOf('CLOSES', 'folded', 'two at once', GAMMA, DELTA) }), 'entry.record');
    expect([entry.closers[0].targets.length, entry.closers[0].verdict]).toEqual([2, 'folded']);
    const board = await data(sb, 'session.board', [TUNIT]);
    for (const absent of [`"slug":"${GAMMA}"`, `"slug":"${DELTA}"`, '"thread":"the human"']) expect(board.stdout).not.toContain(absent);
    expect(answer(board, 'session.board').open_threads).toEqual([]);
    const delta = (await ok(sb, 'entry.get', [TUNIT, DELTA])).entry;
    expect([delta.closed, delta.closed_by, delta.close_reason]).toEqual([true, EPS, 'folded: two at once']);
    const gamma = (await ok(sb, 'entry.get', [TUNIT, GAMMA])).entry;
    expect([gamma.closed, gamma.closed_by]).toEqual([true, EPS]);
  });

  it('TC37: entry.list filters by --group and --anchor', async () => {
    const sb = await at('T35');
    answer(await rec(sb, TUNIT, 1790000050, 'Other group', { with: payload().kv('group', 'other-group') }), 'entry.record');
    expect(answerLine(await data(sb, 'entry.list', [TUNIT, '--group=other-group']), 'entry.list')).toBe(
      `{"unit":"compliance-tasks","entries":[{"slug":"${OTHER}","occurrence":1,"anchor":"A1","what":"Other group","group":"other-group"}]}`,
    );
    expect(slugs((await ok(sb, 'entry.list', [TUNIT, '--group=topic-group'])).entries)).toEqual([ALPHA, BETA, GAMMA]);
    expect(answerLine(await data(sb, 'entry.list', [TUNIT, '--anchor=A9']), 'entry.list')).toBe('{"unit":"compliance-tasks","entries":[]}');
  });

  it('TC57 [the-record-r6]: a legacy repeated slug reads positionally; the audit warns; a new repeat refuses (posix plant)', async () => {
    const sb = await at('empty');
    plantUnit(sb, 'tc57-u');
    const X = '2026-09-20-repeat';
    const board = await ok(sb, 'session.board', ['tc57-u']);
    expect(board.live.map((e: { slug: string; occurrence: number; seq: number }) => [e.slug, e.occurrence, e.seq])).toEqual([
      ['2026-09-20-between', 1, 3],
      ['2026-09-20-closer', 1, 4],
      ['2026-09-20-after', 1, 5],
      [X, 2, 6],
    ]);
    expect(board.open_threads.map((t: { slug: string; anchor: string; thread: string }) => [t.slug, t.anchor, t.thread])).toEqual([[X, 'A1', 'awaits the second answer']]);
    const { entry } = await ok(sb, 'entry.get', ['tc57-u', X]);
    expect([entry.occurrence, entry.seq, entry.what, entry.closed, entry.closed_by]).toEqual([2, 6, 'second occurrence', false, null]);
    expect(answerLine(await data(sb, 'entry.closure', ['tc57-u', X]), 'entry.closure')).toBe('{"unit":"tc57-u","slug":"2026-09-20-repeat","occurrence":2,"closed":false,"closers":[]}');
    const list = (await ok(sb, 'entry.list', ['tc57-u'])).entries;
    expect(list.map((e: { slug: string; occurrence: number }) => [e.slug, e.occurrence])).toEqual([
      [X, 1],
      ['2026-09-20-between', 1],
      ['2026-09-20-closer', 1],
      ['2026-09-20-after', 1],
      [X, 2],
    ]);
    expect(answerLine(await data(sb, 'session.audit', ['tc57-u']), 'session.audit')).toBe(
      `{"unit":"tc57-u","clean":true,"findings":[{"code":"LEGACY_DUPLICATE_SLUG","severity":"warning","slug":"${X}","line":24,"detail":null,"first_line":3,"occurrence":2}],"open_threads":[{"slug":"${X}","thread":"awaits the second answer","line":27}]}`,
    );
    refused(await rec(sb, 'tc57-u', 1790000570, 'a new repeat', { with: payload().kv('slug', X) }), 'entry.record', 1, 'ERR_ENTITY_EXISTS', `entry '${X}' already exists in unit 'tc57-u'`);
  });

  it('TC58 [the-record-r5]: a closer naming an absent entry refuses rc1 ERR_ENTITY_NOT_FOUND, the journal unchanged', async () => {
    const sb = await at('empty');
    answer(await mk(sb, 'tc58-u'), 'session.create');
    answer(await rec(sb, 'tc58-u', 1790000580, 'a present entry'), 'entry.record');
    const before = (await data(sb, 'entry.list', ['tc58-u'])).stdout;
    refused(await rec(sb, 'tc58-u', 1790000581, 'closes nothing', { with: closersOf('CLOSES', 'done', 'gone', '2026-01-01-absent') }), 'entry.record', 1, 'ERR_ENTITY_NOT_FOUND', "entry '2026-01-01-absent' not found in unit 'tc58-u'");
    expect((await data(sb, 'entry.list', ['tc58-u'])).stdout).toBe(before);
  });

  it('TC59 [the-record-r6, the-record-r11]: generated slugs take -1 while held; a held given slug refuses', async () => {
    const sb = await at('empty');
    const u = 'tc59-u';
    answer(await mk(sb, u), 'session.create');
    expect(answer(await rec(sb, u, 1790000590, 'one'), 'entry.record').entry.slug).toBe('2026-09-27-event-1790000590');
    expect(answer(await rec(sb, u, 1790000590, 'two'), 'entry.record').entry.slug).toBe('2026-09-27-event-1790000590-1');
    await ok(sb, 'lane.create', [u, 'l59'], RECIPE);
    const lane = (what: string) => payload().kv('what', what).kv('thread', 'none').kv('date', DATE).kv('epoch', '1790000591');
    expect((await ok(sb, 'lane.record', [u, 'l59'], lane('lane one'))).entry.slug).toBe('2026-09-27-event-1790000591');
    expect((await ok(sb, 'lane.record', [u, 'l59'], lane('lane two'))).entry.slug).toBe('2026-09-27-event-1790000591-1');
    refused(await rec(sb, u, 1790000592, 'given and held', { with: payload().kv('slug', '2026-09-27-event-1790000590') }), 'entry.record', 1, 'ERR_ENTITY_EXISTS', "entry '2026-09-27-event-1790000590' already exists in unit 'tc59-u'");
  });

  it('TC61 [the-record-r20]: the append rule places the separators: each entry canonical with the kind after it, the posix journal its expected bytes', async () => {
    const sb = await at('empty');
    const u = 'tc61-u';
    await ok(sb, 'session.create', [u], payload().kv('objective', 'The append rule fixture').kv('attention', 'append rule fixture'));
    answer(await rec(sb, u, 1790000100, 'first, after an anchor'), 'entry.record');
    answer(await rec(sb, u, 1790000101, 'second, after an entry'), 'entry.record');
    const stamp = await data(sb, 'session.stamp', [u], payload().kv('date', DATE).toString());
    expect([answer(stamp, 'session.stamp').receipt.seq, answer(stamp, 'session.stamp').receipt.next]).toEqual([4, null]);
    expect(stamp.stdout).not.toContain('"verbatim"');
    answer(await rec(sb, u, 1790000102, 'third, after a stamped anchor'), 'entry.record');
    for (const [epoch, seq, next] of [[1790000100, 2, 'entry'], [1790000101, 3, 'anchor'], [1790000102, 5, null]] as const) {
      const r = await data(sb, 'entry.get', [u, `2026-09-27-event-${epoch}`]);
      expect([answer(r, 'entry.get').entry.seq, answer(r, 'entry.get').entry.next]).toEqual([seq, next]);
      expect(r.stdout).not.toContain('"verbatim"');
    }
    expect((await ok(sb, 'entry.list', [u])).entries.map((e: { anchor: string }) => e.anchor)).toEqual(['A1', 'A1', 'A2']);
    expect(readArtifact(sb, u, 'journal').equals(readFileSync(join(COMPLIANCE, 'tc61-expected-journal.md')))).toBe(true);
  });

  it('TC68 [the-record-r4]: entry.closure answers every later closer with its entry, anchor, and closer', async () => {
    const sb = await at('T37');
    const ZETA = '2026-09-27-event-1790000060';
    answer(await rec(sb, TUNIT, 1790000060, 'Supersedes gamma again', { with: closersOf('SUPERSEDES', 'superseded', 'a second closer', GAMMA) }), 'entry.record');
    expect(answerLine(await data(sb, 'entry.closure', [TUNIT, GAMMA]), 'entry.closure')).toBe(
      `{"unit":"compliance-tasks","slug":"${GAMMA}","occurrence":1,"closed":true,"closers":[{"by":"${EPS}","by_anchor":"A1","closer":{"kind":"CLOSES","targets":["${GAMMA}","${DELTA}"],"verdict":"folded","reason":"two at once","extra_text":null}},{"by":"${ZETA}","by_anchor":"A1","closer":{"kind":"SUPERSEDES","targets":["${GAMMA}"],"verdict":"superseded","reason":"a second closer","extra_text":null}}]}`,
    );
    expect(answerLine(await data(sb, 'entry.closure', [TUNIT, OTHER]), 'entry.closure')).toBe(`{"unit":"compliance-tasks","slug":"${OTHER}","occurrence":1,"closed":false,"closers":[]}`);
    refused(await data(sb, 'entry.closure', [TUNIT, '2026-01-01-absent']), 'entry.closure', 1, 'ERR_ENTITY_NOT_FOUND', "entry '2026-01-01-absent' not found in unit 'compliance-tasks'");
  });

  it('UP-f [the-record-r14]: entry.record answers its refs after the thread and writes the REF line after THREAD; none when absent', async () => {
    const sb = await at('empty');
    const u = 'upf-u';
    answer(await mk(sb, u), 'session.create');
    const withRef = payload().kv('knowledge', 'false').kl('refs', 'knowledge#UP_REF').kv('closers.count', '0').kv('slug', `${DATE}-up-er-ref`);
    const r = await rec(sb, u, 1, 'a driver entry with a ref', { with: withRef });
    expect(answerLine(r, 'entry.record')).toContain('"thread":"none","legacy_status":null,"refs":["knowledge#UP_REF"]');
    expect(readArtifact(sb, u, 'journal').toString()).toContain(`@entry ${DATE}-up-er-ref\n  ANCHOR: A1\n  WHAT: "a driver entry with a ref"\n  THREAD: none\n  REF: "knowledge#UP_REF"\n`);
    expect((await ok(sb, 'entry.get', [u, `${DATE}-up-er-ref`])).entry.refs).toEqual(['knowledge#UP_REF']);
    const noRef = payload().kv('knowledge', 'false').kl('refs').kv('closers.count', '0').kv('slug', `${DATE}-up-er-noref`);
    expect(answerLine(await rec(sb, u, 1, 'a driver entry without a ref', { with: noRef }), 'entry.record')).toContain('"thread":"none","legacy_status":null,"refs":[]');
    expect(readArtifact(sb, u, 'journal').toString().split(`@entry ${DATE}-up-er-noref`)[1]).not.toContain('REF:');
  });
});
