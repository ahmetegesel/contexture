import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, LEFTOVERS_STAMP, RECORD_ROOT, leaks } from '../support/drawer';
import { launch } from '../support/exec';
import { ROOT_USER } from '../support/plants';
import { fresh, seed } from '../support/snapshot';
import { createLane, lane, must, run, seedUnit, unit, waitFor } from '../support/unit';

// ctx unit migrate --sweep over a sandbox record: two active units and a CLOSED one, every
// kind planted beside real documents, keys outside the document rules among them (lane
// scratch written as .md files), and leftovers at the top of both roots

const BACKUPS = '.contexture/backups';

function plant(sb: string, rel: string, bytes: string): void {
  mkdirSync(dirname(join(sb, rel)), { recursive: true });
  writeFileSync(join(sb, rel), bytes);
}

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
      return `${p}=${readFileSync(full, 'utf8')}`;
    });
}

function plantLeftovers(sb: string): void {
  const r = (rel: string) => join(RECORD_ROOT, rel);
  plant(sb, r('sw-a/notes.txt'), '12345');
  plant(sb, r('sw-a/lanes/l1/scratch/run.md'), 'run\n');
  plant(sb, r('sw-a/lanes/l1/sb/deep/x.json'), '{}');
  symlinkSync('nowhere', join(sb, r('sw-a/link')));
  mkdirSync(join(sb, r('sw-a/empty')));
  plant(sb, r('sw-c/old.md'), 'old\n');
  plant(sb, r('sw-c/tmp/file'), 'abc');
  plant(sb, r('stray.txt'), 'top');
  mkdirSync(join(sb, FALLBACK_ROOT, '.lock'), { recursive: true });
  plant(sb, join(FALLBACK_ROOT, 'old-unit/x.txt'), 'xy');
}

const UNIT_LINES = [
  'unit sw-a: stray files 1 (5 bytes), folders outside the key shape 1 (2 bytes), empty folders 1 (0 bytes), symbolic links 1 (0 bytes), keys outside the document rules 1 (4 bytes); 1 folder emptied',
  'unit sw-b: nothing beyond the documents',
  'unit sw-c: folders outside the key shape 1 (3 bytes), keys outside the document rules 1 (4 bytes); 0 folders emptied',
  'outside the units: stray files 1 (3 bytes), folders outside the key shape 1 (2 bytes), lock or write remnants 1 (0 bytes); 0 folders emptied',
];
const CLEAN_LINES = ['unit sw-a: nothing beyond the documents', 'unit sw-b: nothing beyond the documents', 'unit sw-c: nothing beyond the documents', 'outside the units: nothing beyond the documents'];
const MOVED_ROOT = [
  'stray.txt=top', 'sw-a/', 'sw-a/empty/', 'sw-a/lanes/', 'sw-a/lanes/l1/', 'sw-a/lanes/l1/sb/', 'sw-a/lanes/l1/sb/deep/', 'sw-a/lanes/l1/sb/deep/x.json={}',
  'sw-a/lanes/l1/scratch/', 'sw-a/lanes/l1/scratch/run.md=run\n', 'sw-a/link -> nowhere', 'sw-a/notes.txt=12345', 'sw-c/', 'sw-c/old.md=old\n', 'sw-c/tmp/', 'sw-c/tmp/file=abc',
];
const MOVED_FALLBACK = ['.lock/', 'old-unit/', 'old-unit/x.txt=xy'];

// the leftovers nudge of ctx unit list reports the leftovers, so it changes with them by
// design: the views compare without it, and the nudges they printed land in the given list
const NUDGE = /^NUDGE: .*\n/gm;
const NUDGE_10 = "NUDGE: the record's storage holds 10 items (23 bytes) beyond its documents; the human's word comes first: tell them, show them the dry run ctx unit migrate --sweep --dry-run --all, and sweep only on their word, moving the leftovers into a backup or deleting them (--delete)\n";
const dayMark = (sb: string): string => readFileSync(join(sb, LEFTOVERS_STAMP), 'utf8');

