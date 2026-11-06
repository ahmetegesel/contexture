import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { data } from '../support/data';
import { engineCall, renderView } from '../support/engine';
import { appendArtifact, artifactPath, DATE, ok, plantUnit, rec } from '../support/record';
import { fresh, seedSteps } from '../support/snapshot';
import { answer, answerLine, payload } from '../support/wire';
import { at } from './chain';

const AUD = 'aud-unit';
const dirty = (unit: string, code: string, slug: string, line: string, detail: string) =>
  `{"unit":"${unit}","clean":false,"findings":[{"code":"${code}","severity":"error","slug":"${slug}","line":${line},"detail":${detail},"first_line":null,"occurrence":null}],"open_threads":[]}`;
const wantAudit = async (sb: string, unit: string, code: string, slug: string, line: string, detail: string) =>
  expect(answerLine(await data(sb, 'session.audit', [unit]), 'session.audit')).toBe(dirty(unit, code, slug, line, detail));
const fixture = async (sb: string, unit: string, attention: string) =>
  ok(sb, 'session.create', [unit], payload().kv('objective', `the ${unit} fixture`).kv('attention', attention));

const audited = seedSteps('audit', [
  { name: 'empty', build: async () => undefined },
  { name: 'unit', build: async (sb) => void (await ok(sb, 'session.create', [AUD], payload().kv('objective', 'audit matrix unit').kv('attention', 'audit matrix'))) },
]);

interface Plant {
  id: string;
  artifact: 'journal' | 'backlog';
  text: string;
  code: string;
  slug: string;
  line: string;
  detail: string;
  view: string;
}

const PLANTS: Plant[] = [
  {
    id: 'RA-1 a dangling closer',
    artifact: 'journal',
    text: '\n@entry 2026-09-19-plant-dangling\n  ANCHOR: A2\n  WHAT: "planted dangling closer"\n  THREAD: none\n  CLOSES: 2026-01-01-nonexistent (done: nothing)\n',
    code: 'DANGLING_CLOSER',
    slug: '2026-09-19-plant-dangling',
    line: '7',
    detail: '"2026-01-01-nonexistent"',
    view: 'DANGLING CLOSER at line 7: 2026-01-01-nonexistent',
  },
  {
    id: 'RA-2 a slugless closer',
    artifact: 'journal',
    text: '\n@entry 2026-09-19-plant-slugless\n  ANCHOR: A2\n  WHAT: "planted slugless closer"\n  THREAD: none\n  CLOSES: nothing (done: nothing)\n',
    code: 'SLUGLESS_CLOSER',
    slug: '2026-09-19-plant-slugless',
    line: '7',
    detail: 'null',
    view: 'SLUGLESS CLOSER at line 7: no valid date-slug target',
  },
  {
    id: 'RA-3 a dateless entry slug',
    artifact: 'journal',
    text: '\n@entry plant-dateless\n  ANCHOR: A2\n  WHAT: "planted dateless slug"\n  THREAD: none\n',
    code: 'DATELESS_SLUG',
    slug: 'plant-dateless',
    line: '3',
    detail: 'null',
    view: 'DATELESS SLUG at line 3: plant-dateless',
  },
  {
    id: 'RA-4 an inline marker on the @entry line',
    artifact: 'journal',
    text: '\n@entry 2026-09-19-plant-inline [THREAD: x]\n  ANCHOR: A2\n  WHAT: "planted inline marker"\n  THREAD: none\n',
    code: 'INLINE_MARKER',
    slug: '2026-09-19-plant-inline',
    line: '3',
    detail: 'null',
    view: 'INLINE MARKER at line 3: 2026-09-19-plant-inline',
  },
  {
    id: 'RA-5 a bracketed field line',
    artifact: 'journal',
    text: '\n@entry 2026-09-19-plant-bracket\n  ANCHOR: A2\n  WHAT: "planted bracketed field"\n  [THREAD: x]\n  THREAD: none\n',
    code: 'BRACKETED_FIELD',
    slug: '2026-09-19-plant-bracket',
    line: '6',
    detail: '"[THREAD: x]"',
    view: 'BRACKETED FIELD at line 6: [THREAD: x]',
  },
  {
    id: 'RA-6 an unharvested KNOWLEDGE flag',
    artifact: 'journal',
    text: '\n@entry 2026-09-19-plant-knowledge\n  ANCHOR: A2\n  WHAT: "planted unharvested knowledge"\n  KNOWLEDGE: true\n  THREAD: none\n',
    code: 'UNHARVESTED_KNOWLEDGE',
    slug: '2026-09-19-plant-knowledge',
    line: '3',
    detail: 'null',
    view: 'UNHARVESTED KNOWLEDGE at line 3: 2026-09-19-plant-knowledge',
  },
  {
    id: 'RA-7 a DONE task without its event',
    artifact: 'backlog',
    text: '\n@task zz-plant-done\n  STATUS: DONE\n  OBJECTIVE: "planted done without event"\n',
    code: 'DONE_WITHOUT_EVENT',
    slug: 'zz-plant-done',
    line: 'null',
    detail: 'null',
    view: 'DONE WITHOUT EVENT (backlog/zz-plant-done: DONE): zz-plant-done',
  },
  {
    id: 'RA-9 a dated entry missing THREAD',
    artifact: 'journal',
    text: '\n@entry 2026-09-19-plant-nothread\n  ANCHOR: A2\n  WHAT: "planted missing thread"\n',
    code: 'MISSING_THREAD',
    slug: '2026-09-19-plant-nothread',
    line: '3',
    detail: 'null',
    view: 'MISSING THREAD at line 3: 2026-09-19-plant-nothread (declare THREAD: <what it awaits> | none)',
  },
];

