import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { refused } from '../support/wire';

const STORE_B64 = join(ROOT, 'base/.contexture/storage/scripts/store-b64');
const ROOT_USER = process.getuid?.() === 0;

const encode = (cwd: string, ...args: string[]) => exec(STORE_B64, args, { cwd });

function file(bytes: Buffer): [string, string] {
  const dir = sandbox('store-b64');
  const path = join(dir, 'value');
  writeFileSync(path, bytes);
  return [dir, path];
}

describe.concurrent('store-b64, the base64 encoder of a scan value', () => {
  it.each([
    ['empty', Buffer.alloc(0)],
    ['one byte', Buffer.from('a')],
    ['two bytes', Buffer.from('ab')],
    ['three bytes', Buffer.from('abc')],
    ['a NUL and 0xFF', Buffer.from([0x00, 0x41, 0xff, 0x0a])],
    ['every byte value', Buffer.from(Array.from({ length: 256 }, (_, i) => i))],
    ['1 KB of mixed bytes', Buffer.from(Array.from({ length: 1024 }, (_, i) => (i * 37) % 256))],
  ])('encodes %s exactly as Buffer base64, with no line end', async (_, bytes) => {
    const [dir, path] = file(bytes);
    const r = await encode(dir, path);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe(bytes.toString('base64'));
  });

  it('refuses a missing argument, an extra argument, and a missing file', async () => {
    const [dir, path] = file(Buffer.from('x'));
    refused(await encode(dir), 'store-b64', 1, 'ERR_INVALID_ARGUMENT', 'takes one file');
    refused(await encode(dir, path, path), 'store-b64', 1, 'ERR_INVALID_ARGUMENT', 'takes one file');
    refused(await encode(dir, join(dir, 'absent')), 'store-b64', 1, 'ERR_ENTITY_NOT_FOUND', 'file not found');
  });

  it.skipIf(ROOT_USER)('refuses an unreadable file', async () => {
    const [dir, path] = file(Buffer.from('x'));
    chmodSync(path, 0o000);
    refused(await encode(dir, path), 'store-b64', 1, 'ERR_STORAGE_READ', 'file is not readable');
  });
});
