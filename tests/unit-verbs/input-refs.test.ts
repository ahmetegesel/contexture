import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { unitLock } from '../support/drawer';
import { holdLock } from '../support/locks';
import { shVerb, writeModule } from '../support/modules';
import { appendArtifact } from '../support/record';
import { ROOT } from '../support/root';
import { fresh, seed } from '../support/snapshot';
import { createLane, lane, laneFlags, must, run, seedUnit, unit, unitChecksum } from '../support/unit';

const D = '2026-09-27';
const U = 'e3-unit';
const refs = (...r: string[]): string[] => r.map((v) => `--ref=${v}`);
const SHAPE = 'a reference is <owner>#<path>, one token without blanks, control characters, or double quotes (ERR_INVALID_ARGUMENT)';
const full = (label: string, ref: string, to: string): string => `${label}: error: malformed ref '${ref}': a reference is a full address <owner>#<path>; write ${to} (ERR_INVALID_ARGUMENT)\n`;

// every full address shape the verbs land: each owner answers it through its get
const GOOD = [
  `unit#${U}/entry/${D}-e3-t`,
  `unit#${U}/task/e3-task`,
  `unit#${U}/finding/E3_ONE`,
  `unit#${U}/lane/e3-lane/recipe`,
  `unit#${U}/lane/e3-lane/recipe/GOAL`,
  `unit#${U}/lane/e3-lane/journal`,
  'file#.contexture/ctx',
  'file#./.contexture/ctx#dispatch',
  'file#/no/such/path/outside/the/workspace',
  'store#notes/n1',
  'docs#workspace/the-record/header',
];

const PATHS: readonly [string, string, (bad: string) => string[]][] = [
  ['record --ref', 'record', (v) => ['unit', 'record', U, '--what=ref probe', `--ref=${v}`]],
  ['finding add --ref', 'finding', (v) => ['unit', 'finding', 'add', U, 'E3_TWO', '--summary=two', `--ref=${v}`]],
  ['finding update --ref', 'finding', (v) => ['unit', 'finding', 'update', U, 'E3_ONE', `--ref=${v}`]],
  ['finding supersede --ref', 'finding', (v) => ['unit', 'finding', 'supersede', U, 'E3_ONE', 'E3_THREE', '--summary=three', `--ref=${v}`]],
  ['lane record --ref', 'lane record', (v) => ['lane', 'record', U, 'e3-lane', '--what=lane probe', `--ref=${v}`]],
  ['lane create --ref', 'lane create', (v) => ['lane', 'create', U, 'e3-new', ...laneFlags([`--ref=${v}`])]],
  ['task add --refs', 'task add', (v) => ['unit', 'task', 'add', U, 'e3-bad', '--objective=bad refs', `--refs=unit#${U}/task/e3-task ${v}`]],
  ['task update --refs', 'task update', (v) => ['unit', 'task', 'update', U, 'e3-task', `--refs=${v}`]],
];

// the retired forms, each refused naming the full address ctx unit migrate writes
const RETIRED: readonly (readonly [string, string])[] = [
  [`journal#${D}-e3-t`, `unit#${U}/entry/${D}-e3-t`],
  ['knowledge#E3_ONE', `unit#${U}/finding/E3_ONE`],
  ['backlog#e3-task', `unit#${U}/task/e3-task`],
  ['lane#e3-lane/report', `unit#${U}/lane/e3-lane/report`],
  ['lane#e3-lane/report#VERDICT', `unit#${U}/lane/e3-lane/report/VERDICT`],
  ['lanes/e3-lane/recipe', `unit#${U}/lane/e3-lane/recipe`],
  ['./README.md', 'file#./README.md'],
  ['README.md', 'file#./README.md'],
  ['src/a.sh#fn', 'file#src/a.sh#fn'],
  ['IDEAS.md#rust-driver', 'store#ideas/rust-driver'],
];

