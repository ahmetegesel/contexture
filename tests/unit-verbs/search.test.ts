import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { createLane, must, run, seedUnit, unit } from '../support/unit';

const search = (sb: string, ...args: string[]) => unit(sb, 'search', ...args);
const json = async (sb: string, ...args: string[]) => {
  const r = await search(sb, ...args, '--json');
  expect([r.code, r.stderr]).toEqual([0, '']);
  return JSON.parse(r.stdout);
};
const refusal = (message: string): string => `search: error: ${message} (ERR_INVALID_ARGUMENT)\n`;
type Row = { module: string; container: string; type: string; id: string; address?: string; snippet: string; read: string; label?: string };

describe.concurrent('ctx unit search on posix', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'x-unit', 'defect regression unit');
      for (const [slug, objective] of [['x-todo', 'Open task'], ['x-prog', 'Running task'], ['x-shared', 'zzshared term in a task']]) await must(unit(sb, 'task', 'add', 'x-unit', slug!, `--objective=${objective}`));
      await must(unit(sb, 'finding', 'add', 'x-unit', 'X_SHARED', '--summary=zzshared term in a finding'));
      await must(unit(sb, 'finding', 'add', 'x-unit', 'ARCH_DECISION', '--summary=Architecture decision 1'));
      await must(unit(sb, 'finding', 'supersede', 'x-unit', 'ARCH_DECISION', 'ARCH_V2', '--summary=Architecture decision version 2'));
      await must(createLane(sb, 'x-unit', 'x-lane'));
      await must(run(sb, ['lane', 'record', 'x-unit', 'x-lane', '--what=a zzshared lane event', '--slug=2026-11-14-x-l1']));
      await must(run(sb, ['lane', 'report', 'x-unit', 'x-lane'], { input: '@report x-lane\nVERDICT :: zzshared done\n' }));
      await seedUnit(sb, 'y-unit', 'payload fidelity unit');
      await must(unit(sb, 'task', 'add', 'y-unit', 'y-keep', '--objective=Kept task'));
      await must(unit(sb, 'task', 'add', 'y-unit', 'y-shared', '--objective=zzshared term in the second unit'));
      await seedUnit(sb, 'z-closed', 'the closed unit');
      await must(unit(sb, 'task', 'add', 'z-closed', 'z-shared', '--objective=zzshared term in a closed unit'));
      await must(unit(sb, 'close', 'z-closed'));
    }, 'posix', 'search');
  });

  it('E-12 [the-record-r13]: search finds a finding across the active units, the query first', async () => {
    expect((await search(fresh(sb0), 'Architecture decision')).stdout).toContain('unit#x-unit/finding/ARCH_V2');
  });

  it('X-m [the-record-r13]: every row carries the shared keys in their order, no score and no section, and its read prints the entity', async () => {
    const sb = fresh(sb0);
    const a = await json(sb, 'Open task');
    expect(Object.keys(a)).toEqual(['query', 'mode', 'total', 'rows']);
    expect(a.rows[0]).toEqual({ module: 'unit', container: 'x-unit/backlog', type: 'task', id: 'x-todo', address: 'unit#x-unit/task/x-todo', snippet: 'Open task', read: 'ctx unit get x-unit/task/x-todo' });
    const read = await unit(sb, ...a.rows[0].read.split(' ').slice(2));
    expect([read.code, read.stdout.split('\n')[0]]).toEqual([0, '@task x-todo']);
  });

  it('X-m [the-record-r13]: the default covers the active units, --all every unit with a closed unit\'s rows labelled closed, --unit any one unit', async () => {
    const sb = fresh(sb0);
    const ids = (rows: Row[]) => rows.filter((r) => r.type === 'task').map((r) => r.address);
    expect(ids((await json(sb, 'zzshared', '--type=task')).rows)).toEqual(['unit#x-unit/task/x-shared', 'unit#y-unit/task/y-shared']);
    const all = (await json(sb, 'zzshared', '--type=task', '--all')).rows as Row[];
    expect(ids(all)).toEqual(['unit#x-unit/task/x-shared', 'unit#y-unit/task/y-shared', 'unit#z-closed/task/z-shared']);
    expect(all.map((r) => r.label ?? '')).toEqual(['', '', 'closed']);
    const one = (await json(sb, 'zzshared', '--unit=z-closed')).rows as Row[];
    expect(one.map((r) => [r.address, r.label])).toEqual([['unit#z-closed/task/z-shared', 'closed']]);
  });

  it('X-m [the-record-r13]: --limit applies once over the merged rows in the board\'s unit order, total counting every merged row', async () => {
    const sb = fresh(sb0);
    const every = await json(sb, 'zzshared', '--all', '--limit=50');
    const two = await json(sb, 'zzshared', '--all', '--limit=2');
    expect(every.total).toBe(every.rows.length);
    expect(every.total).toBeGreaterThan(2);
    expect([two.total, two.rows]).toEqual([every.total, every.rows.slice(0, 2)]);
    const units = (every.rows as Row[]).map((r) => r.container.split('/')[0]);
    expect(units).toEqual([...units].sort());
  });

  it('X-m [the-record-r13]: --type keeps one entity type; a lane report row reads by its address, a lane journal entry too on a direct call', async () => {
    const sb = fresh(sb0);
    const findings = (await json(sb, 'zzshared', '--type=finding')).rows as Row[];
    expect(findings.map((r) => r.type)).toEqual(['finding']);
    const lanes = (await json(sb, 'zzshared', '--unit=x-unit')).rows as Row[];
    expect(lanes).toContainEqual(expect.objectContaining({ type: 'lane', id: 'x-lane/report', address: 'unit#x-unit/lane/x-lane/report', read: 'ctx unit get x-unit/lane/x-lane/report' }));
    expect(lanes).toContainEqual(expect.objectContaining({ type: 'lane_entry', id: 'x-lane/journal/2026-11-14-x-l1', address: 'unit#x-unit/lane/x-lane/journal/2026-11-14-x-l1' }));
  });

  it('X-m [the-record-r13]: the unit state is never a row; an anchor line carries no address, its read the unit\'s load', async () => {
    const sb = fresh(sb0);
    const rows = (await json(sb, 'payload fidelity unit', '--unit=y-unit')).rows as Row[];
    expect(rows.every((r) => !r.container.endsWith('/state'))).toBe(true);
    for (const r of rows.filter((x) => x.type === 'session')) {
      expect(r.address).toBeUndefined();
      expect([r.id, r.read]).toEqual(['y-unit', 'ctx unit load y-unit']);
    }
  });

  it('X-m [the-record-r13]: under the fan-out marker the unit answers entities only, a type it does not hold zero hits, and an unregistered mode falls back to exact', async () => {
    const sb = fresh(sb0);
    const env = { CTX_SEARCH_FANOUT: '1' };
    const fan = await run(sb, ['unit', 'search', 'zzshared', '--all', '--limit=50', '--json'], { env });
    const rows = JSON.parse(fan.stdout).rows as Row[];
    expect(rows.every((r) => ['task', 'entry', 'finding', 'lane'].includes(r.type) && r.address)).toBe(true);
    expect(rows.some((r) => r.type === 'lane' && r.id === 'x-lane/report')).toBe(true);
    const none = await run(sb, ['unit', 'search', 'zzshared', '--type=doc', '--json'], { env });
    expect([none.code, none.stdout]).toEqual([0, '{"query":"zzshared","mode":"exact","total":0,"rows":[]}\n']);
    const mode = await run(sb, ['unit', 'search', 'zzshared', '--mode=fuzzy', '--json'], { env });
    expect([mode.code, JSON.parse(mode.stdout).mode]).toEqual([0, 'exact']);
  });

  it('X-m [the-record-r13]: zero hits is an answer, rc 0; the text view names the type, the address, and the read hint', async () => {
    const sb = fresh(sb0);
    const none = await search(sb, 'zz-no-such-needle');
    expect([none.code, none.stdout, none.stderr]).toEqual([0, 'search "zz-no-such-needle": 0 matches\n', '']);
    const text = (await search(sb, 'Open task')).stdout;
    expect(text).toMatch(/^search "Open task": \d+ match(es)?, \d+ shown$/m);
    expect(text).toContain('  task unit#x-unit/task/x-todo: Open task\n');
    expect(text).toMatch(/^read one: ctx unit get <path> \(the address after unit#\)$/m);
  });

  it.each([
    ['the retired positional unit', ['x-unit', 'task'], refusal('the unit is a flag now: ctx unit search "<query>" --unit=<unit>')],
    ['--entity', ['task', '--entity=task'], refusal('--entity is retired: use --type=<type> (ctx unit search "<query>" --type=<type>)')],
    ['-l', ['task', '-l', '5'], refusal('-l is retired: use --limit=N')],
    ['a bare value form', ['task', '--limit', '5'], refusal("unknown option '--limit' (the --flag=value forms: --unit=, --all, --type=, --mode=, --limit=, and --json)")],
    ['--all beside --unit', ['task', '--all', '--unit=x-unit'], refusal('--all and --unit=<unit> contradict each other')],
    ['a zero limit', ['task', '--limit=0'], refusal("--limit takes a positive whole number: '0'")],
    ['an unknown type', ['task', '--type=doc'], refusal("unknown type 'doc' (task, entry, finding, lane, lane_entry, session, all)")],
    ['an empty query', [''], 'search.query: error: empty query (ERR_INVALID_ARGUMENT)\n'],
    ['a ranked mode on posix', ['task', '--mode=hybrid'], "search.query: error: mode 'hybrid' is not supported; answerable modes: exact (ERR_CAPABILITY_UNSUPPORTED)\n"],
    ['a unit no store holds', ['task', '--unit=no-unit'], "search.query: error: unit 'no-unit' not found (ERR_ENTITY_NOT_FOUND)\n"],
    ['a case twin of a held unit, which no store holds either', ['task', '--unit=X-Unit'], "search.query: error: unit 'X-Unit' not found (ERR_ENTITY_NOT_FOUND)\n"],
  ])('X-m [the-record-r13]: %s refuses rc 1 with one stderr line, nothing on stdout', async (_, args, line) => {
    const r = await search(fresh(sb0), ...args);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', line]);
  });

  it('X-m E3-1 [the-record-r13]: the help names the shared syntax and no driver mode', async () => {
    const sb = fresh(sb0);
    const help = await search(sb, '--help');
    expect([help.code, help.stderr]).toEqual([0, '']);
    expect(help.stdout).toContain('usage: ctx unit search "<query>" [--unit=<unit>] [--all] [--type=<type>] [--mode=<mode>] [--limit=N] [--json]');
    expect(help.stdout).not.toMatch(/hybrid|trigram/);
    const table = await unit(sb, 'help', 'search');
    expect(table.stdout).not.toMatch(/hybrid|trigram/);
    expect((await unit(sb, 'diagnose')).stdout).toMatch(/^ {2}search modes: {4}exact$/m);
  });

  it('X-m [the-record-r13]: a sole help prints the usage, while help with arguments after it is the query, as ctx search hands it', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'task', 'add', 'y-unit', 'y-help', '--objective=Ask for help early'));
    const sole = await search(sb, 'help');
    expect([sole.code, sole.stderr, sole.stdout.split('\n')[0]]).toEqual([0, '', 'usage: ctx unit search "<query>" [--unit=<unit>] [--all] [--type=<type>] [--mode=<mode>] [--limit=N] [--json]']);
    const a = await json(sb, 'help', '--type=task');
    expect(a.query).toBe('help');
    expect(a.rows.map((r: Row) => r.address)).toEqual(['unit#y-unit/task/y-help']);
  });

  it('Y-b R9 [the-record-r13]: an exact snippet carries no edge padding', async () => {
    const a = await json(fresh(sb0), 'Kept task', '--unit=y-unit');
    expect(a.rows[0].snippet).toBe('Kept task');
  });
});
