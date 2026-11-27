import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { stage } from '../support/stage';
import { lane, run, unit } from '../support/unit';

export const DECLARED = ['audit', 'board', 'bootstrap', 'close', 'diagnose', 'entry', 'finding', 'fold', 'get', 'list', 'load', 'migrate', 'objective', 'record', 'refresh', 'refs', 'refs-to', 'reopen', 'search', 'stamp', 'task', 'transfer'];
const NO_ARG_OK = new Set(['diagnose', 'list']);
const verbsIn = (help: string): string[] => (help.split(/^verbs:$/m)[1] ?? '').split(/\n\n/)[0]!.split('\n').filter((l) => /^ {2}[a-z]/.test(l));

describe.concurrent('the unit and lane verb surface', () => {
  let sb: string;
  beforeAll(() => {
    sb = stage('posix', 'verb-surface');
  });

  it('V-b [modules-r2]: the verb scripts on disk are the declared 22', () => {
    const dir = join(sb, '.contexture/modules/unit/scripts');
    const verbs = readdirSync(dir).filter((f) => !f.startsWith('.') && /^# summary: /m.test(readFileSync(join(dir, f), 'utf8'))).sort();
    expect(verbs).toEqual(DECLARED);
    expect(DECLARED).toHaveLength(22);
  });

  it('V-b [the-engine-r5]: the retired index verb of the unit module refuses rc 1 as an unknown verb, the module help on stderr', async () => {
    const r = await unit(sb, 'index');
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toMatch(/^ctx: unknown verb: index$/m);
    expect(r.stderr).toMatch(/^ctx unit: the unit module: /m);
    expect(verbsIn((await unit(sb, 'help')).stdout).map((l) => l.trim().split(/ +/)[0])).not.toContain('index');
  });

  it('V-b: ctx session refuses rc 1 naming ctx unit; unit help answers rc 0', async () => {
    const r = await run(sb, ['session']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^ctx session retired: use ctx unit$/m);
    expect((await unit(sb, 'help')).code).toBe(0);
  });

  it.for(DECLARED)('V-b: ctx unit %s with no argument answers its rc', async (verb) => {
    expect((await unit(sb, verb)).code).toBe(NO_ARG_OK.has(verb) ? 0 : 1);
  });

  it('V-b [the-engine-r17]: ctx unit migrate moves no record between backends: the backend flags are no unit and refuse rc 1', async () => {
    const r = await unit(sb, 'migrate', '--from=posix', '--to=sqlite');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', "migrate: error: unknown option '--from=posix' (ERR_INVALID_ARGUMENT)\n"]);
  });

  it.for(['append', 'amend', 'query', 'flip', 'drop', 'next', 'resolve'])('V-c [the-engine-r2]: the retired ctx unit %s refuses rc 1 naming its replacement', async (verb) => {
    const r = await unit(sb, verb, 'u1');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(new RegExp(`^ctx unit ${verb} retired: use `, 'm'));
  });

  it('V-c [the-engine-r2, modules-r6]: a module named after a retired verb is refused as a reserved name', async () => {
    const own = stage('posix', 'verb-flip');
    mkdirSync(join(own, '.contexture/modules/flip/scripts'), { recursive: true });
    writeFileSync(join(own, '.contexture/modules/flip/module'), '# summary: a module claiming a retired verb name\n');
    const r = await run(own, ['flip']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('reserved name refused (shadow): flip');
  });

  it('V-c [the-engine-r2, the-engine-r4]: unit help of a retired verb prints its replacement; the help tables list 22 unit and 4 lane verbs', async () => {
    const r = await unit(sb, 'help', 'query');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^ctx unit query retired: use entry show/m);
    expect(verbsIn((await unit(sb, 'help')).stdout)).toHaveLength(22);
    expect(verbsIn((await lane(sb, 'help')).stdout)).toHaveLength(4);
  });

  it.for([
    ['finding', 'list'],
    ['finding', 'add'],
    ['task', 'start'],
    ['entry', 'show'],
  ] as const)('E-11b [the-engine-r4, the-engine-r7]: ctx unit %s %s --help and -h print its section table, the bytes ctx unit help <verb> <sub> prints, rc 0, never taken for a unit', async ([verb, sub]) => {
    const section = await unit(sb, 'help', verb, sub);
    expect([section.code, section.stderr]).toEqual([0, '']);
    expect(section.stdout).toMatch(new RegExp(`^ctx unit ${verb} ${sub}: \\S`));
    expect(section.stdout).toMatch(new RegExp(`^ {2}ctx unit ${verb} ${sub} <unit>`, 'm'));
    for (const flag of ['--help', '-h']) {
      expect(await unit(sb, verb, sub, flag).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, section.stdout, '']);
      expect((await unit(sb, '-h', verb, sub)).stdout).toBe(section.stdout);
    }
  });

  it.for(['entry', 'finding', 'task'])('E-11b [the-engine-r5]: the engine refuses an unknown subcommand of ctx unit %s before the verb runs: one stderr line and the verb table, rc 1; help is no subcommand', async (verb) => {
    const table = (await unit(sb, 'help', verb)).stdout;
    for (const args of [['bogus', '-h'], ['bogus'], ['help'], ['help', 'u1'], ['u1']]) {
      const r = await unit(sb, verb, ...args);
      expect([r.code, r.stdout], args.join(' ')).toEqual([1, '']);
      expect(r.stderr, args.join(' ')).toBe(`ctx: unit ${verb}: unknown subcommand: ${args[0]}\n${table}`);
    }
    const help = await unit(sb, 'help', verb, 'bogus');
    expect([help.code, help.stdout, help.stderr]).toEqual([1, '', `ctx: unit ${verb}: unknown subcommand: bogus\n${table}`]);
    const more = await unit(sb, verb, 'show', '-h', 'x');
    expect([more.code, more.stdout, more.stderr]).toEqual([1, '', `ctx: unit ${verb} show: -h takes no further argument; help is ctx unit ${verb} show -h alone\n`]);
    const dash = await unit(sb, verb, '--bogus');
    expect([dash.code, dash.stdout]).toEqual([1, '']);
    expect(dash.stderr).toMatch(new RegExp(`^${verb}: error: unknown subcommand '--bogus' \\(`));
  });

  it('X-h [the-engine-r7]: record and reopen --help and -h print the table ctx unit help <verb> prints on stdout rc 0', async () => {
    for (const verb of ['record', 'reopen']) {
      const table = await unit(sb, 'help', verb);
      expect(table.code).toBe(0);
      for (const flag of ['--help', '-h']) expect(await unit(sb, verb, flag).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, table.stdout, '']);
    }
    expect((await unit(sb, 'help', 'record')).stdout).toContain('ctx unit record <unit> --what=');
    expect((await unit(sb, 'help', 'reopen')).stdout).toMatch(/^ {2}ctx unit reopen <slug>$/m);
  });

  it('X-h [the-engine-r7]: a unit and a lane named help work with every unit and lane verb that takes one, the word never read as a help request', async () => {
    const w = stage('posix', 'verb-surface-help-unit');
    const ok = async (r: Promise<{ code: number; stdout: string; stderr: string }>, what: string, stderr = ''): Promise<string> => {
      const done = await r;
      expect([done.code, done.stderr], what).toEqual([0, stderr]);
      return done.stdout;
    };
    await ok(unit(w, 'bootstrap', 'help', 'a unit named help'), 'bootstrap');
    const slug = /^recorded entry: (\S+)$/m.exec(await ok(unit(w, 'record', 'help', '--what=an event of the unit named help', '--slug=help-ev'), 'record'))?.[1] ?? '';
    expect(slug).toMatch(/-help-ev$/);
    expect(await ok(unit(w, 'board', 'help'), 'board')).toContain('an event of the unit named help');
    expect(await ok(unit(w, 'load', 'help'), 'load')).toContain('unit-load help:');
    await ok(unit(w, 'audit', 'help'), 'audit');
    await ok(unit(w, 'refresh', 'help'), 'refresh');
    await ok(unit(w, 'stamp', 'help'), 'stamp');
    await ok(unit(w, 'task', 'add', 'help', 'h-task', '--objective=a task of the unit named help'), 'task add');
    expect(await ok(unit(w, 'entry', 'list', 'help'), 'entry list')).toContain(slug);
    await ok(unit(w, 'finding', 'add', 'help', 'HELP_FINDING', '--summary=a finding', `--ref=unit#help/entry/${slug}`), 'finding add');
    expect(await ok(unit(w, 'get', 'help/task/h-task'), 'get')).toContain('@task h-task');
    expect(await ok(unit(w, 'search', 'named help', '--unit=help'), 'search')).toContain('named help');
    await ok(unit(w, 'objective', 'help', 'the reworded objective'), 'objective');
    expect(await ok(unit(w, 'refs', 'help'), 'refs')).toContain('ref_sessions');
    expect(await ok(unit(w, 'refs-to', 'help'), 'refs-to')).toContain(`unit#help/entry/${slug}`);
    await ok(unit(w, 'bootstrap', 'help-split', 'the split of the unit named help'), 'bootstrap the split');
    expect(await ok(unit(w, 'transfer', 'help', 'help-split', '--finding=HELP_FINDING'), 'transfer')).toContain('transferred: 0 tasks, 1 findings, 0 entries from help to help-split');
    expect(await ok(run(w, ['lane', 'create', 'help', 'help', '--goal=g', '--branch=b', '--writes=w', '--scope=s', '--report=R :: r']), 'lane create')).toContain('lane help of unit help');
    expect(await ok(run(w, ['lane', 'create', 'help', 'help', '--goal=g2', '--branch=b', '--writes=w', '--scope=s', '--report=R :: r', '--replace']), 'lane create --replace')).toContain('lane replaced: help in help');
    await ok(lane(w, 'record', 'help', 'help', '--what=a lane event'), 'lane record');
    await ok(run(w, ['lane', 'report', 'help', 'help', '--body=@report help']), 'lane report');
    expect(await ok(lane(w, 'show', 'help', 'help', 'journal'), 'lane show')).toContain('a lane event');
    const fold = await unit(w, 'fold', 'help', '--lane=x');
    expect([fold.code, fold.stdout]).toEqual([1, '']);
    expect(fold.stderr).toContain("no active fold for unit 'help'");
    await ok(unit(w, 'close', 'help'), 'close', 'WARNING: open tasks: h-task\n');
    await ok(unit(w, 'reopen', 'help'), 'reopen');
  });

  it('X-h [the-engine-r7]: refresh --help and -h print its help table on stdout rc 0, the table ctx unit help refresh prints, never taken for a slug', async () => {
    const table = await unit(sb, 'help', 'refresh');
    expect(table.stdout).toMatch(/^ctx unit refresh: /);
    for (const flag of ['--help', '-h']) expect(await unit(sb, 'refresh', flag).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, table.stdout, '']);
  });

  it('UP-e [the-engine-r4, the-engine-r7]: finding update --help and its section table show --summary and --ref as optional; the verb table lists update by its text', async () => {
    const optional = /update <unit> <NAME> \[--summary="\.\.\."\] \[--ref=\.\.\.\]/;
    const verbHelp = await unit(sb, 'finding', 'update', '--help');
    expect(verbHelp.stdout).toMatch(optional);
    expect((await unit(sb, 'help', 'finding', 'update')).stdout).toBe(verbHelp.stdout);
    const table = await unit(sb, 'help', 'finding');
    expect(table.stdout).toMatch(/^ {2}update +rewrite a finding's summary or refs$/m);
  });
});
