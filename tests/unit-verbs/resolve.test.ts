import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { createLane, must, run, seedUnit, unit } from '../support/unit';

const D = '2026-09-27';

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
    }, 'posix', 'resolve');
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
