import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { must, seedUnit, unit } from '../support/unit';

describe.concurrent('ctx unit units and refs-to', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await must(unit(sb, 'bootstrap', 'n-unit', 'new verbs unit', 'n-repo, n-other'));
      await seedUnit(sb, 'n-ref', 'new verbs referrer');
      await must(unit(sb, 'refs', 'n-ref', 'n-unit'));
    }, 'posix', 'units');
  });

  it('N-b: units lists the unit touching a repo with its anchor and no stored pointer', async () => {
    const r = await unit(fresh(sb0), 'units', 'n-repo');
    expect(r.code).toBe(0);
    const lines = r.stdout.split('\n');
    expect([lines[0], lines[2]]).toEqual(['units n-repo: 1 units', 'n-unit [ACTIVE]']);
    expect(r.stdout).toMatch(/^ {2}current_anchor: A1$/m);
    expect(r.stdout).not.toContain('next_action');
  });

  it('N-b: units of a repo no unit touches refuses naming the known repos', async () => {
    const r = await unit(fresh(sb0), 'units', 'no-such-repo');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^ERROR: no unit touches repo: no-such-repo \(known: .*n-other, n-repo/m);
  });

  it('N-b: refs-to lists the referrer; an unreferenced unit refuses naming it', async () => {
    const sb = fresh(sb0);
    const r = await unit(sb, 'refs-to', 'n-unit');
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toBe('refs-to n-unit: 1 units\n\n  n-ref\n');
    const none = await unit(sb, 'refs-to', 'n-ref');
    expect(none.code).toBe(1);
    expect(none.stderr).toMatch(/^ERROR: no unit references n-ref$/m);
  });
});
