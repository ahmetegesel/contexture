import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNIT_LIB } from '../support/engine';
import { exec } from '../support/exec';
import { sandbox } from '../support/sandbox';

async function encoded(bytes: Buffer): Promise<string> {
  const dir = sandbox('b64');
  writeFileSync(join(dir, 'value'), bytes);
  const r = await exec('sh', [join(UNIT_LIB, 'b64'), join(dir, 'value')], { cwd: dir });
  expect([r.code, r.stderr]).toEqual([0, '']);
  return r.stdout;
}

const binary = Buffer.from([0, 0xff, 0xfe, 0x0a, 0x5c, 0xc3, 0x28, 0x80, 0x22, 0x0d]);

describe.concurrent('the unit module base64 encoder (lib/b64) against the platform encoder', () => {
  for (const [name, bytes] of [
    ['empty', Buffer.alloc(0)],
    ['one byte', Buffer.from([0x61])],
    ['two bytes', Buffer.from([0x61, 0x62])],
    ['binary: NUL, 0xff, invalid UTF-8, a newline, a backslash, a carriage return', binary],
    ['a 1 MB value', Buffer.from(Array.from({ length: 1 << 20 }, (_, i) => (i * 7919) % 256))],
  ] as const) {
    it(`${name} encodes on one line with no newline, equal to Buffer base64`, async () => {
      expect(await encoded(bytes)).toBe(bytes.toString('base64'));
    });
  }

  it('refuses a missing file rc 1 naming the error', async () => {
    const dir = sandbox('b64');
    const r = await exec('sh', [join(UNIT_LIB, 'b64'), join(dir, 'absent')], { cwd: dir });
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', 'store-b64: error: file not found (ERR_ENTITY_NOT_FOUND)\n']);
  });
});
