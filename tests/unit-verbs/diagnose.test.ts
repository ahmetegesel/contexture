import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
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

  it('X-f: diagnose never reports the store missing while it holds units', async () => {
    const r = await unit(fresh(sb0), 'diagnose', '--json');
    expect(r.stdout + r.stderr).not.toContain('not created yet');
  });

  it('X-q: diagnose counts the ACTIVE units exactly, in the text and --json views', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'active')).stdout.split('\n').filter((l) => /^[a-z0-9][a-z0-9_-]*$/.test(l))).toHaveLength(2);
    expect((await unit(sb, 'diagnose')).stdout).toMatch(/active units: {4}2$/m);
    expect((await unit(sb, 'diagnose', '--json')).stdout).toMatch(/"active_units":2\}\}\n?$/);
  });

  it('X-q: diagnose counts zero ACTIVE units when every unit is CLOSED', async () => {
    const sb = stage('posix', 'diagnose-closed');
    await seedUnit(sb, 'd-only', 'only unit');
    await must(unit(sb, 'close', 'd-only'));
    expect((await unit(sb, 'diagnose', '--json')).stdout).toMatch(/"active_units":0\}\}\n?$/);
    expect((await unit(sb, 'diagnose')).stdout).toMatch(/active units: {4}0$/m);
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
