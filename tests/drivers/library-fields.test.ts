import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { shFunction } from '../support/sh';
import { fresh, seed } from '../support/snapshot';
import { latin1 } from '../unit-verbs/inputs';

const LIBRARY = '.contexture/storage/scripts/library';
const INV = 'ERR_INVALID_ARGUMENT';
const SV = 'ERR_SCHEMA_VIOLATION';

const IDEAS = [
  'what: required block',
  'why: optional block',
  'status: optional line one-of OPEN|PICKED|DROPPED default OPEN',
  'dumped: optional line default today',
  'picked_by: optional line',
  'reason: optional line',
  'note: optional block',
  'tags: optional line list one-of a|b|c',
];
const DECL = `${IDEAS.join('\n')}\n`;
const LABELS = 'labels: required line list\n';

const esc = (s: string): string => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\r/g, '\\r');
const b64 = (s: string | Buffer): string => Buffer.from(s).toString('base64');
type Action = [op: 'set' | 'add' | 'remove', field: string, value: string] | [op: 'unset', field: string] | [op: 'block', field: string, body: string | Buffer];
const actions = (...list: Action[]): string =>
  list.map((a) => (a[0] === 'unset' ? `unset\t${a[1]}` : a[0] === 'block' ? `block\t${a[1]}\t${b64(a[2])}` : `${a[0]}\t${a[1]}\t${esc(a[2])}`)).map((l) => `${l}\n`).join('');

const today = (): string => spawnSync('date', ['+%Y-%m-%d'], { encoding: 'utf8' }).stdout.trim();

let snap: string;
beforeAll(async () => {
  snap = await seed(async () => undefined, 'posix', 'library-fields');
});

function workspace(files: Record<string, string | Buffer>): string {
  const sb = fresh(snap);
  for (const [name, body] of Object.entries(files)) writeFileSync(join(sb, name), body);
  return sb;
}

const call = (sb: string, fn: string, ...args: string[]) => shFunction(sb, join(sb, LIBRARY), fn, args, { env: { CTX_STORE_ROOT: sb } });

async function apply(decl: string, old: string, acts: string | Buffer) {
  const sb = workspace({ decl, old, acts });
  const r = await call(sb, 'fields_apply', 'decl', 'old', 'acts', 'new');
  const written = existsSync(join(sb, 'new')) ? readFileSync(join(sb, 'new'), 'utf8') : null;
  return { r, written, old: readFileSync(join(sb, 'old'), 'utf8') };
}

const RECORD = 'what ::\n  an idea\n  second line\nstatus: "OPEN"\ndumped: "2026-11-01"\n';