describe.concurrent('the full address refs on every write path through the verbs', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      cpSync(join(ROOT, 'plugins/docs-discipline/.contexture'), join(sb, '.contexture'), { recursive: true });
      await must(run(sb, ['docs', 'new', 'workspace', 'the-record', '--kind=structural', '--description=the record doc', '--sources=base/x', '--keywords=record']));
      await must(run(sb, ['store', 'put', 'containers/notes', '--description=the notes', '--minting=given', '--add-fields=text: optional line']));
      await must(run(sb, ['store', 'put', 'notes/n1', '--text=one']));
      await seedUnit(sb, U, 'end review checks');
      await must(unit(sb, 'record', U, '--what=the target', `--slug=${D}-e3-t`));
      await must(unit(sb, 'finding', 'add', U, 'E3_ONE', '--summary=one'));
      await must(unit(sb, 'task', 'add', U, 'e3-task', '--objective=a task'));
      await must(createLane(sb, U, 'e3-lane'));
    }, 'posix', 'input-refs');
  });

  it.for(PATHS)('E3-a [the-record-r9, the-record-r18]: %s refuses a retired short form naming its full address, and a malformed value by the library check; nothing lands', async ([, label, argv]) => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, U, ['e3-lane']);
    const short = await run(sb, argv('journal#x'));
    expect([short.code, short.stdout, short.stderr]).toEqual([1, '', full(label, 'journal#x', `unit#${U}/entry/x`)]);
    const bare = await run(sb, argv('bareword'));
    expect([bare.code, bare.stdout]).toEqual([1, '']);
    expect(bare.stderr).toContain(`malformed ref 'bareword': `);
    expect(await unitChecksum(sb, U, ['e3-lane'])).toBe(before);
  });

  it.for(RETIRED)('E3-a [the-record-r18]: the retired form %s refuses, naming %s', async ([ref, to]) => {
    const r = await unit(fresh(sb0), 'record', U, '--what=retired', `--ref=${ref}`);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', full('record', ref, to)]);
  });

  it.for(['journal x', '', '#slug', 'Owner#x'])('E3-a [the-record-r18]: %j, a value with no owner, refuses by the full address shape check', async (ref) => {
    const r = await unit(fresh(sb0), 'record', U, '--what=no owner', `--ref=${ref}`);
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toBe(`record: error: malformed ref '${ref}': ${SHAPE}\n`);
  });

  it.for(['@e3/entry/x', 'U/entry/x'])('E3-a [the-record-r18]: %j, a compressed view form with no owner, refuses rc 1, nothing written', async (ref) => {
    const r = await unit(fresh(sb0), 'record', U, '--what=no owner', `--ref=${ref}`);
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toMatch(new RegExp(`^record: error: malformed ref '${ref}': .*\\(ERR_INVALID_ARGUMENT\\)\\n$`));
  });

  it('E3-b [the-record-r18]: a control byte in a ref refuses through the verb too, nothing landed', async () => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, U, ['e3-lane']);
    const r = await unit(sb, 'record', U, '--what=e7 probe', `--ref=unit#${U}/entry/x\fy`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(SHAPE);
    expect(await unitChecksum(sb, U, ['e3-lane'])).toBe(before);
  });

  it('E3-b [the-record-r14, the-record-r18]: record lands every full address shape, each its own REF line, as written', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'record', U, '--what=refs ok', `--slug=${D}-e7-refs`, ...refs(...GOOD)));
    expect((await unit(sb, 'entry', 'show', U, `${D}-e7-refs`)).stdout.split('\n').filter((l) => l.startsWith('  REF: '))).toEqual(GOOD.map((r) => `  REF: "${r}"`));
  });

  it('E3-b [the-record-r14, the-record-r18]: task add and task update land the full addresses as the REFS list', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'task', 'add', U, 'e7-good', '--objective=e7 good refs', `--refs=${GOOD.join(' ')}`));
    expect((await unit(sb, 'get', `${U}/task/e7-good`)).stdout).toContain(`  REFS: [${GOOD.join(', ')}]\n`);
    await must(unit(sb, 'task', 'update', U, 'e3-task', `--refs=unit#${U}/entry/${D}-e3-t, file#.contexture/ctx`));
    expect((await unit(sb, 'get', `${U}/task/e3-task`)).stdout).toContain(`  REFS: [unit#${U}/entry/${D}-e3-t, file#.contexture/ctx]\n`);
  });

  it('E3-b [the-record-r14, the-record-r18]: finding add, update, and supersede, lane record, and lane create land the full addresses', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'finding', 'add', U, 'E7_GOOD', '--summary=e7 good', ...refs(...GOOD)));
    expect((await unit(sb, 'finding', 'show', U, 'E7_GOOD')).stdout.split('\n').filter((l) => l.startsWith('  REF: '))).toHaveLength(GOOD.length);
    await must(unit(sb, 'finding', 'update', U, 'E3_ONE', ...refs(`unit#${U}/finding/E7_GOOD`)));
    await must(unit(sb, 'finding', 'supersede', U, 'E3_ONE', 'E3_THREE', '--summary=three', ...refs(`unit#${U}/lane/e3-lane/recipe/GOAL`)));
    await must(lane(sb, 'record', U, 'e3-lane', '--what=e7 lane refs ok', `--slug=${D}-e7-l`, ...refs(...GOOD)));
    expect((await unit(sb, 'get', `${U}/lane/e3-lane/journal/${D}-e7-l`)).stdout.split('\n').filter((l) => l.startsWith('  REF: '))).toHaveLength(GOOD.length);
    await must(createLane(sb, U, 'e7-lane', refs(...GOOD)));
    expect((await lane(sb, 'show', U, 'e7-lane', 'recipe')).stdout).toContain(`\nREFS ::\n${GOOD.map((r) => `  ${r}\n`).join('')}\nSCOPE ::\n`);
  });

  it.for([
    [`unit#${U}/entry/${D}-nope`, `ref 'unit#${U}/entry/${D}-nope': target not found`],
    [`unit#${U}/lane/e3-lane/report/NOPE`, `ref 'unit#${U}/lane/e3-lane/report/NOPE': target not found`],
    ['store#notes/n9', "ref 'store#notes/n9': target not found"],
    ['docs#workspace/the-record/the-record-r999', "ref 'docs#workspace/the-record/the-record-r999': target not found"],
    ['file#no/such/file.sh', "ref 'file#no/such/file.sh': target not found"],
    ['memos#x/y', "ref 'memos#x/y': owner 'memos' is not installed"],
    ['lane-owner#x', "ref 'lane-owner#x': owner 'lane-owner' is not installed"],
    // a path starting with a dash names no target: get would read it as an option
    ['unit#--help', "ref 'unit#--help': target not found"],
    ['store#--help', "ref 'store#--help': target not found"],
    [`unit#-${U}/task/e3-task`, `ref 'unit#-${U}/task/e3-task': target not found`],
    // an installed module with no get verb reads apart from an owner not installed; a name the
    // engine reserves is classed by its readers, never dispatched
    ['rhythm#x', "ref 'rhythm#x': owner 'rhythm' has no get verb"],
    ['run#x', "ref 'run#x': owner 'run' has no get verb"],
    ['compose#x', "ref 'compose#x': owner 'compose' is not installed"],
  ] as const)('E3-d [the-record-r9]: %s refuses rc 1 ERR_ENTITY_NOT_FOUND naming the ref, nothing written', async ([ref, msg]) => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, U, ['e3-lane']);
    for (const argv of PATHS.map(([, , a]) => a(ref))) {
      const r = await run(sb, argv);
      expect([r.code, r.stdout]).toEqual([1, '']);
      expect(r.stderr).toMatch(new RegExp(`^[a-z ]+: error: ${msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(ERR_ENTITY_NOT_FOUND\\)\\n$`));
    }
    expect(await unitChecksum(sb, U, ['e3-lane'])).toBe(before);
  });

  it('E3-d [the-record-r9]: the checks run before the unit lock: a write of eight refs, one dangling, refuses while a live writer holds the lock, and a write of eight good refs lands once it is released', async () => {
    const sb = fresh(sb0);
    const eight = [`unit#${U}/entry/${D}-e3-t`, `unit#${U}/task/e3-task`, `unit#${U}/finding/E3_ONE`, `unit#${U}/lane/e3-lane/recipe`, 'store#notes/n1', 'docs#workspace/the-record/header', 'file#.contexture/ctx', 'file#./.contexture/ctx#dispatch'];
    const release = holdLock(sb, unitLock(U), 'live');
    try {
      const t0 = Date.now();
      const r = await unit(sb, 'record', U, '--what=held', ...refs(...eight.slice(0, 7), `unit#${U}/entry/${D}-nope`));
      expect([r.code, r.stderr]).toEqual([1, `record: error: ref 'unit#${U}/entry/${D}-nope': target not found (ERR_ENTITY_NOT_FOUND)\n`]);
      expect(Date.now() - t0).toBeLessThan(30000);
      const pending = unit(sb, 'record', U, '--what=eight refs', `--slug=${D}-e8`, ...refs(...eight));
      await new Promise((res) => setTimeout(res, 300));
      release();
      expect((await pending).code).toBe(0);
    } finally {
      release();
    }
    expect((await unit(sb, 'entry', 'show', U, `${D}-e8`)).stdout.split('\n').filter((l) => l.startsWith('  REF: '))).toHaveLength(8);
  });

  it('E3-d [the-record-r-hxgfj]: each owner is probed once and a ref given twice in one write is checked once; a module with no get verb refuses naming that', async () => {
    const sb = fresh(sb0);
    writeModule(sb, 'modules', 'probe', { manifest: '# summary: a probe owner\n', files: { 'scripts/get': shVerb('read one probe', 'printf \'%s\\n\' "$1" >> "$CTX_ROOT/probe-gets"') } });
    writeModule(sb, 'modules', 'quiet', { manifest: '# summary: an owner with no get verb\n', files: { 'scripts/hi': shVerb('say hi', 'echo hi') } });
    await must(unit(sb, 'record', U, '--what=twice', ...refs('probe#a', 'probe#a', 'probe#b', 'probe#a', 'file#.contexture/ctx', 'file#.contexture/ctx')));
    expect(readFileSync(join(sb, 'probe-gets'), 'utf8')).toBe('a\nb\n');
    const before = await unitChecksum(sb, U, ['e3-lane']);
    const q = await unit(sb, 'record', U, '--what=quiet', ...refs('quiet#x'));
    expect([q.code, q.stdout, q.stderr]).toEqual([1, '', "record: error: ref 'quiet#x': owner 'quiet' has no get verb (ERR_ENTITY_NOT_FOUND)\n"]);
    expect(await unitChecksum(sb, U, ['e3-lane'])).toBe(before);
  });

  it('E3-e [the-record-r-xbt3g]: lane create takes --task and --decision as unit# addresses checked to exist, and refuses the retired forms naming the full one', async () => {
    const sb = fresh(sb0);
    await must(createLane(sb, U, 'e3-td', [`--task=unit#${U}/task/e3-task`, `--decision=unit#${U}/entry/${D}-e3-t`]));
    const recipe = (await lane(sb, 'show', U, 'e3-td', 'recipe')).stdout;
    expect(recipe).toContain(`  TASKS: unit#${U}/task/e3-task\n  DECISIONS: unit#${U}/entry/${D}-e3-t\n`);
    const t = await run(sb, ['lane', 'create', U, 'e3-t2', ...laneFlags(['--task=backlog#e3-task'])]);
    expect([t.code, t.stderr]).toEqual([1, `lane create: error: malformed task 'backlog#e3-task': a task is unit#<unit>/task/<slug>; write unit#${U}/task/e3-task (ERR_INVALID_ARGUMENT)\n`]);
    const d = await run(sb, ['lane', 'create', U, 'e3-t3', ...laneFlags([`--decision=unit#${U}/entry/${D}-nope`])]);
    expect([d.code, d.stderr]).toEqual([1, `lane create: error: ref 'unit#${U}/entry/${D}-nope': target not found (ERR_ENTITY_NOT_FOUND)\n`]);
  });

  it('E3-c [the-record-r18]: a legacy free-text REF reads as stored (posix plant)', async () => {
    const sb = fresh(sb0);
    appendArtifact(sb, U, 'journal', '\n@entry 2026-09-20-e3-legacy\n  ANCHOR: A1\n  WHAT: "legacy ref"\n  THREAD: none\n  REF: "a free text legacy reference"\n');
    expect((await unit(sb, 'entry', 'show', U, '2026-09-20-e3-legacy')).stdout).toMatch(/^ {2}REF: "a free text legacy reference"$/m);
  });
});
