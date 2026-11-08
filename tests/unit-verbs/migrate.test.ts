import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, RECORD_ROOT } from '../support/drawer';
import { fresh, seed } from '../support/snapshot';
import { fts5Available, stage } from '../support/stage';
import { must, run, seedUnit, unit } from '../support/unit';

const WARNING = 'WARNING: the record was read from its deprecated root; each unit moves at its next write, and ctx unit migrate --all moves the rest when the human chooses\n';

function toFallback(sb: string, slug: string): void {
  mkdirSync(join(sb, FALLBACK_ROOT), { recursive: true });
  renameSync(join(sb, RECORD_ROOT, slug), join(sb, FALLBACK_ROOT, slug));
}

const held = (sb: string, slug: string) => [existsSync(join(sb, RECORD_ROOT, slug)), existsSync(join(sb, FALLBACK_ROOT, slug))];

async function views(sb: string, slug: string): Promise<{ stdout: string[]; stderr: string[] }> {
  const runs = [await unit(sb, 'load', slug), await unit(sb, 'board', slug), await unit(sb, 'audit', slug)];
  for (const r of runs) expect(r.code, r.stderr).toBe(0);
  return { stdout: runs.map((r) => r.stdout), stderr: runs.map((r) => r.stderr) };
}

describe.concurrent('the gradual record root move: the fallback read, the warning, the move on first write, and ctx unit migrate', () => {
  let snap: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      await seedUnit(sb, 'leg-u', 'the legacy unit');
      await must(unit(sb, 'task', 'add', 'leg-u', 'leg-task', '--objective=the legacy task'));
      await must(unit(sb, 'record', 'leg-u', '--what=the legacy entry', '--thread=the human'));
      await seedUnit(sb, 'new-u', 'the unit in the root');
      await seedUnit(sb, 'shut-u', 'the closed unit');
      await must(unit(sb, 'close', 'shut-u'));
    }, 'posix', 'migrate');
  });

  it('[the-record-r14, the-record-r-4gj4k] a load served from the fallback prints the warning exactly once after its answer, a load from the root prints none', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'leg-u');
    const legacy = await unit(sb, 'load', 'leg-u');
    expect([legacy.code, legacy.stderr]).toEqual([0, WARNING]);
    expect(legacy.stdout).toContain('unit-load leg-u:');
    const root = await unit(sb, 'load', 'new-u');
    expect([root.code, root.stderr]).toEqual([0, '']);
  });

  it('[the-record-r14, the-record-r-4gj4k] a refusing run on a fallback unit prints its refusal line alone', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'leg-u');
    const r = await unit(sb, 'task', 'show', 'leg-u', 'no-such-task');
    expect(r.code).toBe(1);
    expect(r.stderr.split('\n').filter(Boolean)).toHaveLength(1);
    expect(r.stderr).not.toContain('WARNING');
  });

  it('[the-record-r-4gj4k] the board, the audit, the listing, and diagnose relay the warning once each', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'leg-u');
    for (const args of [['board', 'leg-u'], ['audit', 'leg-u'], ['list'], ['diagnose']]) {
      const r = await unit(sb, ...args);
      expect([r.code, r.stderr], args.join(' ')).toEqual([0, WARNING]);
    }
  });

  it('[the-record-r-4gj4k] a legacy unit\'s first stamp moves it whole, removing the deprecated root it empties; afterwards the load prints no warning and migrate moves nothing; its views equal a twin stamped in the root', async () => {
    const legacy = fresh(snap);
    const twin = fresh(snap);
    toFallback(legacy, 'leg-u');
    const stamp = await unit(legacy, 'stamp', 'leg-u');
    expect([stamp.code, stamp.stdout]).toEqual([0, 'transition: A1 -> A2\n']);
    expect(held(legacy, 'leg-u')).toEqual([true, false]);
    expect(existsSync(join(legacy, FALLBACK_ROOT))).toBe(false);
    await must(unit(twin, 'stamp', 'leg-u'));
    const after = await views(legacy, 'leg-u');
    expect(after.stderr).toEqual(['', '', '']);
    expect(after.stdout).toEqual((await views(twin, 'leg-u')).stdout);
    expect(await unit(legacy, 'migrate', 'leg-u')).toMatchObject({ code: 0, stdout: 'migrated: 0\n', stderr: '' });
  });

  it('[the-record-r-4gj4k] a landing write makes one store call, as before the root move: a record on a unit in the root and on a unit in the fallback each reach the resolver for its two reads and its one batch alone', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'leg-u');
    const log = join(sb, 'resolver-calls');
    const counting = join(sb, 'counting-resolver');
    writeFileSync(counting, '#!/bin/sh\nprintf \'%s\\n\' "$1" >> "$COUNT_LOG"\nexec "$REAL_RESOLVER" "$@"\n', { mode: 0o755 });
    const env = { CTX_STORE_RESOLVER: counting, COUNT_LOG: log, REAL_RESOLVER: join(sb, '.contexture/storage/scripts/driver-resolver') };
    const calls = async (slug: string): Promise<string[]> => {
      writeFileSync(log, '');
      await must(run(sb, ['unit', 'record', slug, '--what=a counted write'], { env }));
      return readFileSync(log, 'utf8').split('\n').filter(Boolean);
    };
    expect(await calls('new-u')).toEqual(['store.get', 'store.get', 'store.batch']);
    expect(await calls('leg-u')).toEqual(['store.get', 'store.get', 'store.batch']);
    expect(held(sb, 'leg-u')).toEqual([true, false]);
  });

  it('[the-record-r-4gj4k] ctx unit migrate on a legacy unit leaves the load, board, and audit stdout byte identical, the stderr losing only the warning', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'leg-u');
    const before = await views(sb, 'leg-u');
    expect(before.stderr).toEqual([WARNING, WARNING, WARNING]);
    expect(await unit(sb, 'migrate', 'leg-u')).toMatchObject({ code: 0, stdout: 'migrated: 1\n', stderr: '' });
    expect(held(sb, 'leg-u')).toEqual([true, false]);
    const after = await views(sb, 'leg-u');
    expect(after.stdout).toEqual(before.stdout);
    expect(after.stderr).toEqual(['', '', '']);
  });

  it('[the-record-r-4gj4k] every write to a CLOSED unit refuses and moves nothing', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'shut-u');
    const r = await unit(sb, 'record', 'shut-u', '--what=a write to a closed unit');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ERR_UNIT_CLOSED');
    expect(held(sb, 'shut-u')).toEqual([false, true]);
  });

  it('[the-record-r-4gj4k] ctx unit migrate --all moves every unit the store lists and is idempotent', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'leg-u');
    toFallback(sb, 'shut-u');
    expect(await unit(sb, 'migrate', '--all')).toMatchObject({ code: 0, stdout: 'migrated: 2\n', stderr: '' });
    expect([held(sb, 'leg-u'), held(sb, 'shut-u'), held(sb, 'new-u')]).toEqual([[true, false], [true, false], [true, false]]);
    expect(await unit(sb, 'migrate', '--all')).toMatchObject({ code: 0, stdout: 'migrated: 0\n', stderr: '' });
    expect((await unit(sb, 'list')).stderr).toBe('');
  });

  it('[the-record-r-4gj4k] a sweep that moves the last units out of the deprecated root removes that root', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'leg-u');
    toFallback(sb, 'shut-u');
    expect(await unit(sb, 'migrate', '--all')).toMatchObject({ code: 0, stdout: 'migrated: 2\n', stderr: '' });
    expect(existsSync(join(sb, FALLBACK_ROOT))).toBe(false);
  });

  it('[the-record-r-4gj4k] a deprecated root still holding a unit or another entry stays', async () => {
    const unitLeft = fresh(snap);
    toFallback(unitLeft, 'leg-u');
    toFallback(unitLeft, 'shut-u');
    expect(await unit(unitLeft, 'migrate', 'leg-u')).toMatchObject({ code: 0, stdout: 'migrated: 1\n', stderr: '' });
    expect(held(unitLeft, 'shut-u')).toEqual([false, true]);
    const entryLeft = fresh(snap);
    toFallback(entryLeft, 'leg-u');
    writeFileSync(join(entryLeft, FALLBACK_ROOT, 'notes.txt'), 'not a unit\n');
    expect(await unit(entryLeft, 'migrate', '--all')).toMatchObject({ code: 0, stdout: 'migrated: 1\n', stderr: '' });
    expect(readFileSync(join(entryLeft, FALLBACK_ROOT, 'notes.txt'), 'utf8')).toBe('not a unit\n');
  });

  it('[the-record-r-4gj4k] ctx unit migrate --all removes an already emptied deprecated root, migrated: 0; with no deprecated root it answers as before', async () => {
    const sb = fresh(snap);
    expect(await unit(sb, 'migrate', '--all')).toMatchObject({ code: 0, stdout: 'migrated: 0\n', stderr: '' });
    expect(existsSync(join(sb, FALLBACK_ROOT))).toBe(false);
    mkdirSync(join(sb, FALLBACK_ROOT));
    expect(await unit(sb, 'migrate', '--all')).toMatchObject({ code: 0, stdout: 'migrated: 0\n', stderr: '' });
    expect(existsSync(join(sb, FALLBACK_ROOT))).toBe(false);
    expect([held(sb, 'leg-u'), held(sb, 'new-u'), held(sb, 'shut-u')]).toEqual([[true, false], [true, false], [true, false]]);
  });

  it('[the-record-r-4gj4k] the first refusal stops the sweep, its line naming the unit held in both roots, rc 1; the units before it stay moved', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'leg-u');
    toFallback(sb, 'shut-u');
    cpSync(join(sb, FALLBACK_ROOT, 'shut-u'), join(sb, RECORD_ROOT, 'shut-u'), { recursive: true });
    const r = await unit(sb, 'migrate', '--all');
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toBe("unit.promote: error: unit 'shut-u': key prefix 'shut-u/' is held in both roots of namespace 'unit' (ERR_ENTITY_EXISTS)\n");
    expect(held(sb, 'leg-u')).toEqual([true, false]);
    expect(held(sb, 'shut-u')).toEqual([true, true]);
  });

  it('[the-record-r-4gj4k] a write to a unit both roots hold refuses with the store\'s line and writes nothing', async () => {
    const sb = fresh(snap);
    toFallback(sb, 'leg-u');
    mkdirSync(join(sb, RECORD_ROOT, 'leg-u'));
    const r = await unit(sb, 'record', 'leg-u', '--what=a write that cannot promote');
    expect(r.code).toBe(1);
    expect(r.stderr).toBe("entry.record: error: action 1 (put 'leg-u/journal'): key prefix 'leg-u/' is held in both roots of namespace 'unit' (ERR_ENTITY_EXISTS)\n");
    expect((await unit(sb, 'load', 'leg-u')).stdout).not.toContain('a write that cannot promote');
  });

  it.each([
    ['a bare call', [], 'Usage: ctx unit migrate <unit> [<unit>...] | ctx unit migrate --all\nhelp: ctx unit help migrate\n'],
    ['--all beside a unit', ['--all', 'leg-u'], "migrate: error: unexpected argument 'leg-u' (ERR_INVALID_ARGUMENT)\n"],
    ['a malformed unit', ['Bad!'], "migrate: error: malformed unit 'Bad!' (ERR_INVALID_ARGUMENT)\n"],
    ['an unknown unit', ['no-such-u'], "unit.promote: error: unit 'no-such-u' not found (ERR_ENTITY_NOT_FOUND)\n"],
  ])('[the-record-r-4gj4k] ctx unit migrate refuses %s rc 1 and moves nothing', async (_, args, stderr) => {
    const sb = fresh(snap);
    toFallback(sb, 'leg-u');
    expect(await unit(sb, 'migrate', ...args)).toMatchObject({ code: 1, stdout: '', stderr });
    expect(held(sb, 'leg-u')).toEqual([false, true]);
  });

  it('[the-record-r-4gj4k] ctx unit migrate --help prints its table, naming no storage location', async () => {
    const r = await unit(fresh(snap), 'migrate', '--help');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^ctx unit migrate: /);
    expect(r.stdout).toContain('ctx unit migrate --all');
    expect(r.stdout).not.toMatch(/\.contexture|\//);
  });
});

describe.skipIf(!fts5Available())('ctx unit migrate under a store that keeps no fallback root', () => {
  it('[the-record-r-4gj4k] prints that nothing moves, rc 0', async () => {
    const sb = stage('fts5', 'migrate-fts5');
    await seedUnit(sb, 'f-u');
    expect(await unit(sb, 'migrate', '--all')).toMatchObject({ code: 0, stdout: 'nothing moves: the store keeps no fallback\n', stderr: '' });
  });
});
