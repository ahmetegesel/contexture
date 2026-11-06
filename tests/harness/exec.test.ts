import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exec, launch } from '../support/exec';
import { alive, HUNG_TREE, treePids } from '../support/procs';
import { sandbox } from '../support/sandbox';
import { waitFor } from '../support/unit';

const LEAKS: Record<string, string> = {
  CTX_ROOT: '/leak/root',
  CTX_STORAGE_DRIVER: 'fts5',
  COMPACT_DISABLE: '1',
  TMPDIR: '/leak/tmp',
  LANG: 'en_US.UTF-8',
  LC_ALL: 'en_US.UTF-8',
};

const parse = (out: string): Record<string, string> =>
  Object.fromEntries(
    out
      .split('\n')
      .filter(Boolean)
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );

describe('exec env hygiene', () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const [k, v] of Object.entries(LEAKS)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
  });
  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('a child sees only the explicit env: PATH, HOME, USER, TZ, LC_ALL=C, and its sandbox TMPDIR', async () => {
    const sb = sandbox('env');
    const r = await exec('env', [], { cwd: sb });
    expect(r.code, r.stderr).toBe(0);
    const env = parse(r.stdout);
    const passed = ['PATH', 'HOME', 'USER', 'TZ'].filter((k) => process.env[k] !== undefined);
    expect(Object.keys(env).sort()).toEqual([...passed, 'LC_ALL', 'TMPDIR'].sort());
    expect(env.LC_ALL).toBe('C');
    expect(env.TMPDIR).toBe(join(sb, '.contexture', 'tmp'));
  });

  it('null check: the same instrument over the inherited env sees every planted leak', () => {
    const r = spawnSync('env', [], { encoding: 'utf8', env: process.env });
    const env = parse(r.stdout);
    for (const [k, v] of Object.entries(LEAKS)) expect(env[k], k).toBe(v);
  });
});

describe.concurrent('exec bounds a hung call', () => {
  it('a call past its own timeout rejects naming the timeout and kills its whole process group', async () => {
    const dir = sandbox('hung');
    const { result } = launch('sh', ['-c', HUNG_TREE], { cwd: dir, timeout: 5_000 });
    expect(await waitFor(() => treePids(dir).length === 2, 4_500)).toBe(true);
    const tree = treePids(dir);
    await expect(result).rejects.toThrow('timed out after 5000 ms; its process group was killed');
    expect(await waitFor(() => !tree.some(alive), 5_000)).toBe(true);
  });

  it('null check: killing the leader alone leaves its tree alive, which the same instrument sees', async () => {
    const dir = sandbox('orphans');
    const { child, result } = launch('sh', ['-c', HUNG_TREE], { cwd: dir });
    expect(await waitFor(() => treePids(dir).length === 2, 10_000)).toBe(true);
    const tree = treePids(dir);
    child.kill('SIGKILL');
    expect(await waitFor(() => !alive(child.pid!), 5_000)).toBe(true);
    expect(tree.filter(alive)).toEqual(tree);
    process.kill(-child.pid!, 'SIGKILL');
    await result;
    expect(await waitFor(() => !tree.some(alive), 5_000)).toBe(true);
  });
});