describe.concurrent('the record audit', () => {
  it('TC63: each record check a verb-built unit can carry yields exactly its finding; a clean unit answers its open threads', async () => {
    const sb = await at('empty');
    await fixture(sb, 'tc63-unharvested', 'unharvested knowledge fixture');
    answer(await rec(sb, 'tc63-unharvested', 1790000631, 'a knowledge flag no closer names', { with: payload().kv('slug', '2026-09-20-flagged').kv('knowledge', 'true') }), 'entry.record');
    await wantAudit(sb, 'tc63-unharvested', 'UNHARVESTED_KNOWLEDGE', '2026-09-20-flagged', '3', 'null');
    await fixture(sb, 'tc63-thread', 'missing thread fixture');
    const threadless = `what=an entry dated after the thread rule without THREAD\nslug=2026-09-20-threadless\ndate=${DATE}\nepoch=1790000632\n`;
    expect(answer(await data(sb, 'entry.record', ['tc63-thread'], threadless), 'entry.record').entry.thread).toBe(null);
    await wantAudit(sb, 'tc63-thread', 'MISSING_THREAD', '2026-09-20-threadless', '3', 'null');
    await fixture(sb, 'tc63-clean', 'clean fixture');
    answer(await rec(sb, 'tc63-clean', 1790000633, 'a question to the human, answered below', { thread: "the human's answer", with: payload().kv('slug', '2026-09-20-asked') }), 'entry.record');
    answer(await rec(sb, 'tc63-clean', 1790000634, 'a dispatch still awaited', { thread: 'lane review report', with: payload().kv('slug', '2026-09-20-open') }), 'entry.record');
    const answered = payload().kv('slug', '2026-09-20-answered').kv('closers.count', '1').kcl(1, 'CLOSES', 'done', 'the human answered', '2026-09-20-asked');
    answer(await rec(sb, 'tc63-clean', 1790000635, 'the human answered', { with: answered }), 'entry.record');
    expect(answerLine(await data(sb, 'session.audit', ['tc63-clean']), 'session.audit')).toBe(
      '{"unit":"tc63-clean","clean":true,"findings":[],"open_threads":[{"slug":"2026-09-20-open","thread":"lane review report","line":11}]}',
    );
  });

  it('TC77: the record checks only legacy text carries (a dangling closer, DONE without its event) yield exactly their finding (posix plants)', async () => {
    const sb = await at('empty');
    plantUnit(sb, 'tc63-dangling');
    await wantAudit(sb, 'tc63-dangling', 'DANGLING_CLOSER', '2026-09-20-closer-a', '7', '"2026-09-19-absent-target"');
    plantUnit(sb, 'tc63-done');
    await wantAudit(sb, 'tc63-done', 'DONE_WITHOUT_EVENT', 't-done', 'null', 'null');
  });

  it('TC64: the posix grammar checks answer with their lines (posix plant)', async () => {
    const sb = await at('empty');
    plantUnit(sb, 'tc64-u');
    expect(answerLine(await data(sb, 'session.audit', ['tc64-u']), 'session.audit')).toBe(
      '{"unit":"tc64-u","clean":false,"findings":[{"code":"DATELESS_SLUG","severity":"error","slug":"legacy-dateless","line":3,"detail":null,"first_line":null,"occurrence":null},{"code":"INLINE_MARKER","severity":"error","slug":"2026-09-20-inline","line":7,"detail":null,"first_line":null,"occurrence":null},{"code":"BRACKETED_FIELD","severity":"error","slug":"2026-09-20-bracketed","line":14,"detail":"[THREAD: none]","first_line":null,"occurrence":null},{"code":"SLUGLESS_CLOSER","severity":"error","slug":"2026-09-20-slugless","line":19,"detail":null,"first_line":null,"occurrence":null}],"open_threads":[]}',
    );
  });

  it('RA-0: the engine audits the clean unit clean and the audit view prints its thread tail, rc 0', async () => {
    const sb = fresh(await audited('unit'));
    const clean = answerLine(await engineCall(sb, 'session.audit', [AUD]), 'session.audit');
    expect(clean).toBe(`{"unit":"${AUD}","clean":true,"findings":[],"open_threads":[]}`);
    const view = await renderView(sb, 'audit', `${clean}\n`);
    expect([view.code, view.stdout, view.stderr]).toEqual([0, 'open threads: none\n', '']);
  });

  for (const plant of PLANTS) {
    it(`${plant.id}: the engine names its finding and line, the audit view prints the line and exits 1`, async () => {
      const sb = fresh(await audited('unit'));
      appendArtifact(sb, AUD, plant.artifact, plant.text);
      const found = answerLine(await engineCall(sb, 'session.audit', [AUD]), 'session.audit');
      expect(found).toBe(dirty(AUD, plant.code, plant.slug, plant.line, plant.detail));
      const view = await renderView(sb, 'audit', `${found}\n`);
      expect([view.code, view.stdout, view.stderr]).toEqual([1, `${plant.view}\n`, '']);
    });
  }

  it('RA-8: an IN_PROGRESS task audits clean without a state pointer; the retired absence check never fires', async () => {
    const sb = fresh(await audited('unit'));
    appendArtifact(sb, AUD, 'backlog', '\n@task zz-plant-inp\n  STATUS: IN_PROGRESS\n  OBJECTIVE: "planted in progress, no state pointer"\n');
    const clean = answerLine(await engineCall(sb, 'session.audit', [AUD]), 'session.audit');
    expect(clean).toBe(`{"unit":"${AUD}","clean":true,"findings":[],"open_threads":[]}`);
    const view = await renderView(sb, 'audit', `${clean}\n`);
    expect(view.code).toBe(0);
    expect(view.stdout).not.toContain('IN_PROGRESS ABSENT FROM STATE');
  });

  it('RA-0 through ctx: the audit verb exits 0 with the thread tail, 1 with the named line on a planted defect, 0 again after the repair', async () => {
    const sb = await at('empty');
    expect((await ctx(sb, 'unit', 'bootstrap', AUD, 'audit matrix unit')).code).toBe(0);
    const clean = await ctx(sb, 'unit', 'audit', AUD);
    expect([clean.code, clean.stdout.includes('open threads:')]).toEqual([0, true]);
    const journal = artifactPath(sb, AUD, 'journal');
    const kept = readFileSync(journal);
    appendArtifact(sb, AUD, 'journal', PLANTS[0].text);
    const lines = readFileSync(journal, 'utf8').split('\n');
    const at7 = lines.indexOf('  CLOSES: 2026-01-01-nonexistent (done: nothing)') + 1;
    const planted = await ctx(sb, 'unit', 'audit', AUD);
    expect([planted.code, `${planted.stdout}${planted.stderr}`.includes(`DANGLING CLOSER at line ${at7}: 2026-01-01-nonexistent`)]).toEqual([1, true]);
    writeFileSync(journal, kept);
    expect((await ctx(sb, 'unit', 'audit', AUD)).code).toBe(0);
  });
});
