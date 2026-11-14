import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { createLane, must, run, seedUnit, unit } from '../support/unit';

describe.concurrent('ctx unit list --all --repo and refs-to', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await must(unit(sb, 'bootstrap', 'n-unit', 'new verbs unit', 'n-repo, n-other'));
      await seedUnit(sb, 'n-ref', 'new verbs referrer');
      await must(unit(sb, 'refs', 'n-ref', 'n-unit'));
    }, 'posix', 'units');
  });

  it('N-b [the-record-r-lst33]: list --all --repo lists the unit touching a repo with its anchor and no stored pointer', async () => {
    const r = await unit(fresh(sb0), 'list', '--all', '--repo=n-repo');
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('n-unit [ACTIVE] A1\n');
    expect(r.stdout).not.toContain('next_action');
  });

  it('N-b [the-record-r-lst33]: list --all --repo of a repo no unit touches refuses naming the known repos', async () => {
    const r = await unit(fresh(sb0), 'list', '--all', '--repo=no-such-repo');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^ERROR: no unit touches repo: no-such-repo \(known: .*n-other, n-repo/m);
  });

  it('N-b: refs-to lists the ref_sessions referrer; an unreferenced unit refuses naming it', async () => {
    const sb = fresh(sb0);
    const r = await unit(sb, 'refs-to', 'n-unit');
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toBe('refs-to n-unit: 1 referrer\n\n  n-ref session n-ref ref_sessions\n');
    const none = await unit(sb, 'refs-to', 'n-ref');
    expect(none.code).toBe(1);
    expect(none.stderr).toMatch(/^ERROR: no unit references n-ref$/m);
  });
});

const D = '2026-11-14';
const ROWS = [
  `  rt-b task t1 unit#rt-a/entry/${D}-a1`,
  `  rt-b entry ${D}-b1 unit#rt-a/entry/${D}-a1`,
  `  rt-b entry ${D}-b1 unit#rt-a/task/ta`,
  '  rt-b finding F1 unit#rt-a/lane/la/recipe',
  `  rt-b lane_entry lb/${D}-lb1 unit#rt-a/entry/${D}-a1`,
  '  rt-b lane_recipe lb unit#rt-a/task/ta',
  '  rt-b lane_recipe lb unit#rt-a/lane/la/recipe/GOAL',
];