// every view a unit verb answers over the record, the reads the sweep must leave byte equal
async function views(sb: string, nudges: string[] = []): Promise<string[]> {
  const out: string[] = [];
  for (const args of [
    ['load', 'sw-a'], ['load', 'sw-c'], ['board', 'sw-a'], ['list', '--all'], ['list'], ['audit', 'sw-a'], ['audit', 'sw-c'],
    ['get', 'sw-a/task/t1'], ['get', 'sw-a/lane/l1/recipe'], ['get', 'sw-a/lane/l1/journal'], ['search', 'sweep', '--all'], ['search', 'objective', '--all', '--json'],
  ]) {
    const r = await unit(sb, ...args);
    expect(r.code, `${args.join(' ')}: ${r.stderr}`).toBe(0);
    nudges.push(...(r.stderr.match(NUDGE) ?? []));
    out.push(`${args.join(' ')}\n${r.stdout}${r.stderr.replace(NUDGE, '')}`);
  }
  return out;
}

describe.concurrent('ctx unit migrate --sweep', () => {
  let snap: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      await seedUnit(sb, 'sw-a', 'the sweep unit with a lane');
      await must(unit(sb, 'task', 'add', 'sw-a', 't1', '--objective=the sweep task'));
      await must(unit(sb, 'record', 'sw-a', '--what=a sweep entry'));
      await must(createLane(sb, 'sw-a', 'l1'));
      await must(lane(sb, 'record', 'sw-a', 'l1', '--what=a sweep lane event'));
      await seedUnit(sb, 'sw-b', 'the clean unit');
      await seedUnit(sb, 'sw-c', 'the closed unit');
      await must(unit(sb, 'close', 'sw-c'));
    }, 'posix', 'migrate-sweep');
  });

  it('[the-record-r-swp02] the dry run writes nothing and prints exactly what the run does; the run moves the planted content of every unit, the CLOSED one included, and of the top of both roots into the stamped backup, leaves every view byte equal, and a second run moves nothing', async () => {
    const sb = fresh(snap);
    plantLeftovers(sb);
    const roots = () => [tree(join(sb, RECORD_ROOT)), tree(join(sb, FALLBACK_ROOT))];
    const before = roots();
    const nudged: string[] = [];
    const seen = await views(sb, nudged);
    expect(nudged, 'the first listing of the day nudges once, with the counts the dry run closes on').toEqual([NUDGE_10]);
    const measured = dayMark(sb);
    const dry = await unit(sb, 'migrate', '--sweep', '--dry-run', '--all');
    expect([dry.code, dry.stderr]).toEqual([0, '']);
    expect(dry.stdout).toBe([...UNIT_LINES, 'dry run: would move 10 items (23 bytes) and empty 1 folder; nothing written', ''].join('\n'));
    expect(roots(), 'the dry run writes nothing').toEqual(before);
    expect(existsSync(join(sb, BACKUPS))).toBe(false);
    expect(dayMark(sb), 'a dry run leaves the day\'s measure as it was').toBe(measured);
    const swept = await unit(sb, 'migrate', '--sweep', '--all');
    expect([swept.code, swept.stderr]).toEqual([0, '']);
    const lines = swept.stdout.split('\n');
    expect(lines.slice(0, 4)).toEqual(UNIT_LINES);
    const stamp = /^swept: moved 10 items \(23 bytes\) into the backup stamped ([0-9]{8}-[0-9]{6}-[0-9]+) and emptied 1 folder$/.exec(lines[4] ?? '')?.[1];
    expect(stamp, lines[4]).toBeDefined();
    expect(lines.slice(5)).toEqual(['']);
    expect(swept.stdout.split('\n').filter(leaks)).toEqual([]);
    const backup = join(sb, BACKUPS, `sweep-${stamp}`, 'unit');
    expect(tree(join(backup, 'root'))).toEqual(MOVED_ROOT);
    expect(tree(join(backup, 'fallback'))).toEqual(MOVED_FALLBACK);
    expect(existsSync(join(sb, FALLBACK_ROOT)), 'the emptied deprecated root is dropped').toBe(false);
    expect(existsSync(join(sb, LEFTOVERS_STAMP)), 'the sweep run lets the next listing measure again').toBe(false);
    const after: string[] = [];
    expect(await views(sb, after)).toEqual(seen);
    expect(after, 'the listing after the sweep measures nothing beyond the documents').toEqual([]);
    expect(dayMark(sb)).toMatch(/^\d{4}-\d{2}-\d{2} 0 0\n$/);
    const again = await unit(sb, 'migrate', '--sweep', '--all');
    expect([again.code, again.stdout, again.stderr]).toEqual([0, [...CLEAN_LINES, 'swept: nothing beyond the documents; nothing moved', ''].join('\n'), '']);
    const probe = await unit(sb, 'diagnose', '--leftovers');
    expect(probe.stdout).toMatch(/^ {4}root: \d+ documents in \d+ entries, nothing beyond them\n {4}fallback root: absent \(not made yet\)\n$/m);
  });

  it('[the-record-r-swp02] --delete removes the same content with no backup kept, every view byte equal', async () => {
    const sb = fresh(snap);
    plantLeftovers(sb);
    const nudged: string[] = [];
    const seen = await views(sb, nudged);
    expect(nudged).toEqual([NUDGE_10]);
    const dry = await unit(sb, 'migrate', '--sweep', '--delete', '--dry-run', '--all');
    expect(dry.stdout).toBe([...UNIT_LINES, 'dry run: would delete 10 items (23 bytes) and empty 1 folder; nothing written', ''].join('\n'));
    const r = await unit(sb, 'migrate', '--sweep', '--delete', '--all');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, [...UNIT_LINES, 'swept: deleted 10 items (23 bytes) with no backup kept and emptied 1 folder', ''].join('\n'), '']);
    expect(existsSync(join(sb, BACKUPS)), 'a delete keeps no backup').toBe(false);
    expect(await views(sb)).toEqual(seen);
    expect(tree(join(sb, RECORD_ROOT)).map((p) => p.split('=')[0] ?? '').filter((p) => /notes\.txt|scratch|link|empty|old\.md|tmp|stray/.test(p))).toEqual([]);
  });

  it('[the-record-r-swp02] a named unit is swept alone under its lock, a CLOSED one reached, nothing beside it touched and nothing outside the units', async () => {
    const sb = fresh(snap);
    plantLeftovers(sb);
    const r = await unit(sb, 'migrate', '--sweep', 'sw-c');
    expect(r.code).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe(UNIT_LINES[2]);
    expect(r.stdout).toMatch(/^swept: moved 2 items \(7 bytes\) into the backup stamped [0-9-]+ and emptied 0 folders$/m);
    expect(r.stdout).not.toContain('outside the units');
    expect(existsSync(join(sb, RECORD_ROOT, 'sw-c/old.md'))).toBe(false);
    expect(existsSync(join(sb, RECORD_ROOT, 'sw-a/notes.txt'))).toBe(true);
    expect(existsSync(join(sb, RECORD_ROOT, 'stray.txt'))).toBe(true);
    expect((await unit(sb, 'audit', 'sw-c')).code).toBe(0);
  });

  it('[the-record-r-swp02] refuses --delete without --sweep, --sweep beside --forward, an unknown unit, a bare sweep, and a repeated flag, each with one line', async () => {
    const sb = fresh(snap);
    plantLeftovers(sb);
    const refusal = async (args: string[], line: string | RegExp) => {
      const r = await unit(sb, 'migrate', ...args);
      expect([r.code, r.stdout], args.join(' ')).toEqual([1, '']);
      if (typeof line === 'string') expect(r.stderr, args.join(' ')).toBe(`${line}\n`);
      else expect(r.stderr, args.join(' ')).toMatch(line);
    };
    await refusal(['--delete', '--all'], 'migrate: error: --delete removes what the sweep finds, so it takes --sweep (ERR_INVALID_ARGUMENT)');
    await refusal(['--sweep', '--forward=store#a/=store#b/', '--all'], 'migrate: error: --sweep runs no other migration, so it takes no --forward (ERR_INVALID_ARGUMENT)');
    await refusal(['--sweep', 'nope'], "unit.sweep: error: unit 'nope' not found (ERR_ENTITY_NOT_FOUND)");
    await refusal(['--sweep'], /^Usage: ctx unit migrate .*--sweep \[--dry-run\] \[--delete\]/);
    await refusal(['--sweep', '--sweep', '--all'], "migrate: error: unknown option '--sweep' (ERR_INVALID_ARGUMENT)");
    expect(existsSync(join(sb, BACKUPS))).toBe(false);
  });

  it('[the-record-r-swp02] the help names the sweep and its forms, and names no storage path', async () => {
    const r = await run(fresh(snap), ['unit', 'help', 'migrate']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('ctx unit migrate --sweep [--dry-run] [--delete] --all');
    expect(r.stdout.split('\n').filter(leaks)).toEqual([]);
  });
});

