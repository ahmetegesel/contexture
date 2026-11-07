import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { must, seedUnit, unit } from '../support/unit';

describe.concurrent('ctx unit list --all --repo and refs-to', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await must(unit(sb, 'bootstrap', 'n-unit', 'new verbs unit', 'n-repo, n-other'));
      await seedUnit(sb, 'n-ref', 'new verbs referrer');
      await must(unit(sb, 'refs', 'n-ref', 'n-unit'));
    }, 'posix', 'units');
  });

  it('N-b [the-record-r-lst33]: list --all --repo lists the unit touching a repo with its anchor and no stored pointer', async () => {
    const r = await unit(fresh(sb0), 'list', '--all', '--repo=n-repo');
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('n-unit [ACTIVE] A1\n');
    expect(r.stdout).not.toContain('next_action');
  });

  it('N-b [the-record-r-lst33]: list --all --repo of a repo no unit touches refuses naming the known repos', async () => {
    const r = await unit(fresh(sb0), 'list', '--all', '--repo=no-such-repo');
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
