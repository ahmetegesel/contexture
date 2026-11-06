import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../support/unit';
import { engineSandbox } from './fixture';

function plantRoots(sb: string): Record<'dead' | 'live' | 'odd', string> {
  const dead = spawnSync('true').pid!;
  const roots = {
    dead: join(sb, `.contexture/tmp/verb.${dead}.1700000000`),
    live: join(sb, `.contexture/tmp/verb.${process.pid}.1700000000`),
    odd: join(sb, '.contexture/tmp/verb.abc.1700000000'),
  };
  for (const r of Object.values(roots)) {
    mkdirSync(r, { recursive: true });
    writeFileSync(join(r, 'unit.scratch'), 'left behind\n');
  }
  return roots;
}

describe.concurrent('the per-verb scratch root sweep', () => {
  it('N3 [the-engine-r20]: the next dispatch sweeps a root whose pid is gone and keeps a live one and a name without a pid', async () => {
    const sb = engineSandbox('scratch-sweep');
    const roots = plantRoots(sb);
    expect((await run(sb, ['good', 'hi'])).code).toBe(0);
    expect(existsSync(roots.dead)).toBe(false);
    expect(existsSync(roots.live)).toBe(true);
    expect(existsSync(roots.odd)).toBe(true);
  });

  it('N3 [the-engine-r20]: null check: no dispatch, no sweep; ctx help leaves the dead root in place', async () => {
    const sb = engineSandbox('scratch-nosweep');
    const roots = plantRoots(sb);
    expect((await run(sb, ['help'])).code).toBe(0);
    expect(existsSync(roots.dead)).toBe(true);
  });
});
