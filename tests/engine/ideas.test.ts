import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { declaredRoot, libraryLock, lockPath } from '../support/drawer';
import type { Run } from '../support/exec';
import { holdLock } from '../support/locks';
import { ROOT } from '../support/root';
import { fresh, seed } from '../support/snapshot';
import { must, run, unit, waitFor } from '../support/unit';

const LIVE = join(ROOT, '.contexture/modules/ideas');
const VERBS = ['add', 'drop', 'get', 'list', 'pick', 'search'];
const FIELD_LINES = [
  'field: what: required block',
  'field: why: optional block',
  'field: status: optional line one-of OPEN|PICKED|DROPPED default OPEN',
  'field: dumped: optional line default today',
  'field: picked_by: optional line',
  'field: reason: optional line',
  'field: note: optional block',
];
const INV = 'ERR_INVALID_ARGUMENT';
const SV = 'ERR_SCHEMA_VIOLATION';
const EXISTS = 'ERR_ENTITY_EXISTS';
const MISSING = 'ERR_ENTITY_NOT_FOUND';
const MOVE = 'ERR_INVALID_TRANSITION';

const today = (): string => spawnSync('date', ['+%Y-%m-%d'], { encoding: 'utf8' }).stdout.trim();
const ideas = (sb: string, args: readonly string[], input: string | Buffer = '', env?: Record<string, string>): Promise<Run> => run(sb, ['ideas', ...args], { input, env });
const dataRoot = (sb: string): string => join(sb, existsSync(join(LIVE, 'data')) ? declaredRoot(join(LIVE, 'data')) : '.contexture/ideas');

function state(sb: string): string {
  const root = dataRoot(sb);
  if (!existsSync(root)) return '';
  return readdirSync(root)
    .sort()
    .map((f) => `${f}=${readFileSync(join(root, f), 'utf8')}`)
    .join('\n');
}

function plant(sb: string, id: string, record: string): void {
  mkdirSync(dataRoot(sb), { recursive: true });
  writeFileSync(join(dataRoot(sb), id), record);
}

function refused(r: Run, verb: string, code: string, message: string): void {
  expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `ideas ${verb}: error: ${message} (${code})\n`]);
}

async function tableVerbs(sb: string): Promise<string[]> {
  const r = await ideas(sb, []);
  expect(r.code).toBe(0);
  const body = r.stdout.split('\nverbs:\n')[1] ?? '';
  return body
    .split('\n')
    .map((l) => /^ {2}([a-z][a-z0-9_-]*) /.exec(l)?.[1])
    .filter((v): v is string => v !== undefined);
}

const DELETING = /^(delete|del|remove|rm|purge|prune|clear|destroy|erase)$/;

