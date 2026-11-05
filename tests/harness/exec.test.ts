import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { sandbox } from '../support/sandbox';

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
