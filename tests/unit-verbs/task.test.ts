import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { must, run, seedUnit, unit } from '../support/unit';

const NOFIELD = 'task update: error: no field to update (give --objective, --desc, --criteria, --details, or --refs) (ERR_INVALID_ARGUMENT)\n';
const show = async (sb: string, u: string, slug: string): Promise<string> => (await unit(sb, 'task', 'show', u, slug)).stdout;

export function receiptSlug(board: string, what: string): string | undefined {
  let head: string | undefined;
  for (const line of board.split('\n')) {
    if (line.startsWith('@entry ')) head = line.slice(7);
    if (line.includes(`WHAT: "${what}"`)) return head;
  }
  return undefined;
}

describe.concurrent('ctx unit task', () => {
  let sem: string;
  let x: string;
  beforeAll(async () => {
    [sem, x] = await Promise.all([
      seed(async (sb) => {
        await seedUnit(sb, 'sem-unit', 'semantic interface test');
        await must(unit(sb, 'task', 'add', 'sem-unit', 'task-1', '--objective=First objective', '--desc=Task 1 description', '--criteria=Criteria 1', '--details=Details 1'));
        await must(unit(sb, 'task', 'add', 'sem-unit', 'task-2', '--objective=Second objective', '--desc=Piped task description'));
      }, 'posix', 'task-sem'),
      seed(async (sb) => {
        await seedUnit(sb, 'x-unit', 'defect regression unit');
        for (const [slug, objective] of [['x-todo', 'Open task'], ['x-prog', 'Running task'], ['x-done', 'Finished task']]) await must(unit(sb, 'task', 'add', 'x-unit', slug!, `--objective=${objective}`));
        await must(unit(sb, 'task', 'start', 'x-unit', 'x-prog'));
        await must(unit(sb, 'task', 'complete', 'x-unit', 'x-done', '--evidence=closed by the suite'));
      }, 'posix', 'task-x'),
    ]);
  });

  it('R-i: task list refuses a bogus status rc 1', async () => {
    expect((await unit(fresh(x), 'task', 'list', 'x-unit', '--status=bogus')).code).toBe(1);
  });

  it('E-1: task add takes the typed flags and task show reads them back', async () => {
    const sb = fresh(x);
    expect((await unit(sb, 'task', 'add', 'x-unit', 'task-1', '--objective=First objective', '--desc=Task 1 description', '--criteria=Criteria 1', '--details=Details 1')).code).toBe(0);
    const out = await show(sb, 'x-unit', 'task-1');
    expect(out).toContain('OBJECTIVE: "First objective"');
    expect(out).toContain('STATUS: TODO');
  });

  it('E-2: a raw @task block on stdin is retired, refused rc 1; the same task lands through the typed flags', async () => {
    const sb = fresh(x);
    const raw = await run(sb, ['unit', 'task', 'add', 'x-unit'], { input: '@task task-2\n  STATUS: TODO\n  OBJECTIVE: "Second objective"\n  DESCRIPTION ::\n    Piped task description\n' });
    expect(raw.code).toBe(1);
    expect((await unit(sb, 'task', 'show', 'x-unit', 'task-2')).code).toBe(1);
    expect((await unit(sb, 'task', 'add', 'x-unit', 'task-2', '--objective=Second objective', '--desc=Piped task description')).code).toBe(0);
    expect(await show(sb, 'x-unit', 'task-2')).toContain('OBJECTIVE: "Second objective"');
  });

  it('E-3: task update lands; an update carrying no field refuses with the one fixed line and changes nothing', async () => {
    const sb = fresh(sem);
    expect((await unit(sb, 'task', 'update', 'sem-unit', 'task-1', '--objective=Updated objective 1')).code).toBe(0);
    expect(await show(sb, 'sem-unit', 'task-1')).toContain('OBJECTIVE: "Updated objective 1"');
    const raw = await run(sb, ['unit', 'task', 'update', 'sem-unit', 'task-1'], { input: '@task task-1\n  OBJECTIVE: "Raw block update"\n' });
    expect([raw.code, raw.stdout + raw.stderr]).toEqual([1, NOFIELD]);
    expect((await unit(sb, 'task', 'update', 'sem-unit', 'task-1', '--json')).code).toBe(1);
    const empty = await unit(sb, 'task', 'update', 'sem-unit', 'task-1', '--desc=');
    expect([empty.code, empty.stdout + empty.stderr]).toEqual([1, NOFIELD]);
    expect(await show(sb, 'sem-unit', 'task-1')).toContain('OBJECTIVE: "Updated objective 1"');
    const help = await unit(sb, 'task', 'update', '--help');
    expect(help.stdout + help.stderr).toContain('no field refuses');
  });

  it('E-4: task start moves the task to IN_PROGRESS and writes no state pointer', async () => {
    const sb = fresh(sem);
    expect((await unit(sb, 'task', 'start', 'sem-unit', 'task-1')).code).toBe(0);
    expect(await show(sb, 'sem-unit', 'task-1')).toContain('STATUS: IN_PROGRESS');
    expect((await unit(sb, 'load', 'sem-unit', '1')).stdout).not.toContain('next_action:');
  });

  it('E-5 and E-6: task complete lands DONE with its receipt entry; task reopen restores TODO', async () => {
    const sb = fresh(sem);
    await must(unit(sb, 'task', 'start', 'sem-unit', 'task-1'));
    expect((await unit(sb, 'task', 'complete', 'sem-unit', 'task-1', '--evidence=test verified cleanly')).code).toBe(0);
    expect(await show(sb, 'sem-unit', 'task-1')).toContain('STATUS: DONE');
    const what = 'backlog/task-1: DONE (test verified cleanly)';
    const slug = receiptSlug((await unit(sb, 'board', 'sem-unit')).stdout, what);
    expect(slug).toMatch(/^\d{4}-\d{2}-\d{2}-/);
    expect((await unit(sb, 'entry', 'show', 'sem-unit', slug!)).stdout).toContain(what);
    expect((await unit(sb, 'task', 'reopen', 'sem-unit', 'task-1')).code).toBe(0);
    expect(await show(sb, 'sem-unit', 'task-1')).toContain('STATUS: TODO');
  });

  it('E-7: task drop removes the task block', async () => {
    const sb = fresh(sem);
    expect((await unit(sb, 'task', 'drop', 'sem-unit', 'task-2', '--reason=task deprecated')).code).toBe(0);
    expect((await unit(sb, 'task', 'list', 'sem-unit', '--status=all')).stdout).not.toContain('task-2');
  });

  it('E-8: task list prints the text view and --json', async () => {
    const sb = fresh(sem);
    expect((await unit(sb, 'task', 'list', 'sem-unit')).stdout).toContain('task-1');
    expect((await unit(sb, 'task', 'list', 'sem-unit', '--json')).stdout).toContain('"slug":"task-1"');
  });

  it('X-a: the status filters todo, done, all, and progress map in the verb', async () => {
    const sb = fresh(x);
    const todo = (await unit(sb, 'task', 'list', 'x-unit', '--status=todo')).stdout;
    expect(todo).toContain('[TODO] x-todo: Open task');
    expect(todo).not.toContain('x-done');
    expect((await unit(sb, 'task', 'list', 'x-unit', '--status=done', '--json')).stdout).toContain('"slug":"x-done","status":"DONE"');
    expect((await unit(sb, 'task', 'list', 'x-unit', '--status=all')).stdout.split('\n').filter((l) => l.startsWith('  ['))).toHaveLength(3);
    expect((await unit(sb, 'task', 'list', 'x-unit', '--status=progress')).stdout).toContain('[IN_PROGRESS] x-prog: Running task');
  });

  it('X-b: task add --refs lands in the JSON refs array with no error', async () => {
    const sb = fresh(x);
    const added = await unit(sb, 'task', 'add', 'x-unit', 'x-refs', '--objective=Refs task', '--refs=backlog#one knowledge#TWO');
    expect(added.stderr).toBe('');
    expect((await unit(sb, 'task', 'show', 'x-unit', 'x-refs', '--json')).stdout).toContain('"refs":["backlog#one","knowledge#TWO"]');
  });

  it('X-g: task update adds the description, criteria, and details the block lacked', async () => {
    const sb = fresh(x);
    await must(unit(sb, 'task', 'add', 'x-unit', 'x-upd', '--objective=Update target'));
    await must(unit(sb, 'task', 'update', 'x-unit', 'x-upd', '--desc=Added description', '--criteria=Added criteria', '--details=Added details'));
    expect((await unit(sb, 'task', 'show', 'x-unit', 'x-upd', '--json')).stdout).toContain('"description":"Added description","criteria":"Added criteria","details":"Added details"');
  });

  it('X-k: a malformed slug refuses; a quoted objective reads whole; a slug prefixing another adds', async () => {
    const sb = fresh(x);
    expect((await unit(sb, 'task', 'add', 'x-unit', 'Bad Slug', '--objective=Malformed slug')).code).toBe(1);
    expect((await unit(sb, 'task', 'list', 'x-unit')).stdout).not.toContain('Bad');
    await must(unit(sb, 'task', 'add', 'x-unit', 'x-quote', '--objective=Text with a/slash & an ampersand and "quotes"'));
    expect(await show(sb, 'x-unit', 'x-quote')).toContain('ampersand and "quotes"');
    await must(unit(sb, 'task', 'add', 'x-unit', 'x-pre-long', '--objective=Long slug'));
    expect((await unit(sb, 'task', 'add', 'x-unit', 'x-pre', '--objective=Prefix slug')).code).toBe(0);
  });

  it('X-l: task drop writes the canonical backlog/<slug>: DROPPED (<reason>) receipt', async () => {
    const sb = fresh(x);
    await must(unit(sb, 'task', 'drop', 'x-unit', 'x-todo', '--reason=suite drop'));
    const what = 'backlog/x-todo: DROPPED (suite drop)';
    const slug = receiptSlug((await unit(sb, 'board', 'x-unit')).stdout, what);
    expect(slug).toBeDefined();
    expect((await unit(sb, 'entry', 'show', 'x-unit', slug!)).stdout).toContain(`WHAT: "${what}"`);
  });
});
