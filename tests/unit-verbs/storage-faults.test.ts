import { chmodSync, copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { launch } from '../support/exec';
import { RECORD_ROOT, lockPath, namespaceLock, unitLock } from '../support/drawer';
import { catShim, holdLock, readOnlyLockShim, sleepShim } from '../support/locks';
import { ROOT_USER, chmodPlant, mktempPlant } from '../support/plants';
import { fresh, seed } from '../support/snapshot';
import { createLane, lane, must, run, seedUnit, unit, unitChecksum, waitFor } from '../support/unit';
import { refused } from '../support/wire';

const scratch = (sb: string): string[] => readdirSync(join(sb, '.contexture/tmp')).filter((f) => f !== 'locks').sort();
const added = (sb: string, before: readonly string[]): string[] => scratch(sb).filter((f) => !before.includes(f));
const RESIDUE = /^(backlog|knowledge|state|journal|payload|rec|fts5-ws)\./;

function groupGone(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return false;
  } catch {
    return true;
  }
}

describe.concurrent('the unit verbs under storage faults: a read-only store, an interrupt, a killed writer, a held lock', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'w-unit', 'storage failure unit');
      await must(unit(sb, 'task', 'add', 'w-unit', 'w-a', '--objective=Task A'));
      await must(unit(sb, 'task', 'add', 'w-unit', 'w-b', '--objective=Task B'));
      await must(unit(sb, 'finding', 'add', 'w-unit', 'W_ONE', '--summary=One'));
      await must(createLane(sb, 'w-unit', 'w-lane'));
    }, 'posix', 'faults');
  });

  it.skipIf(ROOT_USER)('W-a [the-record-r9, the-record-r12, the-engine-r18]: every typed write on a read-only store exits 2, changes nothing, leaves no temp, and releases the lock', async () => {
    const sb = fresh(sb0);
    const unitDir = join(sb, RECORD_ROOT, 'w-unit');
    const laneDir = join(unitDir, 'lanes/w-lane');
    const files = [unitDir, laneDir].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.md')).map((f) => join(d, f)));
    const before = await unitChecksum(sb, 'w-unit', ['w-lane']);
    const residue = scratch(sb).filter((f) => RESIDUE.test(f)).length;
    for (const f of files) chmodSync(f, 0o444);
    for (const d of [unitDir, laneDir]) chmodSync(d, 0o555);
    try {
      expect((await unit(sb, 'task', 'add', 'w-unit', 'w-c', '--objective=Task C')).code).toBe(2);
      expect((await unit(sb, 'task', 'start', 'w-unit', 'w-a')).code).toBe(2);
      expect((await unit(sb, 'task', 'complete', 'w-unit', 'w-b', '--evidence=never lands')).code).toBe(2);
      expect((await unit(sb, 'finding', 'add', 'w-unit', 'W_TWO', '--summary=Two')).code).toBe(2);
      expect((await lane(sb, 'record', 'w-unit', 'w-lane', '--what=never lands')).code).toBe(2);
    } finally {
      for (const d of [unitDir, laneDir]) chmodSync(d, 0o755);
      for (const f of files) chmodSync(f, 0o644);
    }
    expect(await unitChecksum(sb, 'w-unit', ['w-lane'])).toBe(before);
    expect(scratch(sb).filter((f) => RESIDUE.test(f)).length).toBe(residue);
    expect((await unit(sb, 'task', 'start', 'w-unit', 'w-a')).code).toBe(0);
  });

  it('K [the-engine-r18]: a TERM on a data script waiting on a held unit lock leaves no scratch once the drawer settles', async () => {
    const sb = fresh(sb0);
    const lock = unitLock('w-unit');
    const release = holdLock(sb, lock, 'live');
    const cat = catShim();
    const before = scratch(sb);
    const method = launch(join(sb, '.contexture/modules/unit/scripts/data'), ['task.start', 'w-unit', 'w-a'], {
      cwd: sb,
      input: 'pointer=w-a IN_PROGRESS\n',
      env: { CTX_STORE_ROOT: sb, CTX_STORE_RESOLVER: join(sb, '.contexture/storage/scripts/driver-resolver'), ...cat.env },
    });
    expect(await waitFor(() => cat.reads().includes(join(lockPath(sb, lock), 'pid')), 20_000)).toBe(true);
    expect(added(sb, before).length).toBeGreaterThan(0);
    method.signal('SIGTERM');
    const r = await method.result;
    release();
    expect(r.code).toBe(143);
    expect(await waitFor(() => added(sb, before).length === 0, 10_000)).toBe(true);
  });

  it('KR-a [the-engine-r18]: a SIGKILLed holder leaves its pid in the lock; the next writer removes the stale lock and lands', async () => {
    const sb = fresh(sb0);
    const lock = lockPath(sb, unitLock('w-unit'));
    const holder = launch('sh', ['-c', 'mkdir -p "$(dirname "$1")" && mkdir "$1" && printf "%s\\n" "$$" > "$1/pid" && sleep 30', 'kr-holder', lock], { cwd: sb, group: true });
    expect(await waitFor(() => existsSync(join(lock, 'pid')) && readFileSync(join(lock, 'pid'), 'utf8').trim() !== '', 10_000)).toBe(true);
    expect(readFileSync(join(lock, 'pid'), 'utf8').trim()).toBe(String(holder.child.pid));
    holder.signal('SIGKILL');
    expect(await waitFor(() => groupGone(holder.child.pid!), 10_000)).toBe(true);
    await holder.result;
    expect(() => process.kill(holder.child.pid!, 0)).toThrow();
    expect((await unit(sb, 'task', 'start', 'w-unit', 'w-a')).code).toBe(0);
    expect(existsSync(lock)).toBe(false);
    expect((await unit(sb, 'task', 'show', 'w-unit', 'w-a')).stdout).toContain('IN_PROGRESS');
  });

  it('KR-b [the-engine-r18]: a live holder still refuses the next writer rc 2 ERR_STORAGE_LOCKED (the wait under the sleep shim)', async () => {
    const sb = fresh(sb0);
    holdLock(sb, unitLock('w-unit'), 'live');
    const r = await run(sb, ['unit', 'task', 'complete', 'w-unit', 'w-a', '--evidence=never lands'], { env: sleepShim() });
    expect(r.code).toBe(2);
    expect(r.stdout + r.stderr).toContain('ERR_STORAGE_LOCKED');
  });

  it('KR-c [the-engine-r6, the-engine-r20]: a writer killed while waiting leaves one per-verb scratch root, which the next dispatch sweeps', async () => {
    const sb = fresh(sb0);
    const lock = unitLock('w-unit');
    const release = holdLock(sb, lock, 'live');
    const cat = catShim();
    const before = scratch(sb);
    const verbRoot = (): string | undefined => added(sb, before).find((f) => f.startsWith('verb.'));
    const writer = launch('./.contexture/ctx', ['unit', 'task', 'start', 'w-unit', 'w-a'], { cwd: sb, group: true, env: cat.env });
    expect(await waitFor(() => cat.reads().includes(join(lockPath(sb, lock), 'pid')), 30_000, 50)).toBe(true);
    const root = verbRoot();
    expect(root !== undefined && readdirSync(join(sb, '.contexture/tmp', root)).some((f) => f.startsWith('unit.'))).toBe(true);
    writer.signal('SIGKILL');
    await writer.result;
    expect(await waitFor(() => groupGone(writer.child.pid!), 10_000)).toBe(true);
    release();
    expect(added(sb, before).filter((f) => f.startsWith('verb.'))).toHaveLength(1);
    await unit(sb, 'task', 'show', 'w-unit', 'w-a');
    expect(added(sb, before)).toEqual([]);
  });

  it.skipIf(ROOT_USER)('[the-engine-r21] a unit lock whose holder pid cannot be written refuses with its one line, nothing else on stderr, and no lock left', async () => {
    const sb = fresh(sb0);
    refused(await data(sb, 'task.start', ['w-unit', 'w-a'], 'pointer=w-a IN_PROGRESS\n', readOnlyLockShim()), 'task.start', 2, 'ERR_STORAGE_WRITE', 'cannot write the unit lock holder pid');
    expect(existsSync(lockPath(sb, unitLock('w-unit')))).toBe(false);
    expect((await unit(sb, 'task', 'show', 'w-unit', 'w-a')).stdout).toContain('STATUS: TODO');
  });

  it('[the-engine-r21] a payload the data script cannot stage in its fresh scratch refuses rc 2 ERR_STORAGE_WRITE with nothing else on stderr', async () => {
    const sb = fresh(sb0);
    const r = await data(sb, 'task.start', ['w-unit', 'w-a'], 'pointer=w-a IN_PROGRESS\n', mktempPlant('case "$p" in */unit.*) /bin/mkdir "$p/pay" ;; esac'));
    refused(r, 'task.start', 2, 'ERR_STORAGE_WRITE', "cannot write the data script's scratch");
    expect((await unit(sb, 'task', 'show', 'w-unit', 'w-a')).stdout).toContain('STATUS: TODO');
  });

  it('[the-record-r9, the-engine-r21] a lane document the data script cannot stage refuses rc 2 ERR_STORAGE_WRITE and leaves the report as it was', async () => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, 'w-unit', ['w-lane']);
    const r = await data(sb, 'lane.write_report', ['w-unit', 'w-lane'], 'never lands\n', mktempPlant('case "$p" in */unit.*) /bin/mkdir -p "$p/stage/doc" ;; esac'));
    refused(r, 'lane.write_report', 2, 'ERR_STORAGE_WRITE', "cannot write the data script's scratch");
    expect(await unitChecksum(sb, 'w-unit', ['w-lane'])).toBe(before);
  });

  it('[the-record-r9, the-engine-r21] a session.create whose existence probe cannot be written refuses rc 2 and leaves the unit it names whole', async () => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, 'w-unit', ['w-lane']);
    const r = await data(sb, 'session.create', ['w-unit'], 'objective=a second unit\nattention=fresh unit\n', mktempPlant('case "$p" in */unit.*) /bin/mkdir "$p/keys" ;; esac'));
    expect(await unitChecksum(sb, 'w-unit', ['w-lane']), `rc ${r.code} [${r.stderr}]`).toBe(before);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toMatch(/^session\.create: error: [^\n]+ \(ERR_STORAGE_WRITE\)\n$/);
  });

  it('[the-record-r9, the-engine-r21] a task.add whose fetched backlog cannot be written refuses rc 2 and never reads the backlog as absent', async () => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, 'w-unit', ['w-lane']);
    const r = await data(sb, 'task.add', ['w-unit', 'w-c'], 'objective=Task C\n', mktempPlant('case "$p" in */unit.*) /bin/mkdir "$p/art.2" ;; esac'));
    expect(await unitChecksum(sb, 'w-unit', ['w-lane']), `rc ${r.code} [${r.stderr}]`).toBe(before);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toMatch(/^task\.add: error: [^\n]+ \(ERR_STORAGE_WRITE\)\n$/);
  });

  it.skipIf(ROOT_USER)('[the-record-r9, the-engine-r18, the-engine-r21] a write whose batch payload loses a line after its first action refuses rc 2 and lands none of it', async () => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, 'w-unit', ['w-lane']);
    const b64 = join(sb, '.contexture/modules/unit/lib/b64');
    copyFileSync(b64, `${b64}.real`);
    writeFileSync(b64, `#!/bin/sh\nfor b in "\${CTX_SCRATCH_ROOT:-.contexture/tmp}"/unit.*/batch; do\n  [ -s "$b" ] && chmod 400 "$b"\ndone\nexec "${b64}.real" "$@"\n`, { mode: 0o755 });
    const r = await unit(sb, 'task', 'complete', 'w-unit', 'w-b', '--evidence=never lands');
    copyFileSync(`${b64}.real`, b64);
    expect(await unitChecksum(sb, 'w-unit', ['w-lane']), `rc ${r.code} [${r.stdout}] [${r.stderr}]`).toBe(before);
    expect([r.code, r.stdout], r.stderr).toEqual([2, '']);
    expect(r.stderr).toMatch(/^task\.complete: error: [^\n]+ \(ERR_STORAGE_WRITE\)\n$/);
  });
});

