import { beforeAll, describe, expect, it } from 'vitest';
import { unitLock } from '../support/drawer';
import { holdLock } from '../support/locks';
import { fresh, seed } from '../support/snapshot';
import { createLane, must, run, seedUnit, unit } from '../support/unit';

const D = '2026-11-14';
const REPORT = ['@report g-lane', 'VERDICT :: done', '', 'COMMITS ::', '  one commit', '', 'OPEN ::', '  none', ''].join('\n');
const missing = (path: string): string => `get: error: '${path}' not found (ERR_ENTITY_NOT_FOUND)\n`;
const malformed = (path: string): string =>
  `get: error: malformed path '${path}': <unit>/task/<slug>, <unit>/entry/<slug>, <unit>/finding/<NAME>, <unit>/lane/<lane>/<recipe|report>[/<SECTION>], or <unit>/lane/<lane>/journal/<slug> (ERR_INVALID_ARGUMENT)\n`;

describe.concurrent('ctx unit get', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'g-unit', 'the get unit');
      await must(unit(sb, 'task', 'add', 'g-unit', 'g-task', '--objective=the task get prints', `--refs=journal#${D}-g-e1, ./README.md`));
      await must(unit(sb, 'record', 'g-unit', '--what=the entry get prints', `--slug=${D}-g-e1`));
      await must(unit(sb, 'finding', 'add', 'g-unit', 'G_FINDING', '--summary=the finding get prints', `--ref=journal#${D}-g-e1`));
      await must(createLane(sb, 'g-unit', 'g-lane'));
      await must(run(sb, ['lane', 'record', 'g-unit', 'g-lane', '--what=the lane event get prints', `--slug=${D}-g-l1`]));
      await must(run(sb, ['lane', 'report', 'g-unit', 'g-lane'], { input: REPORT }));
      await must(createLane(sb, 'g-unit', 'e-lane'));
    }, 'posix', 'get');
  });

  it.for([
    ['g-unit/task/g-task', 'unit#g-unit/task/g-task'],
    [`g-unit/entry/${D}-g-e1`, `unit#g-unit/entry/${D}-g-e1`],
    ['g-unit/finding/G_FINDING', 'unit#g-unit/finding/G_FINDING'],
    ['g-unit/lane/g-lane/report/COMMITS', 'lane#g-lane/report#COMMITS'],
    [`g-unit/lane/g-lane/journal/${D}-g-l1`, `lane#g-lane/journal#${D}-g-l1`],
  ] as const)('[the-record-r-l81i1] get %s prints the one entity byte for byte as ctx unit resolve prints its reference, rc 0, empty stderr', async ([path, ref]) => {
    const sb = fresh(sb0);
    const r = await unit(sb, 'get', path);
    const resolved = await unit(sb, 'resolve', 'g-unit', ref);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.length).toBeGreaterThan(1);
    expect(r.stdout).toBe(resolved.stdout);
  });

  it('[the-record-r-l81i1] a task prints whole with its REFS, which the task show text view leaves out', async () => {
    const r = await unit(fresh(sb0), 'get', 'g-unit/task/g-task');
    expect(r.stdout).toBe(`@task g-task\n  STATUS: TODO\n  OBJECTIVE: "the task get prints"\n  REFS: [journal#${D}-g-e1, ./README.md]\n`);
  });

  it.for(['recipe', 'report'] as const)('[the-record-r-l81i1] get of a lane %s prints what ctx lane show prints, and --json the storage answer', async (artifact) => {
    const sb = fresh(sb0);
    const shown = await run(sb, ['lane', 'show', 'g-unit', 'g-lane', artifact]);
    const r = await unit(sb, 'get', `g-unit/lane/g-lane/${artifact}`);
    expect([r.code, r.stderr, r.stdout]).toEqual([0, '', shown.stdout]);
    const j = await unit(sb, 'get', `g-unit/lane/g-lane/${artifact}`, '--json');
    expect([j.code, j.stderr, j.stdout]).toEqual([0, '', (await run(sb, ['lane', 'show', 'g-unit', 'g-lane', artifact, '--json'])).stdout]);
  });

  it('[the-record-r-l81i1] --json of a section answers that section alone, its content the lines the text form prints', async () => {
    const sb = fresh(sb0);
    const text = await unit(sb, 'get', 'g-unit/lane/g-lane/report/COMMITS');
    const j = await unit(sb, 'get', 'g-unit/lane/g-lane/report/COMMITS', '--json');
    expect([j.code, j.stderr]).toEqual([0, '']);
    expect(JSON.parse(j.stdout)).toEqual({ unit: 'g-unit', lane: 'g-lane', artifact: 'report', section: 'COMMITS', content: text.stdout });
  });

  it('[the-record-r-l81i1] --json of a lane journal entry answers that entry\'s object alone, never the lane journal', async () => {
    const sb = fresh(sb0);
    await must(run(sb, ['lane', 'record', 'g-unit', 'g-lane', '--what=a "quoted" \\ second event {x} ]', `--slug=${D}-g-l2`]));
    const whole = JSON.parse((await run(sb, ['lane', 'show', 'g-unit', 'g-lane', 'journal', '--json'])).stdout);
    expect(whole.items).toHaveLength(2);
    for (const [i, slug] of [`${D}-g-l1`, `${D}-g-l2`].entries()) {
      const j = await unit(sb, 'get', `g-unit/lane/g-lane/journal/${slug}`, '--json');
      expect([j.code, j.stderr]).toEqual([0, '']);
      expect(JSON.parse(j.stdout)).toEqual({ unit: 'g-unit', lane: 'g-lane', artifact: 'journal', entry: whole.items[i] });
    }
  });

  it.for([
    'g-unit/task/nope',
    'g-unit/entry/nope',
    'g-unit/finding/NOPE',
    'g-unit/lane/e-lane/report',
    'g-unit/lane/g-lane/report/NOSECTION',
    'g-unit/lane/g-lane/journal/nope',
  ])('[the-record-r-l81i1] a missing entity %s refuses rc 1 with its named not found line, stdout empty, in the text and --json views', async (path) => {
    const sb = fresh(sb0);
    for (const argv of [[path], [path, '--json']]) {
      const r = await unit(sb, 'get', ...argv);
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', missing(path)]);
    }
  });

  it.for(['g-unit/state', 'g-unit/lane/g-lane/journal', 'g-unit', 'g-unit/task', 'g-unit/task/a/b', 'g-unit/lane/g-lane', 'g-unit/lane/g-lane/notes'])(
    '[the-record-r-l81i1] %s names no entity (a container listing, the state, or a bad form) and refuses rc 1 naming the forms',
    async (path) => {
      const r = await unit(fresh(sb0), 'get', path);
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', malformed(path)]);
    },
  );

  it('[the-record-r-l81i1] a missing unit refuses rc 1 with the storage line; an unknown flag refuses; --help prints the usage rc 0', async () => {
    const sb = fresh(sb0);
    const nounit = await unit(sb, 'get', 'nounit/task/g-task');
    expect([nounit.code, nounit.stdout, nounit.stderr]).toEqual([1, '', "task.get: error: unit 'nounit' not found (ERR_ENTITY_NOT_FOUND)\n"]);
    const flag = await unit(sb, 'get', 'g-unit/task/g-task', '--bogus');
    expect([flag.code, flag.stderr]).toEqual([1, "get: error: unknown option '--bogus' (ERR_INVALID_ARGUMENT)\n"]);
    const help = await unit(sb, 'get', '--help');
    expect([help.code, help.stderr]).toEqual([0, '']);
    expect(help.stdout).toMatch(/^usage: ctx unit get <unit>\/<kind>\/<id> \[--json\]$/m);
    expect((await unit(sb, 'get')).code).toBe(1);
  });

  it('[the-record-r-l81i1] get takes no lock: it answers while a live writer holds the unit lock', async () => {
    const sb = fresh(sb0);
    const release = holdLock(sb, unitLock('g-unit'), 'live');
    try {
      const r = await unit(sb, 'get', 'g-unit/task/g-task');
      expect([r.code, r.stderr]).toEqual([0, '']);
      expect(r.stdout).toContain('@task g-task');
    } finally {
      release();
    }
  });
});
