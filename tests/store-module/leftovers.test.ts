import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { leaks } from '../support/drawer';
import { ROOT_USER } from '../support/plants';
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

  it('[store-r6] check takes a container, or --leftovers with an optional sweep, the usage naming both', async () => {
    const sb = sandbox();
    const usage = 'usage: ctx store check <container> | --leftovers [--sweep [--dry-run] [--delete]]';
    refused(await store(sb, ['check', '--leftovers', 'items']), 'check', INV, usage);
    refused(await store(sb, ['check']), 'check', INV, usage);
    refused(await store(sb, ['check', '--json']), 'check', INV, usage);
    refused(await store(sb, ['check', 'items', '--sweep']), 'check', INV, usage);
    refused(await store(sb, ['check', '--leftovers', '--sweep', '--sweep']), 'check', INV, usage);
    refused(await store(sb, ['check', '--leftovers', '--dry-run']), 'check', INV, '--dry-run and --delete belong to --sweep, so they take it');
    refused(await store(sb, ['check', '--leftovers', '--delete']), 'check', INV, '--dry-run and --delete belong to --sweep, so they take it');
  });

  const plantStore = (sb: string): void => {
    const root = join(sb, '.contexture/store');
    writeFileSync(join(root, 'stray.txt'), 'five!');
    mkdirSync(join(root, 'items/x/y'), { recursive: true });
    writeFileSync(join(root, 'items/x/y/deep'), 'abc');
    mkdirSync(join(root, 'dropped'));
  };
  const KIND_LINES = 'root: stray files: 1 (5 bytes)\nroot: folders outside the key shape: 1 (3 bytes)\nroot: empty folders: 1 (0 bytes)\n';

  it('[store-r6, the-engine-r-swp01] check --leftovers --sweep: the dry run writes nothing and prints what the run moves; the run moves the dropped container\'s empty folder and every stray into the stamped backup, records and declarations untouched, and a second run moves nothing', async () => {
    const sb = sandbox();
    plantStore(sb);
    const before = storeState(sb);
    const records = await store(sb, ['list', 'items']);
    const dry = await store(sb, ['check', '--leftovers', '--sweep', '--dry-run']);
    expect([dry.code, dry.stdout, dry.stderr]).toEqual([0, `${KIND_LINES}dry run: would move 3 items (8 bytes) and empty 0 folders; nothing written\n`, '']);
    expect(storeState(sb)).toBe(before);
    const r = await store(sb, ['check', '--leftovers', '--sweep']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.split('\n').filter(leaks)).toEqual([]);
    const stamp = /^swept: moved 3 items \(8 bytes\) into the backup stamped ([0-9]{8}-[0-9]{6}-[0-9]+) and emptied 0 folders$/m.exec(r.stdout)?.[1];
    expect(r.stdout.startsWith(KIND_LINES), r.stdout).toBe(true);
    expect(stamp, r.stdout).toBeDefined();
    const backup = join(sb, '.contexture/backups', `sweep-${stamp}`, 'store/root');
    expect(readdirSync(backup, { recursive: true }).map(String).sort()).toEqual(['dropped', 'items', 'items/x', 'items/x/y', 'items/x/y/deep', 'stray.txt']);
    expect(await store(sb, ['list', 'items'])).toEqual(records);
    expect(await store(sb, ['check', '--leftovers'])).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(await store(sb, ['check', '--leftovers', '--sweep'])).toMatchObject({ code: 0, stdout: 'swept: nothing beyond the documents; nothing moved\n', stderr: '' });
  });

  it('[store-r6, the-engine-r-swp01] check --leftovers --sweep --delete removes them with no backup kept', async () => {
    const sb = sandbox();
    plantStore(sb);
    const r = await store(sb, ['check', '--leftovers', '--sweep', '--delete']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, `${KIND_LINES}swept: deleted 3 items (8 bytes) with no backup kept and emptied 0 folders\n`, '']);
    expect(existsSync(join(sb, '.contexture/backups'))).toBe(false);
    expect(await store(sb, ['check', '--leftovers'])).toMatchObject({ code: 0, stdout: '' });
  });

  it.skipIf(ROOT_USER)('[store-r6, the-engine-r-swp01] check --leftovers --sweep leaves a folder it cannot read untouched, its rights unchanged, and names it on its own line and in the closing line, the dry run alike', async ({ onTestFinished }) => {
    const sb = sandbox();
    const root = join(sb, '.contexture/store');
    writeFileSync(join(root, 'stray.txt'), 'five!');
    mkdirSync(join(root, 'locked'));
    writeFileSync(join(root, 'locked/inside'), 'x');
    chmodSync(join(root, 'locked'), 0o000);
    onTestFinished(() => chmodSync(join(root, 'locked'), 0o755));
    const probe = await store(sb, ['check', '--leftovers']);
    expect([probe.code, probe.stdout]).toEqual([1, 'root: stray files: 1 (5 bytes)\nroot: unreadable folders: 1 (0 bytes)\n']);
    const dry = await store(sb, ['check', '--leftovers', '--sweep', '--delete', '--dry-run']);
    expect([dry.code, dry.stdout, dry.stderr]).toEqual([0, 'root: stray files: 1 (5 bytes)\nroot: unreadable folders left: 1\ndry run: would delete 1 item (5 bytes) and empty 0 folders, leaving 1 unreadable folder untouched (its rights need fixing); nothing written\n', '']);
    const r = await store(sb, ['check', '--leftovers', '--sweep', '--delete']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'root: stray files: 1 (5 bytes)\nroot: unreadable folders left: 1\nswept: deleted 1 item (5 bytes) with no backup kept and emptied 0 folders, leaving 1 unreadable folder untouched (its rights need fixing)\n', '']);
    expect(statSync(join(root, 'locked')).mode & 0o777, 'no rights granted').toBe(0);
    const again = await store(sb, ['check', '--leftovers', '--sweep']);
    expect([again.code, again.stdout, again.stderr]).toEqual([0, 'root: unreadable folders left: 1\nswept: nothing moved, leaving 1 unreadable folder untouched (its rights need fixing)\n', '']);
    chmodSync(join(root, 'locked'), 0o755);
    expect(readFileSync(join(root, 'locked/inside'), 'utf8')).toBe('x');
  });

  it('[store-r6, the-engine-r-swp01] the check help states the hardened sweep: names holding a newline counted and refused, unreadable folders left untouched and named, a folder holding no record taken as one item, naming no storage path', async () => {
    const r = await store(sandbox(), ['help', 'check']);
    expect(r.code).toBe(0);
    for (const part of [
      'lock or write remnants, and names holding a newline (counted with their bytes, never parsed)',
      'a folder holding no record below it moved or removed whole as one item and counted as emptied',
      'a folder it cannot read or enter is never moved or removed, in either form, nor any folder above it, but left untouched and named',
      'a name holding a newline in its reach refuses the sweep rc 2, the dry run too',
      'root: folders emptied: <n> and root: unreadable folders left: <n> when any',
      ', leaving <n> unreadable folders untouched (their rights need fixing) when the sweep left any',
      '2 a storage failure (a name holding a newline in the sweep\'s reach, or an item the sweep cannot move or remove',
    ]) expect(r.stdout).toContain(part);
    expect(r.stdout).not.toContain('the folders it empties removed');
    expect(r.stdout.split('\n').filter(leaks)).toEqual([]);
    expect(r.stdout).not.toMatch(/ - |—|–/);
  });

  it('[store-r6, the-engine-r-swp01] a name holding a newline is named by its own kind, and the sweep refuses it, the dry run too, moving nothing', async () => {
    const sb = sandbox();
    const root = join(sb, '.contexture/store');
    writeFileSync(join(root, 'bad\nname'), 'abc');
    writeFileSync(join(root, 'stray.txt'), 'five!');
    const probe = await store(sb, ['check', '--leftovers']);
    expect([probe.code, probe.stdout]).toEqual([1, 'root: stray files: 1 (5 bytes)\nroot: names holding a newline: 1 (3 bytes)\n']);
    for (const flags of [['--dry-run'], [], ['--delete']]) {
      const r = await store(sb, ['check', '--leftovers', '--sweep', ...flags]);
      expect([r.code, r.stdout, r.stderr], flags.join(' ')).toEqual([2, '', "store check: error: 1 entry whose name holds a newline lies in the sweep's reach, and the sweep never parses such a name, so it swept nothing (rename or remove each one first) (ERR_STORAGE_READ)\n"]);
    }
    expect(readFileSync(join(root, 'bad\nname'), 'utf8')).toBe('abc');
    expect(readFileSync(join(root, 'stray.txt'), 'utf8')).toBe('five!');
  });
});