const READ_ROWS: readonly [string, string[], string][] = [
  ['state', ['unit', 'list'], 'session.active'],
  ['state', ['unit', 'load', 'r-unit'], 'session.load'],
  ['state', ['unit', 'board', 'r-unit'], 'session.board'],
  ['state', ['unit', 'search', 'r-unit', 'probe', '--mode=exact'], 'search.query'],
  ['journal', ['unit', 'load', 'r-unit'], 'session.load'],
  ['journal', ['unit', 'board', 'r-unit'], 'session.board'],
];

const LIST_ROWS: readonly [string[], string][] = [
  [['unit', 'list'], 'session.active'],
  [['lane', 'show', 'r-unit', 'nolane', 'report'], 'lane.get'],
];

const LOCKED = "the store namespace 'unit' is locked (60 s timeout)";

const STORE_ROWS: readonly [string, string[], string, string, string][] = [
  ['store.get', ['unit', 'board', 'r-unit'], 'session.board', 'ERR_STORAGE_READ', 'the store read failed'],
  ['store.list', ['unit', 'list'], 'session.active', 'ERR_STORAGE_READ', 'the store list failed'],
  ['store.batch', ['unit', 'record', 'r-unit', '--what=never lands'], 'entry.record', 'ERR_STORAGE_WRITE', 'the store batch failed'],
];

