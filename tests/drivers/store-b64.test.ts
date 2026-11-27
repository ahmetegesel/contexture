import { spawnSync } from 'node:child_process';
import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { pathPlant } from '../support/plants';
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
    ['a 1 MB value', Buffer.from(Array.from({ length: 1 << 20 }, (_, i) => (i * 7919) % 256))],
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

describe.concurrent('store-b64 answers a value read whole or nothing', () => {
  const REAL_OD = spawnSync('sh', ['-c', 'command -v od'], { encoding: 'utf8' }).stdout.trim();
  const FIRST = Buffer.from('the first value\n');
  const NEXT = Buffer.from('a longer value renamed over the first one\n');

  it.each([
    ['fails after its first line', `'${REAL_OD}' "$@" | head -n 1\nexit 1`],
    ['succeeds after its first line', `'${REAL_OD}' "$@" | head -n 1`],
    ['reads one byte more than the file holds', `'${REAL_OD}' "$@"\nprintf ' 0\\n'`],
  ])('[the-engine-r19] refuses rc 2 with nothing on stdout when its od %s', async (_, od) => {
    const [dir, path] = file(Buffer.from(Array.from({ length: 100 }, (_, i) => (i * 37) % 256)));
    refused(await exec(STORE_B64, [path], { cwd: dir, env: pathPlant('od', od) }), 'store-b64', 2, 'ERR_STORAGE_READ', 'cannot read the file whole');
  });

  it.each([
    ['just before its od opens it', (dir: string) => `mv '${dir}/next' '${dir}/value'\nexec '${REAL_OD}' "$@"`, NEXT],
    ['just after its od read it', (dir: string) => `'${REAL_OD}' "$@"\nr=$?\nmv '${dir}/next' '${dir}/value'\nexit $r`, FIRST],
  ])('[the-engine-r19] answers one version whole when a value is renamed over the file %s', async (_, od, read) => {
    const [dir, path] = file(FIRST);
    writeFileSync(join(dir, 'next'), NEXT);
    const r = await exec(STORE_B64, [path], { cwd: dir, env: pathPlant('od', od(dir)) });
    expect([r.code, r.stderr, r.stdout]).toEqual([0, '', read.toString('base64')]);
  });
});
