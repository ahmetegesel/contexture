import { appendFileSync, mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, RECORD_ROOT } from '../support/drawer';
import { exec } from '../support/exec';
import { fresh, seed } from '../support/snapshot';
import { createLane, must, run, unit } from '../support/unit';
import { laneOf } from './fold-fixture';

const D = '2026-09-27';
const WARNING = 'WARNING: the record was read from its deprecated root; each unit moves at its next write, and ctx unit migrate --all moves the rest when the human chooses\n';

const ROWS: readonly [string[], string | RegExp][] = [
  [['unit', 'load', 'lg', '9'], /^ERROR: page out of range: 9 \(1-\d+\)\n$/],
  [['unit', 'load', 'refs', 'lg', '9'], /^ERROR: page out of range: 9 \(1-\d+\)\n$/],
  [['unit', 'load', 'refs', 'nosuch'], 'ERROR: no such unit: nosuch\n'],
  [['unit', 'task', 'show', 'lg', 'nosuch'], "task.get: error: task 'nosuch' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n"],
  [['unit', 'task', 'start', 'lg', 'lg-done'], "task.start: error: task 'lg-done' is DONE; task.start moves only from TODO (ERR_INVALID_TRANSITION)\n"],
  [['unit', 'task', 'list', 'lg', '--status=bogus'], "task list: error: unknown status 'bogus' (todo, progress, done, all) (ERR_INVALID_ARGUMENT)\n"],
  [['unit', 'finding', 'show', 'lg', 'NOSUCH'], "finding.get: error: finding 'NOSUCH' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n"],
  [['unit', 'entry', 'show', 'lg', `${D}-nosuch`], `entry.get: error: entry '${D}-nosuch' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n`],
  [['unit', 'entry', 'closure', 'lg', `${D}-nosuch`], `entry.closure: error: entry '${D}-nosuch' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n`],
  [['unit', 'resolve', 'lg', 'task#nosuch'], "resolve: error: reference 'task#nosuch' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n"],
  [['unit', 'resolve', 'lg', 'lane#ll/report#NOPE'], "resolve: error: reference 'lane#ll/report#NOPE' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n"],
  [['unit', 'resolve', 'lg', 'lane#ll/report#NOPE', '--json'], "resolve: error: reference 'lane#ll/report#NOPE' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n"],
  [['unit', 'resolve', 'lg', 'lane#le/report'], "resolve: error: reference 'lane#le/report' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n"],
  [['unit', 'resolve', 'lg', 'lane#nosuch/recipe'], "resolve: error: reference 'lane#nosuch/recipe' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n"],
  [['unit', 'refs-to', 'lg'], 'ERROR: no unit references lg\n'],
  [['unit', 'refs', 'lg', 'nosuch'], 'ERROR: no such unit: nosuch\n'],
  [['unit', 'list', '--repo=nosuch'], 'ERROR: no unit touches repo: nosuch (known: r1)\n'],
  [['unit', 'list', '--all', '--repo=nosuch'], 'ERROR: no unit touches repo: nosuch (known: r1)\n'],
  [['unit', 'search', 'lg', 'zzz', '--mode=nosuch'], "search.query: error: mode 'nosuch' is not supported; declared modes: exact (ERR_CAPABILITY_UNSUPPORTED)\n"],
  [['unit', 'fold', 'lg', '--check'], "fold: error: no active fold for unit 'lg'; run 'ctx unit fold lg' without --lane to plan (ERR_INVALID_ARGUMENT)\n"],
  [['unit', 'reopen', 'lg'], "session.reopen: error: unit 'lg' is ACTIVE; session.reopen moves only from CLOSED (ERR_INVALID_TRANSITION)\n"],
  [['unit', 'record', 'lg', '--what=x', `--closes=${D}-nosuch (done: x)`], `entry.record: error: entry '${D}-nosuch' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n`],
  [['lane', 'show', 'lg', 'nosuch-lane', 'report'], "lane.get: error: lane 'nosuch-lane' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n"],
  [['lane', 'record', 'lg', 'nosuch-lane', '--what=x'], "lane.record: error: lane 'nosuch-lane' not found in unit 'lg' (ERR_ENTITY_NOT_FOUND)\n"],
];

