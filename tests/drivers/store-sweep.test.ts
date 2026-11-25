import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { driverPath } from '../support/driver';
import { FALLBACK_ROOT, RECORD_ROOT, namespaceLock } from '../support/drawer';
import { launch } from '../support/exec';
import { holdLock } from '../support/locks';
import { ROOT_USER } from '../support/plants';
import { DRIVERS, fts5Available, stage } from '../support/stage';
import { store } from '../support/store';
import { answer, refused } from '../support/wire';

const KINDS = ['stray_files', 'nonkey_folders', 'empty_folders', 'links', 'special_files', 'unreadable_folders', 'remnants', 'shadowed_keys', 'outside_keys', 'refused_keys', 'newline_names'] as const;
type Kind = (typeof KINDS)[number];
type Swept = { state: string; kinds?: Record<Kind, { count: number; bytes: number }>; emptied?: number; left?: number };
type Answer = { driver: string; namespace: string; mode: string; dry_run: boolean; stamp: string | null; root: Swept; fallback: Swept };

const BACKUPS = '.contexture/backups';
const DOCUMENTS = ['u1/state.md', 'u1/journal.md', 'u1/lanes/l1/report.md'];

function plant(sb: string, rel: string, bytes: string): void {
  mkdirSync(dirname(join(sb, rel)), { recursive: true });
  writeFileSync(join(sb, rel), bytes);
}

function kinds(found: Partial<Record<Kind, [number, number]>> = {}): Record<Kind, { count: number; bytes: number }> {
  return Object.fromEntries(KINDS.map((k) => [k, { count: found[k]?.[0] ?? 0, bytes: found[k]?.[1] ?? 0 }])) as Record<Kind, { count: number; bytes: number }>;
}

// every entry under a folder, its type and its content: a file's bytes, a link's target, a
// folder, a fifo; the form two trees compare by
function tree(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map(String)
    .sort()
    .map((p) => {
      const full = join(dir, p);
      const st = lstatSync(full);
      if (st.isSymbolicLink()) return `${p} -> ${readlinkSync(full)}`;
      if (st.isDirectory()) return `${p}/`;
      if (st.isFIFO()) return `${p} (fifo)`;
      return `${p}=${readFileSync(full, 'utf8')}`;
    });
}

