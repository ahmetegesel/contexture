import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { activeBlocks, must, plantArtifact, run, seedUnit, unit } from '../support/unit';

const STATE = (objective: string, extra = ''): string => `status: ACTIVE\ncurrent_anchor: A1\n${extra}objective: "${objective}"\nrepos: []\nref_sessions: []\n`;

describe.concurrent('ctx unit active: the derived view', () => {
  let dp: string;
  beforeAll(async () => {
    dp = await seed(async (sb) => {
      await seedUnit(sb, 'dp-unit', 'derived pointer unit');
      for (const [slug, objective] of [['dp-todo', 'a todo task'], ['dp-active', 'the active task'], ['dp-done', 'a done task']]) await must(unit(sb, 'task', 'add', 'dp-unit', slug!, `--objective=${objective}`));
      await must(unit(sb, 'task', 'start', 'dp-unit', 'dp-active'));
      await must(unit(sb, 'task', 'complete', 'dp-unit', 'dp-done', '--evidence=done for the fixture'));
      await must(unit(sb, 'task', 'add', 'dp-unit', 'dp-second', '--objective=a second active task'));
      await must(unit(sb, 'task', 'start', 'dp-unit', 'dp-second'));
      await must(unit(sb, 'record', 'dp-unit', '--what=an open question', "--thread=the human's answer", '--slug=2026-09-27-dp-open'));
      await must(unit(sb, 'record', 'dp-unit', '--what=a resolved question', '--thread=a lane report', '--slug=2026-09-27-dp-resolved'));
      await must(unit(sb, 'record', 'dp-unit', '--what=the answer', '--thread=none', '--closes=2026-09-27-dp-resolved (done: answered)'));
    }, 'posix', 'active-dp');
  });

  it('V-e: active on an empty drawer answers rc 0 with no sessions yet', async () => {
    const r = await unit(stage('posix', 'active-empty'), 'active');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('no sessions yet');
  });

  it('R-g: active refuses an argument rc 1', async () => {
    expect((await unit(stage('posix', 'active-arg'), 'active', 'extra')).code).toBe(1);
  });

  it('S1-c [the-record-r1]: active lists bytewise by unit name and prints no last_event or thread count', async () => {
    const sb = stage('posix', 'active-order');
    await seedUnit(sb, 'a80-null', 'recency null unit');
    await seedUnit(sb, 'a80-entry', 'recency entry unit');
    await must(unit(sb, 'record', 'a80-entry', '--what=a dated entry', '--slug=2026-09-27-a80-entry'));
    await seedUnit(sb, 'a80-tie-b', 'recency tie b');
    await must(unit(sb, 'record', 'a80-tie-b', '--what=a tied entry', '--slug=2026-09-27-a80-tie-b'));
    await seedUnit(sb, 'a80-tie-a', 'recency tie a');
    await must(unit(sb, 'record', 'a80-tie-a', '--what=a tied entry', '--slug=2026-09-27-a80-tie-a'));
    await seedUnit(sb, 'a80-stamp', 'recency stamp unit');
    await must(unit(sb, 'record', 'a80-stamp', '--what=the entry before the stamp', '--slug=2026-09-27-a80-stamp-e'));
    expect((await data(sb, 'session.stamp', ['a80-stamp'], 'date=2026-09-28\n')).code).toBe(0);
    const out = (await unit(sb, 'active')).stdout;
    expect(out).not.toContain('last_event:');
    expect(out).not.toContain('threads:');
    expect(activeBlocks(out)['a80-entry']!.split('\n').filter(Boolean).at(-1)).toBe('  objective: "recency entry unit"');
    expect(out.split('\n').filter((l) => /^a80-(stamp|entry|tie-a|tie-b|null)$/.test(l))).toEqual(['a80-entry', 'a80-null', 'a80-stamp', 'a80-tie-a', 'a80-tie-b']);
  });

  it('DP [the-record-r1]: the move is the first IN_PROGRESS task; no second one, no thread count, no stored pointer', async () => {
    const sb = fresh(dp);
    const out = (await unit(sb, 'active')).stdout;
    expect(out.split('\n').filter((l) => l === 'dp-unit')).toHaveLength(1);
    expect(out).toMatch(/^ {2}next: dp-active \(IN_PROGRESS\)$/m);
    expect(out).not.toContain('threads:');
    expect(out).not.toContain('dp-second');
    expect(out).not.toContain('next_action');
    expect((await unit(sb, 'load', 'dp-unit', '1')).stdout).not.toContain('next_action');
  });

  it('DP [the-record-r1]: the no-work forms read in the unit block itself (empty backlog, TODO, all DONE), and stamp stays backlog-free', async () => {
    const sb = stage('posix', 'active-nowork');
    await seedUnit(sb, 'dp-decoy', 'another empty backlog unit');
    const block = async (): Promise<string | undefined> => activeBlocks((await unit(sb, 'active')).stdout)['dp-empty'];
    expect(await block()).toBeUndefined();
    await seedUnit(sb, 'dp-empty', 'empty backlog unit');
    expect(await block()).toMatch(/^ {2}next: none \(empty backlog\)$/m);
    await must(unit(sb, 'task', 'add', 'dp-empty', 'dp-first', '--objective=the first task'));
    expect(await block()).toMatch(/^ {2}next: dp-first \(TODO\)$/m);
    await must(unit(sb, 'task', 'complete', 'dp-empty', 'dp-first', '--evidence=the only task'));
    expect(await block()).toMatch(/^ {2}next: none \(no open task\)$/m);
    expect((await unit(sb, 'stamp', 'dp-decoy')).code).toBe(0);
    expect((await unit(sb, 'stamp', 'dp-empty')).code).toBe(0);
  });

  it('DP [the-record-r1, the-record-r14]: an ACTIVE unit without a backlog warns and reads its none form (posix plant)', async () => {
    const sb = stage('posix', 'active-nobacklog');
    plantArtifact(sb, 'dp-missing', 'state', STATE('missing backlog unit'));
    const r = await run(sb, ['unit', 'active']);
    expect(r.stderr).toMatch(/^WARNING: missing backlog: unit dp-missing$/m);
    expect(activeBlocks(r.stdout)['dp-missing']).toMatch(/^ {2}next: none \(no backlog\)$/m);
  });

  it('DP [the-record-r1]: a legacy next_action is ignored by active and erased by the next state write (posix plant)', async () => {
    const sb = stage('posix', 'active-legacy');
    await seedUnit(sb, 'dp-legacy', 'legacy pointer unit');
    await must(unit(sb, 'task', 'add', 'dp-legacy', 'dp-legacy-task', '--objective=the derived task'));
    plantArtifact(sb, 'dp-legacy', 'state', STATE('legacy pointer unit', 'next_action: "the stale stored pointer"\n'));
    const out = (await unit(sb, 'active')).stdout;
    expect(out).toMatch(/^ {2}next: dp-legacy-task \(TODO\)$/m);
    expect(out).not.toContain('stale stored pointer');
    await must(unit(sb, 'refs', 'dp-legacy'));
    expect(readFileSync(artifactPath(sb, 'dp-legacy', 'state'), 'utf8')).not.toMatch(/^next_action:/m);
  });

  it('DP [the-record-r1, the-record-r11]: an unknown task status is the first open task, printed as stored (posix plant)', async () => {
    const sb = stage('posix', 'active-unknown');
    plantArtifact(sb, 'dp-unknown', 'state', STATE('unknown status unit'));
    plantArtifact(sb, 'dp-unknown', 'backlog', '@task dp-unknown-task\n  STATUS: progress\n  OBJECTIVE: "an unknown status task"\n\n@task dp-after-unknown\n  STATUS: TODO\n  OBJECTIVE: "a todo after the unknown"\n');
    expect((await unit(sb, 'active')).stdout).toMatch(/^ {2}next: dp-unknown-task \(progress\)$/m);
  });
});
