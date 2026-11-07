import { describe, expect, it } from 'vitest';
import { DATE } from '../support/record';
import { fresh, seedSteps } from '../support/snapshot';
import { createLane, lane, must, run, unit } from '../support/unit';

const U = 'baseonly';
const S1 = `${DATE}-base-probe-1`;
const REPORT = '# probe report\n\n@claim probe-claim\n  VERDICT: "the lane claim"\n';

const snap = seedSteps('base-smoke', [
  {
    name: 'tasks',
    build: async (sb) => {
      await must(unit(sb, 'bootstrap', U, 'the base-only probe unit'));
      await must(unit(sb, 'task', 'add', U, 'base-t1', '--objective=the base-only task', '--desc=one line', '--criteria=the gate is green', '--details=staged base alone', '--refs=./AGENTS.md'));
      await must(unit(sb, 'task', 'add', U, 'base-t2', '--objective=a task to drop'));
    },
  },
  {
    name: 'written',
    build: async (sb) => {
      await must(unit(sb, 'record', U, `--slug=${S1}`, '--what=the first probe entry', '--group=base-only'));
      await must(unit(sb, 'record', U, '--what=the second probe entry', '--group=base-only', `--closes=${S1} (done: closed by the smoke)`));
      await must(unit(sb, 'finding', 'add', U, 'BASE_OLD', '--summary=the old finding', `--ref=journal#${S1}`));
      await must(unit(sb, 'finding', 'supersede', U, 'BASE_OLD', 'BASE_NEW', '--summary=the new finding'));
      await must(createLane(sb, U, 'base-lane'));
      await must(lane(sb, 'record', U, 'base-lane', '--what=a lane event', `--ref=journal#${S1}`));
      await must(run(sb, ['lane', 'report', U, 'base-lane'], { input: REPORT }));
    },
  },
]);

describe.concurrent('the bare base: the record and lane smoke over the shipped unit and lane modules', () => {
  it('[the-record-r1, the-record-r8] tasks: list and show, start (active derives it), update, complete with evidence, drop with a reason', async () => {
    const sb = fresh(await snap('tasks'));
    expect((await unit(sb, 'task', 'list', U, '--status=all')).stdout).toContain('base-t1');
    expect((await unit(sb, 'task', 'show', U, 'base-t1')).stdout).toContain('OBJECTIVE: "the base-only task"');
    await must(unit(sb, 'task', 'start', U, 'base-t1'));
    expect((await unit(sb, 'task', 'show', U, 'base-t1')).stdout).toContain('STATUS: IN_PROGRESS');
    expect((await unit(sb, 'list')).stdout).toMatch(/^ {2}next: base-t1 \(IN_PROGRESS\)$/m);
    await must(unit(sb, 'task', 'update', U, 'base-t1', '--desc=two words'));
    await must(unit(sb, 'task', 'complete', U, 'base-t1', '--evidence=the smoke passed'));
    await must(unit(sb, 'task', 'drop', U, 'base-t2', '--reason=not needed'));
    expect((await unit(sb, 'task', 'list', U, '--status=all')).stdout).toBe('  [DONE] base-t1: the base-only task\n');
  });

  it('[the-record-r4] journal and knowledge: the closer closes its target, and the active findings read the successor alone', async () => {
    const sb = fresh(await snap('written'));
    const closure = await unit(sb, 'entry', 'closure', U, S1);
    expect(closure.code).toBe(0);
    expect(closure.stdout).toContain('closed by the smoke');
    const active = (await unit(sb, 'finding', 'list', U, '--active-only')).stdout;
    expect(active).toContain('BASE_NEW');
    expect(active).not.toContain('BASE_OLD');
  });

  it('[the-record-r15] lane: show reads the journal and the report, and resolve reads the claim', async () => {
    const sb = fresh(await snap('written'));
    expect((await lane(sb, 'show', U, 'base-lane', 'journal')).stdout).toContain('a lane event');
    expect((await lane(sb, 'show', U, 'base-lane', 'report')).stdout).toContain('@claim probe-claim');
    const claim = await unit(sb, 'resolve', U, 'lane#base-lane/report#probe-claim');
    expect(claim.code).toBe(0);
    expect(claim.stdout).toMatch(/^@claim probe-claim/m);
  });

  it('[the-record-r13] the reads: board, load to its complete page, audit, the exact search, the snippet quote pair, resolve, and the fold plan', async () => {
    const sb = fresh(await snap('written'));
    expect((await unit(sb, 'board', U)).code).toBe(0);
    let pages = '';
    for (let p = 1; p <= 40 && !/load complete/i.test(pages); p++) pages += (await unit(sb, 'load', U, String(p))).stdout;
    expect(pages).toMatch(/load complete/i);
    expect((await unit(sb, 'audit', U)).code).toBe(0);
    const modeless = await unit(sb, 'search', U, 'probe');
    expect(modeless.code).toBe(1);
    expect(modeless.stderr).toContain('exact');
    const found = await unit(sb, 'search', U, 'base-only task', '--mode=exact');
    expect(found.code).toBe(0);
    expect(found.stdout).toContain('base-t1');
    const snippet = (await unit(sb, 'search', U, 'the base-only probe unit', '--mode=exact', '--json')).stdout;
    expect(snippet).toContain('"snippet":"objective: \\"the base-only probe unit\\""');
    expect(snippet).not.toContain('the base-only probe unit","score"');
    for (const [ref, head] of [['task#base-t1', /^@task base-t1/m], [`entry#${S1}`, /the first probe entry/], ['finding#BASE_NEW', /^@finding BASE_NEW/m]] as const) {
      const r = await unit(sb, 'resolve', U, ref);
      expect(r.code, ref).toBe(0);
      expect(r.stdout).toMatch(head);
    }
    expect((await unit(sb, 'fold', U)).code).toBe(0);
  });

  it('[the-record-r11, the-record-r21] stamp, refresh, close, the closed refusal, reopen, and a write after reopen', async () => {
    const sb = fresh(await snap('written'));
    await must(unit(sb, 'stamp', U));
    await must(unit(sb, 'refresh', U));
    await must(unit(sb, 'close', U));
    expect((await unit(sb, 'record', U, '--what=a write into a closed unit')).code).toBe(1);
    await must(unit(sb, 'reopen', U));
    await must(unit(sb, 'record', U, '--what=the unit writes again'));
  });
});
