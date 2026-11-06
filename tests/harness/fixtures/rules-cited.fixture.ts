import { describe, expect, it } from 'vitest';

describe('[alpha-r3] a describe tag proves nothing', () => {
  it('[alpha-r1] a passed citation', () => {
    expect(1).toBe(1);
  });

  it('a test under the tagged describe', () => {
    expect(1).toBe(1);
  });
});

it('[alpha-r2, beta-r1] two ids in one group', () => {
  expect(1).toBe(1);
});

it.skip('[alpha-r4] a skipped citation', () => {
  expect(1).toBe(1);
});

it('[alpha-r9] an id the corpus lacks', () => {
  expect(1).toBe(1);
});

it('alpha-r5: a prefix outside the canonical form', () => {
  expect(1).toBe(1);
});

it('[alpha-r1, r6] an abbreviated group', () => {
  expect(1).toBe(1);
});

it('[alpha-o1, beta-p1] a responsibility and a pitfall', () => {
  expect(1).toBe(1);
});

it('[beta-r2] an id whose reason is stale now', () => {
  expect(1).toBe(1);
});
