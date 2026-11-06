import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, type Run } from '@support/exec';
import { sandbox } from '@support/sandbox';
import { SCRIPTS } from '../support/corpus';

let sb: string;
beforeAll(() => {
  sb = sandbox('io-helpers');
});

const sourced = (script: string, ...args: string[]): Promise<Run> =>
  exec('sh', ['-c', `. "$1"; shift; ${script}`, 'sh', join(SCRIPTS, 'docs-io.sh'), ...args], { cwd: sb });

const SHOW = 'echo "np=$DOCS_NP p1=$DOCS_P1 p2=$DOCS_P2 after=$DOCS_AFTER first=$DOCS_FIRST remove=$DOCS_REMOVE id=$DOCS_ID dry=$DOCS_DRY stdin=$DOCS_STDIN_FIELD na=${EDIT_NA:-0}"; i=1; while [ "$i" -le "${EDIT_NA:-0}" ]; do eval "echo \\"act $i: \\$EDIT_A_$i \\$EDIT_F_$i [\\$EDIT_V_$i]\\""; i=$((i + 1)); done';

describe('docs_parse: the verb arguments into positionals, controls, and field actions', { concurrent: true }, () => {
  it('reads positionals, the controls the verb takes, and every field action in order', async () => {
    const r = await sourced(`docs_parse "after first remove id stdin dry-run" 1 "$@" && ${SHOW}`, 'wtest', 'unit', '--summary=a b', '--add-source=x', '--remove-keyword=y', '--unset=role', '--after=k', '--first', '--id=unit-p9', '--stdin=consequence-detail', '--dry-run');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe([
      'np=2 p1=wtest p2=unit after=k first=1 remove=0 id=unit-p9 dry=1 stdin=consequence_detail na=4',
      'act 1: set summary [a b]',
      'act 2: add source [x]',
      'act 3: remove keyword [y]',
      'act 4: unset role []',
      '',
    ].join('\n'));
  });

  it('maps a verb alias and reads dashes as underscores', async () => {
    const r = await sourced(`DOCS_ALIASES="source=sources keyword=keywords"; docs_parse "dry-run" 1 "$@" && ${SHOW}`, '--add-source=s/**', '--remove-keyword=k', '--absence-scope=repo');
    expect(r.stdout).toContain('act 1: add sources [s/**]');
    expect(r.stdout).toContain('act 2: remove keywords [k]');
    expect(r.stdout).toContain('act 3: set absence_scope [repo]');
  });

  it.each([
    ['entry --kind, the components kind', 'after first remove id stdin dry-run', ['--kind=runtime'], ['act 1: set kind [runtime]']],
    ['header --kind and --stdin', 'dry-run', ['--kind=overview', '--stdin=detail'], ['act 1: set kind [overview]', 'act 2: set stdin [detail]']],
    ['rule --id', 'after first remove stdin dry-run', ['--id=conv-r1'], ['act 1: set id [conv-r1]']],
    ['new --id', 'kind dry-run', ['--id=x'], ['act 1: set id [x]']],
  ])('reads a value control the verb does not take as a field action: %s', async (_, controls, args, acts) => {
    const r = await sourced(`docs_parse "${controls}" 1 "$@" || exit $?; ${SHOW}`, ...args);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.split('\n').filter((l) => l.startsWith('act '))).toEqual(acts);
  });

  it.each([
    ['W49 an unknown option without a value', '1', ['--bogus']],
    ['a control the verb does not take', '1', ['--first']],
    ['a field flag on a verb without fields', '0', ['--summary=x']],
    ['a value control the verb does not take, on a verb without fields', '0', ['--kind=x']],
    ['a field name outside the name set', '1', ['--Bad=x']],
  ])('refuses %s rc 1 naming the verb and its flags', async (_, fields, args) => {
    const r = await sourced(`DOCS_VERB="ctx docs entry"; DOCS_FLAGS="--after= --dry-run"; docs_parse "after dry-run" ${fields} "$@"`, ...args);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(`ctx docs entry: unknown option: ${args[0]} (flags: --after= --dry-run) (ERR_INVALID_ARGUMENT)\n`);
  });
});

describe('the pure helpers', { concurrent: true }, () => {
  it.each([
    ['workspace', 0], ['demo-orders', 0], ['a.b_c-1', 0], ['A1', 0],
    ['', 1], ['-lead', 1], ['.hidden', 1], ['has space', 1], ['sl/ash', 1], ['türkçe', 1],
  ])('docs_key_valid %j is rc %i', async (key, rc) => {
    expect((await sourced('docs_key_valid "$1"', key)).code).toBe(rc);
  });

  it('docs_noeol tells a doc without its final newline from one with it and from an empty file', async () => {
    writeFileSync(join(sb, 'eol.md'), 'a\n');
    writeFileSync(join(sb, 'noeol.md'), 'a');
    writeFileSync(join(sb, 'empty.md'), '');
    const rc = async (f: string) => (await sourced('docs_noeol "$1"', join(sb, f))).code;
    expect([await rc('noeol.md'), await rc('eol.md'), await rc('empty.md')]).toEqual([0, 1, 1]);
  });

  it.each([['docs/a/b.md', 0], ['b.md', 0], ['some/path', 0], ['nudge-demo', 1], ['workspace', 1]])('docs_file_form %j is rc %i', async (arg, rc) => {
    expect((await sourced('docs_file_form "$1"', arg)).code).toBe(rc);
  });

  it.each([
    ['.contexture/sessions/u/backlog.md', 0],
    ['/elsewhere/.contexture/sessions/u/backlog.md', 0],
    ['backlog.md', 1],
    ['docs/demo/x.md', 1],
  ])('docs_record_file %j is rc %i', async (path, rc) => {
    expect((await sourced('DOCS_ROOT="$PWD"; docs_record_file "$1"', path)).code).toBe(rc);
  });
});
