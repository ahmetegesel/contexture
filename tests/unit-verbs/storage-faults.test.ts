import { chmodSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { launch } from '../support/exec';
import { holdLock, lockPath, sleepShim } from '../support/locks';
import { ROOT_USER } from '../support/plants';
import { fresh, seed } from '../support/snapshot';
import { lane, must, run, seedUnit, unit, unitChecksum, waitFor } from '../support/unit';

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
    const release = holdLock(sb, 'w-unit.lock', 'live');
    const before = scratch(sb);
    const method = launch(join(sb, '.contexture/modules/unit/scripts/data'), ['task.start', 'w-unit', 'w-a'], {
      cwd: sb,
      input: 'pointer=w-a IN_PROGRESS\n',
      env: { CTX_STORE_ROOT: sb, CTX_STORE_RESOLVER: join(sb, '.contexture/storage/scripts/driver-resolver') },
    });
    const staged = await waitFor(() => added(sb, before).length > 0, 20_000);
    method.signal('SIGTERM');
    await method.result;
    release();
    expect(staged).toBe(true);
    expect(await waitFor(() => added(sb, before).length === 0, 10_000)).toBe(true);
  });

  it('KR-a: a SIGKILLed holder leaves its pid in the lock; the next writer removes the stale lock and lands', async () => {
    const sb = fresh(sb0);
    const lock = lockPath(sb, 'w-unit.lock');
    const holder = launch('sh', ['-c', 'mkdir -p "$(dirname "$1")" && mkdir "$1" && printf "%s\\n" "$$" > "$1/pid" && sleep 30', 'kr-holder', lock], { cwd: sb, group: true });
    expect(await waitFor(() => existsSync(join(lock, 'pid')) && readFileSync(join(lock, 'pid'), 'utf8').trim() !== '', 10_000)).toBe(true);
    expect(readFileSync(join(lock, 'pid'), 'utf8').trim()).toBe(String(holder.child.pid));
    holder.signal('SIGKILL');
    expect(await waitFor(() => groupGone(holder.child.pid!), 10_000)).toBe(true);
    await holder.result;
    expect(() => process.kill(holder.child.pid!, 0)).toThrow();
    expect((await unit(sb, 'task', 'start', 'w-unit', 'w-a')).code).toBe(0);
    expect((await unit(sb, 'task', 'show', 'w-unit', 'w-a')).stdout).toContain('IN_PROGRESS');
  });

  it('KR-b: a live holder still refuses the next writer rc 2 ERR_STORAGE_LOCKED (the wait under the sleep shim)', async () => {
    const sb = fresh(sb0);
    holdLock(sb, 'w-unit.lock', 'live');
    const r = await run(sb, ['unit', 'task', 'complete', 'w-unit', 'w-a', '--evidence=never lands'], { env: sleepShim() });
    expect(r.code).toBe(2);
    expect(r.stdout + r.stderr).toContain('ERR_STORAGE_LOCKED');
  });

  it('KR-c: a writer killed while waiting leaves one per-verb scratch root, which the next dispatch sweeps', async () => {
    const sb = fresh(sb0);
    const release = holdLock(sb, 'w-unit.lock', 'live');
    const before = scratch(sb);
    const verbRoot = (): string | undefined => added(sb, before).find((f) => f.startsWith('verb.'));
    const writer = launch('./.contexture/ctx', ['unit', 'task', 'start', 'w-unit', 'w-a'], { cwd: sb, group: true });
    const staged = await waitFor(() => {
      const root = verbRoot();
      return root !== undefined && readdirSync(join(sb, '.contexture/tmp', root)).some((f) => f.startsWith('unit.'));
    }, 30_000, 50);
    writer.signal('SIGKILL');
    await writer.result;
    expect(await waitFor(() => groupGone(writer.child.pid!), 10_000)).toBe(true);
    release();
    expect(staged).toBe(true);
    expect(added(sb, before).filter((f) => f.startsWith('verb.'))).toHaveLength(1);
    await unit(sb, 'task', 'show', 'w-unit', 'w-a');
    expect(added(sb, before)).toEqual([]);
  });
});