type WrapMode = 'silent' | 'foreign' | 'before';

function wrapResolver(sb: string, call: string, mode: WrapMode): Record<string, string> {
  const path = join(sb, 'wrapper-resolver');
  writeFileSync(path, [
    '#!/bin/sh',
    'if [ "$1" = "$WRAP_CALL" ]; then',
    '  case "$WRAP_MODE" in',
    '    silent) exit 2 ;;',
    `    foreign) printf 'probe: a foreign line naming %s\\n' "$WRAP_NAMED" >&2; exit 2 ;;`,
    `    before) printf 'probe: a foreign line naming %s\\n' "$WRAP_NAMED" >&2 ;;`,
    '  esac',
    'fi',
    'exec "$REAL_RESOLVER" "$@"',
    '',
  ].join('\n'), { mode: 0o755 });
  return { CTX_STORE_RESOLVER: path, REAL_RESOLVER: join(sb, '.contexture/storage/scripts/driver-resolver'), WRAP_CALL: call, WRAP_MODE: mode, WRAP_NAMED: join(sb, RECORD_ROOT) };
}

describe.concurrent('a record function whose store call refuses: its own one line, carrying the store\'s message and code', () => {
  let snap: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      await seedUnit(sb, 'r-unit', 'store refusal unit');
      await must(unit(sb, 'record', 'r-unit', '--what=a seeded entry'));
    }, 'posix', 'store-refusal');
  });

  for (const [artifact, argv, fn] of READ_ROWS) {
    it.skipIf(ROOT_USER)(`[the-engine-r21] an unreadable ${artifact} through ctx ${argv.join(' ')} refuses rc 2 with the ${fn} line alone, the store's message and code, never the store's own line`, async ({ onTestFinished }) => {
      const sb = fresh(snap);
      chmodPlant(join(sb, RECORD_ROOT, 'r-unit', `${artifact}.md`), 0o000, 0o644, onTestFinished);
      refused(await run(sb, argv), fn, 2, 'ERR_STORAGE_READ', `cannot read key 'r-unit/${artifact}' in namespace 'unit'`);
    });
  }

  it.for(LIST_ROWS.map(([argv, fn]) => [argv.join(' '), argv, fn] as const))('[the-engine-r21] a store.list that cannot make its scratch through ctx %s refuses rc 2 with the record function\'s line alone, keeping the store\'s ERR_STORAGE_WRITE', async ([, argv, fn]) => {
    const sb = fresh(snap);
    const r = await run(sb, argv, { env: mktempPlant('case "$p" in */store-keys.*) rm -f "$p"; exit 1 ;; esac') });
    refused(r, fn, 2, 'ERR_STORAGE_WRITE', "cannot create the driver's scratch file");
  });

  it('[the-engine-r21] a held namespace lock refuses ctx unit record with the entry.record line alone and writes nothing; a planted relay of the store\'s line reads red', async () => {
    const sb = fresh(snap);
    const planted = fresh(snap);
    const script = join(planted, '.contexture/modules/unit/scripts/data');
    const text = readFileSync(script, 'utf8');
    const reframe = 'u_store_refuse "$uc_rc" store.batch "$U_SCR/batch.err" "the store batch failed (ERR_STORAGE_WRITE)"';
    const relay = text.replace(reframe, `{ cat "$U_SCR/batch.err" >&2; ${reframe}; }`);
    expect(relay, 'the plant finds the batch re-frame').not.toBe(text);
    writeFileSync(script, relay);
    const before = await unitChecksum(sb, 'r-unit');
    for (const s of [sb, planted]) holdLock(s, namespaceLock('unit'), 'live');
    const [real, plant] = await Promise.all([sb, planted].map((s) => run(s, ['unit', 'record', 'r-unit', '--what=never lands'], { env: sleepShim() })));
    refused(real, 'entry.record', 2, 'ERR_STORAGE_LOCKED', LOCKED);
    expect(await unitChecksum(sb, 'r-unit')).toBe(before);
    expect([plant.code, plant.stdout, plant.stderr]).toEqual([2, '', `store.batch: error: ${LOCKED} (ERR_STORAGE_LOCKED)\nentry.record: error: ${LOCKED} (ERR_STORAGE_LOCKED)\n`]);
  });

  for (const mode of ['silent', 'foreign'] as const) {
    for (const [call, argv, fn, code, fallback] of STORE_ROWS) {
      const said = mode === 'silent' ? 'prints nothing' : 'prints only a foreign line naming a folder';
      it(`[the-engine-r21] a ${call} that ${said} refuses ctx ${argv.join(' ')} with the ${fn} line carrying the call's fixed message and code, the unit unchanged`, async () => {
        const sb = fresh(snap);
        const before = await unitChecksum(sb, 'r-unit');
        refused(await run(sb, argv, { env: wrapResolver(sb, call, mode) }), fn, 2, code, fallback);
        expect(await unitChecksum(sb, 'r-unit')).toBe(before);
      });
    }
  }

  it.skipIf(ROOT_USER)('[the-engine-r21] a foreign line before the store\'s own refusal leaves the store\'s line alone as the session.board message', async ({ onTestFinished }) => {
    const sb = fresh(snap);
    chmodPlant(join(sb, RECORD_ROOT, 'r-unit', 'state.md'), 0o000, 0o644, onTestFinished);
    refused(await run(sb, ['unit', 'board', 'r-unit'], { env: wrapResolver(sb, 'store.get', 'before') }), 'session.board', 2, 'ERR_STORAGE_READ', "cannot read key 'r-unit/state' in namespace 'unit'");
  });
});
