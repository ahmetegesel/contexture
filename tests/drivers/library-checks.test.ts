import { chmodSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { execBytes } from '../support/unit';
import { latin1, NOT_UTF8, UTF8_OK } from '../unit-verbs/inputs';

const LIBRARY = join(ROOT, 'base/.contexture/storage/scripts/library');

const call = (script: string, ...args: (string | Buffer)[]) => execBytes(sandbox('library-checks'), ['sh', '-c', `. "${LIBRARY}"; ${script}`, 'sh', ...args]);

const VALID: readonly [name: string, bytes: Buffer][] = [
  ['the empty string', latin1('')],
  ['ASCII with a control byte', latin1('a\x01b\x7f')],
  ['two bytes (U+00E9)', latin1('\xc3\xa9')],
  ['three bytes (U+20AC)', latin1('\xe2\x82\xac')],
  ['the last code point before the surrogates (U+D7FF)', latin1('\xed\x9f\xbf')],
  ['the first code point after the surrogates (U+E000)', latin1('\xee\x80\x80')],
  ['four bytes (U+10000)', latin1('\xf0\x90\x80\x80')],
  ['the last code point (U+10FFFF)', latin1('\xf4\x8f\xbf\xbf')],
  ['mixed text', Buffer.from(UTF8_OK)],
];

const INVALID: readonly [name: string, bytes: Buffer][] = [
  ['a truncated two byte sequence', latin1('a \xc3')],
  ['a truncated three byte sequence', latin1('\xe2\x82')],
  ['a truncated four byte sequence', latin1('\xf0\x90\x8d')],
  ['an overlong NUL (C0 80)', latin1('\xc0\x80')],
  ['an overlong two byte form (C1 BF)', latin1('\xc1\xbf')],
  ['an overlong three byte form (E0 80 80)', latin1('\xe0\x80\x80')],
  ['an overlong three byte form (E0 9F BF)', latin1('\xe0\x9f\xbf')],
  ['an overlong four byte form (F0 8F BF BF)', latin1('\xf0\x8f\xbf\xbf')],
  ['the first surrogate (U+D800)', latin1('\xed\xa0\x80')],
  ['the last surrogate (U+DFFF)', latin1('\xed\xbf\xbf')],
  ['above U+10FFFF (F4 90 80 80)', latin1('\xf4\x90\x80\x80')],
  ['a lead byte above F4 (F5)', latin1('\xf5\x80\x80\x80')],
  ['a five byte form', latin1('\xf8\x88\x80\x80\x80')],
  ['the byte FF', latin1('\xff')],
  ['a stray continuation byte', latin1('a\x80b')],
  ['a lead byte followed by ASCII', latin1('\xc3A')],
];

describe.concurrent('the library\'s UTF-8 check: lib_utf8_ok, lib_utf8_file_ok, and LIB_UTF8_AWK', () => {
  it.for(VALID)('[the-record-r12] lib_utf8_ok takes %s, silent', async ([, bytes]) => {
    const r = await call('lib_utf8_ok "$1"', bytes);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });

  it.for(INVALID)('[the-record-r12] lib_utf8_ok refuses %s rc 1, silent', async ([, bytes]) => {
    const r = await call('lib_utf8_ok "$1"', bytes);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', '']);
  });

  it.for(NOT_UTF8.map((b) => [b.toString('hex'), b] as const))('[the-record-r12] lib_utf8_ok refuses the unit verb vector %s, as the unit verbs do', async ([, bytes]) => {
    expect((await call('lib_utf8_ok "$1"', bytes)).code).toBe(1);
  });

  it('[the-record-r12] lib_utf8_file_ok reads every line: valid lines rc 0, one bad line rc 1, an unreadable file rc 2, each silent', async () => {
    const dir = sandbox('library-utf8-file');
    const good = join(dir, 'good');
    const bad = join(dir, 'bad');
    const locked = join(dir, 'locked');
    writeFileSync(good, Buffer.concat([Buffer.from(`${UTF8_OK}\nline two\n`), latin1('\xf4\x8f\xbf\xbf\n')]));
    writeFileSync(bad, Buffer.concat([Buffer.from('line one\n'), latin1('line \xed\xa0\x80 two\n'), Buffer.from('line three\n')]));
    writeFileSync(locked, 'line\n');
    chmodSync(locked, 0o000);
    const run = async (path: string) => {
      const r = await call('lib_utf8_file_ok "$1"', path);
      return [r.code, r.stdout, r.stderr];
    };
    expect(await run(good)).toEqual([0, '', '']);
    expect(await run(bad)).toEqual([1, '', '']);
    expect(await run(join(dir, 'absent'))).toEqual([2, '', '']);
    if (process.getuid?.() !== 0) expect(await run(locked)).toEqual([2, '', '']);
    chmodSync(locked, 0o644);
  });

  it('[the-record-r12] LIB_UTF8_AWK folds into a caller\'s own awk program', async () => {
    const r = await call('V="$1" LC_ALL=C awk "$LIB_UTF8_AWK"\'BEGIN { print utf8_ok(ENVIRON["V"]) }\'; V="$2" LC_ALL=C awk "$LIB_UTF8_AWK"\'BEGIN { print utf8_ok(ENVIRON["V"]) }\'', latin1('\xe2\x82\xac'), latin1('\xed\xa0\x80'));
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '1\n0\n', '']);
  });
});
