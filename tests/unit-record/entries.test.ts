import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { appendArtifact, COMPLIANCE, DATE, entryJson, mk, ok, plantUnit, readArtifact, rec } from '../support/record';
import { answer, answerLine, payload, refused, type Payload } from '../support/wire';
import { ALPHA, at, BETA, DELTA, EPS, GAMMA, OTHER, RECIPE, TUNIT } from './chain';

const slugs = (items: { slug: string }[]): string[] => items.map((i) => i.slug);
const closersOf = (kind: string, verdict: string, reason: string, ...targets: string[]) => payload().kv('closers.count', '1').kcl(1, kind, verdict, reason, ...targets);
const flagRefusal = (slug: string, verdict: string): string => `closer target ${slug} carries KNOWLEDGE: true; close it harvested (with a --ref to the finding it landed) or discarded, not ${verdict}`;
const HARVEST_REF = 'a harvested closer needs a --ref naming the finding it landed, unit#<unit>/finding/<NAME>';
const entries = async (sb: string, u: string): Promise<string> => (await data(sb, 'entry.list', [u])).stdout;

async function flaggedUnit(u: string, epoch: number): Promise<{ sb: string; F: string; P: string }> {
  const sb = await at('empty');
  answer(await mk(sb, u), 'session.create');
  answer(await rec(sb, u, epoch, 'a flagged entry', { with: payload().kv('knowledge', 'true') }), 'entry.record');
  answer(await rec(sb, u, epoch + 1, 'a plain entry'), 'entry.record');
  return { sb, F: `${DATE}-event-${epoch}`, P: `${DATE}-event-${epoch + 1}` };
}

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
      `{"unit":"compliance-tasks","entries":[{"slug":"${OTHER}","occurrence":1,"anchor":"A1","what":"Other group","group":"other-group","rhythm":null}]}`,
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

  it('TC81 [the-record-r-9rk9q]: a closer naming a live KNOWLEDGE-flagged target refuses rc1 ERR_INVALID_ARGUMENT unless harvested or discarded, a bare closer named none, on CLOSES and SUPERSEDES, multi-target, and a later line; the journal unchanged', async () => {
    const { sb, F, P } = await flaggedUnit('tc81-u', 1790000810);
    const before = await entries(sb, 'tc81-u');
    const cases: [Payload, string][] = [
      [closersOf('CLOSES', 'done', 'resolved', F), 'done'],
      [closersOf('SUPERSEDES', 'superseded', 'replaced', F), 'superseded'],
      [closersOf('CLOSES', 'dropped', 'both at once', P, F), 'dropped'],
      [closersOf('SUPERSEDES', 'folded', 'both at once', F, P), 'folded'],
      [payload().kv('closers.count', '1').kv('closers.1.kind', 'CLOSES').kl('closers.1.targets', F), 'none'],
      [payload().kv('closers.count', '2').kcl(1, 'CLOSES', 'done', 'fine', P).kcl(2, 'SUPERSEDES', 'done', 'gone', F), 'done'],
    ];
    for (const [i, [closers, verdict]] of cases.entries()) {
      refused(await rec(sb, 'tc81-u', 1790000812 + i, 'closes the flag', { with: closers }), 'entry.record', 1, 'ERR_INVALID_ARGUMENT', flagRefusal(F, verdict));
      expect(await entries(sb, 'tc81-u')).toBe(before);
    }
  });

  it('TC82 [the-record-r4, the-record-r-9rk9q]: harvested and discarded close a flagged target and read back as close_reason <verdict>: <reason>; an occurrence already closed takes any later verdict; a verdict without a reason refuses', async () => {
    const { sb, F, P } = await flaggedUnit('tc82-u', 1790000820);
    const H = `${DATE}-event-1790000822`;
    answer(await rec(sb, 'tc82-u', 1790000822, 'harvests the flag', { with: closersOf('CLOSES', 'harvested', 'landed', F).kl('refs', 'unit#tc82-u/finding/TC82_LANDED') }), 'entry.record');
    const harvested = (await ok(sb, 'entry.get', ['tc82-u', F])).entry;
    expect([harvested.closed, harvested.closed_by, harvested.close_reason]).toEqual([true, H, 'harvested: landed']);
    answer(await rec(sb, 'tc82-u', 1790000823, 'supersedes the harvested flag', { with: closersOf('SUPERSEDES', 'done', 'a later word', F) }), 'entry.record');
    expect((await ok(sb, 'entry.closure', ['tc82-u', F])).closers.map((c: { closer: { verdict: string } }) => c.closer.verdict)).toEqual(['harvested', 'done']);
    answer(await rec(sb, 'tc82-u', 1790000824, 'a second flag', { with: payload().kv('knowledge', 'true') }), 'entry.record');
    const F2 = `${DATE}-event-1790000824`;
    answer(await rec(sb, 'tc82-u', 1790000825, 'discards it', { with: closersOf('SUPERSEDES', 'discarded', 'fails the bar', F2) }), 'entry.record');
    expect((await ok(sb, 'entry.get', ['tc82-u', F2])).entry.close_reason).toBe('discarded: fails the bar');
    answer(await rec(sb, 'tc82-u', 1790000826, 'drops it later', { with: closersOf('CLOSES', 'dropped', 'a later word', F2) }), 'entry.record');
    const bare = payload().kv('closers.count', '1').kv('closers.1.kind', 'CLOSES').kl('closers.1.targets', P).kv('closers.1.verdict', 'discarded');
    refused(await rec(sb, 'tc82-u', 1790000827, 'a verdict without a reason', { with: bare }), 'entry.record', 1, 'ERR_INVALID_ARGUMENT', 'closers.1 carries a verdict without a reason');
  });

  it('TC83 [the-record-r-9rk9q]: a legacy repeated slug refuses a done closer while any live occurrence is flagged, the first or a later one; a flagged occurrence closed by a legacy closer takes any verdict (posix plant)', async () => {
    const sb = await at('empty');
    const X = '2026-09-20-repeat';
    const occ = (what: string, flag: boolean): string => `\n@entry ${X}\n  ANCHOR: A1\n  WHAT: "${what}"\n${flag ? '  KNOWLEDGE: true\n' : ''}  THREAD: none\n`;
    answer(await mk(sb, 'tc83-live'), 'session.create');
    appendArtifact(sb, 'tc83-live', 'journal', occ('flagged first occurrence', true) + occ('plain second occurrence', false));
    const before = await entries(sb, 'tc83-live');
    refused(await rec(sb, 'tc83-live', 1790000830, 'closes the repeat', { with: closersOf('CLOSES', 'done', 'resolved', X) }), 'entry.record', 1, 'ERR_INVALID_ARGUMENT', flagRefusal(X, 'done'));
    expect(await entries(sb, 'tc83-live')).toBe(before);
    answer(await mk(sb, 'tc83-closed'), 'session.create');
    const legacy = `\n@entry 2026-09-20-legacy\n  ANCHOR: A1\n  WHAT: "a closer written before the rule"\n  THREAD: none\n  CLOSES: ${X} (done: closed before the rule)\n`;
    appendArtifact(sb, 'tc83-closed', 'journal', occ('flagged first occurrence', true) + legacy + occ('plain second occurrence', false));
    answer(await rec(sb, 'tc83-closed', 1790000831, 'closes the repeat', { with: closersOf('CLOSES', 'done', 'resolved', X) }), 'entry.record');
    answer(await mk(sb, 'tc83-later'), 'session.create');
    appendArtifact(sb, 'tc83-later', 'journal', occ('plain first occurrence', false) + legacy + occ('flagged second occurrence', true));
    const later = await entries(sb, 'tc83-later');
    refused(await rec(sb, 'tc83-later', 1790000832, 'closes the repeat', { with: closersOf('CLOSES', 'done', 'resolved', X) }), 'entry.record', 1, 'ERR_INVALID_ARGUMENT', flagRefusal(X, 'done'));
    expect(await entries(sb, 'tc83-later')).toBe(later);
  });

  it('TC84 [the-record-r-9rk9q]: a harvested closer without a unit#<unit>/finding/<NAME> REF refuses rc1 ERR_INVALID_ARGUMENT whatever its targets, the journal unchanged, a REF holding /finding/ under another shape counting for none; a finding address of any unit satisfies it', async () => {
    const { sb, F, P } = await flaggedUnit('tc84-u', 1790000840);
    const before = await entries(sb, 'tc84-u');
    const cases: Payload[] = [
      closersOf('CLOSES', 'harvested', 'landed', F),
      closersOf('CLOSES', 'harvested', 'landed', P),
      closersOf('SUPERSEDES', 'harvested', 'landed', F).kl('refs', `unit#tc84-u/entry/${P}`, 'file#.contexture/ctx'),
      closersOf('CLOSES', 'harvested', 'landed', F).kl('refs', 'file#docs/finding/NAME.md', 'unit#tc84-u/finding/NAME/extra'),
    ];
    for (const [i, closers] of cases.entries()) {
      refused(await rec(sb, 'tc84-u', 1790000842 + i, 'harvests', { with: closers }), 'entry.record', 1, 'ERR_INVALID_ARGUMENT', HARVEST_REF);
      expect(await entries(sb, 'tc84-u')).toBe(before);
    }
    answer(await rec(sb, 'tc84-u', 1790000846, 'harvests into another unit', { with: closersOf('CLOSES', 'harvested', 'landed elsewhere', F).kl('refs', 'unit#other-unit/finding/ELSEWHERE') }), 'entry.record');
  });

  it('TC85 [the-record-r4, the-record-r5]: an unflagged target takes each of the six verdicts', async () => {
    const sb = await at('empty');
    answer(await mk(sb, 'tc85-u'), 'session.create');
    for (const [i, verdict] of ['done', 'superseded', 'dropped', 'folded', 'harvested', 'discarded'].entries()) {
      const target = 1790000850 + 2 * i;
      answer(await rec(sb, 'tc85-u', target, `target ${verdict}`), 'entry.record');
      const closers = closersOf('CLOSES', verdict, `a ${verdict} word`, `${DATE}-event-${target}`).kl('refs', 'unit#tc85-u/finding/TC85_LANDED');
      expect(answer(await rec(sb, 'tc85-u', target + 1, `closes ${verdict}`, { with: closers }), 'entry.record').entry.closers[0].verdict).toBe(verdict);
      expect((await ok(sb, 'entry.get', ['tc85-u', `${DATE}-event-${target}`])).entry.close_reason).toBe(`${verdict}: a ${verdict} word`);
    }
  });

  it('TC86 [the-record-r-9rk9q]: the closing entry carrying KNOWLEDGE: true binds nothing of its own: it closes an unflagged target done, and a flagged target still only harvested or discarded', async () => {
    const { sb, F, P } = await flaggedUnit('tc86-u', 1790000860);
    const flagged = (closers: Payload): Payload => closers.kv('knowledge', 'true');
    answer(await rec(sb, 'tc86-u', 1790000862, 'a flagged entry closes a plain one', { with: flagged(closersOf('CLOSES', 'done', 'resolved', P)) }), 'entry.record');
    const before = await entries(sb, 'tc86-u');
    refused(await rec(sb, 'tc86-u', 1790000863, 'a flagged entry closes a flag', { with: flagged(closersOf('CLOSES', 'done', 'resolved', F)) }), 'entry.record', 1, 'ERR_INVALID_ARGUMENT', flagRefusal(F, 'done'));
    expect(await entries(sb, 'tc86-u')).toBe(before);
    answer(await rec(sb, 'tc86-u', 1790000864, 'a flagged entry discards a flag', { with: flagged(closersOf('CLOSES', 'discarded', 'fails the bar', F)) }), 'entry.record');
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
    const withRef = payload().kv('knowledge', 'false').kl('refs', 'unit#u1/finding/UP_REF').kv('closers.count', '0').kv('slug', `${DATE}-up-er-ref`);
    const r = await rec(sb, u, 1, 'a driver entry with a ref', { with: withRef });
    expect(answerLine(r, 'entry.record')).toContain('"thread":"none","legacy_status":null,"refs":["unit#u1/finding/UP_REF"]');
    expect(readArtifact(sb, u, 'journal').toString()).toContain(`@entry ${DATE}-up-er-ref\n  ANCHOR: A1\n  WHAT: "a driver entry with a ref"\n  THREAD: none\n  REF: "unit#u1/finding/UP_REF"\n`);
    expect((await ok(sb, 'entry.get', [u, `${DATE}-up-er-ref`])).entry.refs).toEqual(['unit#u1/finding/UP_REF']);
    const noRef = payload().kv('knowledge', 'false').kl('refs').kv('closers.count', '0').kv('slug', `${DATE}-up-er-noref`);
    expect(answerLine(await rec(sb, u, 1, 'a driver entry without a ref', { with: noRef }), 'entry.record')).toContain('"thread":"none","legacy_status":null,"refs":[]');
    expect(readArtifact(sb, u, 'journal').toString().split(`@entry ${DATE}-up-er-noref`)[1]).not.toContain('REF:');
  });
});
