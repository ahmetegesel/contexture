import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNIT_LIB } from '../support/engine';
import { exec, type Run } from '../support/exec';
import { sandbox } from '../support/sandbox';
import { payload } from '../support/wire';

async function program(name: string, pay: string, env: Record<string, string> = {}): Promise<Run> {
  const dir = sandbox('payload');
  writeFileSync(join(dir, 'pay'), pay);
  const files = ['canon.awk', 'model.awk', name].flatMap((p) => ['-f', join(UNIT_LIB, p)]);
  return exec('awk', files, { cwd: dir, input: null, env: { PX_PAY: join(dir, 'pay'), PX_ERR: join(dir, 'err'), ...env } });
}

describe.concurrent('the payload readers (refs.awk, payfield.awk) alone', () => {
  it('refs.awk prints a write payload\'s refs one per line, decoded, in order', async () => {
    const r = await program('refs.awk', payload().kv('objective', 'x').kl('refs', 'unit#u1/task/t1', 'journal#2026-01-01-a', 'docs/a b.md#x').toString());
    expect([r.code, r.stdout]).toEqual([0, 'unit#u1/task/t1\njournal#2026-01-01-a\ndocs/a b.md#x\n']);
  });

  it('refs.awk prints nothing for a payload with no refs', async () => {
    const r = await program('refs.awk', payload().kv('objective', 'x').kl('refs').toString());
    expect([r.code, r.stdout]).toEqual([0, '']);
  });

  it('payfield.awk prints one decoded value raw, and nothing for an absent key', async () => {
    const pay = payload().kv('query', 'a \\ backslash, a\ttab,\na newline').kv('other', 'x').toString();
    expect((await program('payfield.awk', pay, { PK: 'query' })).stdout).toBe('a \\ backslash, a\ttab,\na newline');
    expect((await program('payfield.awk', pay, { PK: 'absent' })).stdout).toBe('');
  });
});