describe.concurrent('ctx unit refs-to over REF values', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'rt-a', 'the referenced unit');
      await must(unit(sb, 'record', 'rt-a', '--what=the target entry', `--slug=${D}-a1`));
      await must(unit(sb, 'task', 'add', 'rt-a', 'ta', '--objective=the target task'));
      await must(createLane(sb, 'rt-a', 'la'));
      await seedUnit(sb, 'rt-b', 'the referring unit');
      await must(unit(sb, 'task', 'add', 'rt-b', 't1', '--objective=refs a', `--refs=unit#rt-a/entry/${D}-a1`));
      await must(unit(sb, 'record', 'rt-b', '--what=refs a', `--slug=${D}-b1`, `--ref=unit#rt-a/entry/${D}-a1`, '--ref=unit#rt-a/task/ta', '--ref=file#.contexture/ctx'));
      await must(unit(sb, 'finding', 'add', 'rt-b', 'F1', '--summary=refs a', '--ref=unit#rt-a/lane/la/recipe'));
      await must(createLane(sb, 'rt-b', 'lb', ['--ref=unit#rt-a/task/ta', '--ref=unit#rt-a/lane/la/recipe/GOAL', '--ref=file#.contexture/ctx#dispatch']));
      await must(run(sb, ['lane', 'record', 'rt-b', 'lb', '--what=refs a', `--slug=${D}-lb1`, `--ref=unit#rt-a/entry/${D}-a1`]));
      await seedUnit(sb, 'rt-c', 'the closed referrer');
      await must(unit(sb, 'record', 'rt-c', '--what=refs a', `--slug=${D}-c1`, `--ref=unit#rt-a/entry/${D}-a1`));
      await must(unit(sb, 'close', 'rt-c'));
    }, 'posix', 'refs-to');
  });

  it('[the-record-r14] refs-to reads every REF and REFS value naming a unit, one row per referrer item with its unit, kind, id, and ref, over the active units by default', async () => {
    const r = await unit(fresh(sb0), 'refs-to', 'rt-a');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(`refs-to rt-a: ${ROWS.length} referrers\n\n${ROWS.join('\n')}\n`);
  });

  it('[the-record-r14] --all widens to every unit, the closed referrer included', async () => {
    const r = await unit(fresh(sb0), 'refs-to', 'rt-a', '--all');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`  rt-c entry ${D}-c1 unit#rt-a/entry/${D}-a1\n`);
    expect(r.stdout.startsWith(`refs-to rt-a: ${ROWS.length + 1} referrers\n`)).toBe(true);
  });

  it('[the-record-r14] a full address matches itself and every address below it; --json answers the rows', async () => {
    const sb = fresh(sb0);
    const r = await unit(sb, 'refs-to', 'unit#rt-a/lane/la/recipe', '--json');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      unit: 'unit#rt-a/lane/la/recipe',
      referrers: [],
      rows: [
        { unit: 'rt-b', kind: 'finding', id: 'F1', ref: 'unit#rt-a/lane/la/recipe' },
        { unit: 'rt-b', kind: 'lane_recipe', id: 'lb', ref: 'unit#rt-a/lane/la/recipe/GOAL' },
      ],
    });
    const none = await unit(sb, 'refs-to', `unit#rt-a/entry/${D}-nope`);
    expect([none.code, none.stderr]).toEqual([1, `ERROR: no unit references unit#rt-a/entry/${D}-nope\n`]);
  });

  it('[the-record-r14] a file# target matches the refs carrying a symbol below it, never another path it prefixes', async () => {
    const sb = fresh(sb0);
    const r = await unit(sb, 'refs-to', 'file#.contexture/ctx');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(`refs-to file#.contexture/ctx: 2 referrers\n\n  rt-b entry ${D}-b1 file#.contexture/ctx\n  rt-b lane_recipe lb file#.contexture/ctx#dispatch\n`);
    const prefix = await unit(sb, 'refs-to', 'file#.contexture/ct');
    expect([prefix.code, prefix.stderr]).toEqual([1, 'ERROR: no unit references file#.contexture/ct\n']);
  });

  it.for([
    ['journal#x', 'unit#<unit>/entry/x'],
    ['knowledge#X', 'unit#<unit>/finding/X'],
    ['lane#la/report#VERDICT', 'unit#<unit>/lane/la/report/VERDICT'],
    ['IDEAS.md#y', 'store#ideas/y'],
  ] as const)('[the-record-r14] a retired short target %s refuses rc 1 naming its full address, as every write does', async ([target, full]) => {
    const r = await unit(fresh(sb0), 'refs-to', target);
    expect([r.code, r.stdout, r.stderr]).toEqual([
      1,
      '',
      `refs-to: error: malformed ref '${target}': a reference is a full address <owner>#<path>; write ${full} (ERR_INVALID_ARGUMENT)\n`,
    ]);
  });

  it('[the-record-r14] the help names the default scope, the widening, and the cost per unit', async () => {
    const r = await unit(fresh(sb0), 'help', 'refs-to');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('reads the active units by default; --all widens to every unit');
    expect(r.stdout).toContain('about 0.2 s per unit');
    expect(r.stdout).toContain('file#<path> its symbols file#<path>#<symbol>');
  });

  it('[the-record-r14] a malformed target or an unknown flag refuses rc 1', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'refs-to', 'a b#c')).code).toBe(1);
    expect((await unit(sb, 'refs-to', 'rt-a', '--bogus')).code).toBe(1);
  });
});