// the guards and surfaces over a second sandbox record: the state guard before any walk, a key
// segment that is no unit labelled apart, a unit held in both roots refused, a refusal midway
// naming what was swept before it, and a signal stopping the sweep

const STAMP = '([0-9]{8}-[0-9]{6}-[0-9]+)';

// a resolver that logs the function of every call it serves and, when asked, answers the
// sweep of one unit with a refusal carrying a count of items swept before it, doing nothing
function resolver(sb: string, refuseUnit = ''): { env: Record<string, string>; calls: () => string[] } {
  const log = join(sb, 'resolver-calls');
  const path = join(sb, 'logging-resolver');
  writeFileSync(path, [
    '#!/bin/sh',
    'printf \'%s\\n\' "$1" >> "$CALL_LOG"',
    'if [ "$1" = storage.sweep ] && [ -n "$REFUSE_UNIT" ]; then',
    '  for a in "$@"; do',
    '    if [ "$a" = "--prefix=$REFUSE_UNIT/" ]; then printf \'storage.sweep: error: the sweep could not move one of the stray files (3 items swept before it) (ERR_STORAGE_WRITE)\\n\' >&2; exit 2; fi',
    '  done',
    'fi',
    'exec "$REAL_RESOLVER" "$@"',
    '',
  ].join('\n'), { mode: 0o755 });
  writeFileSync(log, '');
  return {
    env: { CTX_STORE_RESOLVER: path, CALL_LOG: log, REFUSE_UNIT: refuseUnit, REAL_RESOLVER: join(sb, '.contexture/storage/scripts/driver-resolver') },
    calls: () => {
      const seen = readFileSync(log, 'utf8').split('\n').filter(Boolean);
      writeFileSync(log, '');
      return seen;
    },
  };
}

