import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { DATE, mk, ok, receiptJson } from '../support/record';
import { answer, answerLine, payload, refused } from '../support/wire';
import { at, TUNIT } from './chain';

const task = (fields: string): string => `{"unit":"compliance-tasks","task":${fields}}`;
const T5 =
  '{"slug":"task-sample","ordinal":1,"status":"TODO","objective":"Sample task objective","refs":[],"description":"Sample description\\nwith a second line","criteria":"Acceptance criteria 1","details":"Implementation detail 1","extra_fields":[],"head_text":null,"extra_lines":[],"next":null}';
const T6 =
  '{"slug":"task-sample","ordinal":1,"status":"TODO","objective":"Updated task objective","refs":[],"description":"Updated description","criteria":"Acceptance criteria 1","details":"Implementation detail 1","extra_fields":[],"head_text":null,"extra_lines":[],"next":null}';
const status = async (sb: string, unit: string, slug: string): Promise<string> => answer(await data(sb, 'task.get', [unit, slug]), 'task.get').task.status;
const done = (evidence: string) => payload().kv('evidence', evidence).kv('date', DATE).toString();

describe.concurrent('the tasks through the unit data script', () => {
  it('TC05 [the-record-r11, the-record-r12]: task.add answers the TODO task with its block scalars; a repeated slug refuses rc1', async () => {
    const sb = await at('T0');
    const add = payload().kv('objective', 'Sample task objective').kv('desc', 'Sample description\nwith a second line').kv('criteria', 'Acceptance criteria 1').kv('details', 'Implementation detail 1');
    expect(answerLine(await data(sb, 'task.add', [TUNIT, 'task-sample'], add.toString()), 'task.add')).toBe(task(T5));
    expect(answerLine(await data(sb, 'task.get', [TUNIT, 'task-sample']), 'task.get')).toBe(task(T5));
    refused(await data(sb, 'task.add', [TUNIT, 'task-sample'], payload().kv('objective', 'Again').toString()), 'task.add', 1, 'ERR_ENTITY_EXISTS', "task 'task-sample' already exists in unit 'compliance-tasks'");
    expect(answerLine(await data(sb, 'task.get', [TUNIT, 'task-sample']), 'task.get')).toBe(task(T5));
  });

  it('TC06: task.update replaces the given fields and keeps the rest', async () => {
    const sb = await at('T5');
    const update = payload().kv('objective', 'Updated task objective').kv('desc', 'Updated description').toString();
    expect(answerLine(await data(sb, 'task.update', [TUNIT, 'task-sample'], update), 'task.update')).toBe(task(T6));
    expect(answerLine(await data(sb, 'task.get', [TUNIT, 'task-sample']), 'task.get')).toBe(task(T6));
  });

  it('TC07 [the-record-r1, the-record-r11]: task.start answers IN_PROGRESS and writes no state pointer', async () => {
    const sb = await at('T6');
    expect(answerLine(await data(sb, 'task.start', [TUNIT, 'task-sample']), 'task.start')).toBe(task('{"slug":"task-sample","status":"IN_PROGRESS","objective":"Updated task objective"}'));
    expect(await status(sb, TUNIT, 'task-sample')).toBe('IN_PROGRESS');
    expect(answer(await data(sb, 'session.load', [TUNIT]), 'session.load').state).not.toHaveProperty('next_action');
  });

  it('TC08 [the-record-r8]: task.complete answers DONE with its receipt entry in the journal', async () => {
    const sb = await at('T7');
    const receipt = receiptJson('2026-09-27-task-sample-completed', 2, 'backlog/task-sample: DONE (Verified via automated test suite)');
    expect(answerLine(await data(sb, 'task.complete', [TUNIT, 'task-sample'], done('Verified via automated test suite')), 'task.complete')).toBe(
      `{"unit":"compliance-tasks","task":{"slug":"task-sample","status":"DONE","objective":"Updated task objective"},"receipt":${receipt}}`,
    );
    expect(await status(sb, TUNIT, 'task-sample')).toBe('DONE');
    expect(answerLine(await data(sb, 'entry.list', [TUNIT]), 'entry.list')).toBe(
      '{"unit":"compliance-tasks","entries":[{"slug":"2026-09-27-task-sample-completed","occurrence":1,"anchor":"A1","what":"backlog/task-sample: DONE (Verified via automated test suite)","group":null}]}',
    );
  });

  it('TC09 [the-record-r11]: task.reopen, task.list, task.drop with its receipt; a dropped slug is gone and addable again', async () => {
    const sb = await at('T8');
    await ok(sb, 'task.add', [TUNIT, 'task-keeper'], payload().kv('objective', 'Keeper objective'));
    expect(answerLine(await data(sb, 'task.reopen', [TUNIT, 'task-sample']), 'task.reopen')).toBe(task('{"slug":"task-sample","status":"TODO","objective":"Updated task objective"}'));
    expect(answerLine(await data(sb, 'task.list', [TUNIT, 'TODO']), 'task.list')).toBe(
      '{"unit":"compliance-tasks","tasks":[{"slug":"task-sample","status":"TODO","objective":"Updated task objective"},{"slug":"task-keeper","status":"TODO","objective":"Keeper objective"}]}',
    );
    const receipt = receiptJson('2026-09-27-task-sample-dropped', 3, 'backlog/task-sample: DROPPED (Deprecating task)');
    const drop = payload().kv('reason', 'Deprecating task').kv('date', DATE).toString();
    expect(answerLine(await data(sb, 'task.drop', [TUNIT, 'task-sample'], drop), 'task.drop')).toBe(`{"unit":"compliance-tasks","slug":"task-sample","receipt":${receipt}}`);
    expect(answerLine(await data(sb, 'task.list', [TUNIT, 'all']), 'task.list')).toBe('{"unit":"compliance-tasks","tasks":[{"slug":"task-keeper","status":"TODO","objective":"Keeper objective"}]}');
    refused(await data(sb, 'task.get', [TUNIT, 'task-sample']), 'task.get', 1, 'ERR_ENTITY_NOT_FOUND', "task 'task-sample' not found in unit 'compliance-tasks'");
    const again = (await ok(sb, 'task.add', [TUNIT, 'task-sample'], payload().kv('objective', 'Re-declared objective'))).task;
    expect([again.objective, again.ordinal, again.status]).toEqual(['Re-declared objective', 2, 'TODO']);
  });

  it('TC34: task.list filters by the canonical status and all lists every task', async () => {
    const sb = await at('T27');
    const list = async (filter: string) => answerLine(await data(sb, 'task.list', [TUNIT, filter]), 'task.list');
    expect(await list('all')).toBe(
      '{"unit":"compliance-tasks","tasks":[{"slug":"task-keeper","status":"TODO","objective":"Keeper objective"},{"slug":"task-sample","status":"TODO","objective":"Re-declared objective"}]}',
    );
    expect((await ok(sb, 'task.start', [TUNIT, 'task-keeper'])).task.status).toBe('IN_PROGRESS');
    expect(await list('IN_PROGRESS')).toBe('{"unit":"compliance-tasks","tasks":[{"slug":"task-keeper","status":"IN_PROGRESS","objective":"Keeper objective"}]}');
    expect(await list('TODO')).toBe('{"unit":"compliance-tasks","tasks":[{"slug":"task-sample","status":"TODO","objective":"Re-declared objective"}]}');
    expect(await list('DONE')).toBe('{"unit":"compliance-tasks","tasks":[]}');
    await ok(sb, 'task.complete', [TUNIT, 'task-keeper'], done('keeper landed'));
    expect(await list('DONE')).toBe('{"unit":"compliance-tasks","tasks":[{"slug":"task-keeper","status":"DONE","objective":"Keeper objective"}]}');
  });

  it('TC35 [the-record-r14]: task refs are a JSON array; task.update adds sections and clears refs', async () => {
    const sb = await at('T0');
    const added = (await ok(sb, 'task.add', [TUNIT, 'task-refs'], payload().kv('objective', 'Refs task').kl('refs', 'backlog#one', 'knowledge#TWO'))).task;
    expect([added.refs, added.description]).toEqual([['backlog#one', 'knowledge#TWO'], null]);
    const sections = payload().kv('desc', 'Added description').kv('criteria', 'Added criteria').kv('details', 'Added details');
    const updated = (await ok(sb, 'task.update', [TUNIT, 'task-refs'], sections)).task;
    expect([updated.description, updated.criteria, updated.details, updated.refs.length]).toEqual(['Added description', 'Added criteria', 'Added details', 2]);
    const cleared = (await ok(sb, 'task.update', [TUNIT, 'task-refs'], payload().kl('refs'))).task;
    expect([cleared.refs, cleared.description]).toEqual([[], 'Added description']);
  });

  it('TC53 [the-record-r11]: the status move matrix: every allowed move lands, every other refuses ERR_INVALID_TRANSITION', async () => {
    const sb = await at('empty');
    const u = 'tc53-u';
    answer(await mk(sb, u), 'session.create');
    const add = (slug: string) => ok(sb, 'task.add', [u, slug], payload().kv('objective', `matrix ${slug}`));
    const move = (fn: string, slug: string) => data(sb, fn, [u, slug], fn === 'task.complete' ? done('matrix') : '');
    const moved = async (fn: string, slug: string, want: string) => expect(answer(await move(fn, slug), fn).task.status).toBe(want);
    const refusedMove = async (fn: string, slug: string, from: string, rule: string, still: string) => {
      refused(await move(fn, slug), fn, 1, 'ERR_INVALID_TRANSITION', `task '${slug}' is ${from}; ${fn} moves only from ${rule}`);
      expect(await status(sb, u, slug)).toBe(still);
    };

    await add('m-todo-start');
    await moved('task.start', 'm-todo-start', 'IN_PROGRESS');
    expect(await status(sb, u, 'm-todo-start')).toBe('IN_PROGRESS');
    await add('m-ip-start');
    await moved('task.start', 'm-ip-start', 'IN_PROGRESS');
    await refusedMove('task.start', 'm-ip-start', 'IN_PROGRESS', 'TODO', 'IN_PROGRESS');
    await add('m-done-start');
    await moved('task.complete', 'm-done-start', 'DONE');
    await refusedMove('task.start', 'm-done-start', 'DONE', 'TODO', 'DONE');
    await add('m-todo-complete');
    await moved('task.complete', 'm-todo-complete', 'DONE');
    expect(await status(sb, u, 'm-todo-complete')).toBe('DONE');
    await add('m-ip-complete');
    await moved('task.start', 'm-ip-complete', 'IN_PROGRESS');
    await moved('task.complete', 'm-ip-complete', 'DONE');
    await add('m-done-complete');
    await moved('task.complete', 'm-done-complete', 'DONE');
    await refusedMove('task.complete', 'm-done-complete', 'DONE', 'TODO or IN_PROGRESS', 'DONE');
    await add('m-todo-reopen');
    await refusedMove('task.reopen', 'm-todo-reopen', 'TODO', 'IN_PROGRESS or DONE', 'TODO');
    await add('m-ip-reopen');
    await moved('task.start', 'm-ip-reopen', 'IN_PROGRESS');
    await moved('task.reopen', 'm-ip-reopen', 'TODO');
    expect(await status(sb, u, 'm-ip-reopen')).toBe('TODO');
    await add('m-done-reopen');
    await moved('task.complete', 'm-done-reopen', 'DONE');
    await moved('task.reopen', 'm-done-reopen', 'TODO');
    expect(await status(sb, u, 'm-done-reopen')).toBe('TODO');
  });

  it('TC55 [the-record-r8]: task.complete writes its receipt; entry.get equals it; a same-day repeat takes -1', async () => {
    const sb = await at('empty');
    answer(await mk(sb, 'tc55-u'), 'session.create');
    await ok(sb, 'task.add', ['tc55-u', 'tc55-t'], payload().kv('objective', 'receipt task'));
    const { receipt } = await ok(sb, 'task.complete', ['tc55-u', 'tc55-t'], done('all green'));
    expect([receipt.slug, receipt.what, receipt.thread, receipt.anchor]).toEqual(['2026-09-27-tc55-t-completed', 'backlog/tc55-t: DONE (all green)', 'none', 'A1']);
    const { entry } = await ok(sb, 'entry.get', ['tc55-u', '2026-09-27-tc55-t-completed']);
    const { closed, closed_by, close_reason, ...stored } = entry;
    expect([closed, closed_by, close_reason]).toEqual([false, null, null]);
    expect(JSON.stringify(stored)).toBe(JSON.stringify(receipt));
    await ok(sb, 'task.reopen', ['tc55-u', 'tc55-t']);
    expect((await ok(sb, 'task.complete', ['tc55-u', 'tc55-t'], done('green again'))).receipt.slug).toBe('2026-09-27-tc55-t-completed-1');
    expect(answerLine(await data(sb, 'session.audit', ['tc55-u']), 'session.audit')).toBe('{"unit":"tc55-u","clean":true,"findings":[],"open_threads":[]}');
  });

  it('TC56 [the-record-r11]: task.drop answers its receipt; a dropped slug is addable again; an active task refuses until reopened', async () => {
    const sb = await at('empty');
    const u = 'tc56-u';
    answer(await mk(sb, u), 'session.create');
    const drop = (reason: string) => data(sb, 'task.drop', [u, 'tc56-t'], payload().kv('reason', reason).kv('date', DATE).toString());
    await ok(sb, 'task.add', [u, 'tc56-t'], payload().kv('objective', 'to drop'));
    const receipt = receiptJson('2026-09-27-tc56-t-dropped', 2, 'backlog/tc56-t: DROPPED (no longer needed)');
    expect(answerLine(await drop('no longer needed'), 'task.drop')).toBe(`{"unit":"tc56-u","slug":"tc56-t","receipt":${receipt}}`);
    refused(await data(sb, 'task.get', [u, 'tc56-t']), 'task.get', 1, 'ERR_ENTITY_NOT_FOUND', "task 'tc56-t' not found in unit 'tc56-u'");
    expect((await ok(sb, 'task.add', [u, 'tc56-t'], payload().kv('objective', 'declared again'))).task.objective).toBe('declared again');
    await ok(sb, 'task.start', [u, 'tc56-t']);
    refused(await drop('in progress'), 'task.drop', 1, 'ERR_INVALID_TRANSITION', "task 'tc56-t' is IN_PROGRESS; task.drop moves only from TODO or DONE; reopen an IN_PROGRESS task before dropping it");
    expect(await status(sb, u, 'tc56-t')).toBe('IN_PROGRESS');
    expect((await ok(sb, 'task.reopen', [u, 'tc56-t'])).task.status).toBe('TODO');
    expect(answer(await drop('now droppable'), 'task.drop').slug).toBe('tc56-t');
  });
});
