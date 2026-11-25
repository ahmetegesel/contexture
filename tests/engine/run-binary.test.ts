import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { filter, writeModule } from '../support/modules';
import { chmodPlant, ROOT_USER } from '../support/plants';
import { sandbox } from '../support/sandbox';
import { stage } from '../support/stage';
import { firstByteDifference, put } from '../support/tree';
import { run } from '../support/unit';

function ustar(entries: readonly (readonly [string, Buffer])[]): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, body] of entries) {
    const header = Buffer.alloc(512);
    header.write(name, 0, 'ascii');
    header.write('0000644\0', 100, 'ascii');
    header.write('0000000\0', 108, 'ascii');
    header.write('0000000\0', 116, 'ascii');
    header.write(`${body.length.toString(8).padStart(11, '0')}\0`, 124, 'ascii');
    header.write('00000000000\0', 136, 'ascii');
    header.fill(' ', 148, 156);
    header.write('0', 156, 'ascii');
    header.write('ustar\0', 257, 'ascii');
    header.write('00', 263, 'ascii');
    const sum = header.reduce((total, byte) => total + byte, 0);
    header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'ascii');
    blocks.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  return Buffer.concat([...blocks, Buffer.alloc(1024)]);
}

const TAR = ustar([
  ['notes.txt', Buffer.from('one\ntwo\n')],
  ['raw.bin', Buffer.from([0x1b, 0x5b, 0x31, 0x6d, 0xff, 0xfe, 0x00, 0x0a])],
]);
const TGZ = gzipSync(TAR);
const TEXT = {
  'no-final-lf': Buffer.from('abc'),
  'multi-lf': Buffer.from('a\n\n\n'),
  'lf-only': Buffer.from('\n\n\n'),
  'nul-in-window': Buffer.from('x\0y\n'),
} as const;
const ESC_RED = Buffer.from('\x1b[31mred\x1b[0m\n');
const ESC_INVALID = Buffer.from([0x1b, 0x5b, 0x31, 0x6d, 0x58, 0xff, 0x0a]);
const BINARY_LINE = '[ctx: binary stream passed through unchanged]\n';

