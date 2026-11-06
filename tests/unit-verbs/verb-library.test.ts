import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { stage } from '../support/stage';
import { execBytes } from '../support/unit';
import { BAD_REFS, GOOD_REFS, latin1, NOT_UTF8, SHAPES, UTF8_OK } from './inputs';

describe.concurrent('the verb library lib/verb.sh, one function at a time', () => {
  let sb: string;
  beforeAll(() => {
    sb = stage('posix', 'verb-library');
  });
  const call = (script: string, ...args: (string | Buffer)[]) => execBytes(sb, ['sh', '-c', `. .contexture/modules/unit/lib/verb.sh; ${script}`, 'sh', ...args], { env: { VB_SELF: '.contexture/modules/unit/scripts/record' } });

  it.for(BAD_REFS)('vb_ref_ok refuses %j naming both pointer shapes', async (ref) => {
    const r = await call('vb_ref_ok record "$1"', ref);
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toBe(`record: error: malformed ref '${ref}': ${SHAPES}\n`);
  });

  it.for(GOOD_REFS)('vb_ref_ok takes %j', async (ref) => {
    const r = await call('vb_ref_ok record "$1"', ref);
    expect([r.code, r.stderr]).toEqual([0, '']);
  });

  it.for(NOT_UTF8.map((b) => [b.toString('hex'), b] as const))('vb_kv refuses the bytes %s as not valid UTF-8 naming the field', async ([, bytes]) => {
    const r = await call('vb_kv what "$1"; cat "$VB_PAY"', bytes);
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toMatch(/error: what is not valid UTF-8 \(ERR_INVALID_ARGUMENT\)\n$/);
  });

  it('vb_kv takes valid UTF-8 of two, three, and four bytes unchanged', async () => {
    const r = await call('vb_kv what "$1"; cat "$VB_PAY"', UTF8_OK);
    expect([r.code, r.stdout]).toEqual([0, `what=${UTF8_OK}\n`]);
  });

  it('vb_kv escapes a backslash, a tab, a carriage return, and a newline by concatenation', async () => {
    const r = await call('vb_kv k "$1"; cat "$VB_PAY"', 'a\\b\tc\rd\ne\\');
    expect([r.code, r.stdout]).toEqual([0, 'k=a\\\\b\\tc\\rd\\ne\\\\\n']);
  });

  it.for([
    ['nul', Buffer.from('a recipe\0with a NUL\n'), 'the recipe holds a NUL byte'],
    ['bad', latin1('a recipe \xff\n'), 'the recipe is not valid UTF-8'],
  ] as const)('vb_doc_ok refuses a %s document naming it', async ([name, bytes, message]) => {
    writeFileSync(join(sb, `${name}.doc`), bytes);
    const r = await call('vb_doc_ok "the recipe" "$1"', `${name}.doc`);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(new RegExp(`error: ${message} \\(ERR_INVALID_ARGUMENT\\)\\n$`));
  });

  it('vb_doc_ok takes a UTF-8 document', async () => {
    writeFileSync(join(sb, 'ok.doc'), `# recipe ${UTF8_OK}\n`);
    expect((await call('vb_doc_ok "the recipe" "$1"', 'ok.doc')).code).toBe(0);
  });

  it('vb_refuse_nl refuses a newline in a one-line field, naming it, and takes one line', async () => {
    const r = await call('vb_refuse_nl what "$1"', 'one\ntwo');
    expect([r.code, r.stderr]).toEqual([1, 'ERROR: embedded newline in what (one line)\n']);
    expect((await call('vb_refuse_nl what "$1"', 'one line')).code).toBe(0);
  });

  it('vb_refuse_cr refuses a carriage return in any value and takes LF text', async () => {
    const r = await call('vb_refuse_cr "$1" "$2"', 'plain', 'carriage\rreturn');
    expect([r.code, r.stderr]).toEqual([1, 'ERROR: embedded carriage return in a field value (the dialect is LF)\n']);
    expect((await call('vb_refuse_cr "$1"', 'line\nfeed')).code).toBe(0);
  });

  it('vb_refs_split drops the brackets and splits on commas and blanks', async () => {
    expect((await call('vb_refs_split "$1"', '[journal#x, lanes/l/recipe  ###]')).stdout).toBe('journal#x\nlanes/l/recipe\n###\n');
  });

  it.for([['task-1', 0], ['A_b9', 0], ['', 1], ['-x', 1], ['Bad Slug', 1], ['a.b', 1]] as const)('vb_slug_ok %j answers rc %i', async ([slug, rc]) => {
    expect((await call('vb_slug_ok "$1"', slug)).code).toBe(rc);
  });

  it('vb_unknown refuses an unknown flag and an extra argument with their own lines', async () => {
    expect((await call('vb_unknown "task add" "$1"', '--bogus')).stderr).toBe("task add: error: unknown option '--bogus' (ERR_INVALID_ARGUMENT)\n");
    const extra = await call('vb_unknown "task add" "$1"', 'extra');
    expect([extra.code, extra.stderr]).toEqual([1, "task add: error: unexpected argument 'extra' (ERR_INVALID_ARGUMENT)\n"]);
  });

  it('vb_verb_help prints the verb header table: summary, usage, help', async () => {
    const r = await call('vb_verb_help unit .contexture/modules/unit/scripts/stamp');
    expect(r.stdout).toMatch(/^ctx unit stamp: \S/);
    expect(r.stdout).toMatch(/\n\nusage:\n {2}\S/);
  });
});
