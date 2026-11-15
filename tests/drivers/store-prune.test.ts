import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { FALLBACK_ROOT, RECORD_ROOT } from '../support/drawer';
import { ROOT_USER, chmodPlant } from '../support/plants';
import { stage } from '../support/stage';
import { store } from '../support/store';
import { answer } from '../support/wire';

// the posix delete, alone or as a batch action, removes each folder it empties above the
// deleted key, never the root itself, and leaves a folder still holding anything

function plant(sb: string, rel: string, bytes: string): void {
  mkdirSync(dirname(join(sb, rel)), { recursive: true });
  writeFileSync(join(sb, rel), bytes);
}

const tree = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir, { recursive: true }).map(String).sort() : []);

async function probeStore(label: string, keys: readonly string[]): Promise<string> {
  const sb = stage('posix', label);
  dataFile(sb, 'modules', 'probe', 'root: probe-root\nkey: <c>/<id>\n');
  const s = store(sb, 'posix');
  for (const key of keys) answer(await s.put('probe', key, `${key}\n`), 'store.put');
  return sb;
}

describe('the posix delete removes the folders it empties', { concurrent: true }, () => {
  it('[the-engine-r-ov2vq] a delete of a container\'s last record removes its folder, while the root and a folder still holding a record stay', async () => {
    const sb = await probeStore('prune-single', ['c/a', 'c/b', 'd/x']);
    const s = store(sb, 'posix');
    answer(await s.del('probe', 'c/a'), 'store.delete');
    expect(tree(join(sb, 'probe-root'))).toEqual(['c', 'c/b', 'd', 'd/x']);
    answer(await s.del('probe', 'c/b'), 'store.delete');
    expect(tree(join(sb, 'probe-root'))).toEqual(['d', 'd/x']);
    answer(await s.del('probe', 'd/x'), 'store.delete');
    expect(existsSync(join(sb, 'probe-root')), 'the root itself is never removed').toBe(true);
    expect(tree(join(sb, 'probe-root'))).toEqual([]);
  });

  it('[the-engine-r-ov2vq] a batch emptying two folders removes both and keeps the folder its put fills and the one it leaves holding a record', async () => {
    const sb = await probeStore('prune-batch', ['x/1', 'y/1', 'z/1', 'z/2']);
    const r = await store(sb, 'posix').batch('probe', [
      { action: 'delete', key: 'x/1' },
      { action: 'delete', key: 'y/1' },
      { action: 'delete', key: 'z/1' },
      { action: 'delete', key: 'z/2' },
      { action: 'put', key: 'z/3', value: 'refill\n' },
    ]);
    expect(answer(r, 'store.batch')).toEqual({ namespace: 'probe', actions: 5 });
    expect(tree(join(sb, 'probe-root'))).toEqual(['z', 'z/3']);
  });

  it('[the-engine-r-ov2vq] a deep key\'s delete removes each folder up to the first one still holding a key, a leftover, or a folder', async () => {
    const sb = stage('posix', 'prune-deep');
    const s = store(sb, 'posix');
    for (const key of ['u1/state', 'u1/lanes/l1/report', 'u1/lanes/l2/report', 'u2/lanes/l3/report']) answer(await s.put('unit', key, `${key}\n`), 'store.put');
    plant(sb, join(RECORD_ROOT, 'u1/lanes/l2/scratch.txt'), 'kept\n');
    answer(await s.del('unit', 'u1/lanes/l1/report'), 'store.delete');
    answer(await s.del('unit', 'u1/lanes/l2/report'), 'store.delete');
    answer(await s.del('unit', 'u2/lanes/l3/report'), 'store.delete');
    expect(tree(join(sb, RECORD_ROOT))).toEqual(['u1', 'u1/lanes', 'u1/lanes/l2', 'u1/lanes/l2/scratch.txt', 'u1/state.md']);
  });

  it('[the-engine-r-ov2vq] a delete of a key the fallback root alone held moves its folder, removes it once emptied, and drops the emptied fallback root', async () => {
    const sb = stage('posix', 'prune-fallback');
    plant(sb, join(FALLBACK_ROOT, 'old/lanes/l1/report.md'), 'old\n');
    answer(await store(sb, 'posix').put('unit', 'kept/state', 'kept\n'), 'store.put');
    answer(await store(sb, 'posix').del('unit', 'old/lanes/l1/report'), 'store.delete');
    expect(tree(join(sb, RECORD_ROOT))).toEqual(['kept', 'kept/state.md']);
    expect(existsSync(join(sb, FALLBACK_ROOT))).toBe(false);
  });

  it.skipIf(ROOT_USER)('[the-engine-r-ov2vq, the-engine-r18] a batch rolled back after its delete restores the key into its folder, since the folders go only once the whole commit landed', async ({ onTestFinished }) => {
    const sb = await probeStore('prune-rollback', ['c/a', 'd/x']);
    chmodPlant(join(sb, 'probe-root/d'), 0o555, 0o755, onTestFinished);
    const r = await store(sb, 'posix').batch('probe', [
      { action: 'delete', key: 'c/a' },
      { action: 'put', key: 'd/y', value: 'refused\n' },
    ]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^store\.batch: error: action 2 \(put 'd\/y'\): .*\(ERR_STORAGE_WRITE\)\n$/);
    expect(readFileSync(join(sb, 'probe-root/c/a'), 'utf8')).toBe('c/a\n');
  });
});
