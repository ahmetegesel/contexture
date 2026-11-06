import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterNames, pairs, viaFilter } from '@support/pairs';
import { ROOT } from '@support/root';
import { stage } from '@support/stage';
import { firstByteDifference } from '@support/tree';
import { MODULE, staged } from './staged';

const FILTERS = join(MODULE, 'filters');
const PAIRS = join(ROOT, 'plugins/toolchain-filters/tests');

describe.concurrent("the plugin's own filters byte for byte through the staged ctx run --filter", () => {
  it('the filters and their pairs exist', () => {
    expect(filterNames(FILTERS)).toEqual(['cargo-test', 'compiler-errors', 'go-test', 'pytest', 'vitest']);
    expect(pairs(FILTERS, PAIRS).length).toBe(11);
  });

  it.each(pairs(FILTERS, PAIRS).map((p) => [p.name, p] as const))('%s', async (_name, pair) => {
    const r = await viaFilter(staged('pair'), pair.filter, pair.input);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(firstByteDifference(r.bytes, readFileSync(pair.expected))).toBe(-1);
  });

  it.each(filterNames(FILTERS))('the %s filter carries a pair with its expected bytes', (filter) => {
    const owned = pairs(FILTERS, PAIRS).filter((p) => p.filter === filter);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.filter((p) => !existsSync(p.expected))).toEqual([]);
  });

  it('a pair reads red when its filter is not staged', async () => {
    const r = await viaFilter(stage('posix', 'unstaged'), 'vitest', join(PAIRS, 'vitest-smoke.in'));
    expect(r.code === 0 && firstByteDifference(r.bytes, readFileSync(join(PAIRS, 'vitest-smoke.expected'))) === -1).toBe(false);
  });
});
