import { existsSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { libraryLock, lockPath } from '../support/drawer';
import { holdLock } from '../support/locks';
import { waitFor } from '../support/unit';
import { declare, EXISTS, snapshot, store, storeState } from './support';

let sandbox: () => string;
beforeAll(async () => {
  sandbox = await snapshot('store-concurrency', async (sb) => {
    await declare(sb, 'items', 'given', ['what: required line']);
  });
});

describe('the store writers serialize under the library lock', () => {
  it('[store-r3] concurrent puts of one new id leave exactly one record and refuse the rest ERR_ENTITY_EXISTS', async () => {
    const sb = sandbox();
    const runs = await Promise.all([1, 2, 3, 4].map((n) => store(sb, ['put', 'items/same', `--what=writer ${n}`])));
    const landed = runs.filter((r) => r.code === 0);
    const refused = runs.filter((r) => r.code === 1);
    expect(landed).toHaveLength(1);
    expect(refused).toHaveLength(3);
    for (const r of refused) expect(r.stderr).toBe(`store put: error: record 'items/same' already exists (${EXISTS})\n`);
    expect(storeState(sb).match(/^items\/same=/gm)).toHaveLength(1);
  });

  it('[store-r3] a put waits on a held library lock of the store and lands once it is released', async () => {
    const sb = sandbox();
    const release = holdLock(sb, libraryLock('store'), 'live');
    const pending = store(sb, ['put', 'items/waiting', '--what=w']);
    expect(await waitFor(() => false, 1500)).toBe(false);
    expect(storeState(sb)).not.toContain('items/waiting=');
    release();
    const r = await pending;
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'waiting\n', '']);
    expect(existsSync(lockPath(sb, libraryLock('store')))).toBe(false);
  }, 30_000);
});
