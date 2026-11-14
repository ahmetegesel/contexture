import { beforeAll, describe, expect, it } from 'vitest';
import { execBytes } from '../support/unit';
import { latin1 } from '../unit-verbs/inputs';
import { declare, EXISTS, INV, MISSING, refused, snapshot, store, storeState, SV } from './support';

const FIELDS = ['what: required line', 'status: optional line one-of OPEN|DONE default OPEN', 'note: optional block', 'tags: optional line list'];

let sandbox: () => string;
beforeAll(async () => {
  sandbox = await snapshot('store-refusals', async (sb) => {
    await declare(sb, 'items', 'given', FIELDS);
    await store(sb, ['put', 'items/held', '--what=held']);
    await store(sb, ['put', 'items/gone', '--what=gone']);
    await store(sb, ['delete', 'items/gone']);
  });
});

type Case = [name: string, argv: string[], input: string, code: string, message: string];

const put = (...flags: string[]): string[] => ['put', 'items/new', '--what=w', ...flags];

const CASES: Case[] = [
  ['a newline in a line field', put('--status=OPEN\nX'), '', INV, "field 'status': a line value holds a newline or a carriage return"],
  ['a bad id', ['put', 'items/-bad', '--what=w'], '', INV, "malformed id '-bad' (letters, digits, underscore, and dash, starting with a letter or digit)"],
  ['a ref outside the full address grammar', put('--add-ref=journal slug'), '', INV, "malformed ref 'journal slug': a reference is <owner>#<path>, one token without blanks, control characters, or double quotes"],
  ['a ref with no owner', put('--add-ref=#x'), '', INV, "malformed ref '#x': a reference is <owner>#<path>, one token without blanks, control characters, or double quotes"],
  ['a set form on the ref list', put('--ref=unit#u/t'), '', INV, "field 'ref' is a list: add or remove its items"],
  ['an empty value', put('--status='), '', INV, "field 'status': an empty value (unset removes a field)"],
  ['a set on a list field', put('--tags=a'), '', INV, "field 'tags' is a list: add or remove its items"],
  ['a block for a line field', ['put', 'items/new', '--stdin=what'], 'x\n', INV, "field 'what' is a line field, not a block"],
  ['two blocks in one call', ['put', 'items/new', '--what=w', '--stdin=note', '--stdin=note'], 'x\n', INV, "one block per call: --stdin names 'note' already"],
  ['an unknown argument', ['put', 'items/new', 'loose'], '', INV, "unknown argument 'loose' (a write takes --<field>=<value>, --add-<field>=<item>, --remove-<field>=<item>, --unset=<field>, or --stdin=<field>)"],
  ['a field name holding a newline', put('--co\nlour=x'), '', INV, "argument '--co\\nlour=x' names a malformed field"],
  ['a field name holding a tab', put('--add-co\tlour=x'), '', INV, "argument '--add-co\\tlour=x' names a malformed field"],
  ['a removed ref holding a carriage return', ['set', 'items/held', '--remove-ref=unit#a\rb'], '', INV, "field 'ref' holds no item 'unit#a\\rb'"],
  ['a missing required field', ['put', 'items/new', '--status=OPEN'], '', SV, "field 'what' is required and absent"],
  ['a value outside its one-of set', put('--status=MAYBE'), '', SV, "field 'status': 'MAYBE' is not one of OPEN|DONE"],
  ['an unknown field', put('--colour=red'), '', SV, "field 'colour' is not declared"],
  ['a write to an undeclared container', ['put', 'nope/x', '--what=w'], '', SV, "container 'nope' is not declared (put containers/nope declares it)"],
  ['a put on a used id', ['put', 'items/held', '--what=w'], '', EXISTS, "record 'items/held' already exists"],
  ['a put on a retired id', ['put', 'items/gone', '--what=w'], '', EXISTS, "id 'gone' is retired in container 'items' (a deleted id is never handed out again)"],
  ['a set on a missing record', ['set', 'items/none', '--what=w'], '', MISSING, "record 'items/none' not found"],
  ['a set on a retired record', ['set', 'items/gone', '--what=w'], '', MISSING, "record 'items/gone' is retired (a deleted id is never handed out again)"],
  ['a delete of a missing record', ['delete', 'items/none'], '', MISSING, "record 'items/none' not found"],
  ['a set leaving a required field absent', ['set', 'items/held', '--unset=what'], '', SV, "field 'what' is required: unset would leave it absent"],
  ['a set into an undeclared container', ['set', 'nope/x', '--what=w'], '', SV, "container 'nope' is not declared (put containers/nope declares it)"],
];

describe.concurrent('the store write refusals: rc 1, one line, nothing written', () => {
  it.each(CASES)('[store-r4] refuses %s', async (_name, argv, input, code, message) => {
    const sb = sandbox();
    const before = storeState(sb);
    refused(await store(sb, argv, input), argv[0]!, code, message);
    expect(storeState(sb)).toBe(before);
  });

  it('[store-r4] the checks run in their fixed order: the container before the id, the id before the fields, the fields before the ref', async () => {
    const sb = sandbox();
    refused(await store(sb, ['put', 'nope/-bad', '--colour=x']), 'put', SV, "container 'nope' is not declared (put containers/nope declares it)");
    refused(await store(sb, ['put', 'items/held', '--colour=x']), 'put', EXISTS, "record 'items/held' already exists");
    refused(await store(sb, ['put', 'items/new', '--colour=x', '--add-ref=bad ref']), 'put', SV, "field 'colour' is not declared");
    refused(await store(sb, ['put', 'items/new', '--what=w', '--add-ref=bad ref']), 'put', INV, "malformed ref 'bad ref': a reference is <owner>#<path>, one token without blanks, control characters, or double quotes");
  });

  it.each([
    ['a line field', 'what'],
    ['a ref', 'add-ref'],
  ])('[store-r4] refuses invalid UTF-8 in %s', async (_name, flag) => {
    const sb = sandbox();
    const before = storeState(sb);
    const bad = Buffer.concat([Buffer.from(`--${flag}=`), flag === 'add-ref' ? Buffer.from('unit#') : Buffer.alloc(0), latin1('bad \xff byte')]);
    const argv = flag === 'add-ref' ? ['put', 'items/new', '--what=w', bad] : ['put', 'items/new', bad];
    const r = await execBytes(sb, ['./.contexture/ctx', 'store', ...argv]);
    const field = flag === 'add-ref' ? 'ref' : 'what';
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `store put: error: field '${field}': the value is not valid UTF-8 (${INV})\n`]);
    expect(storeState(sb)).toBe(before);
  });

  it('[store-r4] every refusal leaves the library lock free for the next writer', async () => {
    const sb = sandbox();
    refused(await store(sb, ['put', 'items/held', '--what=w']), 'put', EXISTS, "record 'items/held' already exists");
    const r = await store(sb, ['put', 'items/next', '--what=w']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'next\n', '']);
  });
});
