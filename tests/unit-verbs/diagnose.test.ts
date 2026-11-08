import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { RECORD_ROOT, namespaceLock } from '../support/drawer';
import { holdLock } from '../support/locks';
import { ROOT_USER, chmodPlant } from '../support/plants';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { plantScript } from '../support/store';
import { must, seedUnit, unit } from '../support/unit';

describe.concurrent('ctx unit diagnose', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'x-one');
      await seedUnit(sb, 'x-two');
      await seedUnit(sb, 'x-closed');
      await must(unit(sb, 'close', 'x-closed'));
    }, 'posix', 'diagnose');
  });

  it('X-f [the-engine-r24]: diagnose never reports the store missing while it holds units', async () => {
    const r = await unit(fresh(sb0), 'diagnose', '--json');
    expect(r.stdout + r.stderr).not.toContain('not created yet');
  });

  it('X-q [the-engine-r24]: diagnose counts the ACTIVE units exactly, in the text and --json views', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'list')).stdout.split('\n').filter((l) => /^[a-z0-9][a-z0-9_-]*$/.test(l))).toHaveLength(2);
    expect((await unit(sb, 'diagnose')).stdout).toMatch(/active units: {4}2$/m);
    expect((await unit(sb, 'diagnose', '--json')).stdout).toMatch(/"active_units":2\}\}\n?$/);
  });

  it.skipIf(ROOT_USER)('X-q [the-engine-r24]: diagnose never reports an ACTIVE count it could not read: a refused listing reads unknown with its message, null in --json, every other line printed, rc 0', async ({ onTestFinished }) => {
    const sb = fresh(sb0);
    chmodPlant(join(sb, RECORD_ROOT, 'x-one', 'state.md'), 0o000, 0o644, onTestFinished);
    const text = await unit(sb, 'diagnose');
    expect([text.code, text.stderr]).toEqual([0, '']);
    expect(text.stdout).not.toMatch(/active units: +\d/);
    expect(text.stdout).toMatch(/^ {2}active units: {4}unknown \(cannot read key 'x-one\/state' in namespace 'unit' \(ERR_STORAGE_READ\)\)$/m);
    for (const line of ['workspace root:', 'configuration:', 'storage driver:', 'driver status:', 'search modes:', 'storage health:']) expect(text.stdout).toContain(line);
    const json = await unit(sb, 'diagnose', '--json');
    expect([json.code, json.stderr]).toEqual([0, '']);
    expect(JSON.parse(json.stdout).storage).toMatchObject({ active_units: null, health: expect.any(String) });
  });

  it('X-q [the-engine-r24]: diagnose counts zero ACTIVE units when every unit is CLOSED', async () => {
    const sb = stage('posix', 'diagnose-closed');
    await seedUnit(sb, 'd-only', 'only unit');
    await must(unit(sb, 'close', 'd-only'));
    expect((await unit(sb, 'diagnose', '--json')).stdout).toMatch(/"active_units":0\}\}\n?$/);
    expect((await unit(sb, 'diagnose')).stdout).toMatch(/active units: {4}0$/m);
  });

  it('X-f [the-engine-r24]: diagnose probes the unit namespace\'s own store: its lock reads locked, another namespace\'s lock does not', async () => {
    const sb = fresh(sb0);
    const health = async () => JSON.parse((await unit(sb, 'diagnose', '--json')).stdout).storage;
    expect(await health()).toMatchObject({ health: 'ok', store: 'present' });
    const release = holdLock(sb, namespaceLock('docs'), 'live');
    expect((await health()).health).toBe('ok');
    release();
    holdLock(sb, namespaceLock('unit'), 'live');
    expect(await health()).toMatchObject({ health: 'locked', store: 'present' });
  });

  it('X-f [the-engine-r24]: diagnose prints a health the driver cannot report as error with the store absent', async () => {
    const sb = fresh(sb0);
    plantScript(sb, 'store-data', 'printf "store-data: planted unreadable drawer\\n" >&2\nexit 2');
    const r = await unit(sb, 'diagnose', '--json');
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout).storage).toMatchObject({ health: 'error', store: 'absent' });
  });

  it('D: diagnose answers rc 0; --json carries the workspace root and the capability descriptor; --diagnose answers rc 0', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'diagnose')).code).toBe(0);
    const json = (await unit(sb, 'diagnose', '--json')).stdout;
    expect(json).toContain('"workspace_root"');
    expect(json).toContain('"descriptor":{"driver":"');
    expect((await unit(sb, '--diagnose')).code).toBe(0);
  });
});
