import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, LEFTOVERS_STAMP, RECORD_ROOT, leaks } from '../support/drawer';
import { launch } from '../support/exec';
import { sweepGate } from '../support/plants';
import { fresh, seed } from '../support/snapshot';
import { must, run, seedUnit, unit, waitFor } from '../support/unit';

// the leftovers nudge of ctx unit list (lib/verb.sh): the storage layer's read only probe at
// most once a day through the day's mark in the drawer's scratch, its one line after the
// answer, and the sweep run holding it back, over a sandbox record with and without leftovers

const nudge = (items: string, bytes: number): string =>
  `NUDGE: the record's storage holds ${items} (${bytes} bytes) beyond its documents; the human's word comes first: tell them, show them the dry run ctx unit migrate --sweep --dry-run --all, and sweep only on their word, moving the leftovers into a backup or deleting them (--delete)\n`;

function plant(sb: string, rel: string, bytes: string): void {
  mkdirSync(dirname(join(sb, rel)), { recursive: true });
  writeFileSync(join(sb, rel), bytes);
}

// three items, nine bytes: a stray file and a key outside the document rules (old lane scratch)
// in one unit's folder, and a lock remnant at the top of the deprecated root
function plantLeftovers(sb: string): void {
  plant(sb, join(RECORD_ROOT, 'ln-a/notes.txt'), '12345');
  plant(sb, join(RECORD_ROOT, 'ln-a/lanes/old/scratch/run.md'), 'run\n');
  mkdirSync(join(sb, FALLBACK_ROOT, '.lock'), { recursive: true });
}

const pad = (n: number): string => String(n).padStart(2, '0');
const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const mark = (sb: string): string => readFileSync(join(sb, LEFTOVERS_STAMP), 'utf8');
const setMark = (sb: string, line: string): void => plant(sb, LEFTOVERS_STAMP, `${line}\n`);

// a resolver that logs the function of every call it serves (and, on a sweep call, the day's
// mark as the sweep finds it), and refuses the probe when asked to
function counting(sb: string, refuseProbe = false): { env: Record<string, string>; calls: () => string[]; seenMarks: () => string } {
  const log = join(sb, 'resolver-calls');
  const marks = join(sb, 'marks-at-sweep');
  const path = join(sb, 'counting-resolver');
  writeFileSync(path, [
    '#!/bin/sh',
    'printf \'%s\\n\' "$1" >> "$COUNT_LOG"',
    'if [ "$1" = storage.sweep ]; then cat "$STAMP" >> "$MARKS" 2>/dev/null || printf \'none\\n\' >> "$MARKS"; fi',
    'if [ "$1" = storage.leftovers ] && [ "$REFUSE_PROBE" = 1 ]; then printf \'storage.leftovers: error: the probe refused for the test (ERR_STORAGE_READ)\\n\' >&2; exit 2; fi',
    'exec "$REAL_RESOLVER" "$@"',
    '',
  ].join('\n'), { mode: 0o755 });
  writeFileSync(log, '');
  writeFileSync(marks, '');
  return {
    env: { CTX_STORE_RESOLVER: path, COUNT_LOG: log, MARKS: marks, STAMP: join(sb, LEFTOVERS_STAMP), REFUSE_PROBE: refuseProbe ? '1' : '0', REAL_RESOLVER: join(sb, '.contexture/storage/scripts/driver-resolver') },
    calls: () => {
      const seen = readFileSync(log, 'utf8').split('\n').filter(Boolean);
      writeFileSync(log, '');
      return seen;
    },
    seenMarks: () => {
      const seen = readFileSync(marks, 'utf8');
      writeFileSync(marks, '');
      return seen;
    },
  };
}

const probes = (calls: readonly string[]): number => calls.filter((c) => c === 'storage.leftovers').length;