describe.concurrent('the field validator: fields_decl_check', () => {
  it.each([
    ['the ideas declaration', DECL],
    ['a required list field', LABELS],
    ['an empty declaration', ''],
    ['a name of digits, underscore, and dash', 'x-y_z1: required line\n'],
    ['one-of values holding blanks', 'size: optional line one-of very small|large default very small\n'],
    ['a default holding blanks and the word default', 'title: optional line default a default title\n'],
  ])('[the-engine-r-mrwga] accepts %s, silent', async (_name, decl) => {
    const r = await call(workspace({ decl }), 'fields_decl_check', 'decl');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });

  const GRAMMAR = 'a field line is <name>: <required|optional> <line|block> [list] [one-of <A|B|...>] [default <value>]';
  it.each([
    ['an uppercase name', 'Status: optional line', "field 'Status': a field name is lowercase letters, digits, underscore, and dash, starting with a letter"],
    ['a name starting with a digit', '1x: optional line', "field '1x': a field name is lowercase letters, digits, underscore, and dash, starting with a letter"],
    ['a name declared twice', 'x: optional line\nx: required line', "field 'x': declared twice"],
    ['no colon', 'x optional line', `declaration line 1: ${GRAMMAR}`],
    ['no blank after the colon', 'x:optional line', `field 'x': ${GRAMMAR}`],
    ['no presence clause', 'x: line', "field 'x': the presence clause is required or optional, not 'line'"],
    ['an unknown shape', 'x: optional text', "field 'x': the shape clause is line or block, not 'text'"],
    ['a missing shape', 'x: optional', "field 'x': the shape clause is line or block, not ''"],
    ['an empty one-of', 'x: optional line one-of', "field 'x': the one-of clause names no value"],
    ['an empty one-of before a default', 'x: optional line one-of default a', "field 'x': the one-of clause names no value"],
    ['an empty one-of value', 'x: optional line one-of A||B', "field 'x': the one-of set 'A||B' holds an empty value"],
    ['a default without a value', 'x: optional line one-of A|B default', "field 'x': the default clause takes a value"],
    ['a block with a one-of set', 'x: optional block one-of A|B', "field 'x': a block field takes no one-of set"],
    ['a block with a default', 'x: optional block default A', "field 'x': a block field takes no default"],
    ['a block list', 'x: optional block list', "field 'x': a block field cannot be a list (no write form adds a block item)"],
    ['a list with a default', 'x: optional line list default a', "field 'x': a list field takes no default"],
    ['a required field with a default', 'x: required line default a', "field 'x': a required field takes no default (a default fills an absent optional field)"],
    ['a today default with a one-of set', 'x: optional line one-of A|B default today', "field 'x': a today default cannot satisfy a one-of set"],
    ['a default outside its one-of set', 'x: optional line one-of A|B default C', "field 'x': the default 'C' is not one of A|B"],
    ['a clause out of order', 'x: optional line list list', `field 'x': unknown clause 'list' (${GRAMMAR})`],
    ['an unknown clause', 'x: optional line wide', `field 'x': unknown clause 'wide' (${GRAMMAR})`],
    ['an empty line', 'x: optional line\n\ny: optional line', 'declaration line 2 is empty'],
    ['a carriage return', 'x: optional line\r', 'declaration line 1 holds a carriage return'],
  ])('[the-engine-r-mrwga] refuses %s rc 1 naming the field and the clause', async (_name, decl, message) => {
    const r = await call(workspace({ decl: `${decl}\n` }), 'fields_decl_check', 'decl');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `fields.decl_check: error: ${message} (${INV})\n`]);
  });

  it('[the-engine-r-mrwga] refuses a declaration line that is not UTF-8', async () => {
    const r = await call(workspace({ decl: Buffer.concat([Buffer.from('x: optional line default '), latin1('\xff\n')]) }), 'fields_decl_check', 'decl');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `fields.decl_check: error: declaration line 1 is not valid UTF-8 (${INV})\n`]);
  });

  const RESERVED_LIST = 'json, limit, type, mode, container, id, ref, unset, stdin, any name starting with add-, any name starting with remove-';
  it.each(['json', 'limit', 'type', 'mode', 'container', 'id', 'ref', 'unset', 'stdin', 'add-x', 'remove-y'])('[the-engine-r-mrwga] refuses the reserved name %s at declaration', async (name) => {
    const r = await call(workspace({ decl: `${name}: optional line\n` }), 'fields_decl_check', 'decl');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `fields.decl_check: error: field '${name}': the name is reserved (${RESERVED_LIST}) (${INV})\n`]);
  });

  it('[the-engine-r-mrwga] fields_reserved_ok answers the same list, silent', async () => {
    const sb = workspace({});
    for (const name of ['json', 'limit', 'type', 'mode', 'container', 'id', 'ref', 'unset', 'stdin', 'add-x', 'remove-y']) {
      expect([(await call(sb, 'fields_reserved_ok', name)).code, name]).toEqual([1, name]);
    }
    for (const name of ['status', 'addition', 'removed', 'identity', 'types']) {
      const r = await call(sb, 'fields_reserved_ok', name);
      expect([r.code, r.stdout, r.stderr, name]).toEqual([0, '', '', name]);
    }
  });

  it('[the-engine-r-mrwga] an unreadable declaration refuses rc 2 naming its role, and a wrong argument count rc 1', async () => {
    const sb = workspace({});
    expect(await call(sb, 'fields_decl_check', 'absent')).toMatchObject({ code: 2, stdout: '', stderr: 'fields.decl_check: error: cannot read the declaration file (ERR_STORAGE_READ)\n' });
    expect(await call(sb, 'fields_decl_check')).toMatchObject({ code: 1, stderr: `fields.decl_check: error: takes one declaration file (${INV})\n` });
    expect(await call(sb, 'fields_apply', 'a', 'b')).toMatchObject({ code: 1, stderr: `fields.apply: error: takes a declaration, an old record, an actions file, and a new record file (${INV})\n` });
    expect(await call(sb, 'fields_effective', 'a')).toMatchObject({ code: 1, stderr: `fields.effective: error: takes a declaration and a record file (${INV})\n` });
    expect(await call(sb, 'fields_conforms', 'a')).toMatchObject({ code: 1, stderr: `fields.conforms: error: takes a declaration and a record file (${INV})\n` });
  });
});