describe.concurrent('the refusal order over a unit in the deprecated root: a refusing run prints its refusal alone, a rc 0 run its one warning after the answer', () => {
  let snap: string;
  let foldLane = '';
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      await must(unit(sb, 'bootstrap', 'lg', 'the legacy unit', 'r1'));
      await must(unit(sb, 'task', 'add', 'lg', 'lg-done', '--objective=a done task'));
      await must(unit(sb, 'task', 'complete', 'lg', 'lg-done', '--evidence=done'));
      await must(unit(sb, 'finding', 'add', 'lg', 'F_ONE', '--summary=one'));
      await must(unit(sb, 'record', 'lg', '--what=an entry', `--slug=${D}-lg-e1`));
      await must(createLane(sb, 'lg', 'll'));
      await must(run(sb, ['lane', 'report', 'lg', 'll'], { input: '@report ll\nVERDICT: done\nFINDINGS ::\n  F1\n' }));
      await must(createLane(sb, 'lg', 'le'));
      await must(unit(sb, 'bootstrap', 'fg', 'the legacy unit a fold plan holds'));
      for (const n of [1, 2, 3, 4]) await must(unit(sb, 'record', 'fg', `--what=fold note ${n}`, `--slug=${D}-fg-${n}`));
      foldLane = laneOf((await must(unit(sb, 'fold', 'fg'))).stdout, 1) ?? '';
      mkdirSync(join(sb, FALLBACK_ROOT), { recursive: true });
      for (const u of ['lg', 'fg']) renameSync(join(sb, RECORD_ROOT, u), join(sb, FALLBACK_ROOT, u));
    }, 'posix', 'refusal-order');
  });

  it.for(ROWS.map(([argv, line]) => [argv.join(' '), argv, line] as const))('[the-record-r-4gj4k] ctx %s refuses rc 1 with its refusal line alone, no warning', async ([, argv, line]) => {
    const r = await run(fresh(snap), argv);
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).not.toContain('WARNING');
    if (typeof line === 'string') expect(r.stderr).toBe(line);
    else expect(r.stderr).toMatch(line);
  });

  it('[the-record-r-4gj4k] ctx unit refresh over the same unit, its audit failing on a planted entry without THREAD, ends rc 1 with no warning', async () => {
    const sb = fresh(snap);
    appendFileSync(join(sb, FALLBACK_ROOT, 'lg', 'journal.md'), `\n@entry 2026-10-01-lg-bad\n  ANCHOR: A1\n  WHAT: "an entry with no thread"\n`);
    const r = await run(sb, ['unit', 'refresh', 'lg']);
    expect([r.code, r.stderr]).toEqual([1, '']);
    expect(r.stdout).toContain('2026-10-01-lg-bad');
  });

  it('[the-record-r-4gj4k] ctx unit fold --check over a unit in the deprecated root whose fresh plan holds no batch ends rc 1 with no warning', async () => {
    const r = await run(fresh(snap), ['unit', 'fold', 'fg', '--check']);
    expect([r.code, r.stderr]).toEqual([1, '']);
    expect(r.stdout).toContain('fold check: fg');
  });

  it.for(
    [
      ['unit', 'load', 'lg'],
      ['unit', 'board', 'lg'],
      ['unit', 'refresh', 'lg'],
      ['unit', 'resolve', 'lg', 'lane#ll/report#FINDINGS'],
      ['unit', 'list', '--all', '--repo=r1'],
      ['lane', 'show', 'lg', 'll', 'report'],
      ['unit', 'fold', 'fg'],
      ['unit', 'fold', 'fg', '--lane=<lane>'],
    ].map((argv) => [argv.join(' '), argv] as const),
  )('[the-record-r-4gj4k] ctx %s over a unit in the deprecated root answers rc 0 and prints the warning once, after its answer', async ([, given]) => {
    const sb = fresh(snap);
    const argv = given.map((a) => a.replace('<lane>', foldLane));
    expect(foldLane).not.toBe('');
    const r = await run(sb, argv);
    expect([r.code, r.stderr]).toEqual([0, WARNING]);
    expect(r.stdout.length).toBeGreaterThan(0);
    const merged = await exec('sh', ['-c', './.contexture/ctx "$@" 2>&1', 'sh', ...argv], { cwd: sb });
    expect(merged.stdout).toBe(r.stdout + WARNING);
  });
});
