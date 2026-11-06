import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { fresh, seed } from '../support/snapshot';

let snap = '';

beforeAll(async () => {
  snap = await seed(async (sb) => {
    const boot = await ctx(sb, 'unit', 'bootstrap', 'iso-unit', 'isolation seed');
    expect(boot.code, boot.stderr).toBe(0);
    const task = await ctx(sb, 'unit', 'task', 'add', 'iso-unit', 'iso-seed', '--objective=the seeded task');
    expect(task.code, task.stderr).toBe(0);
  });
});

async function plantLeak(sb: string): Promise<void> {
  const r = await ctx(sb, 'unit', 'task', 'add', 'iso-unit', 'leak-task', '--objective=the planted leak');
  expect(r.code, r.stderr).toBe(0);
}

async function sawLeak(sb: string): Promise<boolean> {
  const r = await ctx(sb, 'unit', 'task', 'list', 'iso-unit', '--status=all');
  expect(r.code, r.stderr).toBe(0);
  expect(r.stdout).toContain('iso-seed');
  return r.stdout.includes('leak-task');
}

describe('snapshot: a fresh copy of the seeded sandbox per test', { concurrent: false }, () => {
  let sb = '';
  beforeEach(() => {
    sb = fresh(snap);
  });

  it('the first test plants a leak in its copy', async () => {
    await plantLeak(sb);
    expect(await sawLeak(sb)).toBe(true);
  });

  it('[plugins-r5] the next test reads its own copy: the leak is absent', async () => {
    expect(await sawLeak(sb)).toBe(false);
  });
});

describe('snapshot null check: one sandbox shared by two tests, no copy', { concurrent: false }, () => {
  let shared = '';
  beforeAll(() => {
    shared = fresh(snap);
  });

  it('the first test plants the same leak', async () => {
    await plantLeak(shared);
  });

  it('[plugins-r5] the same instrument sees the leak, so the isolation assertion fails without the copy', async () => {
    expect(await sawLeak(shared)).toBe(true);
  });
});
