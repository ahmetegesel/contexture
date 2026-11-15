import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { leaks } from '../support/drawer';
import { declare, INV, refused, snapshot, store, storeState } from './support';

let sandbox: () => string;
beforeAll(async () => {
  sandbox = await snapshot('store-leftovers', async (sb) => {
    await declare(sb, 'items', 'given', ['what: required line']);
    await store(sb, ['put', 'items/a', '--what=a']);
    await store(sb, ['put', 'items/b', '--what=b']);
  });
});

describe.concurrent('the store check --leftovers: what the store\'s storage holds beyond its keys', () => {
  it('[store-r6, the-engine-r-lf7vr] a store holding only its records and declarations prints nothing and exits 0, and so does a store not made yet', async () => {
    expect(await store(sandbox(), ['check', '--leftovers'])).toMatchObject({ code: 0, stdout: '', stderr: '' });
    const empty = await snapshot('store-leftovers-empty');
    expect(await store(empty(), ['check', '--leftovers'])).toMatchObject({ code: 0, stdout: '', stderr: '' });
  });

  it('[store-r6, store-r8, the-engine-r-lf7vr, the-engine-r-ov2vq] a dropped container leaves no folder, so the check prints nothing, while an empty folder an older release left is named by kind with no path, rc 1, and nothing removed', async () => {
    const sb = sandbox();
    expect((await store(sb, ['delete', 'containers/items'])).code).toBe(0);
    expect(storeState(sb).split('\n').filter((l) => l.startsWith('items'))).toEqual([]);
    expect(await store(sb, ['check', '--leftovers'])).toMatchObject({ code: 0, stdout: '', stderr: '' });
    mkdirSync(join(sb, '.contexture/store/older'));
    const before = storeState(sb);
    const r = await store(sb, ['check', '--leftovers']);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, 'root: empty folders: 1 (0 bytes)\n', '']);
    expect(r.stdout.split('\n').filter(leaks)).toEqual([]);
    expect(storeState(sb)).toBe(before);
  });

  it('[store-r6, the-engine-r-lf7vr] one line per kind found, in the fixed kind order, each with its count and bytes', async () => {
    const sb = sandbox();
    const root = join(sb, '.contexture/store');
    writeFileSync(join(root, 'stray.txt'), 'five!');
    mkdirSync(join(root, 'items/x/y'), { recursive: true });
    writeFileSync(join(root, 'items/x/y/deep'), 'abc');
    writeFileSync(join(root, 'old.lock'), 'pid');
    const r = await store(sb, ['check', '--leftovers']);
    expect([r.code, r.stderr]).toEqual([1, '']);
    expect(r.stdout).toBe('root: stray files: 1 (5 bytes)\nroot: folders outside the key shape: 1 (3 bytes)\nroot: lock or write remnants: 1 (3 bytes)\n');
  });

  it('[store-r6] check takes a container or --leftovers alone, the usage naming both', async () => {
    const sb = sandbox();
    refused(await store(sb, ['check', '--leftovers', 'items']), 'check', INV, 'usage: ctx store check <container> | --leftovers');
    refused(await store(sb, ['check']), 'check', INV, 'usage: ctx store check <container> | --leftovers');
    refused(await store(sb, ['check', '--json']), 'check', INV, 'usage: ctx store check <container> | --leftovers');
  });
});
