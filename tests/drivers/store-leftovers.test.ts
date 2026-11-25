import { mkdirSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { FALLBACK_ROOT, RECORD_ROOT } from '../support/drawer';
import { driverPath } from '../support/driver';
import { launch } from '../support/exec';
import { ROOT_USER, chmodPlant } from '../support/plants';
import { DRIVERS, fts5Available, stage } from '../support/stage';
import { listAnswer, store } from '../support/store';
import { answer, refused } from '../support/wire';

const KINDS = ['stray_files', 'nonkey_folders', 'empty_folders', 'links', 'special_files', 'unreadable_folders', 'remnants', 'shadowed_keys', 'outside_keys', 'refused_keys', 'newline_names'] as const;
type Kind = (typeof KINDS)[number];
type Root = { state: string; entries?: number; keys?: number; documents?: number; kinds?: Record<Kind, { count: number; bytes: number }> };

function plant(sb: string, rel: string, bytes: string): void {
  mkdirSync(dirname(join(sb, rel)), { recursive: true });
  writeFileSync(join(sb, rel), bytes);
}

function kinds(found: Partial<Record<Kind, [number, number]>> = {}): Record<Kind, { count: number; bytes: number }> {
  return Object.fromEntries(KINDS.map((k) => [k, { count: found[k]?.[0] ?? 0, bytes: found[k]?.[1] ?? 0 }])) as Record<Kind, { count: number; bytes: number }>;
}

async function leftovers(sb: string, namespace: string): Promise<{ driver: string; namespace: string; root: Root; fallback: Root }> {
  const r = await store(sb, 'posix').op('storage.leftovers', [namespace]);
  expect(r.stdout, 'the answer names no folder').not.toMatch(/\//);
  return answer(r, 'storage.leftovers');
}

// three real keys under the record root, written through the store, so the keys are the
// store's own and never counted beyond them
async function keyed(label: string): Promise<string> {
  const sb = stage('posix', label);
  const s = store(sb, 'posix');
  for (const key of ['u1/state', 'u1/journal', 'u1/lanes/l1/report']) answer(await s.put('unit', key, `${key}\n`), 'store.put');
  return sb;
}

describe('the leftovers probe on posix', { concurrent: true }, () => {
  it('[the-engine-r-lf7vr] a root holding only its keys answers every kind at zero, its keys and entries counted, and a fallback root not made reads absent', async () => {
    const sb = await keyed('leftovers-clean');
    expect(await leftovers(sb, 'unit')).toEqual({
      driver: 'posix',
      namespace: 'unit',
      root: { state: 'walked', entries: 6, keys: 3, documents: 3, kinds: kinds() },
      fallback: { state: 'absent' },
    });
  });

  it('[the-engine-r-lf7vr] names each planted kind with its count and bytes beside the real keys, which are never counted beyond them', async () => {
    const sb = await keyed('leftovers-kinds');
    const r = (rel: string) => join(RECORD_ROOT, rel);
    plant(sb, r('u1/notes.txt'), '12345');
    plant(sb, r('top.md'), 'top\n');
    plant(sb, r('u1/bad name.md'), 'bl');
    plant(sb, r('u1/sand/deep/a.sh'), 'xx');
    plant(sb, r('u1/sand/b.md'), 'a key the pattern admits, so its folder is a key folder');
    mkdirSync(join(sb, r('gone/a/b')), { recursive: true });
    mkdirSync(join(sb, r('u1/empty')));
    symlinkSync('nowhere', join(sb, r('u1/dangling')));
    execFileSync('mkfifo', [join(sb, r('u1/fifo'))]);
    plant(sb, r('u1/.lock/pid'), '123');
    plant(sb, r('u1/journal.md.Ab12Cd'), 'abc');
    const a = await leftovers(sb, 'unit');
    expect(a.root).toEqual({
      state: 'walked',
      entries: 22,
      keys: 4,
      documents: 3,
      kinds: kinds({ stray_files: [2, 9], nonkey_folders: [1, 2], empty_folders: [2, 0], links: [1, 0], special_files: [1, 0], remnants: [2, 6], outside_keys: [1, 55], refused_keys: [1, 2] }),
    });
    expect(a.fallback).toEqual({ state: 'absent' });
  });

  it('[the-engine-r-lf7vr] splits the keys into documents and keys outside the document rules: the state (an unsearched document) and the lane artifacts are documents, lane scratch and a stray note under a unit folder are keys outside them', async () => {
    const sb = await keyed('leftovers-split');
    plant(sb, join(RECORD_ROOT, 'u1/lanes/l1/scratch/notes.md'), 'four');
    plant(sb, join(RECORD_ROOT, 'u1/notes.md'), 'ab');
    plant(sb, join(RECORD_ROOT, 'u1/lanes/l1/extra.md'), 'xyz');
    expect((await leftovers(sb, 'unit')).root).toEqual({ state: 'walked', entries: 10, keys: 6, documents: 3, kinds: kinds({ outside_keys: [3, 9] }) });
  });

  it('[the-engine-r-lf7vr] a namespace declaring no document rule and no unsearched line counts every key a document', async () => {
    const sb = stage('posix', 'leftovers-nodocs');
    dataFile(sb, 'modules', 'probe', 'root: probe-root\nkey: <c>/<id>\n');
    const s = store(sb, 'posix');
    for (const key of ['c/a', 'c/b', 'd/x']) answer(await s.put('probe', key, 'v\n'), 'store.put');
    expect((await leftovers(sb, 'probe')).root).toEqual({ state: 'walked', entries: 5, keys: 3, documents: 3, kinds: kinds() });
  });

  it('[the-engine-r-lf7vr] a folder holding no key counts once with everything below it rolled in, a lock folder as a remnant', async () => {
    const sb = await keyed('leftovers-folders');
    plant(sb, join(RECORD_ROOT, 'u1/lanes/l1/scratch/sb/run.log'), 'four');
    plant(sb, join(RECORD_ROOT, 'u1/lanes/l1/scratch/sb/deep/x.json'), '{}');
    mkdirSync(join(sb, RECORD_ROOT, 'u1/lanes/l1/scratch/empty'));
    plant(sb, join(RECORD_ROOT, 'u1/old.lock/pid'), '42');
    const a = await leftovers(sb, 'unit');
    expect(a.root.kinds).toEqual(kinds({ nonkey_folders: [1, 6], remnants: [1, 2] }));
    expect(a.root.keys).toBe(3);
  });

  it('[the-engine-r-lf7vr] a name holding a newline is never parsed: it counts as its own kind with the bytes at or below it, and a folder named to forge a listing line for a document forges nothing', async () => {
    const sb = await keyed('leftovers-newline');
    plant(sb, join(RECORD_ROOT, 'q\nd\t.', 'u1/state.md'), 'xyz');
    plant(sb, join(RECORD_ROOT, 'u1/a\nb'), 'ab');
    plant(sb, join(RECORD_ROOT, 'u1/notes.txt'), 'stray');
    expect((await leftovers(sb, 'unit')).root).toEqual({ state: 'walked', entries: 9, keys: 3, documents: 3, kinds: kinds({ stray_files: [1, 5], newline_names: [2, 5] }) });
  });

  it.skipIf(ROOT_USER)('[the-engine-r-lf7vr] a folder the walk cannot read counts as unreadable, and a root it cannot read answers unreadable', async ({ onTestFinished }) => {
    const sb = await keyed('leftovers-unreadable');
    plant(sb, join(RECORD_ROOT, 'u1/locked/f.md'), 'hidden key');
    chmodPlant(join(sb, RECORD_ROOT, 'u1/locked'), 0o000, 0o755, onTestFinished);
    expect((await leftovers(sb, 'unit')).root.kinds).toEqual(kinds({ unreadable_folders: [1, 0] }));
    const other = await keyed('leftovers-unreadable-root');
    chmodPlant(join(other, RECORD_ROOT), 0o311, 0o755, onTestFinished);
    expect((await leftovers(other, 'unit')).root).toEqual({ state: 'unreadable' });
  });

  it.skipIf(ROOT_USER)('[the-engine-r-lf7vr] a folder holding an unreadable folder is opened: the unreadable folder counts as itself and each entry beside it apart, never rolled into one folder', async ({ onTestFinished }) => {
    const sb = await keyed('leftovers-unreadable-inside');
    plant(sb, join(RECORD_ROOT, 'u1/holder/inner/g.txt'), 'deep');
    plant(sb, join(RECORD_ROOT, 'u1/holder/x.txt'), 'beside');
    chmodPlant(join(sb, RECORD_ROOT, 'u1/holder/inner'), 0o000, 0o755, onTestFinished);
    expect((await leftovers(sb, 'unit')).root.kinds).toEqual(kinds({ stray_files: [1, 6], unreadable_folders: [1, 0] }));
  });

  it('[the-engine-r-lf7vr] walks the fallback root apart: its leftovers, and a key the root shadows counted as shadowed, never as a key', async () => {
    const sb = await keyed('leftovers-fallback');
    plant(sb, join(FALLBACK_ROOT, 'u1/state.md'), 'shadow\n');
    plant(sb, join(FALLBACK_ROOT, 'u2/state.md'), 'moved yet\n');
    plant(sb, join(FALLBACK_ROOT, 'old/x/y.txt'), 'old\n');
    mkdirSync(join(sb, FALLBACK_ROOT, '.lock'));
    const a = await leftovers(sb, 'unit');
    expect(a.root.kinds).toEqual(kinds());
    expect(a.fallback).toEqual({ state: 'walked', entries: 8, keys: 1, documents: 1, kinds: kinds({ nonkey_folders: [1, 4], remnants: [1, 0], shadowed_keys: [1, 7] }) });
  });

  it('[the-engine-r-lf7vr] a namespace with no fallback reads none, a root not made reads absent, a linked root reads link, and the store namespace takes its own pattern', async () => {
    const sb = stage('posix', 'leftovers-store');
    dataFile(sb, 'modules', 'probe', 'root: probe-root\nkey: <c>/<id>\n');
    expect(await leftovers(sb, 'probe')).toEqual({ driver: 'posix', namespace: 'probe', root: { state: 'absent' }, fallback: { state: 'none' } });
    answer(await store(sb, 'posix').put('probe', 'c/a', 'one\n'), 'store.put');
    mkdirSync(join(sb, 'probe-root/dropped'));
    plant(sb, 'probe-root/c/x/deep', 'three segments');
    plant(sb, 'probe-root/top', 'one');
    expect((await leftovers(sb, 'probe')).root).toEqual({ state: 'walked', entries: 6, keys: 1, documents: 1, kinds: kinds({ stray_files: [1, 3], nonkey_folders: [1, 14], empty_folders: [1, 0] }) });
    const linked = stage('posix', 'leftovers-link');
    dataFile(linked, 'modules', 'probe', 'root: probe-root\nkey: <c>/<id>\n');
    mkdirSync(join(linked, 'elsewhere'));
    symlinkSync('elsewhere', join(linked, 'probe-root'));
    expect((await leftovers(linked, 'probe')).root).toEqual({ state: 'link' });
  });

  it('[the-engine-r-lf7vr, the-engine-r-kvr01] a refused key counts apart, also in a folder holding no key; a dot name stays a stray; the put temp (a dot, the key file name, the mktemp tail) and the older <key file>.XXXXXX temp are remnants', async () => {
    const sb = await keyed('leftovers-refused');
    const r = (rel: string) => join(RECORD_ROOT, rel);
    plant(sb, r('u1/.journal.mdAb12Cd'), 'abc');
    plant(sb, r('u1/journal.md.Xy34Zw'), 'ab');
    plant(sb, r('u1/Bad+Name.md'), 'bad');
    plant(sb, r('_old/state.md'), 'old!');
    plant(sb, r('_old/lanes/l1/report.md'), 'gone!');
    plant(sb, r('u1/.hidden.md'), 'h');
    plant(sb, r('.cache/x.md'), 'c');
    const a = await leftovers(sb, 'unit');
    expect(a.root.kinds).toEqual(kinds({ stray_files: [1, 1], nonkey_folders: [1, 1], remnants: [2, 5], refused_keys: [3, 12] }));
    expect([a.root.keys, a.root.documents]).toEqual([3, 3]);
    expect((await store(sb, 'posix').list('unit')).stdout).toBe(listAnswer('unit', ['u1/journal', 'u1/lanes/l1/report', 'u1/state']));
  });

  it('[the-engine-r-lf7vr, the-engine-r-kvr01] a put killed mid write in an empty suffix namespace leaves a remnant, never a key the store lists', async () => {
    const sb = stage('posix', 'leftovers-killed-put');
    dataFile(sb, 'modules', 'probe', 'root: probe-root\nkey: <c>/<id>\n');
    answer(await store(sb, 'posix').put('probe', 'c/a', 'one\n'), 'store.put');
    const put = launch(driverPath(sb, 'posix'), ['store.put', 'probe', 'c/b'], { cwd: sb, input: null, group: true });
    put.child.stdin?.write('partial');
    const dir = join(sb, 'probe-root/c');
    const temps = () => readdirSync(dir).filter((n) => n !== 'a');
    for (let i = 0; i < 200 && temps().length === 0; i++) await new Promise((done) => setTimeout(done, 25));
    expect(temps()).toEqual([expect.stringMatching(/^\.b[A-Za-z0-9]{6}$/)]);
    put.signal('SIGKILL');
    await put.result;
    expect(temps().length, 'the killed put left its temp').toBe(1);
    expect((await store(sb, 'posix').list('probe')).stdout).toBe(listAnswer('probe', ['c/a']));
    const root = (await leftovers(sb, 'probe')).root;
    expect([root.entries, root.keys, root.documents, root.kinds?.remnants.count]).toEqual([3, 1, 1, 1]);
    expect({ ...root.kinds, remnants: kinds().remnants }).toEqual(kinds());
  });

  it('[the-engine-r-lf7vr] refuses a missing, extra, or undeclared namespace with its one line, and writes nothing', async () => {
    const sb = stage('posix', 'leftovers-refusals');
    const s = store(sb, 'posix');
    refused(await s.op('storage.leftovers', []), 'storage.leftovers', 1, 'ERR_INVALID_ARGUMENT', 'storage.leftovers takes the namespace');
    refused(await s.op('storage.leftovers', ['unit', 'x']), 'storage.leftovers', 1, 'ERR_INVALID_ARGUMENT', "unexpected argument 'x'");
    refused(await s.op('storage.leftovers', ['nope']), 'storage.leftovers', 1, 'ERR_ENTITY_NOT_FOUND', "namespace 'nope' is declared by no module data file");
  });
});

for (const driver of DRIVERS.filter((d) => d === 'fts5')) {
  describe.skipIf(!fts5Available())('the leftovers probe on fts5', () => {
    it('[the-engine-r-lf7vr] a driver that keeps no file tree answers its unknown function line rc 2', async () => {
      const sb = stage(driver, 'leftovers-fts5');
      refused(await store(sb, driver).op('storage.leftovers', ['unit']), 'storage.leftovers', 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'storage.leftovers'");
    });
  });
}
