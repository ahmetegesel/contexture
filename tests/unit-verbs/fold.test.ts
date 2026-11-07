import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { run, seedUnit, unit } from '../support/unit';
import { batch, D, foldUnit, laneOf } from './fold-fixture';

describe.concurrent('ctx unit fold: the surface, the handoff, and the input rules', () => {
  let empty: string;
  beforeAll(async () => {
    empty = await seed((sb) => seedUnit(sb, 'fc-empty', 'empty fold unit'), 'posix', 'fold-empty');
  });

  it('FC1 [the-engine-r7]: fold with no argument prints the usage rc 1; --help, -h, and help print the lane manual rc 0', async () => {
    const sb = fresh(empty);
    const bare = await unit(sb, 'fold');
    expect(bare.code).toBe(1);
    expect(bare.stdout + bare.stderr).toMatch(/^usage: ctx unit fold <unit>/m);
    for (const h of ['--help', '-h', 'help']) expect((await unit(sb, 'fold', h)).code).toBe(0);
    const help = (await unit(sb, 'fold', '--help')).stdout;
    for (const line of ['# Consolidation fold lane', 'one ordinary journal entry', 'ctx run .contexture/ctx unit record', 'thread=none', 'supersedes=', 'no digest', 'Every step through the runner']) expect(help).toContain(line);
    expect(help).not.toContain('CHAPTER FOLD: <Title>');
    const table = (await unit(sb, 'help', 'fold')).stdout;
    expect(table).toContain("prints the plan (the carried open threads included), the first lane's ctx lane create command and its manual, and the first act");
  });

  it('FC1: fold refuses a malformed or absent unit, a lane call with no active fold, a payload, a NUL payload, and an unknown option', async () => {
    const sb = fresh(empty);
    expect((await unit(sb, 'fold', 'bad slug!')).code).toBe(1);
    expect((await unit(sb, 'fold', 'no-such-unit')).code).toBe(1);
    const lane = await unit(sb, 'fold', 'fc-empty', '--lane=fold-x');
    expect(lane.code).toBe(1);
    expect(lane.stderr).toContain('no active fold');
    expect((await run(sb, ['unit', 'fold', 'fc-empty'], { input: 'x\n' })).code).toBe(1);
    expect((await run(sb, ['unit', 'fold', 'fc-empty'], { input: Buffer.from('a\0b\n') })).code).toBe(1);
    expect((await unit(sb, 'fold', 'fc-empty', '--bogus')).code).toBe(1);
  });

  it('FC1: an empty unit has nothing to fold rc 0', async () => {
    const r = await unit(fresh(empty), 'fold', 'fc-empty');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('holds no live entries');
  });

  it('FC11: a 2000-byte one-line WHAT round-trips and the check stays clean', async () => {
    const sb = stage('posix', 'fold-long');
    await foldUnit(sb, 'fc-long', ['e1']);
    const long = 'x'.repeat(2000);
    const slug = await batch(sb, 'fc-long', long, [1]);
    expect(slug).toMatch(/^\d{4}-\d{2}-\d{2}-event-/);
    const what = (await unit(sb, 'entry', 'show', 'fc-long', slug)).stdout.split('\n').find((l) => l.startsWith('  WHAT: '));
    expect(what).toBe(`  WHAT: "${long}"`);
    const check = await unit(sb, 'fold', 'fc-long', '--check');
    expect(check.code).toBe(0);
    expect(check.stdout).toContain('fold check: clean');
  });

  it('FC12 [the-record-r12]: a carriage return in a WHAT or a closer refuses rc 1', async () => {
    const sb = fresh(empty);
    expect((await unit(sb, 'record', 'fc-empty', '--what=a\rb')).code).toBe(1);
    expect((await unit(sb, 'record', 'fc-empty', `--closes=${D}-fc-long-1 (folded: \rbad)`)).code).toBe(1);
  });

  it('FC18: on a fresh plan with no batch the progress view answers rc 0 and the check rc 1, each with an empty stderr', async () => {
    const sb = stage('posix', 'fold-fresh');
    await foldUnit(sb, 'fc-fresh', ['e1', 'e2', 'e3', 'e4'], { lanes: [] });
    const progress = await unit(sb, 'fold', 'fc-fresh');
    const check = await unit(sb, 'fold', 'fc-fresh', '--check');
    expect([progress.code, progress.stderr, check.code, check.stderr]).toEqual([0, '', 1, '']);
  });

  it('FC14: the fetch hands one chunk at a time; a single-chunk lane has no merge partner; the one batch checks clean', async () => {
    const sb = stage('posix', 'fold-one');
    const plan = await foldUnit(sb, 'fc-one', ['e1', 'e2']);
    const lane = laneOf(plan, 1) ?? '';
    const fetch = await unit(sb, 'fold', 'fc-one', `--lane=${lane}`);
    expect(fetch.code).toBe(0);
    expect(fetch.stdout).toContain('The fetch hands one chunk at a time');
    expect(fetch.stdout).not.toContain('REMAINING ENTRIES');
    const merge = await unit(sb, 'fold', 'fc-one', `--lane=${lane}`, '--merge');
    expect(merge.code).toBe(0);
    expect(merge.stdout).toContain('MERGE: no following unclosed chunk in this lane');
    await batch(sb, 'fc-one', 'Batch one: the two notes', [1, 2], '--thread=none');
    const check = await unit(sb, 'fold', 'fc-one', '--check');
    expect(check.code).toBe(0);
    expect(check.stdout).toContain('fold check: clean');
  });
});