describe.concurrent('the field validator: fields_apply', () => {
  it('[the-engine-r-mrwga] a create fills every absent optional default (today the write\'s date) and prints the canonical record in declaration order', async () => {
    const before = today();
    const { r, written, old } = await apply(DECL, '', actions(['add', 'tags', 'b'], ['block', 'what', 'an idea\nsecond line\n'], ['add', 'tags', 'a']));
    const after = today();
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
    const dated = (d: string) => `what ::\n  an idea\n  second line\nstatus: "OPEN"\ndumped: "${d}"\ntags: "b"\ntags: "a"\n`;
    expect([dated(before), dated(after)]).toContain(written);
    expect(old).toBe('');
  });

  it('[the-engine-r-mrwga] an update leaves an absent field absent, applies set, add, and block in order, and keeps a leftover after the declared fields', async () => {
    const old = 'legacy: "kept"\nwhat ::\n  an idea\nreason: "first"\n';
    const { r, written } = await apply(DECL, old, actions(['set', 'reason', 'second'], ['set', 'picked_by', 'unit-x'], ['block', 'note', 'a note'], ['add', 'tags', 'c']));
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(written).toBe('what ::\n  an idea\npicked_by: "unit-x"\nreason: "second"\nnote ::\n  a note\ntags: "c"\nlegacy: "kept"\n');
  });

  it('[the-engine-r-mrwga] a line value carries the payload escape and a double quote as text, and a block keeps its blank lines', async () => {
    const { r, written } = await apply(DECL, RECORD, actions(['set', 'reason', 'a\\b\tc "quoted"'], ['block', 'why', 'one\n\n  indented\n']));
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(written).toBe('what ::\n  an idea\n  second line\nwhy ::\n  one\n  \n    indented\nstatus: "OPEN"\ndumped: "2026-11-01"\nreason: "a\\\\b\\tc "quoted""\n');
  });

  it('[the-engine-r-mrwga] an equal result is rc 0 with the same bytes, and a canonical record applies to itself unchanged', async () => {
    const same = await apply(DECL, RECORD, actions(['set', 'status', 'OPEN']));
    expect([same.r.code, same.written]).toEqual([0, RECORD]);
    const none = await apply(DECL, RECORD, '');
    expect([none.r.code, none.written]).toEqual([0, RECORD]);
  });

  it('[the-engine-r-mrwga] an unset clears a leftover field the record holds, while a set on it refuses as undeclared', async () => {
    const old = `${RECORD}legacy: "x"\n`;
    const cleared = await apply(DECL, old, actions(['unset', 'legacy']));
    expect([cleared.r.code, cleared.written]).toEqual([0, RECORD]);
    const set = await apply(DECL, old, actions(['set', 'legacy', 'y']));
    expect([set.r.code, set.r.stderr, set.written]).toEqual([1, `fields.apply: error: field 'legacy' is not declared (${SV})\n`, null]);
  });

  it('[the-engine-r-mrwga] remove takes one item out and the last item takes the field away', async () => {
    const old = `${RECORD}tags: "a"\ntags: "b"\n`;
    const one = await apply(DECL, old, actions(['remove', 'tags', 'a']));
    expect([one.r.code, one.written]).toEqual([0, `${RECORD}tags: "b"\n`]);
    const all = await apply(DECL, old, actions(['remove', 'tags', 'a'], ['remove', 'tags', 'b']));
    expect([all.r.code, all.written]).toEqual([0, RECORD]);
  });

  it.each([
    ['a value that is not UTF-8', DECL, RECORD, Buffer.concat([Buffer.from('set\treason\t'), latin1('a \xff b\n')]), INV, "field 'reason': the value is not valid UTF-8"],
    ['a newline in a line value', DECL, RECORD, actions(['set', 'reason', 'two\nlines']), INV, "field 'reason': a line value holds a newline or a carriage return"],
    ['a carriage return in a line value', DECL, RECORD, actions(['set', 'reason', 'cr\r']), INV, "field 'reason': a line value holds a newline or a carriage return"],
    ['a carriage return in a block', DECL, RECORD, actions(['block', 'why', 'a\r\nb']), INV, "field 'why': the block body holds a carriage return"],
    ['an empty value', DECL, RECORD, actions(['set', 'reason', '']), INV, "field 'reason': an empty value (unset removes a field)"],
    ['an empty block', DECL, RECORD, actions(['block', 'why', '\n']), INV, "field 'why': an empty value (unset removes a field)"],
    ['an unknown field', DECL, RECORD, actions(['set', 'colour', 'red']), SV, "field 'colour' is not declared"],
    ['a value outside the one-of set', DECL, RECORD, actions(['set', 'status', 'BOGUS']), SV, "field 'status': 'BOGUS' is not one of OPEN|PICKED|DROPPED"],
    ['a list item outside the one-of set', DECL, RECORD, actions(['add', 'tags', 'z']), SV, "field 'tags': 'z' is not one of a|b|c"],
    ['a set on a list field', DECL, RECORD, actions(['set', 'tags', 'a']), INV, "field 'tags' is a list: add or remove its items"],
    ['an add on a single field', DECL, RECORD, actions(['add', 'reason', 'x']), INV, "field 'reason' is single: set its value"],
    ['a remove on a single field', DECL, RECORD, actions(['remove', 'reason', 'x']), INV, "field 'reason' is single: set its value"],
    ['a block on a line field', DECL, RECORD, actions(['block', 'reason', 'x']), INV, "field 'reason' is a line field, not a block"],
    ['a set on a block field', DECL, RECORD, actions(['set', 'why', 'x']), INV, "field 'why' is a block field: its value comes as a block"],
    ['an item added twice', DECL, `${RECORD}tags: "a"\n`, actions(['add', 'tags', 'a']), INV, "field 'tags' already holds 'a'"],
    ['an absent item removed', DECL, RECORD, actions(['remove', 'tags', 'a']), INV, "field 'tags' holds no item 'a'"],
    ['an unset of a required field', DECL, RECORD, actions(['unset', 'what']), SV, "field 'what' is required: unset would leave it absent"],
    ['a remove of a required list\'s last item', LABELS, 'labels: "one"\n', actions(['remove', 'labels', 'one']), SV, "field 'labels' is required: remove would leave it absent"],
    ['a create missing a required field', DECL, '', actions(['set', 'reason', 'x']), SV, "field 'what' is required and absent"],
    ['an unknown action', DECL, RECORD, 'frob\treason\tx\n', INV, 'action line 1 is malformed (set, add, remove, unset, or block)'],
    ['an action missing its value', DECL, RECORD, 'set\treason\n', INV, 'action line 1 is malformed (set <field> <value>)'],
    ['an unset with a value', DECL, RECORD, 'unset\treason\tx\n', INV, 'action line 1 is malformed (unset <field>)'],
    ['a block body that is not base64', DECL, RECORD, 'block\twhy\tnot*base64\n', INV, "field 'why': the block body is not base64"],
    ['a block body holding a NUL byte', DECL, RECORD, actions(['block', 'why', Buffer.from([0x61, 0x00, 0x62])]), INV, "field 'why': the block body holds a NUL byte"],
    ['a malformed record', DECL, 'garbage\n', actions(['set', 'reason', 'x']), INV, 'the record is malformed at line 1'],
    ['a record holding a block twice', DECL, 'why ::\n  a\nwhy ::\n  b\n', '', INV, "the record is malformed at line 3: field 'why' appears twice"],
  ])('[the-engine-r-mrwga, the-engine-r21] refuses %s rc 1 with one line, nothing written, the old record untouched', async (_name, decl, old, acts, code, message) => {
    const r = await apply(decl, old, acts);
    expect([r.r.code, r.r.stdout, r.r.stderr]).toEqual([1, '', `fields.apply: error: ${message} (${code})\n`]);
    expect(r.written).toBeNull();
    expect(r.old).toBe(old);
  });

  it('[the-engine-r-mrwga] the checks run in their fixed order over every action, whatever the action order', async () => {
    const r = await apply(DECL, RECORD, Buffer.concat([Buffer.from(actions(['set', 'colour', 'red'], ['set', 'status', 'BOGUS'])), Buffer.from('set\treason\t'), latin1('\xff\n')]));
    expect(r.r.stderr).toBe(`fields.apply: error: field 'reason': the value is not valid UTF-8 (${INV})\n`);
    const later = await apply(DECL, RECORD, actions(['set', 'status', 'BOGUS'], ['set', 'colour', 'red']));
    expect(later.r.stderr).toBe(`fields.apply: error: field 'colour' is not declared (${SV})\n`);
  });
});