describe.skipIf(!existsSync(LIVE))('the ideas workspace module (needs its tracked folder .contexture/modules/ideas)', { concurrent: true }, () => {
  let sandbox: () => string;
  beforeAll(async () => {
    const snap = await seed(
      async (sb) => {
        cpSync(LIVE, join(sb, '.contexture/modules/ideas'), { recursive: true });
        await must(unit(sb, 'bootstrap', 'demo', 'the demo objective'));
        await must(unit(sb, 'task', 'add', 'demo', 't1', '--objective=a task to point at'));
      },
      'posix',
      'ideas',
    );
    sandbox = () => fresh(snap);
  });

  it('[modules-r3] the verb table is add, drop, get, list, pick, and search, no verb deletes, and the worker stays private', async () => {
    const sb = sandbox();
    expect((await run(sb, ['help'])).stdout).toMatch(/^ {2}ideas {2,}the idea dump/m);
    const verbs = await tableVerbs(sb);
    expect(verbs).toEqual(VERBS);
    expect(verbs.filter((v) => DELETING.test(v))).toEqual([]);
    const scripts = readdirSync(join(sb, '.contexture/modules/ideas/scripts')).sort();
    expect(scripts).toEqual([...VERBS, 'ideas'].sort());
    expect(readFileSync(join(sb, '.contexture/modules/ideas/scripts/ideas'), 'utf8')).not.toMatch(/^# summary:/m);
    const unknown = await ideas(sb, ['delete', 'x']);
    expect(unknown.code).toBe(1);
    expect((await ideas(sb, ['add', '--help'])).stdout).toContain('ctx ideas add <id> --what=<line>|--stdin=what');
    writeFileSync(join(sb, '.contexture/modules/ideas/scripts/delete'), '#!/bin/sh\n# summary: a planted delete verb\nexit 0\n', { mode: 0o755 });
    const planted = await tableVerbs(sb);
    expect(planted.filter((v) => DELETING.test(v))).toEqual(['delete']);
  });

  it('never delete: an idea is out of the store verbs\' reach, and every verb leaves the idea in place', async () => {
    const sb = sandbox();
    await must(ideas(sb, ['add', 'kept', '--what=an idea that stays']));
    expect((await run(sb, ['store', 'list', 'containers'])).stdout).not.toMatch(/^ideas /m);
    expect((await run(sb, ['store', 'get', 'ideas/kept'])).code).toBe(1);
    expect((await run(sb, ['store', 'delete', 'ideas/kept'])).code).toBe(1);
    await must(ideas(sb, ['list', '--json']));
    await must(ideas(sb, ['search', 'stays']));
    await must(ideas(sb, ['drop', 'kept', '--reason=dropped, still kept']));
    const got = await ideas(sb, ['get', 'kept']);
    expect([got.code, got.stdout]).toEqual([0, ['what ::', '  an idea that stays', 'status: "DROPPED"', `dumped: "${today()}"`, 'reason: "dropped, still kept"', ''].join('\n')]);
    expect(state(sb)).toMatch(/^kept=/);
  });

  it('[modules-r10] the data file declares the ideas container in field lines, and every read checks them', async () => {
    const sb = sandbox();
    const data = readFileSync(join(sb, '.contexture/modules/ideas/data'), 'utf8').split('\n');
    expect(data.filter((l) => l.startsWith('field: '))).toEqual(FIELD_LINES);
    expect(data).toContain('key: <id>');
    expect(data.some((l) => l.startsWith('namespace:'))).toBe(false);
    const good = join(sb, '.contexture/modules/ideas/data');
    const lines = readFileSync(good, 'utf8').split('\n');
    const at = lines.findIndex((l) => l.startsWith('field: status: ')) + 1;
    writeFileSync(good, lines.map((l) => (l.startsWith('field: status: ') ? 'field: status: mandatory line' : l)).join('\n'));
    for (const args of [['list'], ['get', 'x'], ['add', 'x', '--what=y']]) {
      const r = await ideas(sb, args);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(`line ${at}: field 'status': the presence clause is required or optional, not 'mandatory'`);
      expect(r.stderr.split('\n').filter(Boolean)).toHaveLength(1);
    }
    expect(state(sb)).toBe('');
  });

  it('[modules-r10] the read default is the data file\'s: an idea with no status reads OPEN until the default leaves the field line', async () => {
    const sb = sandbox();
    plant(sb, 'bare', 'what ::\n  stored with no status\n');
    expect((await ideas(sb, ['list'])).stdout).toBe('bare | status: OPEN\n');
    expect((await ideas(sb, ['get', 'bare'])).stdout).toBe('what ::\n  stored with no status\nstatus: "OPEN"\n');
    const data = join(sb, '.contexture/modules/ideas/data');
    writeFileSync(data, readFileSync(data, 'utf8').replace('one-of OPEN|PICKED|DROPPED default OPEN', 'one-of OPEN|PICKED|DROPPED'));
    expect((await ideas(sb, ['list'])).stdout).toBe('');
    expect((await ideas(sb, ['get', 'bare'])).stdout).toBe('what ::\n  stored with no status\n');
  });

  it('[the-engine-r-mrwga] add lands an idea OPEN with dumped today through the checked write, prints its id, and get prints it canonical', async () => {
    const sb = sandbox();
    const add = await ideas(sb, ['add', 'rust-driver', '--what=a driver in rust', '--why=speed']);
    expect([add.code, add.stdout, add.stderr]).toEqual([0, 'rust-driver\n', '']);
    const canonical = ['what ::', '  a driver in rust', 'why ::', '  speed', 'status: "OPEN"', `dumped: "${today()}"`, ''].join('\n');
    expect((await ideas(sb, ['get', 'rust-driver'])).stdout).toBe(canonical);
    expect(state(sb)).toBe(`rust-driver=${canonical}`);
    const block = await ideas(sb, ['add', 'block-one', '--stdin=what', '--dumped=2026-01-02', '--why=one line why'], 'a block\n\nwith a blank line\n');
    expect([block.code, block.stdout, block.stderr]).toEqual([0, 'block-one\n', '']);
    expect((await ideas(sb, ['get', 'block-one'])).stdout).toBe(['what ::', '  a block', '  ', '  with a blank line', 'why ::', '  one line why', 'status: "OPEN"', 'dumped: "2026-01-02"', ''].join('\n'));
    const json = await ideas(sb, ['get', 'block-one', '--json']);
    expect(JSON.parse(json.stdout)).toEqual({ container: 'ideas', id: 'block-one', address: 'ideas#block-one', record: { what: 'a block\n\nwith a blank line', why: 'one line why', status: 'OPEN', dumped: '2026-01-02' } });
    await must(ideas(sb, ['add', 'why-block', '--what=w', '--stdin=why'], 'a why block\n'));
    expect((await ideas(sb, ['get', 'why-block'])).stdout).toContain('why ::\n  a why block\nstatus: "OPEN"\n');
  });

  it('add refuses each malformed or breaking write with one line, writing nothing', async () => {
    const sb = sandbox();
    await must(ideas(sb, ['add', 'Taken', '--what=x']));
    const before = state(sb);
    const cases: [args: string[], input: string | Buffer, code: string, message: string][] = [
      [['Taken', '--what=y'], '', EXISTS, "idea 'Taken' already exists"],
      [['taken', '--what=y'], '', EXISTS, "idea 'taken' already exists as 'Taken' (ids are unique whatever their case)"],
      [['TAKEN', '--what=y'], '', EXISTS, "idea 'TAKEN' already exists as 'Taken' (ids are unique whatever their case)"],
      [['bad id', '--what=y'], '', INV, "malformed id 'bad id' (letters, digits, underscore, and dash, starting with a letter or digit)"],
      [['-x'], '', INV, 'add takes the id first (usage: ctx ideas add <id> [flags])'],
      [['fresh'], '', SV, "field 'what' is required and absent"],
      [['fresh', '--why=only a why'], '', SV, "field 'what' is required and absent"],
      [['fresh', '--what='], '', INV, "field 'what': an empty value"],
      [['fresh', '--what=two\nlines'], '', INV, '--what takes one line (a block comes on stdin: --stdin=what)'],
      [['fresh', '--why=a\rb', '--what=x'], '', INV, '--why takes one line (a block comes on stdin: --stdin=why)'],
      [['fresh', '--stdin=what'], Buffer.from([0x62, 0x61, 0x64, 0xff, 0x0a]), INV, "field 'what': the value is not valid UTF-8"],
      [['fresh', '--stdin=what'], '', INV, "field 'what': an empty value (unset removes a field)"],
      [['fresh', '--what=x', '--status=PICKED'], '', INV, "unknown argument '--status=PICKED' (add takes --what, --why, --stdin=what or --stdin=why, --ref, and --dumped)"],
      [['fresh', '--what=x', '--picked_by=demo'], '', INV, "unknown argument '--picked_by=demo' (add takes --what, --why, --stdin=what or --stdin=why, --ref, and --dumped)"],
      [['fresh', '--what=x', '--what=y'], '', INV, "field 'what' is given twice"],
      [['fresh', '--what=x', '--stdin=what'], '', INV, "field 'what' is given twice"],
      [['fresh', '--stdin=what', '--stdin=why'], 'x\n', INV, "one block per call: --stdin names 'what' already"],
      [['fresh', '--stdin=note'], 'x\n', INV, "add reads one block of what or why on stdin, not 'note'"],
      [['fresh', '--what=x', '--dumped=yesterday'], '', INV, "field 'dumped': 'yesterday' is no calendar date YYYY-MM-DD (the month 01 to 12, the day within its month)"],
    ];
    for (const [args, input, code, message] of cases) refused(await ideas(sb, ['add', ...args], input), 'add', code, message);
    expect(state(sb)).toBe(before);
  });

  it('add takes --dumped only as a real calendar date: the month 01 to 12, the day within its month, leap years counted; any other value refuses naming the field and the value', async () => {
    const sb = sandbox();
    for (const [id, d] of [['leap-4', '2024-02-29'], ['leap-400', '2000-02-29'], ['april-end', '2026-04-30'], ['year-end', '2026-12-31'], ['year-start', '2026-01-01']]) {
      await must(ideas(sb, ['add', id, '--what=x', `--dumped=${d}`]));
      expect((await ideas(sb, ['get', id])).stdout).toContain(`dumped: "${d}"\n`);
    }
    const before = state(sb);
    const bad = ['9999-99-99', '2026-00-10', '2026-13-01', '2026-01-00', '2026-01-32', '2026-02-30', '2025-02-29', '1900-02-29', '2026-04-31', '2026-06-31', '2026-09-31', '2026-11-31', '2026-1-01', '2026-01-01x', 'yesterday'];
    for (const d of bad) refused(await ideas(sb, ['add', 'fresh', '--what=x', `--dumped=${d}`]), 'add', INV, `field 'dumped': '${d}' is no calendar date YYYY-MM-DD (the month 01 to 12, the day within its month)`);
    expect(state(sb)).toBe(before);
  });

  it('a value of only blanks for what, why, or reason refuses exactly as the empty value of that field does, naming the field, writing nothing', async () => {
    const sb = sandbox();
    await must(ideas(sb, ['add', 'open-one', '--what=o']));
    const before = state(sb);
    // each blank form beside the empty form of the same field and the same door, which refused before
    const pairs: [verb: string, blank: string[], empty: string[], blankIn: string, emptyIn: string, message: string][] = [
      ['add', ['fresh', '--what= '], ['fresh', '--what='], '', '', "field 'what': an empty value"],
      ['add', ['fresh', '--what=\t \t'], ['fresh', '--what='], '', '', "field 'what': an empty value"],
      ['add', ['fresh', '--what=x', '--why=  '], ['fresh', '--what=x', '--why='], '', '', "field 'why': an empty value"],
      ['add', ['fresh', '--stdin=what'], ['fresh', '--stdin=what'], '  \n', '', "field 'what': an empty value (unset removes a field)"],
      ['add', ['fresh', '--stdin=what'], ['fresh', '--stdin=what'], ' \n\t\n\n', '\n', "field 'what': an empty value (unset removes a field)"],
      ['add', ['fresh', '--what=x', '--stdin=why'], ['fresh', '--what=x', '--stdin=why'], '\t\n', '', "field 'why': an empty value (unset removes a field)"],
      ['drop', ['open-one', '--reason= '], ['open-one', '--reason='], '', '', "field 'reason': an empty value"],
      ['drop', ['open-one', '--reason=\t'], ['open-one', '--reason='], '', '', "field 'reason': an empty value"],
    ];
    for (const [verb, blank, empty, blankIn, emptyIn, message] of pairs) {
      const b = await ideas(sb, [verb, ...blank], blankIn);
      refused(b, verb, INV, message);
      const e = await ideas(sb, [verb, ...empty], emptyIn);
      expect([b.code, b.stdout, b.stderr]).toEqual([e.code, e.stdout, e.stderr]);
    }
    expect(state(sb)).toBe(before);
    await must(ideas(sb, ['drop', 'open-one', '--reason= words beside blanks ']));
    expect((await ideas(sb, ['get', 'open-one'])).stdout).toContain('reason: " words beside blanks "\n');
  });

  it('[the-engine-r-sx11j] add checks each ref for its shape and its target through the owner\'s get before the write, and keeps the refs after the declared fields', async () => {
    const sb = sandbox();
    await must(ideas(sb, ['add', 'target', '--what=the idea pointed at']));
    const before = state(sb);
    const cases: [ref: string, code: string, message: string][] = [
      ['bad ref', INV, "malformed ref 'bad ref': a reference is <owner>#<path>, one token without blanks, control characters, or double quotes"],
      ['unit#demo/task/none', MISSING, "ref 'unit#demo/task/none': target not found"],
      ['file#no/such/file.md', MISSING, "ref 'file#no/such/file.md': target not found"],
      ['nomodule#x', MISSING, "ref 'nomodule#x': owner 'nomodule' is not installed"],
      ['journal#x', MISSING, "ref 'journal#x': owner 'journal' is not installed"],
      ['run#x', MISSING, "ref 'run#x': owner 'run' has no get verb"],
      ['ideas#missing', MISSING, "ref 'ideas#missing': target not found"],
      ['ideas#-x', MISSING, "ref 'ideas#-x': target not found"],
    ];
    for (const [ref, code, message] of cases) refused(await ideas(sb, ['add', 'pointer', '--what=x', `--ref=${ref}`]), 'add', code, message);
    refused(await ideas(sb, ['add', 'pointer', '--what=x', '--ref=ideas#target', '--ref=ideas#target']), 'add', INV, "field 'ref' already holds 'ideas#target'");
    expect(state(sb)).toBe(before);
    const refs = ['unit#demo/task/t1', 'file#AGENTS.md', 'ideas#target', 'file#/nowhere/outside/the/workspace'];
    const add = await ideas(sb, ['add', 'pointer', '--what=points around', ...refs.map((r) => `--ref=${r}`)]);
    expect([add.code, add.stdout, add.stderr]).toEqual([0, 'pointer\n', '']);
    expect((await ideas(sb, ['get', 'pointer'])).stdout).toBe(['what ::', '  points around', 'status: "OPEN"', `dumped: "${today()}"`, ...refs.map((r) => `ref: "${r}"`), ''].join('\n'));
    expect(JSON.parse((await ideas(sb, ['get', 'pointer', '--json'])).stdout).record.ref).toEqual(refs);
    expect((await ideas(sb, ['list'])).stdout).toContain(`pointer | status: OPEN | dumped: ${today()} | ref: ${refs.join(', ')}\n`);
    await must(ideas(sb, ['pick', 'pointer', '--by=demo']));
    expect((await ideas(sb, ['get', 'pointer'])).stdout).toBe(['what ::', '  points around', 'status: "PICKED"', `dumped: "${today()}"`, 'picked_by: "demo"', ...refs.map((r) => `ref: "${r}"`), ''].join('\n'));
  });

  it('pick sets PICKED with picked_by and drop sets DROPPED with reason, each in one write printing the id, and list moves the idea', async () => {
    const sb = sandbox();
    await must(ideas(sb, ['add', 'to-pick', '--what=p', '--dumped=2026-02-03']));
    await must(ideas(sb, ['add', 'to-drop', '--what=d', '--dumped=2026-02-03']));
    expect((await ideas(sb, ['list'])).stdout).toBe('to-drop | status: OPEN | dumped: 2026-02-03\nto-pick | status: OPEN | dumped: 2026-02-03\n');
    const pick = await ideas(sb, ['pick', 'to-pick', '--by=demo']);
    expect([pick.code, pick.stdout, pick.stderr]).toEqual([0, 'to-pick\n', '']);
    const drop = await ideas(sb, ['drop', 'to-drop', '--reason=met elsewhere, (with parens)']);
    expect([drop.code, drop.stdout, drop.stderr]).toEqual([0, 'to-drop\n', '']);
    expect(state(sb)).toBe(
      [
        'to-drop=what ::\n  d\nstatus: "DROPPED"\ndumped: "2026-02-03"\nreason: "met elsewhere, (with parens)"\n',
        'to-pick=what ::\n  p\nstatus: "PICKED"\ndumped: "2026-02-03"\npicked_by: "demo"\n',
      ].join('\n'),
    );
    expect((await ideas(sb, ['list'])).stdout).toBe('');
    expect((await ideas(sb, ['list', '--status=PICKED'])).stdout).toBe('to-pick | status: PICKED | dumped: 2026-02-03 | picked_by: demo\n');
    expect((await ideas(sb, ['list', '--status=DROPPED'])).stdout).toBe('to-drop | status: DROPPED | dumped: 2026-02-03 | reason: met elsewhere, (with parens)\n');
  });

  it('pick and drop refuse a missing pair, a missing idea, and an idea that is not OPEN, writing nothing', async () => {
    const sb = sandbox();
    await must(ideas(sb, ['add', 'open-one', '--what=o']));
    await must(ideas(sb, ['add', 'picked-one', '--what=p']));
    await must(ideas(sb, ['pick', 'picked-one', '--by=demo']));
    await must(ideas(sb, ['add', 'dropped-one', '--what=d']));
    await must(ideas(sb, ['drop', 'dropped-one', '--reason=gone']));
    const before = state(sb);
    const cases: [verb: string, args: string[], code: string, message: string][] = [
      ['pick', ['open-one'], INV, "pick needs --by=<unit>: field 'picked_by' pairs with status PICKED"],
      ['drop', ['open-one'], INV, "drop needs --reason=<text>: field 'reason' pairs with status DROPPED"],
      ['pick', ['open-one', '--by='], INV, "field 'picked_by': an empty value"],
      ['drop', ['open-one', '--reason='], INV, "field 'reason': an empty value"],
      ['pick', ['open-one', '--by=not a unit'], INV, "field 'picked_by': 'not a unit' is no unit slug (letters, digits, underscore, and dash, starting with a letter or digit)"],
      ['drop', ['open-one', '--reason=two\nlines'], INV, "field 'reason': a line value holds a newline or a carriage return"],
      ['pick', ['open-one', '--by=a', '--by=b'], INV, "field 'picked_by' is given twice"],
      ['pick', ['open-one', '--reason=x'], INV, "unknown flag '--reason=x' (usage: ctx ideas pick <id> --by=<unit>)"],
      ['drop', ['open-one', 'extra', '--reason=x'], INV, 'drop takes one id (usage: ctx ideas drop <id> --reason=<text>)'],
      ['pick', ['bad id', '--by=demo'], INV, "malformed id 'bad id' (letters, digits, underscore, and dash, starting with a letter or digit)"],
      ['pick', ['nope', '--by=demo'], MISSING, "idea 'nope' not found"],
      ['drop', ['nope', '--reason=x'], MISSING, "idea 'nope' not found"],
      ['pick', ['picked-one', '--by=demo'], MOVE, "idea 'picked-one' is PICKED; pick moves only from OPEN"],
      ['drop', ['picked-one', '--reason=x'], MOVE, "idea 'picked-one' is PICKED; drop moves only from OPEN"],
      ['pick', ['dropped-one', '--by=demo'], MOVE, "idea 'dropped-one' is DROPPED; pick moves only from OPEN"],
      ['drop', ['dropped-one', '--reason=again'], MOVE, "idea 'dropped-one' is DROPPED; drop moves only from OPEN"],
    ];
    for (const [verb, args, code, message] of cases) refused(await ideas(sb, [verb, ...args]), verb, code, message);
    expect(state(sb)).toBe(before);
  });

  it('a stored field that a move would leave beside the wrong status refuses with the module\'s own line; the move\'s own field is overwritten', async () => {
    const sb = sandbox();
    plant(sb, 'stray-reason', 'what ::\n  w\nstatus: "OPEN"\nreason: "stray"\n');
    plant(sb, 'stray-by', 'what ::\n  w\npicked_by: "old-unit"\n');
    const before = state(sb);
    refused(await ideas(sb, ['pick', 'stray-reason', '--by=demo']), 'pick', SV, "idea 'stray-reason' holds field 'reason', which pairs only with status DROPPED, so pick would leave it beside PICKED");
    refused(await ideas(sb, ['drop', 'stray-by', '--reason=x']), 'drop', SV, "idea 'stray-by' holds field 'picked_by', which pairs only with status PICKED, so drop would leave it beside DROPPED");
    expect(state(sb)).toBe(before);
    await must(ideas(sb, ['pick', 'stray-by', '--by=demo']));
    expect((await ideas(sb, ['get', 'stray-by'])).stdout).toBe('what ::\n  w\nstatus: "PICKED"\npicked_by: "demo"\n');
    await must(ideas(sb, ['drop', 'stray-reason', '--reason=fresh reason']));
    expect((await ideas(sb, ['get', 'stray-reason'])).stdout).toBe('what ::\n  w\nstatus: "DROPPED"\nreason: "fresh reason"\n');
  });

  it('list is complete and uncapped in id order, --json answers every record whole, and a bad filter refuses naming it', async () => {
    const sb = sandbox();
    const ids = Array.from({ length: 25 }, (_, i) => `idea-${String(i).padStart(2, '0')}`);
    for (const id of ids) plant(sb, id, `what ::\n  ${id}\nstatus: "OPEN"\ndumped: "2026-03-04"\n`);
    plant(sb, 'zz-picked', 'what ::\n  z\nstatus: "PICKED"\npicked_by: "demo"\n');
    const text = (await ideas(sb, ['list'])).stdout.split('\n').filter(Boolean);
    expect(text).toEqual(ids.map((id) => `${id} | status: OPEN | dumped: 2026-03-04`));
    const json = JSON.parse((await ideas(sb, ['list', '--json'])).stdout);
    expect(json.container).toBe('ideas');
    expect(json.total).toBe(25);
    expect(json.records[0]).toEqual({ id: 'idea-00', address: 'ideas#idea-00', record: { what: 'idea-00', status: 'OPEN', dumped: '2026-03-04' } });
    expect(JSON.parse((await ideas(sb, ['list', '--status=DROPPED', '--json'])).stdout)).toEqual({ container: 'ideas', records: [], total: 0 });
    refused(await ideas(sb, ['list', '--status=open']), 'list', INV, "field 'status': 'open' is not one of OPEN|PICKED|DROPPED");
    refused(await ideas(sb, ['list', '--status=']), 'list', INV, "field 'status': an empty filter value");
    refused(await ideas(sb, ['list', 'all']), 'list', INV, 'list takes no operand (usage: ctx ideas list [--status=OPEN|PICKED|DROPPED] [--json])');
    refused(await ideas(sb, ['list', '--limit=5']), 'list', INV, "unknown flag '--limit=5' (usage: ctx ideas list [--status=OPEN|PICKED|DROPPED] [--json])");
    refused(await ideas(sb, ['get']), 'get', INV, 'usage: ctx ideas get <id> [--json]');
    refused(await ideas(sb, ['get', 'a', 'b']), 'get', INV, 'get takes one id (usage: ctx ideas get <id> [--json])');
    refused(await ideas(sb, ['get', 'nope']), 'get', MISSING, "idea 'nope' not found");
  });

  it('list matches --status against each status as a whole: the pipe joined form the usage prints is no status and refuses naming it, never an empty answer', async () => {
    const sb = sandbox();
    plant(sb, 'o1', 'what ::\n  o\nstatus: "OPEN"\n');
    plant(sb, 'p1', 'what ::\n  p\nstatus: "PICKED"\npicked_by: "demo"\n');
    for (const v of ['OPEN|PICKED', 'PICKED|DROPPED', 'OPEN|PICKED|DROPPED', 'OPEN|OPEN', 'PICKED|', '|OPEN', 'OPEN ', '*'])
      refused(await ideas(sb, ['list', `--status=${v}`]), 'list', INV, `field 'status': '${v}' is not one of OPEN|PICKED|DROPPED`);
    for (const [v, line] of [['OPEN', 'o1 | status: OPEN\n'], ['PICKED', 'p1 | status: PICKED | picked_by: demo\n'], ['DROPPED', '']]) expect((await ideas(sb, ['list', `--status=${v}`])).stdout).toBe(line);
  });

  it('search answers the shared shape: rows of type idea reading ctx ideas get <id>, zero hits rc 0, and ctx search groups them under ideas', async () => {
    const sb = sandbox();
    await must(ideas(sb, ['add', 'alpha', '--what=a rust driver for the store']));
    await must(ideas(sb, ['add', 'beta', '--what=b', '--stdin=why'], 'first line\nthe Rust second line\n'));
    await must(ideas(sb, ['pick', 'beta', '--by=demo']));
    const json = JSON.parse((await ideas(sb, ['search', 'rust', '--json'])).stdout);
    expect(json).toEqual({
      query: 'rust',
      mode: 'exact',
      total: 2,
      rows: [
        { module: 'ideas', container: 'ideas', type: 'idea', id: 'alpha', address: 'ideas#alpha', snippet: 'a rust driver for the store', read: 'ctx ideas get alpha' },
        { module: 'ideas', container: 'ideas', type: 'idea', id: 'beta', address: 'ideas#beta', snippet: 'the Rust second line', read: 'ctx ideas get beta' },
      ],
    });
    expect(JSON.parse((await ideas(sb, ['search', 'rust', '--json', '--limit=1', '--type=idea'])).stdout)).toMatchObject({ total: 2, rows: [{ id: 'alpha' }] });
    expect((await ideas(sb, ['search', 'rust', '--limit=1'])).stdout).toBe('search "rust": 2 matches, 1 shown\n  idea ideas#alpha: a rust driver for the store\nread one: ctx ideas get <id> (the address after ideas#)\n');
    const none = await ideas(sb, ['search', 'no-such-text', '--json']);
    expect([none.code, JSON.parse(none.stdout)]).toEqual([0, { query: 'no-such-text', mode: 'exact', total: 0, rows: [] }]);
    refused(await ideas(sb, ['search', 'rust', '--type=task']), 'search', INV, "type 'task' is no ideas type (the ideas module answers type idea)");
    refused(await ideas(sb, ['search', 'rust', '--mode=hybrid']), 'search', INV, "mode 'hybrid' cannot answer the ideas module (it answers: exact)");
    refused(await ideas(sb, ['search', 'rust', '--limit=0']), 'search', INV, "--limit takes a positive whole number, not '0'");
    refused(await ideas(sb, ['search', 'a', 'b']), 'search', INV, 'search takes one query');
    const fan = { CTX_SEARCH_FANOUT: '1' };
    expect(JSON.parse((await ideas(sb, ['search', 'rust', '--type=task', '--json'], '', fan)).stdout)).toEqual({ query: 'rust', mode: 'exact', total: 0, rows: [] });
    expect(JSON.parse((await ideas(sb, ['search', 'rust', '--mode=hybrid', '--json'], '', fan)).stdout)).toMatchObject({ mode: 'exact', total: 2 });
    const all = await run(sb, ['search', 'rust', '--json']);
    expect(all.code).toBe(0);
    const group = JSON.parse(all.stdout).groups.find((g: { module: string }) => g.module === 'ideas');
    expect(group).toMatchObject({ module: 'ideas', status: 'ok', mode: 'exact', total: 2 });
    expect(group.rows.map((r: { read: string }) => r.read)).toEqual(['ctx ideas get alpha', 'ctx ideas get beta']);
  });

  it('the address ideas#<id> resolves: the unit\'s write time ref check passes through ctx ideas get and refuses a missing idea', async () => {
    const sb = sandbox();
    await must(ideas(sb, ['add', 'pointed', '--what=x']));
    expect((await unit(sb, 'record', 'demo', '--what=points at an idea', '--ref=ideas#pointed')).code).toBe(0);
    const miss = await unit(sb, 'record', 'demo', '--what=points at nothing', '--ref=ideas#absent');
    expect([miss.code, miss.stderr]).toEqual([1, "record: error: ref 'ideas#absent': target not found (ERR_ENTITY_NOT_FOUND)\n"]);
  });

  it('[the-engine-r-uv5a3] the writers serialize under the ideas library lock: concurrent adds of one id leave one idea, and a pick waits on a held lock', async () => {
    const sb = sandbox();
    const runs = await Promise.all([1, 2, 3, 4].map((n) => ideas(sb, ['add', 'same', `--what=writer ${n}`])));
    expect(runs.filter((r) => r.code === 0)).toHaveLength(1);
    const lost = runs.filter((r) => r.code === 1);
    expect(lost).toHaveLength(3);
    for (const r of lost) expect(r.stderr).toBe(`ideas add: error: idea 'same' already exists (${EXISTS})\n`);
    expect(state(sb).match(/^same=/gm)).toHaveLength(1);
    for (const n of [1, 2, 3]) await must(ideas(sb, ['add', `raced-${n}`, '--what=r']));
    for (const n of [1, 2, 3]) {
      const moves = await Promise.all([ideas(sb, ['pick', `raced-${n}`, '--by=demo']), ideas(sb, ['drop', `raced-${n}`, '--reason=r']), ideas(sb, ['pick', `raced-${n}`, '--by=other'])]);
      expect(moves.filter((r) => r.code === 0)).toHaveLength(1);
      for (const r of moves.filter((m) => m.code !== 0)) expect(r.stderr).toMatch(new RegExp(`^ideas (pick|drop): error: idea 'raced-${n}' is (PICKED|DROPPED); (pick|drop) moves only from OPEN \\(${MOVE}\\)\\n$`));
    }
    const release = holdLock(sb, libraryLock('ideas'), 'live');
    const pending = ideas(sb, ['pick', 'same', '--by=demo']);
    expect(await waitFor(() => false, 1500)).toBe(false);
    expect(readFileSync(join(dataRoot(sb), 'same'), 'utf8')).toContain('status: "OPEN"');
    release();
    const r = await pending;
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'same\n', '']);
    expect(existsSync(lockPath(sb, libraryLock('ideas')))).toBe(false);
  }, 30_000);
});
