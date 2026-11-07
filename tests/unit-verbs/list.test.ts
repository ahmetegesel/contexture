import { mkdirSync, readFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { FALLBACK_ROOT, RECORD_ROOT } from '../support/drawer';
import { exec } from '../support/exec';
import { artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { activeBlocks, must, plantArtifact, run, seedUnit, unit } from '../support/unit';

const STATE = (objective: string, extra = ''): string => `status: ACTIVE\ncurrent_anchor: A1\n${extra}objective: "${objective}"\nrepos: []\nref_sessions: []\n`;
const USAGE = 'Usage: ctx unit list [--active|--all] [--repo=<repo>]\nhelp: ctx unit help\n';
const WARNING = 'WARNING: the record was read from its deprecated root; each unit moves at its next write, and ctx unit migrate --all moves the rest when the human chooses\n';

function toFallback(sb: string, slug: string): void {
  mkdirSync(join(sb, FALLBACK_ROOT), { recursive: true });
  renameSync(join(sb, RECORD_ROOT, slug), join(sb, FALLBACK_ROOT, slug));
}

describe.concurrent('ctx unit list: the derived view', () => {
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

  it('V-e: list on an empty drawer answers rc 0 with no units yet', async () => {
    const r = await unit(stage('posix', 'active-empty'), 'list');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('no units yet');
  });

  it('R-g: list refuses an argument rc 1', async () => {
    expect((await unit(stage('posix', 'active-arg'), 'list', 'extra')).code).toBe(1);
  });

  it('S1-c [the-record-r1]: list lists bytewise by unit name and prints no last_event or thread count', async () => {
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
    const out = (await unit(sb, 'list')).stdout;
    expect(out).not.toContain('last_event:');
    expect(out).not.toContain('threads:');
    expect(activeBlocks(out)['a80-entry']!.split('\n').filter(Boolean).at(-1)).toBe('  objective: "recency entry unit"');
    expect(out.split('\n').filter((l) => /^a80-(stamp|entry|tie-a|tie-b|null)$/.test(l))).toEqual(['a80-entry', 'a80-null', 'a80-stamp', 'a80-tie-a', 'a80-tie-b']);
  });

  it('DP [the-record-r1]: the move is the first IN_PROGRESS task; no second one, no thread count, no stored pointer', async () => {
    const sb = fresh(dp);
    const out = (await unit(sb, 'list')).stdout;
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
    const block = async (): Promise<string | undefined> => activeBlocks((await unit(sb, 'list')).stdout)['dp-empty'];
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
    const r = await run(sb, ['unit', 'list']);
    expect(r.stderr).toMatch(/^WARNING: missing backlog: unit dp-missing$/m);
    expect(activeBlocks(r.stdout)['dp-missing']).toMatch(/^ {2}next: none \(no backlog\)$/m);
  });

  it('DP [the-record-r1]: a legacy next_action is ignored by list and erased by the next state write (posix plant)', async () => {
    const sb = stage('posix', 'active-legacy');
    await seedUnit(sb, 'dp-legacy', 'legacy pointer unit');
    await must(unit(sb, 'task', 'add', 'dp-legacy', 'dp-legacy-task', '--objective=the derived task'));
    plantArtifact(sb, 'dp-legacy', 'state', STATE('legacy pointer unit', 'next_action: "the stale stored pointer"\n'));
    const out = (await unit(sb, 'list')).stdout;
    expect(out).toMatch(/^ {2}next: dp-legacy-task \(TODO\)$/m);
    expect(out).not.toContain('stale stored pointer');
    await must(unit(sb, 'refs', 'dp-legacy'));
    expect(readFileSync(artifactPath(sb, 'dp-legacy', 'state'), 'utf8')).not.toMatch(/^next_action:/m);
  });

  it('DP [the-record-r1, the-record-r11]: an unknown task status is the first open task, printed as stored (posix plant)', async () => {
    const sb = stage('posix', 'active-unknown');
    plantArtifact(sb, 'dp-unknown', 'state', STATE('unknown status unit'));
    plantArtifact(sb, 'dp-unknown', 'backlog', '@task dp-unknown-task\n  STATUS: progress\n  OBJECTIVE: "an unknown status task"\n\n@task dp-after-unknown\n  STATUS: TODO\n  OBJECTIVE: "a todo after the unknown"\n');
    expect((await unit(sb, 'list')).stdout).toMatch(/^ {2}next: dp-unknown-task \(progress\)$/m);
  });
});

describe.concurrent('ctx unit list: the forms, the repo filter, the refusals, and the retired verbs', () => {
  let snap: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      await must(unit(sb, 'bootstrap', 'l-a', 'the active unit touching r', 'r, l-other'));
      await must(unit(sb, 'task', 'add', 'l-a', 'l-a-task', '--objective=the l-a task'));
      await must(unit(sb, 'bootstrap', 'l-b', 'the active unit elsewhere', 'l-other'));
      await must(unit(sb, 'bootstrap', 'l-c', 'the closed unit touching r', 'r'));
      await must(unit(sb, 'close', 'l-c'));
    }, 'posix', 'list-forms');
  });

  const ACTIVE_ALL = 'l-a\n  current_anchor: A1\n  next: l-a-task (TODO)\n  objective: "the active unit touching r"\n\nl-b\n  current_anchor: A1\n  next: none (empty backlog)\n  objective: "the active unit elsewhere"\nclosed: 1\n';

  it('[the-record-r-lst33, the-record-r1] no flag and --active print every ACTIVE unit in the derived view, a blank line between, then the closed count, byte equal', async () => {
    const sb = fresh(snap);
    for (const args of [[], ['--active']]) {
      expect(await unit(sb, 'list', ...args).then((r) => [r.code, r.stdout, r.stderr]), args.join(' ')).toEqual([0, ACTIVE_ALL, '']);
    }
  });

  it('[the-record-r-lst33] --all prints one line per unit, ACTIVE and CLOSED, bytewise, with its status as stored and its anchor, no tail', async () => {
    expect(await unit(fresh(snap), 'list', '--all').then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, 'l-a [ACTIVE] A1\nl-b [ACTIVE] A1\nl-c [CLOSED] A1\n', '']);
  });

  it('[the-record-r-lst33] --repo keeps the units touching the repo in either form, the --active closed count counting the CLOSED ones touching it', async () => {
    const sb = fresh(snap);
    for (const args of [['--all', '--repo=r'], ['--repo=r', '--all']]) {
      expect(await unit(sb, 'list', ...args).then((r) => [r.code, r.stdout, r.stderr]), args.join(' ')).toEqual([0, 'l-a [ACTIVE] A1\nl-c [CLOSED] A1\n', '']);
    }
    const one = 'l-a\n  current_anchor: A1\n  next: l-a-task (TODO)\n  objective: "the active unit touching r"\nclosed: 1\n';
    for (const args of [['--active', '--repo=r'], ['--repo=r']]) {
      expect(await unit(sb, 'list', ...args).then((r) => [r.code, r.stdout, r.stderr]), args.join(' ')).toEqual([0, one, '']);
    }
    expect(await unit(sb, 'list', '--repo=l-other').then((r) => r.stdout)).toBe(ACTIVE_ALL.replace('closed: 1', 'closed: 0'));
  });

  it('[the-record-r-lst33] a repo no unit touches refuses rc 1, stdout empty, naming the repos the units know, in every form', async () => {
    const sb = fresh(snap);
    for (const args of [['--repo=nosuch'], ['--active', '--repo=nosuch'], ['--all', '--repo=nosuch']]) {
      expect(await unit(sb, 'list', ...args).then((r) => [r.code, r.stdout, r.stderr]), args.join(' ')).toEqual([1, '', 'ERROR: no unit touches repo: nosuch (known: l-other, r)\n']);
    }
  });

  it('[the-record-r-lst33] a store not created yet prints no units yet rc 0 whatever the flags', async () => {
    const sb = stage('posix', 'list-absent');
    for (const args of [[], ['--active'], ['--all'], ['--repo=r'], ['--all', '--repo=r'], ['--active', '--repo=r']]) {
      expect(await unit(sb, 'list', ...args).then((r) => [r.code, r.stdout, r.stderr]), args.join(' ')).toEqual([0, 'no units yet\n', '']);
    }
  });

  it.for([['--active', '--all'], ['--all', '--active'], ['--all', '--all'], ['--active', '--active'], ['--repo=r', '--repo=r'], ['--repo='], ['--repo'], ['--json'], ['--all', '--json'], ['--bogus'], ['extra'], ['--all', 'extra'], ['help']])(
    '[the-record-r-lst33] list %s refuses rc 1 with the usage on stderr',
    async (args) => {
      expect(await unit(fresh(snap), 'list', ...args).then((r) => [r.code, r.stdout, r.stderr])).toEqual([1, '', USAGE]);
    },
  );

  it('[the-record-r-lst33] a malformed repo refuses rc 1 naming it', async () => {
    expect(await unit(fresh(snap), 'list', '--repo=a b').then((r) => [r.code, r.stdout, r.stderr])).toEqual([1, '', "list: error: malformed repo 'a b' (ERR_INVALID_ARGUMENT)\n"]);
  });

  it('[the-record-r-lst33, the-record-r-4gj4k] over a unit in the deprecated root a refusing run prints its refusal alone, and a rc 0 run its one warning after the answer', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'l-b');
    const miss = await unit(sb, 'list', '--repo=nosuch');
    expect([miss.code, miss.stdout, miss.stderr]).toEqual([1, '', 'ERROR: no unit touches repo: nosuch (known: l-other, r)\n']);
    for (const args of [[], ['--all'], ['--all', '--repo=l-other']]) {
      const r = await unit(sb, 'list', ...args);
      expect([r.code, r.stderr], args.join(' ')).toEqual([0, WARNING]);
      expect(r.stdout).toMatch(/^l-b/m);
      const merged = await exec('sh', ['-c', `./.contexture/ctx unit list ${args.join(' ')} 2>&1`], { cwd: sb });
      expect(merged.stdout, args.join(' ')).toBe(r.stdout + WARNING);
    }
  });

  it.for(['active', 'units'])('[the-record-r-lst33, the-engine-r5] the retired ctx unit %s refuses rc 1 as an unknown verb, the module help on stderr', async (verb) => {
    const sb = fresh(snap);
    for (const args of [[verb], [verb, 'r']]) {
      const r = await unit(sb, ...args);
      expect([r.code, r.stdout]).toEqual([1, '']);
      expect(r.stderr).toMatch(new RegExp(`^ctx: unknown verb: ${verb}$`, 'm'));
      expect(r.stderr).toMatch(/^ctx unit: the unit module: /m);
    }
  });

  it('[the-record-r-lst33, the-engine-r4] list --help and -h print its help table rc 0, as ctx unit help list does', async () => {
    const sb = fresh(snap);
    const table = await unit(sb, 'help', 'list');
    expect(table.code).toBe(0);
    expect(table.stdout).toMatch(/^ {2}ctx unit list \[--active\|--all\] \[--repo=<repo>\]$/m);
    for (const flag of ['--help', '-h']) expect(await unit(sb, 'list', flag).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, table.stdout, '']);
  });
});
