import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec, type Run } from '../support/exec';
import { alive, treePids } from '../support/procs';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { waitFor } from '../support/unit';

const VITEST = join(ROOT, 'tests/node_modules/.bin/vitest');
const CONFIG = join(ROOT, 'tests/harness/fixtures/vitest.config.mts');

async function inner(fixture: string, sweep = true): Promise<{ dir: string; r: Run }> {
  const dir = sandbox(fixture);
  const env: Record<string, string> = { RUNNER_DIR: dir, ...(sweep ? {} : { RUNNER_SWEEP: 'off' }) };
  return { dir, r: await exec(VITEST, ['run', '--config', CONFIG, fixture], { cwd: dir, env }) };
}

describe.concurrent('a vitest run fails a planted failure and a planted hang, and no process outlives the hang', () => {
  it('a planted failing test exits nonzero', async () => {
    const { r } = await inner('planted-failure');
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('a planted failure');
  });

  it('a planted hang fails at the test timeout and the file sweep kills its whole process tree', async () => {
    const { dir, r } = await inner('planted-hang');
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout + r.stderr).toMatch(/timed out in 1000ms/i);
    const tree = treePids(dir);
    expect(tree).toHaveLength(2);
    expect(await waitFor(() => !tree.some(alive), 5_000)).toBe(true);
  });

  it('null check: without the sweep the same instrument sees the hung tree outlive the run', async () => {
    const { dir, r } = await inner('planted-hang', false);
    const tree = treePids(dir);
    try {
      expect(r.code).toBe(1);
      expect(tree).toHaveLength(2);
      expect(tree.filter(alive)).toEqual(tree);
    } finally {
      for (const pid of tree) if (alive(pid)) process.kill(pid, 'SIGKILL');
    }
  });
});