async function sweep(sb: string, namespace: string, ...flags: string[]): Promise<Answer> {
  const r = await store(sb, 'posix').op('storage.sweep', [namespace, ...flags]);
  expect(r.stdout, 'the answer names no folder').not.toMatch(/\//);
  return answer(r, 'storage.sweep');
}

const counts = (a: Answer) => ({ root: a.root, fallback: a.fallback });

// the sandbox copy of the driver with its act bounds narrowed, so a test sees its batches and
// the gaps between them; the shipped bounds stay in the shipped driver
function narrowBatches(sb: string, batch: number, gap: number): void {
  const path = driverPath(sb, 'posix');
  const text = readFileSync(path, 'utf8');
  const narrowed = text.replace(/^SW_BATCH=.*$/m, `SW_BATCH=${batch}`).replace(/^SW_GAP=.*$/m, `SW_GAP=${gap}`);
  writeFileSync(path, narrowed);
}

async function until(what: string, cond: () => boolean, ms = 60_000): Promise<void> {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting: ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

// three documents written through the store, every leftover kind planted beside them, keys
// outside the document rules among them, and a fallback root holding a shadowed key and its
// own leftovers
async function planted(label: string): Promise<string> {
  const sb = stage('posix', label);
  const s = store(sb, 'posix');
  for (const key of ['u1/state', 'u1/journal', 'u1/lanes/l1/report']) answer(await s.put('unit', key, `${key}\n`), 'store.put');
  const r = (rel: string) => join(RECORD_ROOT, rel);
  plant(sb, r('u1/notes.txt'), '12345');
  plant(sb, r('top.md'), 'top\n');
  plant(sb, r('u1/bad name.md'), 'bl');
  plant(sb, r('u1/sand/b.md'), 'outside\n');
  plant(sb, r('u1/sand/deep/a.sh'), 'xx');
  plant(sb, r('u1/lanes/l1/scratch/run.log'), 'four');
  plant(sb, r('u2/only.md'), 'only\n');
  mkdirSync(join(sb, r('gone/a/b')), { recursive: true });
  mkdirSync(join(sb, r('u1/empty')));
  symlinkSync('nowhere', join(sb, r('u1/dangling')));
  execFileSync('mkfifo', [join(sb, r('u1/fifo'))]);
  plant(sb, r('u1/.lock/pid'), '123');
  plant(sb, r('u1/journal.md.Ab12Cd'), 'abc');
  plant(sb, join(FALLBACK_ROOT, 'u1/state.md'), 'shadow\n');
  plant(sb, join(FALLBACK_ROOT, 'fb-old/x/y.txt'), 'old\n');
  mkdirSync(join(sb, FALLBACK_ROOT, '.lock'));
  return sb;
}

const ROOT_KINDS = kinds({ stray_files: [2, 9], nonkey_folders: [2, 6], empty_folders: [2, 0], links: [1, 0], special_files: [1, 0], remnants: [2, 6], outside_keys: [2, 13], refused_keys: [1, 2] });
const FALLBACK_KINDS = kinds({ nonkey_folders: [1, 4], remnants: [1, 0], shadowed_keys: [1, 7] });
const MOVED_ROOT = [
  'gone/', 'gone/a/', 'gone/a/b/', 'top.md=top\n', 'u1/', 'u1/.lock/', 'u1/.lock/pid=123', 'u1/bad name.md=bl', 'u1/dangling -> nowhere', 'u1/empty/', 'u1/fifo (fifo)',
  'u1/journal.md.Ab12Cd=abc', 'u1/lanes/', 'u1/lanes/l1/', 'u1/lanes/l1/scratch/', 'u1/lanes/l1/scratch/run.log=four', 'u1/notes.txt=12345', 'u1/sand/', 'u1/sand/b.md=outside\n',
  'u1/sand/deep/', 'u1/sand/deep/a.sh=xx', 'u2/', 'u2/only.md=only\n',
];
const MOVED_FALLBACK = ['.lock/', 'fb-old/', 'fb-old/x/', 'fb-old/x/y.txt=old\n', 'u1/', 'u1/state.md=shadow\n'];
const LEFT_ROOT = ['u1/', 'u1/journal.md=u1/journal\n', 'u1/lanes/', 'u1/lanes/l1/', 'u1/lanes/l1/report.md=u1/lanes/l1/report\n', 'u1/state.md=u1/state\n'];

describe('the sweep on posix', { concurrent: true }, () => {
  it('[the-engine-r-swp01] the dry run writes nothing and answers exactly what the run does; the run moves exactly the planted content into the stamped backup with its root label and layout, removes the folders it empties and the emptied fallback root, and leaves every document byte equal', async () => {
    const sb = await planted('sweep-move');
    const roots = () => [tree(join(sb, RECORD_ROOT)), tree(join(sb, FALLBACK_ROOT))];
    const before = roots();
    const docs = DOCUMENTS.map((d) => readFileSync(join(sb, RECORD_ROOT, d), 'utf8'));
    const dry = await sweep(sb, 'unit', '--dry-run');
    expect(roots(), 'the dry run writes nothing').toEqual(before);
    expect(existsSync(join(sb, BACKUPS)), 'the dry run makes no backup').toBe(false);
    expect(dry).toEqual({ driver: 'posix', namespace: 'unit', mode: 'move', dry_run: true, stamp: null, root: { state: 'walked', kinds: ROOT_KINDS, emptied: 2, left: 0 }, fallback: { state: 'walked', kinds: FALLBACK_KINDS, emptied: 1, left: 0 } });
    const run = await sweep(sb, 'unit');
    expect(counts(run)).toEqual(counts(dry));
    expect([run.mode, run.dry_run]).toEqual(['move', false]);
    expect(run.stamp).toMatch(/^[0-9]{8}-[0-9]{6}-[0-9]+$/);
    const backup = join(sb, BACKUPS, `sweep-${run.stamp}`, 'unit');
    expect(tree(join(backup, 'root'))).toEqual(MOVED_ROOT);
    expect(tree(join(backup, 'fallback'))).toEqual(MOVED_FALLBACK);
    expect(tree(join(sb, RECORD_ROOT))).toEqual(LEFT_ROOT);
    expect(existsSync(join(sb, FALLBACK_ROOT)), 'the emptied fallback root is dropped').toBe(false);
    expect(DOCUMENTS.map((d) => readFileSync(join(sb, RECORD_ROOT, d), 'utf8'))).toEqual(docs);
    const again = await sweep(sb, 'unit');
    expect(again).toEqual({ driver: 'posix', namespace: 'unit', mode: 'move', dry_run: false, stamp: null, root: { state: 'walked', kinds: kinds(), emptied: 0, left: 0 }, fallback: { state: 'absent' } });
    const probe = answer(await store(sb, 'posix').op('storage.leftovers', ['unit']), 'storage.leftovers');
    expect(probe.root).toEqual({ state: 'walked', entries: 6, keys: 3, documents: 3, kinds: kinds() });
  });

  it('[the-engine-r-swp01] --delete removes the same content outright, keeps no backup, and leaves every document byte equal', async () => {
    const sb = await planted('sweep-delete');
    const dry = await sweep(sb, 'unit', '--delete', '--dry-run');
    expect([dry.mode, dry.dry_run, dry.stamp]).toEqual(['delete', true, null]);
    const run = await sweep(sb, 'unit', '--delete');
    expect(counts(run)).toEqual(counts(dry));
    expect(counts(run)).toEqual({ root: { state: 'walked', kinds: ROOT_KINDS, emptied: 2, left: 0 }, fallback: { state: 'walked', kinds: FALLBACK_KINDS, emptied: 1, left: 0 } });
    expect([run.mode, run.stamp]).toEqual(['delete', null]);
    expect(existsSync(join(sb, BACKUPS)), 'a delete keeps no backup').toBe(false);
    expect(tree(join(sb, RECORD_ROOT))).toEqual(LEFT_ROOT);
    expect(existsSync(join(sb, FALLBACK_ROOT))).toBe(false);
  });

  it('[the-engine-r-swp01] --prefix sweeps one key folder in both roots and nothing beside it, the prefix folder going too once it holds no document', async () => {
    const sb = await planted('sweep-prefix');
    const run = await sweep(sb, 'unit', '--prefix=u2/');
    expect(counts(run)).toEqual({ root: { state: 'walked', kinds: kinds({ outside_keys: [1, 5] }), emptied: 1, left: 0 }, fallback: { state: 'walked', kinds: kinds(), emptied: 0, left: 0 } });
    expect(existsSync(join(sb, RECORD_ROOT, 'u2'))).toBe(false);
    const u1 = await sweep(sb, 'unit', '--prefix=u1/');
    expect(u1.root.kinds).toEqual(kinds({ stray_files: [1, 5], nonkey_folders: [2, 6], empty_folders: [1, 0], links: [1, 0], special_files: [1, 0], remnants: [2, 6], outside_keys: [1, 8], refused_keys: [1, 2] }));
    expect(u1.fallback).toEqual({ state: 'walked', kinds: kinds({ shadowed_keys: [1, 7] }), emptied: 1, left: 0 });
    expect(tree(join(sb, RECORD_ROOT))).toEqual(['gone/', 'gone/a/', 'gone/a/b/', 'top.md=top\n', ...LEFT_ROOT]);
    expect(tree(join(sb, FALLBACK_ROOT))).toEqual(['.lock/', 'fb-old/', 'fb-old/x/', 'fb-old/x/y.txt=old\n']);
  });

  it('[the-engine-r-swp01] --loose sweeps the entries at the top of each root that hold no key, never a key folder', async () => {
    const sb = await planted('sweep-loose');
    const run = await sweep(sb, 'unit', '--loose');
    expect(counts(run)).toEqual({ root: { state: 'walked', kinds: kinds({ stray_files: [1, 4], empty_folders: [1, 0] }), emptied: 0, left: 0 }, fallback: { state: 'walked', kinds: kinds({ nonkey_folders: [1, 4], remnants: [1, 0] }), emptied: 0, left: 0 } });
    const left = tree(join(sb, RECORD_ROOT));
    expect(left.filter((p) => !/^u[12]\//.test(p))).toEqual([]);
    expect(left.filter((p) => /^u[12]\/$/.test(p))).toEqual(['u1/', 'u2/']);
    expect(left).toContain('u2/only.md=only\n');
    expect(tree(join(sb, FALLBACK_ROOT))).toEqual(['u1/', 'u1/state.md=shadow\n']);
  });

  it('[the-engine-r-swp01] a namespace declaring no document rule keeps every key, sweeping only what lies beyond them, and has no fallback root to walk', async () => {
    const sb = stage('posix', 'sweep-store');
    dataFile(sb, 'modules', 'probe', 'root: probe-root\nkey: <c>/<id>\n');
    answer(await store(sb, 'posix').put('probe', 'c/a', 'one\n'), 'store.put');
    mkdirSync(join(sb, 'probe-root/dropped'));
    plant(sb, 'probe-root/stray', 'five!');
    const run = await sweep(sb, 'probe', '--delete');
    expect(counts(run)).toEqual({ root: { state: 'walked', kinds: kinds({ stray_files: [1, 5], empty_folders: [1, 0] }), emptied: 0, left: 0 }, fallback: { state: 'none' } });
    expect(tree(join(sb, 'probe-root'))).toEqual(['c/', 'c/a=one\n']);
  });

  it('[the-engine-r-swp01] a dry run takes no lock, so it answers while a writer holds the namespace lock', async () => {
    const sb = await planted('sweep-dry-lock');
    const release = holdLock(sb, namespaceLock('unit'), 'live');
    try {
      expect((await sweep(sb, 'unit', '--dry-run')).root.kinds).toEqual(ROOT_KINDS);
    } finally {
      release();
    }
  });

  it('[the-engine-r-swp01] a backup place already taken stops the run rc 2 naming the kind and the items swept before it, never a path', async () => {
    const sb = stage('posix', 'sweep-collide');
    answer(await store(sb, 'posix').put('unit', 'u1/state', 's\n'), 'store.put');
    plant(sb, join(RECORD_ROOT, 'u1/notes.txt'), 'one');
    expect((await sweep(sb, 'unit', '--stamp=fixed')).root.kinds).toEqual(kinds({ stray_files: [1, 3] }));
    plant(sb, join(RECORD_ROOT, 'u1/notes.txt'), 'two');
    refused(await store(sb, 'posix').op('storage.sweep', ['unit', '--stamp=fixed']), 'storage.sweep', 2, 'ERR_STORAGE_WRITE', "the sweep's backup already holds the place of one of the stray files (0 items swept before it)");
    expect(readFileSync(join(sb, RECORD_ROOT, 'u1/notes.txt'), 'utf8')).toBe('two');
  });

  it.skipIf(ROOT_USER)('[the-engine-r-swp01] a folder the walk cannot read or enter is never moved or removed, in either form, nor any folder above it: the sweep leaves it, counts it as left, grants itself no rights, sweeps what lies beside it, and every document behind it survives', async ({ onTestFinished }) => {
    const back = (p: string) => onTestFinished(() => { if (existsSync(p)) chmodSync(p, 0o755); });
    for (const mode of ['move', 'delete']) {
      const sb = stage('posix', `sweep-unreadable-${mode}`);
      const s = store(sb, 'posix');
      for (const key of ['u1/state', 'u1/lanes/l1/report', 'u2/state']) answer(await s.put('unit', key, `${key}\n`), 'store.put');
      plant(sb, join(RECORD_ROOT, 'u1/holder/inner/g.txt'), 'deep');
      plant(sb, join(RECORD_ROOT, 'u1/holder/x.txt'), 'beside');
      const shut = [join(sb, RECORD_ROOT, 'u2'), join(sb, RECORD_ROOT, 'u1/lanes/l1'), join(sb, RECORD_ROOT, 'u1/holder/inner')];
      for (const p of shut) { chmodSync(p, 0o000); back(p); }
      const flags = mode === 'delete' ? ['--delete'] : [];
      const dry = await sweep(sb, 'unit', '--dry-run', ...flags);
      const run = await sweep(sb, 'unit', ...flags);
      expect(counts(run), mode).toEqual(counts(dry));
      expect(run.root, mode).toEqual({ state: 'walked', kinds: kinds({ stray_files: [1, 6] }), emptied: 0, left: 3 });
      expect(shut.map((p) => statSync(p).mode & 0o777), `${mode}: no rights granted`).toEqual([0, 0, 0]);
      for (const p of shut) chmodSync(p, 0o755);
      expect(tree(join(sb, RECORD_ROOT)), mode).toEqual([
        'u1/', 'u1/holder/', 'u1/holder/inner/', 'u1/holder/inner/g.txt=deep', 'u1/lanes/', 'u1/lanes/l1/', 'u1/lanes/l1/report.md=u1/lanes/l1/report\n', 'u1/state.md=u1/state\n',
        'u2/', 'u2/state.md=u2/state\n',
      ]);
    }
  });

  it.skipIf(ROOT_USER)('[the-engine-r-swp01] a delete never changes the rights of what it leaves: a document hard linked inside an unreadable folder keeps its mode', async ({ onTestFinished }) => {
    const sb = stage('posix', 'sweep-hardlink');
    answer(await store(sb, 'posix').put('unit', 'u1/state', 's\n'), 'store.put');
    const doc = join(sb, RECORD_ROOT, 'u1/state.md');
    const locked = join(sb, RECORD_ROOT, 'u1/junk/locked');
    mkdirSync(locked, { recursive: true });
    linkSync(doc, join(locked, 'twin.md'));
    chmodSync(doc, 0o444);
    chmodSync(locked, 0o000);
    onTestFinished(() => { chmodSync(locked, 0o755); chmodSync(doc, 0o644); });
    const run = await sweep(sb, 'unit', '--delete');
    expect(run.root).toEqual({ state: 'walked', kinds: kinds(), emptied: 0, left: 1 });
    expect(statSync(doc).mode & 0o777, 'the document keeps its read only mode').toBe(0o444);
    expect(statSync(locked).mode & 0o777).toBe(0);
    expect(readFileSync(doc, 'utf8')).toBe('s\n');
  });

  it('[the-engine-r-swp01] a name holding a newline is never parsed: a folder named to forge a listing line for a document leaves the document in place, and the dry run and the run refuse rc 2 naming the count, in both forms, moving nothing', async () => {
    const sb = stage('posix', 'sweep-newline');
    const s = store(sb, 'posix');
    for (const key of ['u1/state', 'u1/journal']) answer(await s.put('unit', key, `${key}\n`), 'store.put');
    plant(sb, join(RECORD_ROOT, 'q\nd\t.', 'u1/state.md'), 'x');
    plant(sb, join(RECORD_ROOT, 'u1/a\nb'), 'ab');
    plant(sb, join(RECORD_ROOT, 'u1/notes.txt'), 'stray');
    const before = tree(join(sb, RECORD_ROOT));
    const line = '2 entries whose names hold a newline lie in the sweep\'s reach, and the sweep never parses such a name, so it swept nothing (rename or remove each one first)';
    for (const flags of [['--dry-run'], [], ['--delete', '--dry-run'], ['--delete'], ['--prefix=u1/']]) {
      const r = await s.op('storage.sweep', ['unit', ...flags]);
      if (flags[0] === '--prefix=u1/') refused(r, 'storage.sweep', 2, 'ERR_STORAGE_READ', line.replace(/^2 entries whose names hold a newline lie/, '1 entry whose name holds a newline lies'));
      else refused(r, 'storage.sweep', 2, 'ERR_STORAGE_READ', line);
      expect(tree(join(sb, RECORD_ROOT)), flags.join(' ')).toEqual(before);
    }
    expect(readFileSync(join(sb, RECORD_ROOT, 'u1/state.md'), 'utf8')).toBe('u1/state\n');
    expect(existsSync(join(sb, BACKUPS))).toBe(false);
  });

  it('[the-engine-r-swp01] a symbolic link at a document\'s key path, which a read follows as the document, is never taken, nor a folder holding one: the dry run and the run refuse rc 2 and nothing moves', async () => {
    const line = "an entry the sweep would take is, or holds, a symbolic link at a document's key path, which a read follows as the document, so it swept nothing (put the document in place of the link or remove the link first)";
    const linked = stage('posix', 'sweep-docpath-link');
    answer(await store(linked, 'posix').put('unit', 'u1/state', 's\n'), 'store.put');
    plant(linked, 'elsewhere/journal.md', 'the journal\n');
    symlinkSync(join(linked, 'elsewhere/journal.md'), join(linked, RECORD_ROOT, 'u1/journal.md'));
    plant(linked, join(RECORD_ROOT, 'u1/notes.txt'), 'stray');
    const held = stage('posix', 'sweep-docpath-held');
    answer(await store(held, 'posix').put('unit', 'u1/state', 's\n'), 'store.put');
    plant(held, 'elsewhere/state.md', 'the state\n');
    mkdirSync(join(held, RECORD_ROOT, 'u2'));
    symlinkSync(join(held, 'elsewhere/state.md'), join(held, RECORD_ROOT, 'u2/state.md'));
    for (const sb of [linked, held]) {
      const before = tree(join(sb, RECORD_ROOT));
      for (const flags of [['--dry-run'], [], ['--delete']]) {
        refused(await store(sb, 'posix').op('storage.sweep', ['unit', ...flags]), 'storage.sweep', 2, 'ERR_STORAGE_WRITE', line);
        expect(tree(join(sb, RECORD_ROOT)), flags.join(' ')).toEqual(before);
      }
    }
    expect(readFileSync(join(linked, RECORD_ROOT, 'u1/journal.md'), 'utf8')).toBe('the journal\n');
    expect(readFileSync(join(held, RECORD_ROOT, 'u2/state.md'), 'utf8')).toBe('the state\n');
  });

  it('[the-engine-r-swp01] before each batch acts the guard re-walks its items: a document written into a planned folder after the plan stops the run rc 2, the document left in place and the items swept before it kept in the backup', async () => {
    const sb = stage('posix', 'sweep-guard');
    const s = store(sb, 'posix');
    for (const key of ['u1/state', 'u1/lanes/l1/report']) answer(await s.put('unit', key, `${key}\n`), 'store.put');
    plant(sb, join(RECORD_ROOT, 'u1/lanes/la/scratch/a.md'), 'a');
    plant(sb, join(RECORD_ROOT, 'u1/lanes/lb/scratch/b.md'), 'b');
    narrowBatches(sb, 1, 5);
    const lanes = join(sb, RECORD_ROOT, 'u1/lanes');
    const run = launch(driverPath(sb, 'posix'), ['storage.sweep', 'unit', '--stamp=guard'], { cwd: sb });
    await until('the first batch moved one planned folder', () => !existsSync(join(lanes, 'la')) || !existsSync(join(lanes, 'lb')));
    const other = existsSync(join(lanes, 'la')) ? 'la' : 'lb';
    plant(sb, join(RECORD_ROOT, `u1/lanes/${other}/journal.md`), 'a journal written after the plan\n');
    const r = await run.result;
    refused(r, 'storage.sweep', 2, 'ERR_STORAGE_WRITE', 'one of the items the sweep planned is or holds a document, so it stopped (1 items swept before it)');
    expect(readFileSync(join(lanes, other, 'journal.md'), 'utf8')).toBe('a journal written after the plan\n');
    expect(existsSync(join(lanes, other, 'scratch'))).toBe(true);
    const moved = other === 'la' ? 'lb' : 'la';
    expect(existsSync(join(sb, BACKUPS, 'sweep-guard/unit/root/u1/lanes', moved, 'scratch'))).toBe(true);
  });

  it('[the-engine-r-swp01] the acts run in bounded batches that release the namespace lock between them: a writer waiting during a sweep lands before the sweep ends', async () => {
    const sb = stage('posix', 'sweep-batches');
    const s = store(sb, 'posix');
    for (const key of ['u1/state', 'u1/lanes/l1/report', 'u2/state']) answer(await s.put('unit', key, `${key}\n`), 'store.put');
    for (let i = 0; i < 8; i++) plant(sb, join(RECORD_ROOT, `u1/lanes/l1/f${i}.md`), `${i}`);
    narrowBatches(sb, 2, 1);
    const left = () => readdirSync(join(sb, RECORD_ROOT, 'u1/lanes/l1')).filter((n) => /^f[0-9]\.md$/.test(n)).length;
    let ended = false;
    const run = launch(driverPath(sb, 'posix'), ['storage.sweep', 'unit', '--prefix=u1/'], { cwd: sb });
    const settled = run.result.then((r) => { ended = true; return r; });
    await until('the first batch moved its items', () => left() < 8 || ended);
    const w = await s.put('unit', 'u2/journal', 'written during the sweep\n');
    const endedBeforeWriter = ended;
    expect(w.code, w.stderr).toBe(0);
    expect(endedBeforeWriter, 'the writer landed while the sweep still had batches to run').toBe(false);
    const done = answer(await settled, 'storage.sweep');
    expect(done.root).toEqual({ state: 'walked', kinds: kinds({ outside_keys: [8, 8] }), emptied: 0, left: 0 });
    expect(left()).toBe(0);
    expect(readFileSync(join(sb, RECORD_ROOT, 'u2/journal.md'), 'utf8')).toBe('written during the sweep\n');
  });

  it('[the-engine-r-swp01] a key folder holding no document below it moves as one item: its folder lands in the backup by one rename, its entries still counted by kind and its key folders as emptied', async () => {
    const sb = stage('posix', 'sweep-whole');
    const s = store(sb, 'posix');
    for (const key of ['u1/state', 'u1/lanes/l1/report']) answer(await s.put('unit', key, `${key}\n`), 'store.put');
    plant(sb, join(RECORD_ROOT, 'u1/lanes/l2/scratch/a.md'), 'aa');
    plant(sb, join(RECORD_ROOT, 'u1/lanes/l2/scratch/b.md'), 'bbb');
    plant(sb, join(RECORD_ROOT, 'u1/lanes/l2/notes.txt'), 'n');
    const ino = statSync(join(sb, RECORD_ROOT, 'u1/lanes/l2')).ino;
    const dry = await sweep(sb, 'unit', '--dry-run');
    const run = await sweep(sb, 'unit', '--stamp=whole');
    const moved = join(sb, BACKUPS, 'sweep-whole/unit/root/u1/lanes/l2');
    expect(statSync(moved).ino, 'the folder itself moved, never made anew').toBe(ino);
    expect(counts(run)).toEqual(counts(dry));
    expect(run.root).toEqual({ state: 'walked', kinds: kinds({ stray_files: [1, 1], outside_keys: [2, 5] }), emptied: 2, left: 0 });
    expect(tree(moved)).toEqual(['notes.txt=n', 'scratch/', 'scratch/a.md=aa', 'scratch/b.md=bbb']);
    expect(tree(join(sb, RECORD_ROOT))).toEqual(['u1/', 'u1/lanes/', 'u1/lanes/l1/', 'u1/lanes/l1/report.md=u1/lanes/l1/report\n', 'u1/state.md=u1/state\n']);
  });

  it('[the-engine-r-swp01] a name holding a tab, ending in one, or holding any other control character or a backslash is swept as itself in both forms', async () => {
    const names = ['tabend\t', 'mid\ttab', 'cr\r', 'back\\nslash', 'ctl\u0001x', 'esc\u001bname'];
    for (const mode of ['move', 'delete']) {
      const sb = stage('posix', `sweep-control-${mode}`);
      answer(await store(sb, 'posix').put('unit', 'u1/state', 's\n'), 'store.put');
      for (const n of names) plant(sb, join(RECORD_ROOT, 'u1', n), n.length.toString());
      const run = await sweep(sb, 'unit', '--stamp=ctl', ...(mode === 'delete' ? ['--delete'] : []));
      expect(run.root.kinds, mode).toEqual(kinds({ stray_files: [names.length, names.map((n) => n.length.toString().length).reduce((a, b) => a + b, 0)] }));
      expect(tree(join(sb, RECORD_ROOT)), mode).toEqual(['u1/', 'u1/state.md=s\n']);
      if (mode === 'move') expect(tree(join(sb, BACKUPS, 'sweep-ctl/unit/root/u1')).sort()).toEqual(names.map((n) => `${n}=${n.length}`).sort());
      expect((await sweep(sb, 'unit')).root.kinds, `${mode}: a second run finds nothing`).toEqual(kinds());
    }
  });

  it('[the-engine-r-swp01] a root that holds another namespace\'s root, or its fallback root, refuses rc 1 naming both, the dry run too, and nothing moves', async () => {
    for (const where of [RECORD_ROOT, FALLBACK_ROOT]) {
      const sb = stage('posix', 'sweep-nested');
      answer(await store(sb, 'posix').put('unit', 'u1/state', 's\n'), 'store.put');
      dataFile(sb, 'modules', 'inner', `root: ${where}/inner\nkey: <c>/<id>\n`);
      answer(await store(sb, 'posix').put('inner', 'c/a', 'one\n'), 'store.put');
      for (const flags of [['--dry-run'], [], ['--delete']]) {
        refused(await store(sb, 'posix').op('storage.sweep', ['unit', ...flags]), 'storage.sweep', 1, 'ERR_INVALID_ARGUMENT', "a root of namespace 'unit' holds the storage of namespace 'inner', so it cannot be swept");
      }
      expect(readFileSync(join(sb, where, 'inner/c/a'), 'utf8')).toBe('one\n');
      expect(existsSync(join(sb, BACKUPS))).toBe(false);
    }
  });

  it('[the-engine-r-swp01] refuses a missing namespace, an unknown argument, a repeated flag, a malformed stamp or prefix, two scopes, an undeclared namespace, and a root holding the drawer\'s backups folder, writing nothing', async () => {
    const sb = stage('posix', 'sweep-refusals');
    const op = (args: string[]) => store(sb, 'posix').op('storage.sweep', args);
    refused(await op([]), 'storage.sweep', 1, 'ERR_INVALID_ARGUMENT', 'storage.sweep takes the namespace');
    refused(await op(['unit', '--all']), 'storage.sweep', 1, 'ERR_INVALID_ARGUMENT', "unknown argument '--all'");
    refused(await op(['unit', '--delete', '--delete']), 'storage.sweep', 1, 'ERR_INVALID_ARGUMENT', "the flag '--delete' is given twice");
    refused(await op(['unit', '--stamp=a/b']), 'storage.sweep', 1, 'ERR_INVALID_ARGUMENT', "malformed stamp 'a/b' (letters, digits, underscore, and dash, not starting with a dash)");
    refused(await op(['unit', '--prefix=u1']), 'storage.sweep', 1, 'ERR_INVALID_ARGUMENT', "malformed key prefix 'u1' (whole key segments ending in a slash)");
    refused(await op(['unit', '--prefix=../']), 'storage.sweep', 1, 'ERR_INVALID_ARGUMENT', "malformed key prefix '../' (whole key segments ending in a slash)");
    refused(await op(['unit', '--prefix=u1/', '--loose']), 'storage.sweep', 1, 'ERR_INVALID_ARGUMENT', '--prefix and --loose name two scopes; give one or neither');
    refused(await op(['nope']), 'storage.sweep', 1, 'ERR_ENTITY_NOT_FOUND', "namespace 'nope' is declared by no module data file");
    dataFile(sb, 'modules', 'drawer', 'root: .contexture\nkey: <a>/<b>\n');
    refused(await op(['drawer', '--dry-run']), 'storage.sweep', 1, 'ERR_INVALID_ARGUMENT', "a root of namespace 'drawer' holds the drawer's backups or scratch folder, so it cannot be swept");
    dataFile(sb, 'modules', 'inbackup', 'root: .contexture/backups/old\nkey: <a>/<b>\n');
    refused(await op(['inbackup']), 'storage.sweep', 1, 'ERR_INVALID_ARGUMENT', "a root of namespace 'inbackup' lies in the drawer's backups folder, so it cannot be swept");
    expect(existsSync(join(sb, BACKUPS))).toBe(false);
  });
});

for (const driver of DRIVERS.filter((d) => d === 'fts5')) {
  describe.skipIf(!fts5Available())('the sweep on fts5', () => {
    it('[the-engine-r-swp01] a driver that keeps no file tree answers its unknown function line rc 2', async () => {
      const sb = stage(driver, 'sweep-fts5');
      refused(await store(sb, driver).op('storage.sweep', ['unit']), 'storage.sweep', 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'storage.sweep'");
    });
  });
}
