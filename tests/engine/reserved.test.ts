import { beforeAll, describe, expect, it } from 'vitest';
import { stage } from '../support/stage';
import { run } from '../support/unit';

describe.concurrent('the ctx _reserved reader', () => {
  let sb: string;
  beforeAll(() => {
    sb = stage('posix', 'reserved');
  });

  it.for(['refresh', 'record', 'run', 'hooks', 'help', 'next', 'flip'])('MD-RS [the-engine-r2, modules-r6]: %s is reserved rc 0', async (name) => {
    const r = await run(sb, ['_reserved', name]);
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
  });

  it.for(['unit', 'lane', 'zzz'])('MD-RS [the-engine-r2, modules-r6]: %s is free rc 1 (a builtin, the extension lane module, a free name)', async (name) => {
    expect((await run(sb, ['_reserved', name])).code).toBe(1);
  });

  it('MD-RS: a missing name refuses rc 1 with the usage', async () => {
    const r = await run(sb, ['_reserved']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('_reserved: usage: ctx _reserved <name>');
  });
});
