import { beforeAll, describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { fresh, seed } from '../support/snapshot';
import { seedUnit } from '../support/unit';

const script = (sb: string, verb: string, ...args: string[]) => exec('sh', [`.contexture/modules/unit/scripts/${verb}`, ...args], { cwd: sb });

describe.concurrent('the unit verbs run standalone, without CTX_MODULE_DIR or CTX_BIN', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'ref-unit', 'reference reader unit');
      await seedUnit(sb, 'u2', 'standalone close unit');
      await seedUnit(sb, 'u3', 'standalone stamp unit');
    }, 'posix', 'standalone');
  });

  it('S2: load prints a page with a silent stderr', async () => {
    const r = await script(fresh(sb0), 'load', 'ref-unit', '1');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toContain('LOAD');
  });

  it('S2: close runs the audit through the backend and prints CLOSED', async () => {
    const r = await script(fresh(sb0), 'close', 'u2');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('CLOSED: u2');
  });

  it('S2: stamp prints the transition with a silent stderr', async () => {
    const r = await script(fresh(sb0), 'stamp', 'u3');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toContain('transition: A1 -> A2');
  });

  it('S2: board answers with a silent stderr', async () => {
    const r = await script(fresh(sb0), 'board', 'ref-unit');
    expect([r.code, r.stderr]).toEqual([0, '']);
  });
});
