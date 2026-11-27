import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { createLane, must, unit, unitChecksum } from '../support/unit';

const D = '2026-09-27';
const E1 = `${D}-va-e1`;
const E2 = `${D}-va-e2`;
const USAGE = 'ctx unit transfer <source> <target> [--task=<slug>]... [--finding=<NAME>]... [--entry=<slug>]... [--group=<token>]... [--dry-run]';
const POINTER = /^ {2}pointer unit#va\/entry\/\d{4}-\d{2}-\d{2}-event-\d+(-1)*$/;

async function build(sb: string): Promise<void> {
  for (const [u, o] of [['va', 'the verb source'], ['vb', 'the verb target'], ['vc', 'the outside referrer'], ['vz', 'the closed referrer']]) await must(unit(sb, 'bootstrap', u!, o!));
  await must(unit(sb, 'task', 'add', 'va', 'ta1', '--objective=the moving task'));
  await must(unit(sb, 'task', 'add', 'va', 'ta2', '--objective=the task nobody names'));
  await must(unit(sb, 'finding', 'add', 'va', 'FA', '--summary=the moving finding'));
  await must(unit(sb, 'record', 'va', '--what=the first group entry', `--slug=${E1}`, '--group=gv', '--ref=unit#va/task/ta1'));
  await must(unit(sb, 'record', 'va', '--what=the second group entry', `--slug=${E2}`, '--group=gv'));
  await must(unit(sb, 'record', 'vc', '--what=free text naming unit#va/task/ta1', `--slug=${D}-vc-e1`, '--ref=unit#va/task/ta1'));
  await must(unit(sb, 'task', 'add', 'vc', 'tc1', '--objective=the outside task', '--refs=unit#va/finding/FA'));
  await must(createLane(sb, 'vc', 'lc', ['--task=unit#va/task/ta1']));
  await must(unit(sb, 'record', 'vz', '--what=the closed referrer', `--slug=${D}-vz-e1`, '--ref=unit#va/task/ta1'));
  await must(unit(sb, 'close', 'vz'));
}

const lines = (s: string): string[] => s.split('\n');

