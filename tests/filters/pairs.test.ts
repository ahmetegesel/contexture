import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterNames, owner, pairs, viaFilter } from '../support/pairs';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { firstByteDifference } from '../support/tree';

const FILTERS = join(ROOT, 'base/.contexture/modules/run/filters');
const PAIRS = join(ROOT, 'tests/filters/pairs');

describe.concurrent('the run filters byte for byte through the staged ctx run --filter', () => {
  it.each(pairs(FILTERS, PAIRS).map((p) => [p.name, p] as const))('%s', async (_name, pair) => {
    const r = await viaFilter(stage('posix', 'pair'), pair.filter, pair.input);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(firstByteDifference(r.bytes, readFileSync(pair.expected))).toBe(-1);
  });

  it.each(filterNames(FILTERS))('the %s filter carries a pair with its expected bytes', (filter) => {
    const owned = pairs(FILTERS, PAIRS).filter((p) => p.filter === filter);
    expect(owned.length).toBeGreaterThan(0);
    expect(owned.filter((p) => !existsSync(p.expected))).toEqual([]);
  });

  it('a case belongs to the filter with the longest prefix of its name', () => {
    expect(owner('foo-bar-case', ['foo', 'foo-bar'])).toBe('foo-bar');
    expect(owner('foo-case', ['foo', 'foo-bar'])).toBe('foo');
    expect(owner('other-case', ['foo'])).toBe('');
  });

  it('the byte compare names the first differing offset', () => {
    const expected = readFileSync(join(PAIRS, 'log-repeat.expected'));
    const planted = Buffer.from(expected);
    planted[3] ^= 1;
    expect(firstByteDifference(planted, expected)).toBe(3);
    expect(firstByteDifference(expected.subarray(0, 5), expected)).toBe(5);
  });
});