describe.concurrent('ctx unit list: the leftovers nudge', () => {
  let snap: string;
  let clean: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      await seedUnit(sb, 'ln-a', 'the nudge unit');
      await seedUnit(sb, 'ln-b', 'the clean unit');
    }, 'posix', 'list-nudge');
    clean = (await unit(snap, 'list')).stdout;
    rmSync(join(snap, LEFTOVERS_STAMP), { force: true });
  });

  it('[the-record-r-nudge] the first listing of the day over a record holding leftovers keeps its answer and prints the nudge once after it, its counts the dry run\'s closing counts, naming no path; a clean record measured the same way prints none', async () => {
    const sb = fresh(snap);
    plantLeftovers(sb);
    const r = await unit(sb, 'list');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, clean, nudge('3 items', 9)]);
    expect(mark(sb)).toBe(`${today()} 3 9\n`);
    const dry = await unit(sb, 'migrate', '--sweep', '--dry-run', '--all');
    expect(dry.stdout).toMatch(/^dry run: would move 3 items \(9 bytes\) and empty \d+ folders?; nothing written$/m);
    expect(leaks(r.stderr), 'the nudge names no record storage path').toBe(false);
    expect(r.stderr).not.toMatch(/ - |—|–/);
    const none = fresh(snap);
    const c = await unit(none, 'list');
    expect([c.code, c.stdout, c.stderr]).toEqual([0, clean, '']);
    expect(mark(none), 'the clean record was measured, so the silence is the measure\'s').toBe(`${today()} 0 0\n`);
    const all = fresh(snap);
    plantLeftovers(all);
    const a = await unit(all, 'list', '--all');
    expect([a.code, a.stderr], 'every form of a listing that answers measures').toEqual([0, nudge('3 items', 9)]);
    const refused = fresh(snap);
    plantLeftovers(refused);
    const f = await unit(refused, 'list', '--repo=none-such');
    expect(f.code).toBe(1);
    expect(f.stderr).toMatch(/^ERROR: no unit touches repo: none-such/);
    expect(f.stderr, 'a refusing listing prints its refusal line alone').not.toContain('NUDGE');
    expect(() => mark(refused), 'and measures nothing').toThrow();
  });

  it('[the-record-r-nudge] the throttle: the first listing of the day calls the probe once, the later listings that day call it never and print nothing, and a mark of an earlier day (the period passed) probes again and repeats the nudge with the same counts', async () => {
    const sb = fresh(snap);
    plantLeftovers(sb);
    const counter = counting(sb);
    const first = await run(sb, ['unit', 'list'], { env: counter.env });
    expect(first.stderr).toBe(nudge('3 items', 9));
    expect(probes(counter.calls()), 'the instrument sees the probe when it runs').toBe(1);
    for (let i = 0; i < 2; i++) {
      const later = await run(sb, ['unit', 'list'], { env: counter.env });
      expect([later.code, later.stdout, later.stderr]).toEqual([0, clean, '']);
      const calls = counter.calls();
      expect(calls.length, 'the listing itself still reached the storage layer').toBeGreaterThan(0);
      expect(probes(calls), 'no probe, so no extra walk, on a later listing of the day').toBe(0);
    }
    setMark(sb, '2000-01-01 3 9');
    const next = await run(sb, ['unit', 'list'], { env: counter.env });
    expect(next.stderr, 'the period passed, so the standing nudge repeats').toBe(nudge('3 items', 9));
    expect(probes(counter.calls())).toBe(1);
    expect(mark(sb)).toBe(`${today()} 3 9\n`);
  });

  it('[the-record-r-nudge] the counts change by a sweep run: it removes the day\'s mark, so the next listing measures again and nudges the remainder (one item), the one after it stays silent, and once nothing is left the listing prints nothing', async () => {
    const sb = fresh(snap);
    plantLeftovers(sb);
    expect((await unit(sb, 'list')).stderr).toBe(nudge('3 items', 9));
    await must(unit(sb, 'migrate', '--sweep', 'ln-a'));
    expect(() => mark(sb), 'the sweep run removed the mark').toThrow();
    const rest = await unit(sb, 'list');
    expect([rest.code, rest.stderr]).toEqual([0, nudge('1 item', 0)]);
    expect((await unit(sb, 'list')).stderr).toBe('');
    await must(unit(sb, 'migrate', '--sweep', '--delete', '--all'));
    const after = await unit(sb, 'list');
    expect([after.code, after.stdout, after.stderr]).toEqual([0, clean, '']);
    expect(mark(sb)).toBe(`${today()} 0 0\n`);
  });

  it('[the-record-r-nudge] never during a sweep: a sweep run calls no probe and holds the mark at today sweeping, with its pid, while it sweeps, a listing under a mark whose sweep lives probes nothing, and a dry run leaves the mark as it was', async () => {
    const sb = fresh(snap);
    plantLeftovers(sb);
    const counter = counting(sb);
    await must(run(sb, ['unit', 'list'], { env: counter.env }));
    counter.calls();
    const before = mark(sb);
    await must(run(sb, ['unit', 'migrate', '--sweep', '--dry-run', '--all'], { env: counter.env }));
    expect(probes(counter.calls())).toBe(0);
    expect(mark(sb), 'a dry run changes no count, so the mark stays').toBe(before);
    expect(new Set(counter.seenMarks().split('\n').filter(Boolean)), 'the dry run\'s calls found the day\'s measure, never a sweep mark').toEqual(new Set([before.trimEnd()]));
    await must(run(sb, ['unit', 'migrate', '--sweep', '--all'], { env: counter.env }));
    const calls = counter.calls();
    expect(calls).toContain('storage.sweep');
    expect(probes(calls), 'the sweep never runs the probe').toBe(0);
    const seen = counter.seenMarks().split('\n').filter(Boolean);
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen).size, 'every sweep call found one mark').toBe(1);
    expect(seen[0], 'the mark of a sweep in progress carries the verb\'s pid').toMatch(new RegExp(`^${today()} sweeping [0-9]+$`));
    plantLeftovers(sb);
    setMark(sb, `${today()} sweeping ${process.pid}`);
    const during = await run(sb, ['unit', 'list'], { env: counter.env });
    expect([during.code, during.stderr]).toEqual([0, '']);
    expect(probes(counter.calls()), 'a listing during a sweep probes nothing').toBe(0);
    setMark(sb, `2000-01-01 sweeping ${process.pid}`);
    const night = await run(sb, ['unit', 'list'], { env: counter.env });
    expect([night.code, night.stderr], 'a sweep that crossed midnight still holds the probe back').toEqual([0, '']);
    expect(probes(counter.calls())).toBe(0);
  });

  it('[the-record-r-nudge] a sweep mark whose pid is gone, or that names none, reads as no mark: the listing probes and nudges', async () => {
    const gone = spawnSync('sh', ['-c', 'echo $$'], { encoding: 'utf8' }).stdout.trim();
    expect(gone).toMatch(/^[0-9]+$/);
    for (const line of [`${today()} sweeping ${gone}`, `${today()} sweeping`]) {
      const sb = fresh(snap);
      plantLeftovers(sb);
      setMark(sb, line);
      const counter = counting(sb);
      const r = await run(sb, ['unit', 'list'], { env: counter.env });
      expect([r.code, r.stdout, r.stderr], line).toEqual([0, clean, nudge('3 items', 9)]);
      expect(probes(counter.calls()), line).toBe(1);
      expect(mark(sb)).toBe(`${today()} 3 9\n`);
    }
  });

  it('[the-record-r-nudge] a sweep stopped by a signal removes its mark, so the next listing measures the remainder again', { timeout: 300_000 }, async () => {
    const sb = fresh(snap);
    const total = 2500;
    for (let i = 0; i < total; i++) writeFileSync(join(sb, RECORD_ROOT, 'ln-a', `k${i}.md`), '');
    const left = () => readdirSync(join(sb, RECORD_ROOT, 'ln-a')).filter((n) => /^k[0-9]+\.md$/.test(n)).length;
    // the gate holds the sweep at its gap before its second batch, so the signal finds it
    // running with work left however long the test takes to send it
    const gate = sweepGate(sb);
    const sweep = launch('./.contexture/ctx', ['unit', 'migrate', '--sweep', 'ln-a'], { cwd: sb, input: null, env: gate.env, timeout: 180_000 });
    expect(await waitFor(gate.reached, 120_000, 50), 'the sweep stands between two batches').toBe(true);
    expect(await waitFor(() => left() < total, 60_000, 50), 'the first batch moved').toBe(true);
    expect(mark(sb), 'the running sweep marks the day with its own pid').toBe(`${today()} sweeping ${sweep.child.pid}\n`);
    sweep.signal('SIGTERM');
    const r = await sweep.result;
    expect(r.code).toBe(143);
    const remaining = left();
    expect(remaining).toBeGreaterThan(0);
    expect(() => mark(sb), 'the stop removed the mark').toThrow();
    const next = await unit(sb, 'list');
    expect([next.code, next.stderr]).toEqual([0, nudge(`${remaining} items`, 0)]);
  });

  it('[the-record-r-nudge] the measure lands only over the listing\'s own claim: a sweep\'s mark and clear made during the probe stand, and so does another listing\'s claim, the racing listing printing nothing', async () => {
    const race = (sb: string, play: string): Record<string, string> => {
      const path = join(sb, 'racing-resolver');
      writeFileSync(path, [
        '#!/bin/sh',
        'if [ "$1" = storage.leftovers ]; then',
        '  out=$("$REAL_RESOLVER" "$@"); rc=$?',
        `  ${play}`,
        '  printf \'%s\\n\' "$out"',
        '  exit $rc',
        'fi',
        'exec "$REAL_RESOLVER" "$@"',
        '',
      ].join('\n'), { mode: 0o755 });
      return { CTX_STORE_RESOLVER: path, REAL_RESOLVER: join(sb, '.contexture/storage/scripts/driver-resolver'), STAMP: join(sb, LEFTOVERS_STAMP), NOTES: join(sb, RECORD_ROOT, 'ln-a/notes.txt') };
    };
    const swept = fresh(snap);
    plant(swept, join(RECORD_ROOT, 'ln-a/notes.txt'), '12345');
    const s = await run(swept, ['unit', 'list'], { env: race(swept, `printf '%s sweeping %s\\n' "$(date +%Y-%m-%d)" "$$" > "$STAMP"; rm -f "$NOTES"; rm -f "$STAMP"`) });
    expect([s.code, s.stdout, s.stderr], 'the stale pre sweep count is neither written nor printed').toEqual([0, clean, '']);
    expect(() => mark(swept), 'the sweep\'s clear stands').toThrow();
    const after = await unit(swept, 'list');
    expect([after.code, after.stderr]).toEqual([0, '']);
    expect(mark(swept), 'the next listing measured again').toBe(`${today()} 0 0\n`);
    const claimed = fresh(snap);
    plantLeftovers(claimed);
    const other = `${today()} probing 1`;
    const c = await run(claimed, ['unit', 'list'], { env: race(claimed, `printf '%s\\n' '${other}' > "$STAMP"`) });
    expect([c.code, c.stdout, c.stderr], 'another listing claimed the day during the probe').toEqual([0, clean, '']);
    expect(mark(claimed)).toBe(`${other}\n`);
  });

  it('[the-record-r-nudge] a probe that refuses prints nothing and still marks the day, so the next listing pays no probe; a drawer that cannot keep the mark probes nothing at all', async () => {
    const sb = fresh(snap);
    plantLeftovers(sb);
    const refusing = counting(sb, true);
    const r = await run(sb, ['unit', 'list'], { env: refusing.env });
    expect([r.code, r.stdout, r.stderr]).toEqual([0, clean, '']);
    expect(probes(refusing.calls())).toBe(1);
    expect(mark(sb)).toBe(`${today()} unknown\n`);
    await must(run(sb, ['unit', 'list'], { env: refusing.env }));
    expect(probes(refusing.calls()), 'a refused probe still holds the throttle').toBe(0);
    const blocked = fresh(snap);
    plantLeftovers(blocked);
    mkdirSync(join(blocked, LEFTOVERS_STAMP), { recursive: true });
    const counter = counting(blocked);
    const b = await run(blocked, ['unit', 'list'], { env: counter.env });
    expect([b.code, b.stdout, b.stderr]).toEqual([0, clean, '']);
    expect(probes(counter.calls()), 'no mark kept, so no probe').toBe(0);
  });
});