describe.concurrent('ctx unit transfer, the verb', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(build, 'posix', 'transfer-verb');
  });

  it('[the-record-r-xfer1] a real run prints the plan, the census, and the outside referrers; a selector given twice, or an entry named by --entry and by its --group, is selected once', async () => {
    const sb = fresh(sb0);
    const r = await unit(sb, 'transfer', 'va', 'vb', '--task=ta1', '--task=ta1', '--finding=FA', `--entry=${E1}`, '--group=gv');
    expect([r.code, r.stderr]).toEqual([0, '']);
    const out = lines(r.stdout);
    expect(out[5]).toMatch(POINTER);
    expect([...out.slice(0, 5), ...out.slice(6)]).toEqual([
      'transfer plan: from va to vb',
      '  task ta1 to unit#vb/task/ta1',
      '  finding FA to unit#vb/finding/FA',
      `  entry ${E1} copied to unit#vb/entry/${E1}`,
      `  entry ${E2} copied to unit#vb/entry/${E2}`,
      '  refs forwarded in place: 2',
      'transferred: 1 tasks, 1 findings, 2 entries from va to vb',
      'outside referrers, listed and never rewritten: 3',
      '  vc task tc1 unit#va/finding/FA',
      `  vc entry ${D}-vc-e1 unit#va/task/ta1`,
      '  vc lane_recipe lc unit#va/task/ta1',
      '',
    ]);
    expect((await unit(sb, 'task', 'show', 'vb', 'ta1')).code).toBe(0);
    expect((await unit(sb, 'task', 'show', 'va', 'ta1')).code).toBe(1);
    expect(lines((await unit(sb, 'entry', 'show', 'vb', E1)).stdout)).toContain('  REF: "unit#vb/task/ta1"');
  });

  it('[the-record-r-xfer1] the outside referrers are listed, never rewritten: the active unit keeps its refs, a CLOSED unit is not read', async () => {
    const sb = fresh(sb0);
    const was = await unitChecksum(sb, 'vc', ['lc']);
    const r = await unit(sb, 'transfer', 'va', 'vb', '--task=ta1');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).not.toContain('vz ');
    expect(await unitChecksum(sb, 'vc', ['lc'])).toBe(was);
    expect(lines((await unit(sb, 'entry', 'show', 'vz', `${D}-vz-e1`)).stdout)).toContain('  REF: "unit#va/task/ta1"');
  });

  it('[the-record-r-xfer1] a move nobody outside names prints that there are no outside referrers', async () => {
    const r = await unit(fresh(sb0), 'transfer', 'va', 'vb', '--task=ta2');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(lines(r.stdout).slice(-3)).toEqual(['transferred: 1 tasks, 0 findings, 0 entries from va to vb', 'outside referrers: none', '']);
  });

  it('[the-record-r-xfer1] --dry-run prints the same plan and outside rows, closes with the dry run line, and writes nothing', async () => {
    const sb = fresh(sb0);
    const was = `${await unitChecksum(sb, 'va')}${await unitChecksum(sb, 'vb')}`;
    const r = await unit(sb, 'transfer', 'va', 'vb', '--task=ta1', '--dry-run');
    expect([r.code, r.stderr]).toEqual([0, '']);
    const out = lines(r.stdout);
    expect(out[2]).toMatch(POINTER);
    expect([...out.slice(0, 2), ...out.slice(3)]).toEqual([
      'transfer plan: from va to vb',
      '  task ta1 to unit#vb/task/ta1',
      '  refs forwarded in place: 1',
      'outside referrers, listed and never rewritten: 2',
      `  vc entry ${D}-vc-e1 unit#va/task/ta1`,
      '  vc lane_recipe lc unit#va/task/ta1',
      'dry run: would transfer 1 tasks, 0 findings, 0 entries from va to vb; nothing written',
      '',
    ]);
    expect(`${await unitChecksum(sb, 'va')}${await unitChecksum(sb, 'vb')}`).toBe(was);
  });

  it('[the-record-r-xfer1] a group selecting no open entry refuses through the data function line', async () => {
    const r = await unit(fresh(sb0), 'transfer', 'va', 'vb', '--group=nosuch');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', "unit.transfer: error: group 'nosuch' selects no open entry in unit 'va' (ERR_ENTITY_NOT_FOUND)\n"]);
  });

  it('[the-record-r-xfer1] a finding NAME with a leading underscore passes the shape check as the finding verb takes it', async () => {
    const r = await unit(fresh(sb0), 'transfer', 'va', 'vb', '--finding=_F');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', "unit.transfer: error: finding '_F' not found in unit 'va' (ERR_ENTITY_NOT_FOUND)\n"]);
  });

  const SHAPES: readonly [string, string[], string][] = [
    ['no selector', ['va', 'vb'], `no selector: name at least one --task, --finding, --entry, or --group; usage: ${USAGE}`],
    ['the same unit twice', ['va', 'va', '--task=ta1'], "the source and the target are the same unit 'va'"],
    ['a malformed source', ['v a', 'vb', '--task=ta1'], "malformed unit 'v a'"],
    ['a malformed target', ['va', 'v/b', '--task=ta1'], "malformed unit 'v/b'"],
    ['a malformed task slug', ['nounit1', 'nounit2', '--task=bad slug'], "malformed task slug 'bad slug'"],
    ['an empty task slug', ['va', 'vb', '--task='], "malformed task slug ''"],
    ['a malformed entry slug', ['va', 'vb', '--entry=-x'], "malformed entry slug '-x'"],
    ['a malformed group', ['va', 'vb', '--group=g.x'], "malformed group 'g.x'"],
    ['a malformed finding NAME', ['va', 'vb', '--finding=F.1'], "malformed finding NAME 'F.1'"],
    ['an unknown flag', ['va', 'vb', '--task=ta1', '--nope'], "unknown option '--nope'"],
    ['an extra argument', ['va', 'vb', 'extra', '--task=ta1'], "unexpected argument 'extra'"],
  ];

  it.for(SHAPES)('[the-record-r-xfer1] %s refuses rc 1 with one line before any storage call', async ([, args, message]) => {
    const r = await unit(sb0, 'transfer', ...args);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `transfer: error: ${message} (ERR_INVALID_ARGUMENT)\n`]);
  });

  it('[the-record-r-xfer1] a bare call or a source alone prints the usage rc 1', async () => {
    for (const args of [[], ['va']]) {
      const r = await unit(sb0, 'transfer', ...args);
      expect([r.code, r.stdout]).toEqual([1, '']);
      expect(r.stderr).toBe(`Usage: ${USAGE}\nhelp: ctx unit help transfer\n`);
    }
  });

  it('[the-record-r-xfer1, the-engine-r7] a sole --help or -h, answered by the engine, and ctx unit help transfer print the same help table rc 0', async () => {
    const table = await unit(sb0, 'help', 'transfer');
    expect(table.code).toBe(0);
    expect(table.stdout).toMatch(/^ctx unit transfer: /);
    expect(table.stdout).toContain(`  ${USAGE}\n`);
    for (const flag of ['--help', '-h']) expect(await unit(sb0, 'transfer', flag).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, table.stdout, '']);
  });
});
