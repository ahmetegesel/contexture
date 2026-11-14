import { beforeAll, describe, expect, it } from 'vitest';
import { unitLock } from '../support/drawer';
import { holdLock } from '../support/locks';
import { fresh, seed } from '../support/snapshot';
import { createLane, LANE_BRIEF, must, plantArtifact, run, seedUnit, unit } from '../support/unit';

const D = '2026-11-14';
const REPORT = ['@report g-lane', 'VERDICT :: done', '', 'COMMITS ::', '  one commit', '', 'OPEN ::', '  none', ''].join('\n');
const missing = (path: string): string => `get: error: '${path}' not found (ERR_ENTITY_NOT_FOUND)\n`;
const malformed = (path: string): string =>
  `get: error: malformed path '${path}': <unit>/task/<slug>, <unit>/entry/<slug>, <unit>/finding/<NAME>, <unit>/lane/<lane>/<recipe|report>[/<SECTION>], or <unit>/lane/<lane>/journal[/<slug>] (ERR_INVALID_ARGUMENT)\n`;

describe.concurrent('ctx unit get', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'g-unit', 'the get unit');
      await must(unit(sb, 'record', 'g-unit', '--what=the entry get prints', `--slug=${D}-g-e1`));
      await must(unit(sb, 'task', 'add', 'g-unit', 'g-task', '--objective=the task get prints', `--refs=unit#g-unit/entry/${D}-g-e1, file#.contexture/ctx`));
      await must(unit(sb, 'finding', 'add', 'g-unit', 'G_FINDING', '--summary=the finding get prints', `--ref=unit#g-unit/entry/${D}-g-e1`));
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
    expect(r.stdout).toBe(`@task g-task\n  STATUS: TODO\n  OBJECTIVE: "the task get prints"\n  REFS: [unit#g-unit/entry/${D}-g-e1, file#.contexture/ctx]\n`);
  });

  it.for(['recipe', 'report', 'journal'] as const)('[the-record-r-l81i1] get of a lane %s prints what ctx lane show prints, and --json the storage answer', async (artifact) => {
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

  it.for(['g-unit/state', 'g-unit', 'g-unit/task', 'g-unit/task/a/b', 'g-unit/lane/g-lane', 'g-unit/lane/g-lane/notes'])(
    '[the-record-r-l81i1] %s names no entity (a container listing, the state, or a bad form) and refuses rc 1 naming the forms',
    async (path) => {
      const r = await unit(fresh(sb0), 'get', path);
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', malformed(path)]);
    },
  );

  it('[the-record-r-l81i1] a missing unit refuses rc 1 in the verb\'s own not found line, whatever the kind; an unknown flag refuses; --help prints the usage rc 0', async () => {
    const sb = fresh(sb0);
    for (const path of ['nounit/task/g-task', 'nounit/entry/x', 'nounit/finding/X', 'nounit/lane/g-lane/report', 'nounit/lane/g-lane/journal/x']) {
      for (const argv of [[path], [path, '--json']]) {
        const nounit = await unit(sb, 'get', ...argv);
        expect([nounit.code, nounit.stdout, nounit.stderr]).toEqual([1, '', missing(path)]);
      }
    }
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

const K = '2026-09-27';
const K_REPORT = [
  '@report k-lane',
  'VERDICT: done',
  'VERDICT2 :: inline text',
  '  its continuation',
  'FINDINGS ::',
  '  F0 the first head, shadowed by the later one',
  'STALE :: ',
  'FINDINGS ::',
  '  F1 the finding',
  '  INNER ::',
  '',
  '  F2 after a blank line',
  '',
  'CRITERIA ::  ',
  '  C1 met',
  '@c9',
  '  the at claim body',
  '',
  '@claim c8 extra',
  '  the claim form body',
  '',
].join('\n');

describe.concurrent('ctx unit get: the section and lane journal cases', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'x-unit', 'the section cases unit');
      await must(createLane(sb, 'x-unit', 'k-lane'));
      await must(run(sb, ['lane', 'record', 'x-unit', 'k-lane', '--what=A lane event', `--slug=${K}-k-l1`]));
      await must(run(sb, ['lane', 'record', 'x-unit', 'k-lane', '--what=A later lane event', `--slug=${K}-k-l2`]));
      await must(run(sb, ['lane', 'report', 'x-unit', 'k-lane'], { input: K_REPORT }));
      await must(createLane(sb, 'x-unit', 'e-lane'));
      plantArtifact(sb, 'x-unit', 'lanes/r-lane/report', '@report r-lane\nVERDICT: planted\n');
    }, 'posix', 'get-sections');
  });

  it.for([
    ['FINDINGS', 'FINDINGS ::\n  F1 the finding\n  INNER ::\n\n  F2 after a blank line\n\n'],
    ['CRITERIA', 'CRITERIA ::  \n  C1 met\n'],
    ['STALE', 'STALE :: \n'],
    ['VERDICT2', 'VERDICT2 :: inline text\n  its continuation\n'],
  ] as const)('[the-record-r-l81i1] a %s :: section, its text inline or below, prints from its last column-0 head to the line before the next non-blank column-0 line, blank lines kept', async ([key, span]) => {
    expect(await unit(fresh(sb0), 'get', `x-unit/lane/k-lane/report/${key}`).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, span, '']);
  });

  it.for([
    ['c9', '@c9\n  the at claim body\n\n'],
    ['c8', '@claim c8 extra\n  the claim form body\n'],
  ] as const)('[the-record-r-l81i1] the @<SECTION> and @claim <SECTION> heads keep their span to the next column-0 @ line (%s)', async ([claim, span]) => {
    expect(await unit(fresh(sb0), 'get', `x-unit/lane/k-lane/report/${claim}`).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, span, '']);
  });

  it.for([
    ['an @BOTH head, then a BOTH :: head', '@report b-lane\n@BOTH\n  the at body\nBOTH ::\n  the keyed body\n\nNEXT ::\n  after\n', 'BOTH ::\n  the keyed body\n\n'],
    ['a BOTH :: head, then an @BOTH head', '@report b-lane\nBOTH ::\n  the keyed body\n@BOTH\n  the at body\n\nNEXT ::\n  still the at span\n@end\n', '@BOTH\n  the at body\n\nNEXT ::\n  still the at span\n'],
  ] as const)('[the-record-r-l81i1] a report naming one section in both head forms, %s, answers the span of the last head in its own form', async ([, report, span]) => {
    const sb = fresh(sb0);
    await must(createLane(sb, 'x-unit', 'b-lane'));
    await must(run(sb, ['lane', 'report', 'x-unit', 'b-lane'], { input: report }));
    expect(await unit(sb, 'get', 'x-unit/lane/b-lane/report/BOTH').then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, span, '']);
  });

  it('[the-record-r-l81i1] a recipe section prints the recipe span of its GOAL :: head by the report section rule', async () => {
    expect(await unit(fresh(sb0), 'get', 'x-unit/lane/k-lane/recipe/GOAL').then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, `GOAL ::\n  ${LANE_BRIEF.goal}\n\n`, '']);
  });

  it('[the-record-r-l81i1] a lane journal entry prints as ctx lane show prints it, and the whole lane journal is the entries in order', async () => {
    const sb = fresh(sb0);
    const [r1, r2] = await Promise.all([`${K}-k-l1`, `${K}-k-l2`].map((slug) => unit(sb, 'get', `x-unit/lane/k-lane/journal/${slug}`)));
    expect([r1.code, r1.stderr, r2.code, r2.stderr]).toEqual([0, '', 0, '']);
    expect(r1.stdout).toBe(`@entry ${K}-k-l1\n  WHAT: "A lane event"\n  THREAD: none\n\n`);
    const shown = await run(sb, ['lane', 'show', 'x-unit', 'k-lane', 'journal']);
    expect(shown.stdout).toBe(r1.stdout + r2.stdout);
    expect(await unit(sb, 'get', 'x-unit/lane/k-lane/journal').then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, shown.stdout, '']);
  });

  it('[the-record-r-l81i1] the empty journal ctx lane create stores answers as ctx lane show prints it', async () => {
    const sb = fresh(sb0);
    const shown = await run(sb, ['lane', 'show', 'x-unit', 'e-lane', 'journal']);
    expect(shown.code).toBe(0);
    expect(await unit(sb, 'get', 'x-unit/lane/e-lane/journal').then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, shown.stdout, '']);
  });

  it.for([
    'x-unit/lane/k-lane/recipe/FINDINGS',
    'x-unit/lane/k-lane/journal/FINDINGS',
    `x-unit/lane/k-lane/journal/${K}-k-l9`,
    `x-unit/lane/nosuch-lane/journal/${K}-k-l1`,
    'x-unit/lane/nosuch-lane/journal',
    'x-unit/lane/nosuch-lane/recipe/GOAL',
    'x-unit/lane/nosuch-lane/recipe',
    'x-unit/lane/r-lane/recipe/GOAL',
    'x-unit/lane/r-lane/recipe',
    'x-unit/lane/e-lane/report/FINDINGS',
    'x-unit/lane/k-lane/report/NOPE',
    'x-unit/lane/k-lane/report/VERDICT',
    'x-unit/lane/k-lane/report/INNER',
  ])('[the-record-r-l81i1] %s refuses rc 1, empty stdout, with the one not found line, in the text and --json views alike', async (path) => {
    const sb = fresh(sb0);
    for (const view of [[], ['--json']]) {
      const r = await unit(sb, 'get', path, ...view);
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', missing(path)]);
    }
  });

  it.for(['x-unit/lane/k-lane/notes', 'x-unit/lane/k-lane/report.md', 'x-unit/lane/k-lane/notes/GOAL', 'x-unit/lane/k-lane/report/a b', 'x-unit/lane/k-lane/report/c9#x', 'x-unit/lane/k-lane/report/GOAL/x'])(
    '[the-record-r-l81i1] %s names no entity and refuses rc 1 naming the forms',
    async (path) => {
      const r = await unit(fresh(sb0), 'get', path);
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', malformed(path)]);
    },
  );
});