describe.concurrent('the field validator: fields_effective and fields_conforms', () => {
  it('[the-engine-r-mrwga] fields_effective fills an absent static default at read, never a today default, and writes nothing', async () => {
    const stored = 'what ::\n  an idea\nreason: "r"\n';
    const sb = workspace({ decl: DECL, rec: stored });
    const r = await call(sb, 'fields_effective', 'decl', 'rec');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'what ::\n  an idea\nstatus: "OPEN"\nreason: "r"\n', '']);
    expect(readFileSync(join(sb, 'rec'), 'utf8')).toBe(stored);
  });

  it('[the-engine-r-mrwga] fields_conforms names each field breaking the declaration, one line per field, rc 1', async () => {
    const rec = 'why: "a line"\nstatus: "BOGUS"\nreason: "one"\nreason: "two"\ntags: "a"\ntags: "z"\nlegacy: "x"\n';
    const r = await call(workspace({ decl: DECL, rec }), 'fields_conforms', 'decl', 'rec');
    expect([r.code, r.stderr]).toEqual([1, '']);
    expect(r.stdout).toBe([
      'what: required and absent',
      'why: stored as a line where a block is declared',
      "status: 'BOGUS' is not one of OPEN|PICKED|DROPPED",
      'reason: holds 2 values where one is declared',
      "tags: 'z' is not one of a|b|c",
      'legacy: not declared (a leftover field)',
      '',
    ].join('\n'));
  });

  it('[the-engine-r-mrwga] fields_conforms answers rc 0 and nothing for a conforming record, an absent optional field included', async () => {
    const r = await call(workspace({ decl: DECL, rec: 'what ::\n  an idea\n' }), 'fields_conforms', 'decl', 'rec');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });

  it('[the-engine-r-mrwga] fields_conforms refuses a malformed declaration on stderr with nothing on stdout', async () => {
    const r = await call(workspace({ decl: 'x: optional text\n', rec: '' }), 'fields_conforms', 'decl', 'rec');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `fields.conforms: error: field 'x': the shape clause is line or block, not 'text' (${INV})\n`]);
  });
});