describe.concurrent('the run binary passthrough', () => {
  let sb: string;
  beforeAll(() => {
    sb = stage('posix', 'run-binary');
    for (const [name, bytes] of Object.entries({ tar: TAR, tgz: TGZ, ...TEXT, 'esc-red': ESC_RED, 'esc-invalid': ESC_INVALID })) put(join(sb, 'fx', name), bytes);
    writeModule(sb, 'modules', 'merging', {
      manifest: '# summary: the merged stream fixture filter\n',
      files: { 'filters/merge.awk': filter({ filter: 'merge', stream: 'merged' }, '{ print }') },
    });
  });
  const both = (name: string, bytes: Buffer, flags: readonly string[] = [], env?: Record<string, string>) =>
    Promise.all([run(sb, ['run', ...flags, 'cat', `fx/${name}`], { env }), run(sb, ['run', ...flags], { input: bytes, env })]);

  it('[the-engine-r-fu38g] a tar and a tar.gz come back byte identical, wrapped and piped, rc 0', async () => {
    for (const [name, bytes] of [['tar', TAR], ['tgz', TGZ]] as const) {
      for (const r of await both(name, bytes)) {
        expect(r.code).toBe(0);
        expect(firstByteDifference(r.bytes, bytes), name).toBe(-1);
      }
    }
  });

  it('[the-engine-r-fu38g] a binary stream keeps the command exit code, a non-zero one too', async () => {
    const r = await run(sb, ['run', 'sh', '-c', 'cat fx/tgz; exit 3']);
    expect(r.code).toBe(3);
    expect(firstByteDifference(r.bytes, TGZ)).toBe(-1);
  });

  it('[the-engine-r-fu38g] --stats names a binary stream in one line and text never; an explicit --filter never reaches a binary stream', async () => {
    for (const r of await both('tar', TAR, ['--stats'])) expect(r.stderr).toBe(BINARY_LINE);
    for (const r of await both('multi-lf', TEXT['multi-lf'], ['--stats'])) expect(r.stderr).not.toContain('binary stream');
    for (const r of await both('tar', TAR, ['--filter=diff'])) {
      expect(firstByteDifference(r.bytes, TAR)).toBe(-1);
      expect(r.stderr).toBe('');
    }
  });

  it('[the-engine-r-fu38g, the-engine-r11] a binary stdout keeps the stderr cap: the notice and the last 10 of 12 lines', async () => {
    const r = await run(sb, ['run', 'sh', '-c', 'cat fx/tar; i=1; while [ $i -le 12 ]; do echo e$i >&2; i=$((i+1)); done']);
    expect(r.code).toBe(0);
    expect(firstByteDifference(r.bytes, TAR)).toBe(-1);
    const last = Array.from({ length: 10 }, (_, i) => `e${i + 3}\n`).join('');
    expect(r.stderr).toBe(`[ctx: stderr capped: showing the last 10 of 12 lines; COMPACT_DISABLE=1 for the full stream]\n${last}`);
  });

  it('[the-engine-r11, the-engine-r-fu38g] text the runner does not shorten comes back byte identical: no final newline, a multi-newline tail, newlines only, a NUL in the first 8000 bytes', async () => {
    for (const [name, bytes] of Object.entries(TEXT)) {
      for (const r of await both(name, bytes)) {
        expect(r.code).toBe(0);
        expect(firstByteDifference(r.bytes, bytes), name).toBe(-1);
      }
    }
  });

  it('[the-engine-r-fu38g] ESC with an invalid UTF-8 byte under a UTF-8 ctype never comes back empty: the rc kept, the exact copy or the stripped text, no towc error', async () => {
    const stripped = Buffer.from([0x58, 0xff, 0x0a]);
    for (const r of await both('esc-invalid', ESC_INVALID, [], { LC_ALL: '', LC_CTYPE: 'en_US.UTF-8' })) {
      expect(r.code).toBe(0);
      expect(firstByteDifference(r.bytes, ESC_INVALID) === -1 || firstByteDifference(r.bytes, stripped) === -1, r.bytes.toString('hex')).toBe(true);
      expect(r.stderr).not.toContain('towc');
    }
  });

  it('[the-engine-r-fu38g] an invalid UTF-8 byte under a UTF-8 ctype passes the merged strip and the notice scan: the rc and the text kept', async () => {
    const env = { LC_ALL: '', LC_CTYPE: 'en_US.UTF-8' };
    const merged = await run(sb, ['run', '--filter=merge', 'sh', '-c', 'printf "\\033[1mX\\377\\n" >&2; exit 1'], { env });
    expect([merged.code, merged.bytes.toString('hex'), merged.stderr]).toEqual([1, '58ff0a', '']);
    const piped = await run(sb, ['run', '--filter=merge'], { input: Buffer.from([0x58, 0xff, 0x0a]), env });
    expect([piped.code, piped.bytes.toString('hex'), piped.stderr]).toEqual([0, '58ff0a', '']);
  });

  it('[the-engine-r11] null check: the ANSI strip still holds on text, wrapped and piped', async () => {
    for (const r of await both('esc-red', ESC_RED)) expect(r.stdout).toBe('red\n');
  });

  it('[the-engine-r11] null check: a merged filter keeps the command stderr when stdout is empty', async () => {
    const r = await run(sb, ['run', '--filter=merge', 'sh', '-c', 'echo e1 >&2; echo e2 >&2; exit 1']);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('e1\ne2\n');
  });

  it('[the-engine-r14] the piped capture leaves no capture name behind', async () => {
    const own = stage('posix', 'run-binary-piped');
    const r = await run(own, ['run'], { input: TAR });
    expect(firstByteDifference(r.bytes, TAR)).toBe(-1);
    const captures = () => readdirSync(join(own, '.contexture/tmp')).filter((n) => n.startsWith('compact-'));
    expect(captures()).toEqual([]);
    put(join(own, '.contexture/tmp/compact-stdout.planted'), '');
    expect(captures()).toEqual(['compact-stdout.planted']);
  });

  it.skipIf(ROOT_USER)('[the-engine-r14] with no writable scratch the piped form warns and passes stdin through uncompacted, byte for byte, rc 0 (skipped as root, where the plant cannot take)', async ({ onTestFinished }) => {
    const own = stage('posix', 'run-binary-noscratch');
    const alt = sandbox('run-binary-noscratch-tmpdir');
    chmodPlant(join(own, '.contexture/tmp'), 0o555, 0o755, onTestFinished);
    chmodPlant(alt, 0o555, 0o755, onTestFinished);
    const repeated = Buffer.from('same line\n'.repeat(50));
    const r = await run(own, ['run'], { input: repeated, env: { TMPDIR: alt } });
    expect(r.code).toBe(0);
    expect(firstByteDifference(r.bytes, repeated)).toBe(-1);
    expect(r.stderr).toContain(`ctx run: cannot create a capture file in ${alt}\n`);
  });
});
