import { chmodSync, copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { launch } from '../support/exec';
import { catShim, holdLock, lockPath, readOnlyLockShim, sleepShim, unitLock } from '../support/locks';
import { ROOT_USER, mktempPlant } from '../support/plants';
import { fresh, seed } from '../support/snapshot';
import { lane, must, run, seedUnit, unit, unitChecksum, waitFor } from '../support/unit';
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
      await must(run(sb, ['lane', 'create', 'w-unit', 'w-lane'], { input: '# recipe grammar\nMISSION\n  GOAL: "w lane"\n' }));
    }, 'posix', 'faults');
  });

  it.skipIf(ROOT_USER)('W-a: every typed write on a read-only store exits 2, changes nothing, leaves no temp, and releases the lock', async () => {
    const sb = fresh(sb0);
    const unitDir = join(sb, '.contexture/sessions/w-unit');
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

  it('K: a TERM on a data script waiting on a held unit lock leaves no scratch once the drawer settles', async () => {
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

  it('KR-a: a SIGKILLed holder leaves its pid in the lock; the next writer removes the stale lock and lands', async () => {
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

  it('KR-b: a live holder still refuses the next writer rc 2 ERR_STORAGE_LOCKED (the wait under the sleep shim)', async () => {
    const sb = fresh(sb0);
    holdLock(sb, unitLock('w-unit'), 'live');
    const r = await run(sb, ['unit', 'task', 'complete', 'w-unit', 'w-a', '--evidence=never lands'], { env: sleepShim() });
    expect(r.code).toBe(2);
    expect(r.stdout + r.stderr).toContain('ERR_STORAGE_LOCKED');
  });

  it('KR-c: a writer killed while waiting leaves one per-verb scratch root, which the next dispatch sweeps', async () => {
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

  it('[the-engine-r21] a payload the data script cannot stage in its fresh scratch refuses with its one line and nothing else on stderr', async () => {
    const sb = fresh(sb0);
    const r = await data(sb, 'task.start', ['w-unit', 'w-a'], 'pointer=w-a IN_PROGRESS\n', mktempPlant('case "$p" in */unit.*) /bin/mkdir "$p/pay" ;; esac'));
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^task\.start: error: [^\n]+ \(ERR_STORAGE_[A-Z]+\)\n$/);
    expect((await unit(sb, 'task', 'show', 'w-unit', 'w-a')).stdout).toContain('STATUS: TODO');
  });

  it('a session.create whose existence probe cannot be written refuses rc 2 and leaves the unit it names whole', async () => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, 'w-unit', ['w-lane']);
    const r = await data(sb, 'session.create', ['w-unit'], 'objective=a second unit\nattention=fresh unit\n', mktempPlant('case "$p" in */unit.*) /bin/mkdir "$p/keys" ;; esac'));
    expect(await unitChecksum(sb, 'w-unit', ['w-lane']), `rc ${r.code} [${r.stderr}]`).toBe(before);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toMatch(/^session\.create: error: [^\n]+ \(ERR_STORAGE_WRITE\)\n$/);
  });

  it('a task.add whose fetched backlog cannot be written refuses rc 2 and never reads the backlog as absent', async () => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, 'w-unit', ['w-lane']);
    const r = await data(sb, 'task.add', ['w-unit', 'w-c'], 'objective=Task C\n', mktempPlant('case "$p" in */unit.*) /bin/mkdir "$p/art.2" ;; esac'));
    expect(await unitChecksum(sb, 'w-unit', ['w-lane']), `rc ${r.code} [${r.stderr}]`).toBe(before);
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toMatch(/^task\.add: error: [^\n]+ \(ERR_STORAGE_WRITE\)\n$/);
  });

  it.skipIf(ROOT_USER)('a write whose batch payload loses a line after its first action refuses rc 2 and lands none of it', async () => {
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
