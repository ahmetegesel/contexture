import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { seedUnit, unit } from '../support/unit';

// exact is the storage contract's one mode, so a direct ctx unit search naming another refuses
// whatever its scope holds, a workspace with no unit included, never a zero hit answer echoing
// the mode it cannot run

const LINE = (mode: string): string => `search.query: error: mode '${mode}' is not supported; answerable modes: exact (ERR_CAPABILITY_UNSUPPORTED)\n`;

describe.concurrent('ctx unit search with a mode other than exact', () => {
  let empty: string;
  let one: string;
  beforeAll(async () => {
    [empty, one] = await Promise.all([
      seed(async () => {}, 'posix', 'search-mode-empty'),
      seed(async (sb) => { await seedUnit(sb, 'sm-unit', 'the search mode unit'); }, 'posix', 'search-mode-one'),
    ]);
  });

  it.each([
    ['no unit, the active scope', [] as string[]],
    ['no unit, --all', ['--all']],
    ['no unit, --json', ['--json']],
  ])('[the-record-r13] refuses rc 1 naming exact with %s', async (_, scope) => {
    const r = await unit(fresh(empty), 'search', 'gw', '--mode=hybrid', ...scope);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', LINE('hybrid')]);
  });

  it('[the-record-r13] refuses the same line over a unit, and exact answers zero hits with no unit (the null check)', async () => {
    const r = await unit(fresh(one), 'search', 'gw', '--mode=trigram');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', LINE('trigram')]);
    const exact = await unit(fresh(empty), 'search', 'gw', '--json');
    expect([exact.code, exact.stderr]).toEqual([0, '']);
    expect(JSON.parse(exact.stdout)).toEqual({ query: 'gw', mode: 'exact', total: 0, rows: [] });
  });
});