// the processes still running a script of the sandbox
function survivors(sb: string): string[] {
  return spawnSync('ps', ['-A', '-o', 'pid=', '-o', 'command='], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.includes(sb));
}

describe.concurrent('ctx unit migrate --sweep: the guards', () => {
  let snap: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      await seedUnit(sb, 'g-a', 'the first unit');
      await must(unit(sb, 'record', 'g-a', '--what=an entry'));
      await seedUnit(sb, 'g-b', 'the second unit, with a lane');
      await must(createLane(sb, 'g-b', 'l1'));
      await seedUnit(sb, 'g-c', 'the third unit');
    }, 'posix', 'migrate-sweep-guards');
  });

  it('[the-record-r-swp02] refuses rc 1 naming the cause, before any walk or write and in every form, when the installed unit declaration does not declare the state unsearched', async () => {
    const sb = fresh(snap);
    const data = join(sb, '.contexture/modules/unit/data');
    const declared = readFileSync(data, 'utf8');
    expect(declared).toMatch(/^unsearched: <unit>\/state$/m);
    writeFileSync(data, declared.replace(/^unsearched: .*\n/m, ''));
    plant(sb, join(RECORD_ROOT, 'g-a/notes.txt'), '12345');
    const before = tree(join(sb, RECORD_ROOT));
    const log = resolver(sb);
    const line = "unit.sweep: error: the installed unit declaration does not declare the state unsearched, so the sweep would take every unit's state for a key outside the document rules; it swept nothing (install the whole unit module first) (ERR_INVALID_ARGUMENT)\n";
    for (const args of [['--dry-run', '--all'], ['--all'], ['--delete', '--all'], ['--dry-run', 'g-a'], ['g-a']]) {
      const r = await run(sb, ['unit', 'migrate', '--sweep', ...args], { env: log.env });
      expect([r.code, r.stdout, r.stderr], args.join(' ')).toEqual([1, '', line]);
      expect(log.calls(), `${args.join(' ')}: no storage layer call, so no walk`).toEqual([]);
    }
    expect(tree(join(sb, RECORD_ROOT)), 'every state and leftover in place').toEqual(before);
    expect(existsSync(join(sb, BACKUPS))).toBe(false);
    writeFileSync(data, declared);
    const ok = await run(sb, ['unit', 'migrate', '--sweep', '--dry-run', 'g-a'], { env: log.env });
    expect([ok.code, ok.stdout]).toEqual([0, 'unit g-a: stray files 1 (5 bytes); 0 folders emptied\ndry run: would move 1 item (5 bytes) and empty 0 folders; nothing written\n']);
    expect(log.calls(), 'the instrument sees the walk once the line is declared').toContain('storage.sweep');
  });

  it('[the-record-r-swp02] --all labels a first key segment holding no unit state apart from the units, the dry run and the run alike', async () => {
    const sb = fresh(snap);
    plant(sb, join(RECORD_ROOT, 'g-a/notes.txt'), '12345');
    plant(sb, join(RECORD_ROOT, 'nounit/old.md'), 'old\n');
    const lines = [
      'unit g-a: stray files 1 (5 bytes); 0 folders emptied',
      'unit g-b: nothing beyond the documents',
      'unit g-c: nothing beyond the documents',
      'outside the units, key segment nounit: keys outside the document rules 1 (4 bytes); 1 folder emptied',
      'outside the units: nothing beyond the documents',
    ];
    const dry = await unit(sb, 'migrate', '--sweep', '--dry-run', '--all');
    expect([dry.code, dry.stdout, dry.stderr]).toEqual([0, [...lines, 'dry run: would move 2 items (9 bytes) and empty 1 folder; nothing written', ''].join('\n'), '']);
    const r = await unit(sb, 'migrate', '--sweep', '--all');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.split('\n').slice(0, 5)).toEqual(lines);
    expect(r.stdout).toMatch(new RegExp(`^swept: moved 2 items \\(9 bytes\\) into the backup stamped ${STAMP} and emptied 1 folder$`, 'm'));
    expect(r.stdout).not.toMatch(/^unit nounit:/m);
    expect(existsSync(join(sb, RECORD_ROOT, 'nounit'))).toBe(false);
  });

  it('[the-record-r-swp02] a unit whose keys the store holds in both roots refuses rc 1 before anything of it is swept, the dry run and --delete alike, as ctx unit migrate refuses it; under --all the units before it are swept and named first', async () => {
    const sb = fresh(snap);
    cpSync(join(sb, RECORD_ROOT, 'g-b'), join(sb, FALLBACK_ROOT, 'g-b'), { recursive: true });
    const keys = tree(join(sb, FALLBACK_ROOT)).filter((p) => p.includes('.md=')).length;
    expect(keys).toBeGreaterThan(3);
    plant(sb, join(RECORD_ROOT, 'g-a/notes.txt'), '12345');
    plant(sb, join(RECORD_ROOT, 'g-b/notes.txt'), 'bb');
    const fallback = tree(join(sb, FALLBACK_ROOT));
    const line = `unit.sweep: error: unit 'g-b': key prefix 'g-b/' is held in both roots of namespace 'unit', so the sweep would take the deprecated root's copy of ${keys} keys the root holds too; it swept nothing of it (ctx unit migrate refuses it too) (ERR_ENTITY_EXISTS)\n`;
    for (const [flags, closing] of [
      [['--dry-run'], 'dry run: would stop before sweeping anything; nothing written\n'],
      [[], 'stopped: nothing swept before the stop\n'],
      [['--delete'], 'stopped: nothing swept before the stop\n'],
    ] as const) {
      const r = await unit(sb, 'migrate', '--sweep', ...flags, 'g-b');
      expect([r.code, r.stdout, r.stderr], flags.join(' ')).toEqual([1, closing, line]);
      expect(tree(join(sb, FALLBACK_ROOT)), 'the deprecated root\'s copy untouched').toEqual(fallback);
      expect(existsSync(join(sb, RECORD_ROOT, 'g-b/notes.txt')), 'nothing of the unit swept').toBe(true);
    }
    const m = await unit(sb, 'migrate', 'g-b');
    expect([m.code, m.stderr]).toEqual([1, "unit.migrate: error: unit 'g-b': key prefix 'g-b/' is held in both roots of namespace 'unit' (ERR_ENTITY_EXISTS)\n"]);
    const all = await unit(sb, 'migrate', '--sweep', '--all');
    expect([all.code, all.stderr]).toEqual([1, line]);
    const stamp = new RegExp(`^unit g-a: stray files 1 \\(5 bytes\\); 0 folders emptied\\nstopped: swept 1 item before the stop, moved into the backup stamped ${STAMP}\\n$`).exec(all.stdout)?.[1];
    expect(stamp, all.stdout).toBeDefined();
    expect(tree(join(sb, BACKUPS, `sweep-${stamp}`, 'unit/root'))).toEqual(['g-a/', 'g-a/notes.txt=12345']);
    expect(tree(join(sb, FALLBACK_ROOT))).toEqual(fallback);
  });

  it.skipIf(ROOT_USER)('[the-record-r-swp02] a refusal midway first prints the line of every unit swept before it and one line with the run total swept before the stop and the backup stamp, then the refusal; the units swept before it stay swept', async ({ onTestFinished }) => {
    const sb = fresh(snap);
    plant(sb, join(RECORD_ROOT, 'g-a/notes.txt'), '12345');
    plant(sb, join(RECORD_ROOT, 'g-b/notes.txt'), 'bb');
    plant(sb, join(RECORD_ROOT, 'g-c/notes.txt'), 'c');
    chmodSync(join(sb, RECORD_ROOT, 'g-b'), 0o555);
    onTestFinished(() => chmodSync(join(sb, RECORD_ROOT, 'g-b'), 0o755));
    const r = await unit(sb, 'migrate', '--sweep', '--all');
    expect([r.code, r.stderr]).toEqual([2, "unit.sweep: error: unit 'g-b': the sweep could not move one of the stray files (0 items swept before it) (ERR_STORAGE_WRITE)\n"]);
    const stamp = new RegExp(`^unit g-a: stray files 1 \\(5 bytes\\); 0 folders emptied\\nstopped: swept 1 item before the stop, moved into the backup stamped ${STAMP}\\n$`).exec(r.stdout)?.[1];
    expect(stamp, r.stdout).toBeDefined();
    expect(tree(join(sb, BACKUPS, `sweep-${stamp}`, 'unit/root')).filter((p) => p.includes('=')), 'the stamp names the partial backup').toEqual(['g-a/notes.txt=12345']);
    expect(existsSync(join(sb, RECORD_ROOT, 'g-c/notes.txt')), 'the units after the stop untouched').toBe(true);
    const d = await unit(sb, 'migrate', '--sweep', '--delete', '--all');
    expect([d.code, d.stdout]).toEqual([2, 'unit g-a: nothing beyond the documents\nstopped: nothing swept before the stop\n']);
  });

  it('[the-record-r-swp02] the run total adds the items the refused call swept before it to the units before it, in the delete form too; a dry run refused midway names what the run would have swept', async () => {
    const sb = fresh(snap);
    plant(sb, join(RECORD_ROOT, 'g-a/notes.txt'), '12345');
    const log = resolver(sb, 'g-b');
    const refusal = "unit.sweep: error: unit 'g-b': the sweep could not move one of the stray files (3 items swept before it) (ERR_STORAGE_WRITE)\n";
    const r = await run(sb, ['unit', 'migrate', '--sweep', '--all'], { env: log.env });
    expect([r.code, r.stderr]).toEqual([2, refusal]);
    expect(r.stdout).toMatch(new RegExp(`^unit g-a: stray files 1 \\(5 bytes\\); 0 folders emptied\\nstopped: swept 4 items before the stop, moved into the backup stamped ${STAMP}\\n$`));
    plant(sb, join(RECORD_ROOT, 'g-a/notes.txt'), '12345');
    const d = await run(sb, ['unit', 'migrate', '--sweep', '--delete', '--all'], { env: log.env });
    expect([d.code, d.stdout, d.stderr]).toEqual([2, 'unit g-a: stray files 1 (5 bytes); 0 folders emptied\nstopped: swept 4 items before the stop, deleted with no backup kept\n', refusal]);
    const nl = fresh(snap);
    plant(nl, join(RECORD_ROOT, 'g-a/notes.txt'), '12345');
    plant(nl, join(RECORD_ROOT, 'g-b/bad\nname'), 'x');
    const dry = await unit(nl, 'migrate', '--sweep', '--dry-run', '--all');
    expect([dry.code, dry.stdout, dry.stderr]).toEqual([2, 'unit g-a: stray files 1 (5 bytes); 0 folders emptied\ndry run: would stop after sweeping 1 item; nothing written\n', "unit.sweep: error: unit 'g-b': 1 entry whose name holds a newline lies in the sweep's reach, and the sweep never parses such a name, so it swept nothing (rename or remove each one first) (ERR_STORAGE_READ)\n"]);
    expect(existsSync(join(nl, BACKUPS))).toBe(false);
  });

  it('[the-record-r-swp02] a termination, an interrupt, or a hangup stops the sweep: the verb sends its children a termination, waits for them, names the stop with the backup stamp, and exits 143, 130, or 129; no child survives, the locks are free, and a second run sweeps the rest', { timeout: 120_000 }, async () => {
    for (const [sig, rc] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]] as const) {
      const sb = fresh(snap);
      const total = 6000;
      for (let i = 0; i < total; i++) writeFileSync(join(sb, RECORD_ROOT, 'g-a', `k${i}.md`), '');
      const left = () => readdirSync(join(sb, RECORD_ROOT, 'g-a')).filter((n) => /^k[0-9]+\.md$/.test(n)).length;
      const sweep = launch('./.contexture/ctx', ['unit', 'migrate', '--sweep', 'g-a'], { cwd: sb, input: null });
      expect(await waitFor(() => left() < total, 60_000, 50), `${sig}: the first batch moved`).toBe(true);
      sweep.signal(sig);
      const r = await sweep.result;
      const stamp = new RegExp(`^migrate: stopped by a signal; what the sweep moved before the stop lies in the backup stamped ${STAMP}\\n$`).exec(r.stderr)?.[1];
      expect([r.code, r.stdout, stamp === undefined ? r.stderr : 'named'], sig).toEqual([rc, '', 'named']);
      const remaining = left();
      expect(remaining, `${sig}: the sweep stopped before its end`).toBeGreaterThan(0);
      expect(survivors(sb), `${sig}: no child of the sweep survives`).toEqual([]);
      expect(readdirSync(join(sb, BACKUPS, `sweep-${stamp}`, 'unit/root/g-a')).length, `${sig}: the stamp names what was moved`).toBe(total - remaining);
      const w = await unit(sb, 'record', 'g-a', '--what=after the stop');
      expect(w.code, `${sig}: the unit and namespace locks are free: ${w.stderr}`).toBe(0);
      const again = await unit(sb, 'migrate', '--sweep', 'g-a');
      expect(again.code).toBe(0);
      expect(left(), `${sig}: a second run sweeps the rest`).toBe(0);
    }
  });

  it('[the-record-r-swp02] the help names the labels, the guards, the midway lines, the stop, and the exit codes scoped to each form, naming no storage path', async () => {
    const r = await run(fresh(snap), ['unit', 'help', 'migrate']);
    expect(r.code).toBe(0);
    for (const part of [
      'a key folder holding no document below it moved or removed whole as one item and counted as emptied',
      'a folder it cannot read or enter is never moved or removed, in either form, nor any folder above it: the sweep leaves it untouched and names it',
      'a name holding a newline, which the diagnostic counts, refuses the run rc 2, the dry run too',
      'a first key segment holding no unit state labelled outside the units, key segment <segment>: ...',
      'the sweep refuses rc 1 before any walk when the installed unit declaration does not declare the state unsearched',
      'a unit or key prefix whose keys the storage layer holds in both roots',
      'stopped: swept <n> items before the stop, moved into the backup stamped <stamp>',
      'a hangup, an interrupt, or a termination stops the sweep',
      'for the migration a unit the storage layer holds in both roots, and for the sweep a unit or key prefix whose keys the storage layer holds in both roots',
    ]) expect(r.stdout).toContain(part);
    expect(r.stdout).not.toContain('and the folders it empties removed');
    expect(r.stdout).not.toMatch(/special files, unreadable folders, lock/);
    expect(r.stdout.split('\n').filter(leaks)).toEqual([]);
    expect(r.stdout).not.toMatch(/ - |—|–/);
  });
});
