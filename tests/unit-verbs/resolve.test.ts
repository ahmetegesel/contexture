import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { createLane, LANE_BRIEF, must, plantArtifact, run, seedUnit, unit } from '../support/unit';

const D = '2026-09-27';

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

const notFound = (ref: string, u = 'x-unit'): string => `resolve: error: reference '${ref}' not found in unit '${u}' (ERR_ENTITY_NOT_FOUND)\n`;

describe.concurrent('ctx unit resolve', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'x-unit', 'defect regression unit');
      await must(unit(sb, 'task', 'add', 'x-unit', 'x-todo', '--objective=Open task'));
      await must(unit(sb, 'finding', 'add', 'x-unit', 'X_FINDING', '--summary=First'));
      await must(unit(sb, 'finding', 'add', 'x-unit', 'ARCH_V2', '--summary=Architecture decision version 2'));
      await must(unit(sb, 'record', 'x-unit', '--what=Resolvable entry', `--slug=${D}-x-e1`));
      await must(createLane(sb, 'x-unit', 'x-lane'));
      await must(run(sb, ['lane', 'record', 'x-unit', 'x-lane', '--what=Second lane event', `--slug=${D}-x-l2`, '--thread=the dispatcher']));
      await must(run(sb, ['lane', 'report', 'x-unit', 'x-lane'], { input: '# x report\n\n@claim x1\n  VERDICT: "from stdin"\n' }));
      await must(createLane(sb, 'x-unit', 'k-lane'));
      await must(run(sb, ['lane', 'record', 'x-unit', 'k-lane', '--what=A lane event', `--slug=${D}-k-l1`]));
      await must(run(sb, ['lane', 'record', 'x-unit', 'k-lane', '--what=A later lane event', `--slug=${D}-k-l2`, '--ref=lane#k-lane/recipe#GOAL']));
      await must(run(sb, ['lane', 'report', 'x-unit', 'k-lane'], { input: K_REPORT }));
      await must(createLane(sb, 'x-unit', 'e-lane'));
      plantArtifact(sb, 'x-unit', 'lanes/r-lane/report', '@report r-lane\nVERDICT: planted\n');
    }, 'posix', 'resolve');
  });

  it.for(
    ['recipe', 'journal', 'report'].flatMap((a) => [`lane#k-lane/${a}`, `lanes/k-lane/${a}`, `unit#x-unit/lane/k-lane/${a}`].map((ref) => [ref, a] as const)),
  )('X-f [the-record-r-7jaw4]: resolve %s prints byte for byte what ctx lane show prints, rc 0, empty stderr, and the same --json', async ([ref, artifact]) => {
    const sb = fresh(sb0);
    const shown = await run(sb, ['lane', 'show', 'x-unit', 'k-lane', artifact]);
    const r = await unit(sb, 'resolve', 'x-unit', ref);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(shown.stdout.length).toBeGreaterThan(1);
    expect(Buffer.from(r.stdout).equals(Buffer.from(shown.stdout))).toBe(true);
    const shownJson = await run(sb, ['lane', 'show', 'x-unit', 'k-lane', artifact, '--json']);
    const j = await unit(sb, 'resolve', 'x-unit', ref, '--json');
    expect([j.code, j.stderr, j.stdout]).toEqual([0, '', shownJson.stdout]);
  });

  it.for([
    ['FINDINGS', 'FINDINGS ::\n  F1 the finding\n  INNER ::\n\n  F2 after a blank line\n\n'],
    ['CRITERIA', 'CRITERIA ::  \n  C1 met\n'],
    ['STALE', 'STALE :: \n'],
    ['VERDICT2', 'VERDICT2 :: inline text\n  its continuation\n'],
  ] as const)('X-g [the-record-r-7jaw4]: a %s :: claim, its text inline or below, prints from its last column-0 head to the line before the next non-blank column-0 line, blank lines kept', async ([key, span]) => {
    const sb = fresh(sb0);
    for (const ref of [`lane#k-lane/report#${key}`, `lanes/k-lane/report#${key}`]) {
      expect(await unit(sb, 'resolve', 'x-unit', ref).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, span, '']);
    }
  });

  it.for([
    ['c9', '@c9\n  the at claim body\n\n'],
    ['c8', '@claim c8 extra\n  the claim form body\n'],
  ] as const)('X-h [the-record-r-7jaw4]: the @<claim> and @claim <claim> heads keep their span to the next column-0 @ line (%s)', async ([claim, span]) => {
    const sb = fresh(sb0);
    for (const ref of [`lane#k-lane/report#${claim}`, `lanes/k-lane/report#${claim}`, `lanes/k-lane/report.md#${claim}`]) {
      expect(await unit(sb, 'resolve', 'x-unit', ref).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, span, '']);
    }
  });

  it.for([
    ['an @BOTH head, then a BOTH :: head', '@report b-lane\n@BOTH\n  the at body\nBOTH ::\n  the keyed body\n\nNEXT ::\n  after\n', 'BOTH ::\n  the keyed body\n\n'],
    ['a BOTH :: head, then an @BOTH head', '@report b-lane\nBOTH ::\n  the keyed body\n@BOTH\n  the at body\n\nNEXT ::\n  still the at span\n@end\n', '@BOTH\n  the at body\n\nNEXT ::\n  still the at span\n'],
  ] as const)('X-l [the-record-r-7jaw4]: a report naming one claim in both head forms, %s, resolves the span of the last head in its own form', async ([, report, span]) => {
    const sb = fresh(sb0);
    await must(createLane(sb, 'x-unit', 'b-lane'));
    await must(run(sb, ['lane', 'report', 'x-unit', 'b-lane'], { input: report }));
    for (const ref of ['lane#b-lane/report#BOTH', 'lanes/b-lane/report#BOTH']) {
      expect(await unit(sb, 'resolve', 'x-unit', ref).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, span, '']);
    }
  });

  it.for(['lane#k-lane/recipe#GOAL', 'lanes/k-lane/recipe#GOAL'])(
    'X-m [the-record-r-7jaw4, the-record-r18]: the recipe claim %s prints the recipe span of its GOAL :: head by the report claim rule, and --json the lane.get recipe answer',
    async (ref) => {
      const sb = fresh(sb0);
      expect(await unit(sb, 'resolve', 'x-unit', ref).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, `GOAL ::\n  ${LANE_BRIEF.goal}\n\n`, '']);
      const shownJson = await run(sb, ['lane', 'show', 'x-unit', 'k-lane', 'recipe', '--json']);
      expect(await unit(sb, 'resolve', 'x-unit', ref, '--json').then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, shownJson.stdout, '']);
    },
  );

  it.for(['lane#k-lane/journal#', 'lanes/k-lane/journal#'])(
    'X-m [the-record-r-7jaw4, the-record-r18]: the lane journal claim %s<slug> prints that entry as ctx lane show prints it, and --json the lane.get journal answer',
    async (form) => {
      const sb = fresh(sb0);
      const [r1, r2] = await Promise.all([`${D}-k-l1`, `${D}-k-l2`].map((slug) => unit(sb, 'resolve', 'x-unit', `${form}${slug}`)));
      expect([r1.code, r1.stderr, r2.code, r2.stderr]).toEqual([0, '', 0, '']);
      expect(r1.stdout).toBe(`@entry ${D}-k-l1\n  WHAT: "A lane event"\n  THREAD: none\n\n`);
      expect(r2.stdout).toMatch(new RegExp(`^@entry ${D}-k-l2\\n {2}WHAT: "A later lane event"\\n`));
      const shown = await run(sb, ['lane', 'show', 'x-unit', 'k-lane', 'journal']);
      expect(shown.stdout).toBe(r1.stdout + r2.stdout);
      const shownJson = await run(sb, ['lane', 'show', 'x-unit', 'k-lane', 'journal', '--json']);
      expect(await unit(sb, 'resolve', 'x-unit', `${form}${D}-k-l1`, '--json').then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, shownJson.stdout, '']);
    },
  );

  it.for([
    'lane#k-lane/recipe#FINDINGS',
    'lane#k-lane/journal#FINDINGS',
    'lanes/k-lane/recipe#FINDINGS',
    'lanes/k-lane/journal#FINDINGS',
    `lane#k-lane/journal#${D}-k-l9`,
    `lane#nosuch-lane/journal#${D}-k-l1`,
    'lane#nosuch-lane/recipe#GOAL',
    'lane#r-lane/recipe#GOAL',
  ])('X-m [the-record-r-7jaw4]: %s refuses rc 1, empty stdout, with the one not found line, in the text and --json views alike', async (ref) => {
    const sb = fresh(sb0);
    for (const view of [[], ['--json']]) {
      const r = await unit(sb, 'resolve', 'x-unit', ref, ...view);
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', notFound(ref)]);
    }
  });

  it.for(['lane#k-lane/notes', 'lanes/k-lane/report.md', 'lane#k-lane/notes#GOAL', 'lanes/k-lane/notes#GOAL', 'lanes/k-lane/x/recipe#GOAL', `lanes/k-lane/x/journal#${D}-k-l1`])(
    'X-i [the-record-r-7jaw4]: %s refuses rc 1 as an unsupported form',
    async (ref) => {
      const r = await unit(fresh(sb0), 'resolve', 'x-unit', ref);
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `resolve: error: unsupported ref format: '${ref}' (ERR_INVALID_ARGUMENT)\n`]);
    },
  );

  it.for([
    'lane#e-lane/report',
    'lanes/e-lane/report',
    'unit#x-unit/lane/e-lane/report',
    'lane#e-lane/report#FINDINGS',
    'lane#r-lane/recipe',
    'lanes/r-lane/recipe',
    'lane#nosuch-lane/recipe',
    'lanes/nosuch-lane/report',
    'lane#nosuch-lane/report#FINDINGS',
    'lane#k-lane/report#NOPE',
    'lane#k-lane/report#VERDICT',
    'lane#k-lane/report#INNER',
  ])('X-j [the-record-r-7jaw4]: %s refuses rc 1, empty stdout, with the one not found line, in the text and --json views alike', async (ref) => {
    const sb = fresh(sb0);
    for (const view of [[], ['--json']]) {
      const r = await unit(sb, 'resolve', 'x-unit', ref, ...view);
      expect([r.code, r.stdout, r.stderr]).toEqual([1, '', notFound(ref)]);
    }
  });

  it('X-k [the-record-r-7jaw4, the-record-r16]: the empty journal ctx lane create stores resolves as ctx lane show prints it, while lane show keeps one empty line for the absent report', async () => {
    const sb = fresh(sb0);
    const shown = await run(sb, ['lane', 'show', 'x-unit', 'e-lane', 'journal']);
    expect(shown.code).toBe(0);
    for (const ref of ['lane#e-lane/journal', 'lanes/e-lane/journal', 'unit#x-unit/lane/e-lane/journal']) {
      expect(await unit(sb, 'resolve', 'x-unit', ref).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, shown.stdout, '']);
    }
    expect(await run(sb, ['lane', 'show', 'x-unit', 'e-lane', 'report']).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, '\n', '']);
    expect(await run(sb, ['lane', 'show', 'x-unit', 'r-lane', 'recipe']).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, '\n', '']);
  });

  it('E-13b: resolve of the legacy knowledge.md# form renders the block and --json the finding answer', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'resolve', 'x-unit', 'knowledge.md#ARCH_V2')).stdout).toContain('@finding ARCH_V2');
    expect((await unit(sb, 'resolve', 'x-unit', 'knowledge.md#ARCH_V2', '--json')).stdout).toContain('"finding":{"name":"ARCH_V2"');
  });

  it.for([
    ['task#x-todo', /^@task x-todo/m],
    ['finding#X_FINDING', /^@finding X_FINDING/m],
    [`entry#${D}-x-e1`, /WHAT: "Resolvable entry"/],
    ['lane#x-lane/report#x1', /^@claim x1/m],
    ['lanes/x-lane/report.md#x1', /VERDICT: "from stdin"/],
    ['knowledge.md#X_FINDING', /^@finding X_FINDING/m],
    ['unit#x-unit/task/x-todo', /^@task x-todo/m],
    ['unit#x-unit/finding/X_FINDING', /^@finding X_FINDING/m],
    [`unit#x-unit/entry/${D}-x-e1`, /WHAT: "Resolvable entry"/],
    ['unit#x-unit/lane/x-lane/report', /VERDICT: "from stdin"/],
    ['unit#x-unit/lane/x-lane/journal', new RegExp(`^@entry ${D}-x-l2$`, 'm')],
  ] as const)('X-e: resolve %s answers rc 0 with its block', async ([ref, block]) => {
    const r = await unit(fresh(sb0), 'resolve', 'x-unit', ref);
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toMatch(block);
  });

  it.for(['task#x-missing', 'unit#x-unit/task/x-missing', 'unit#x-unit/lane/x-lane/report#x1'])('X-e: resolve %s refuses rc 1', async (ref) => {
    expect((await unit(fresh(sb0), 'resolve', 'x-unit', ref)).code).toBe(1);
  });
});
