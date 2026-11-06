import { describe, expect, it } from 'vitest';
import { stage } from '../support/stage';
import { must, run, seedUnit, unit } from '../support/unit';
import { batch, D, foldUnit, laneOf, SHAPES } from './fold-fixture';

const check = (sb: string, u: string) => unit(sb, 'fold', u, '--check');
const slugs = (u: string, ...n: number[]): string[] => n.map((i) => `${D}-${u}-${i}`);

async function red(sb: string, u: string, code: string): Promise<string> {
  const r = await check(sb, u);
  expect(r.code).toBe(1);
  expect(r.stdout + r.stderr).toContain(code);
  return r.stdout + r.stderr;
}

async function clean(sb: string, u: string): Promise<string> {
  const r = await check(sb, u);
  expect(r.code).toBe(0);
  expect(r.stdout).toContain('fold check: clean');
  return r.stdout;
}

const fresh = (label: string): string => stage('posix', `fold-${label}`);

describe.concurrent('ctx unit fold --check: every defect class named and red, every repair clean', () => {
  it('FC9: UNREFERENCED_CLOSER, a folded closer whose target the batch never refs', async () => {
    const sb = fresh('unref');
    await foldUnit(sb, 'fc-unref', SHAPES.two);
    await must(unit(sb, 'record', 'fc-unref', '--what=batch', `--ref=journal#${D}-fc-unref-1`, ...slugs('fc-unref', 1, 2).map((s) => `--closes=${s} (folded: consolidated)`)));
    await red(sb, 'fc-unref', 'UNREFERENCED_CLOSER');
  });

  it('FC9: CLOSER_NOT_FOLDED, a batch closer without the folded verdict', async () => {
    const sb = fresh('notfolded');
    await foldUnit(sb, 'fc-notfolded', SHAPES.one);
    await must(unit(sb, 'record', 'fc-notfolded', '--what=batch', `--ref=journal#${D}-fc-notfolded-1`, `--closes=${D}-fc-notfolded-1 (done: not folded)`));
    await red(sb, 'fc-notfolded', 'CLOSER_NOT_FOLDED');
  });

  it('FC9: TARGET_OUTSIDE_SCOPE, a batch folding an entry written after the plan', async () => {
    const sb = fresh('outside');
    await foldUnit(sb, 'fc-outside', SHAPES.one);
    await must(unit(sb, 'record', 'fc-outside', '--what=outside', `--slug=${D}-fc-outside-2`));
    await batch(sb, 'fc-outside', 'batch', [1, 2]);
    await red(sb, 'fc-outside', 'TARGET_OUTSIDE_SCOPE');
  });

  it('FC9: BATCH_PARTIAL_CHUNK, a batch folding part of a chunk, its other constituent SCOPED_LIVE', async () => {
    const sb = fresh('partial');
    await foldUnit(sb, 'fc-partial', SHAPES.two);
    await batch(sb, 'fc-partial', 'batch', [1]);
    expect(await red(sb, 'fc-partial', 'BATCH_PARTIAL_CHUNK')).toContain('SCOPED_LIVE');
  });

  it('FC9: BATCH_NOT_CONSECUTIVE, a batch skipping the chunks between its own', async () => {
    const sb = fresh('noncon');
    await foldUnit(sb, 'fc-noncon', ['e1', 'backlog/a: DONE x', 'e2', 'DECIDE x', 'e3']);
    await batch(sb, 'fc-noncon', 'batch', [1, 5]);
    await red(sb, 'fc-noncon', 'BATCH_NOT_CONSECUTIVE');
  });

  it('FC9: BATCH_CROSS_LANE, a batch reaching into the next lane', async () => {
    const sb = fresh('cross');
    await foldUnit(sb, 'fc-cross', ['e1', 'backlog/a: DONE x', 'e2', 'e3'], { stampBefore: 4, lanes: [1, 3] });
    await batch(sb, 'fc-cross', 'batch one', [1, 2]);
    await batch(sb, 'fc-cross', 'batch crossing the lane', [3, 4]);
    await red(sb, 'fc-cross', 'BATCH_CROSS_LANE');
  });

  it('FC9: DOUBLE_CONSOLIDATION, two live batches over the same chunk', async () => {
    const sb = fresh('double');
    await foldUnit(sb, 'fc-double', SHAPES.two);
    await batch(sb, 'fc-double', 'batch A', [1, 2]);
    await batch(sb, 'fc-double', 'batch B', [1, 2]);
    await red(sb, 'fc-double', 'DOUBLE_CONSOLIDATION');
  });

  it('FC9: BATCH_OVERLAP, two batches sharing a chunk, which also stops the progress', async () => {
    const sb = fresh('overlap');
    await foldUnit(sb, 'fc-overlap', SHAPES.twoChunks);
    await batch(sb, 'fc-overlap', 'batch A', [1, 2]);
    await batch(sb, 'fc-overlap', 'batch B', [1, 2, 3]);
    await red(sb, 'fc-overlap', 'BATCH_OVERLAP');
    const progress = await unit(sb, 'fold', 'fc-overlap');
    expect(progress.code).toBe(1);
    expect(progress.stdout + progress.stderr).toContain('BATCH_OVERLAP');
  });

  it('FC9: BATCH_GAP, a chunk no batch covers, its entry SCOPED_LIVE', async () => {
    const sb = fresh('gap');
    await foldUnit(sb, 'fc-gap', SHAPES.twoChunks);
    await batch(sb, 'fc-gap', 'batch one', [1, 2]);
    expect(await red(sb, 'fc-gap', 'BATCH_GAP')).toContain('SCOPED_LIVE');
  });

  it('FC9: CONSOLIDATION_NOT_LIVE, a batch superseded without a successor batch', async () => {
    const sb = fresh('notlive');
    await foldUnit(sb, 'fc-notlive', SHAPES.one);
    const a = await batch(sb, 'fc-notlive', 'batch A', [1]);
    await must(unit(sb, 'record', 'fc-notlive', '--what=batch A revised', `--supersedes=${a} (superseded: revised)`));
    await red(sb, 'fc-notlive', 'CONSOLIDATION_NOT_LIVE');
  });

  it('FC9: PLAN_DRIFT, a fold start whose scope no longer matches the live record', async () => {
    const sb = fresh('drift');
    await seedUnit(sb, 'fc-drift', 'fold drift');
    for (const n of [1, 2]) await must(unit(sb, 'record', 'fc-drift', `--what=e${n}`, `--slug=${D}-fc-drift-${n}`));
    const plan = `{"v":4,"unit":"fc-drift","epoch":"1","scope":["${D}-fc-drift-1"],"chunks":[{"id":1,"anchor":"A1","lane":"fold-1-1","kind":"ANCHOR","first":1,"last":1,"from":"${D}-fc-drift-1","to":"${D}-fc-drift-1","count":1}],"lanes":["fold-1-1"]}`;
    await must(unit(sb, 'record', 'fc-drift', `--what=FOLD START v4 fc-drift scope=1 chunks=1 lanes=1 batch=one-or-more-chunks-per-entry :: ${plan}`, '--group=fold', '--thread=none'));
    await red(sb, 'fc-drift', 'PLAN_DRIFT');
  });

  it('FC9: V3_START_LIVE, a live fold start of an older protocol', async () => {
    const sb = fresh('v3');
    await seedUnit(sb, 'fc-v3', 'fold v3');
    await must(unit(sb, 'record', 'fc-v3', '--what=e1', `--slug=${D}-fc-v3-1`));
    await must(unit(sb, 'record', 'fc-v3', '--what=FOLD START v1 fc-v3 scope=1 chunks=1 lanes=1 batch=one-chunk-per-call :: {}', '--group=fold', '--thread=none'));
    await red(sb, 'fc-v3', 'V3_START_LIVE');
  });

  it('FC9: AUDIT_RED, a clean partition over a unit whose audit fails', async () => {
    const sb = fresh('audit');
    await foldUnit(sb, 'fc-audit', SHAPES.one);
    await batch(sb, 'fc-audit', 'batch', [1]);
    await must(unit(sb, 'record', 'fc-audit', '--what=knowledge flag', `--slug=${D}-fc-audit-2`, '--knowledge'));
    await red(sb, 'fc-audit', 'AUDIT_RED');
  });

  it('FC10: the supersession repair closes the prior batch superseded and the new one checks clean', async () => {
    const sb = fresh('repair');
    await foldUnit(sb, 'fc-repair', SHAPES.one);
    const bad = await must(unit(sb, 'record', 'fc-repair', '--what=bad batch', `--ref=journal#${D}-fc-repair-1`, `--closes=${D}-fc-repair-1 (done: not folded)`));
    const badSlug = /^recorded entry: (\S+)/m.exec(bad.stdout + bad.stderr)?.[1] ?? '';
    await batch(sb, 'fc-repair', 'good batch', [1], `--supersedes=${badSlug} (superseded: revised)`);
    await clean(sb, 'fc-repair');
    expect((await unit(sb, 'entry', 'closure', 'fc-repair', badSlug)).stdout).toContain('closed (superseded)');
  });

  it('FC13: a carried open thread stays in the scope, is refed as context, never closed, and survives the finish', async () => {
    const sb = fresh('thread');
    await seedUnit(sb, 'fc-thread', 'fold carried thread');
    await must(unit(sb, 'record', 'fc-thread', '--what=A note before the thread', `--slug=${D}-fc-thread-1`));
    await must(unit(sb, 'record', 'fc-thread', '--what=Open thread: awaiting the human', "--thread=the human's verdict", `--slug=${D}-fc-thread-2`));
    await must(unit(sb, 'record', 'fc-thread', '--what=A note after the thread', `--slug=${D}-fc-thread-3`));
    const planned = await unit(sb, 'fold', 'fc-thread');
    expect(planned.code).toBe(0);
    const plan = planned.stdout + planned.stderr;
    for (const line of ['scope: 3 live entries', 'carried open threads: 1', `${D}-fc-thread-2 [A1]: the human's verdict`]) expect(plan).toContain(line);
    expect(plan).toMatch(new RegExp(`1 {2}\\[A1\\] ANCHOR.*from ${D}-fc-thread-1 to ${D}-fc-thread-3 \\(3 entries\\)`));
    const start = /^fold start: (\S+)/m.exec(plan)?.[1] ?? '';
    const lane = laneOf(plan, 1) ?? '';
    await must(run(sb, ['lane', 'create', 'fc-thread', lane], { input: 'fold thread lane\n' }));
    const fetch = (await must(unit(sb, 'fold', 'fc-thread', `--lane=${lane}`))).stdout;
    for (const line of ["THREAD: the human's verdict", `ref="journal#${D}-fc-thread-2"`, 'NOTE: carried open threads stay live']) expect(fetch).toContain(line);
    expect(fetch).not.toContain(`closes="${D}-fc-thread-2`);
    const closes = [1, 3].map((n) => `--closes=${D}-fc-thread-${n} (folded: consolidated)`);
    const bad = await must(unit(sb, 'record', 'fc-thread', '--what=Batch one: the notes without the carried ref', '--group=fc', '--thread=none', `--ref=journal#${D}-fc-thread-1`, `--ref=journal#${D}-fc-thread-3`, ...closes));
    const badSlug = /^recorded entry: (\S+)/m.exec(bad.stdout + bad.stderr)?.[1] ?? '';
    await red(sb, 'fc-thread', 'CARRIED_UNREFERENCED');
    await must(unit(sb, 'record', 'fc-thread', '--what=Batch one: the notes and the carried thread', '--group=fc', '--thread=none', ...[1, 2, 3].map((n) => `--ref=journal#${D}-fc-thread-${n}`), ...closes, `--supersedes=${badSlug} (superseded: revised)`));
    const ok = await clean(sb, 'fc-thread');
    for (const line of ['covered: 2 closed receipts', 'carried open threads: 1', 'coverage: 0 uncovered', 'OPEN THREADS (awaiting resolution):']) expect(ok).toContain(line);
    expect((await unit(sb, 'board', 'fc-thread')).stdout).toContain(`@entry ${D}-fc-thread-2`);
    expect((await unit(sb, 'entry', 'show', 'fc-thread', `${D}-fc-thread-2`)).stdout).toContain("THREAD: the human's verdict");
    const finish = await unit(sb, 'fold', 'fc-thread', '--finish');
    expect(finish.code).toBe(0);
    expect(finish.stdout).toMatch(new RegExp(`^FOLD FINISH v4 ${start} batches=1 covered=2 carried=1 open threads :: coverage zero; audit clean`, 'm'));
    expect(finish.stdout).toContain('carried: 1 open threads stay live');
    expect((await unit(sb, 'board', 'fc-thread')).stdout).toContain(`@entry ${D}-fc-thread-2`);
    const audit = await unit(sb, 'audit', 'fc-thread');
    expect(audit.code).toBe(0);
    expect(audit.stdout).toContain('OPEN THREADS (awaiting resolution):');
    expect(audit.stdout).toContain(`${D}-fc-thread-2 (the human's verdict)`);
  });

  it('FC13b: closing a carried open thread in a batch refuses THREAD_CLOSED naming it', async () => {
    const sb = fresh('thread-close');
    await seedUnit(sb, 'fc-thread-close', 'fold thread close');
    await must(unit(sb, 'record', 'fc-thread-close', '--what=A note', `--slug=${D}-fc-thread-close-1`));
    await must(unit(sb, 'record', 'fc-thread-close', '--what=Open thread: awaiting the human', "--thread=the human's verdict", `--slug=${D}-fc-thread-close-2`));
    const plan = (await must(unit(sb, 'fold', 'fc-thread-close'))).stdout;
    await must(run(sb, ['lane', 'create', 'fc-thread-close', laneOf(plan, 1) ?? ''], { input: 'fold thread close lane\n' }));
    await batch(sb, 'fc-thread-close', 'Bad batch: closes the open thread', [1, 2], '--group=fc', '--thread=none');
    expect(await red(sb, 'fc-thread-close', 'THREAD_CLOSED')).toContain(`${D}-fc-thread-close-2`);
  });

  it('FC15: a two-chunk batch refuses MERGE_REASON_MISSING without its marker and checks clean with one', async () => {
    const sb = fresh('merge');
    await foldUnit(sb, 'fc-merge', ['e1', 'backlog/a: DONE x', 'e2', 'DECIDE x', 'e3', 'DECIDE y']);
    const bad = await batch(sb, 'fc-merge', 'Batch one: the two chunks merged', [1, 2, 3, 4], '--thread=none');
    await red(sb, 'fc-merge', 'MERGE_REASON_MISSING');
    await batch(sb, 'fc-merge', 'Batch one: the two chunks merged (merged: same topic)', [1, 2, 3, 4], '--thread=none', `--supersedes=${bad} (superseded: revised)`);
    await batch(sb, 'fc-merge', 'Batch two: the third chunk', [5, 6], '--thread=none');
    await clean(sb, 'fc-merge');
  });

  it('FC16: a batch of 13 constituents refuses CONSTITUENT_CAP', async () => {
    const sb = fresh('cap');
    await foldUnit(sb, 'fc-cap', Array.from({ length: 13 }, (_, i) => `e${i + 1}`));
    await batch(sb, 'fc-cap', 'Batch one: thirteen notes', Array.from({ length: 13 }, (_, i) => i + 1), '--thread=none');
    await red(sb, 'fc-cap', 'CONSTITUENT_CAP');
  });

  it('FC17: one batch for every chunk of an anchor refuses WHOLE_ANCHOR_BATCH; split batches check clean', async () => {
    const sb = fresh('anchor');
    await foldUnit(sb, 'fc-anchor', SHAPES.twoChunks);
    const whole = await batch(sb, 'fc-anchor', 'Batch one: the whole anchor', [1, 2, 3], '--thread=none');
    await red(sb, 'fc-anchor', 'WHOLE_ANCHOR_BATCH');
    await batch(sb, 'fc-anchor', 'Batch one: the first chunk', [1, 2], '--thread=none');
    await batch(sb, 'fc-anchor', 'Batch two: the second chunk', [3], '--thread=none', `--supersedes=${whole} (superseded: split)`);
    await clean(sb, 'fc-anchor');
  });
});
