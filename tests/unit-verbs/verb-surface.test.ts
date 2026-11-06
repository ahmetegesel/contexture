import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { stage } from '../support/stage';
import { lane, run, unit } from '../support/unit';

export const DECLARED = ['active', 'audit', 'board', 'bootstrap', 'close', 'diagnose', 'entry', 'finding', 'fold', 'index', 'load', 'record', 'refresh', 'refs', 'refs-to', 'reopen', 'resolve', 'search', 'stamp', 'task', 'units'];
const NO_ARG_OK = new Set(['active', 'diagnose', 'index']);
const verbsIn = (help: string): string[] => (help.split(/^verbs:$/m)[1] ?? '').split(/\n\n/)[0]!.split('\n').filter((l) => /^ {2}[a-z]/.test(l));

describe.concurrent('the unit and lane verb surface', () => {
  let sb: string;
  beforeAll(() => {
    sb = stage('posix', 'verb-surface');
  });

  it('V-b: the verb scripts on disk are the declared 21', () => {
    const dir = join(sb, '.contexture/modules/unit/scripts');
    const verbs = readdirSync(dir).filter((f) => !f.startsWith('.') && /^# summary: /m.test(readFileSync(join(dir, f), 'utf8'))).sort();
    expect(verbs).toEqual(DECLARED);
    expect(DECLARED).toHaveLength(21);
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

  it('V-b: ctx unit migrate answers as an unknown verb', async () => {
    const r = await unit(sb, 'migrate', '--from=posix', '--to=fts5');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^ctx: unknown verb: migrate$/m);
  });

  it.for(['append', 'amend', 'query', 'flip', 'drop', 'next'])('V-c: the retired ctx unit %s refuses rc 1 naming its replacement', async (verb) => {
    const r = await unit(sb, verb, 'u1');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(new RegExp(`^ctx unit ${verb} retired: use `, 'm'));
  });

  it('V-c: a module named after a retired verb is refused as a reserved name', async () => {
    const own = stage('posix', 'verb-flip');
    mkdirSync(join(own, '.contexture/modules/flip/scripts'), { recursive: true });
    writeFileSync(join(own, '.contexture/modules/flip/module'), '# summary: a module claiming a retired verb name\n');
    const r = await run(own, ['flip']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('reserved name refused (shadow): flip');
  });

  it('V-c: unit help of a retired verb prints its replacement; the help tables list 21 unit and 4 lane verbs', async () => {
    const r = await unit(sb, 'help', 'query');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^ctx unit query retired: use entry show/m);
    expect(verbsIn((await unit(sb, 'help')).stdout)).toHaveLength(21);
    expect(verbsIn((await lane(sb, 'help')).stdout)).toHaveLength(4);
  });

  it.for([
    ['finding', 'list', /^ {2}list <unit>/m],
    ['finding', 'add', /^ {2}add <unit>/m],
    ['task', 'start', /^ {2}start <unit>/m],
    ['entry', 'show', /^ {2}show <unit>/m],
  ] as const)('E-11b: ctx unit %s %s --help and -h print its usage rc 0, never taken for a unit', async ([verb, sub, usage]) => {
    for (const flag of ['--help', '-h']) {
      const r = await unit(sb, verb, sub, flag);
      expect(r.code).toBe(0);
      expect(r.stdout + r.stderr).toMatch(usage);
      expect(r.stdout + r.stderr).not.toContain('not found');
    }
  });

  it('X-h: record and reopen --help and -h print the usage rc 0', async () => {
    const record = await unit(sb, 'record', '--help');
    expect(record.code).toBe(0);
    expect(record.stdout + record.stderr).toContain('ctx unit record <unit> --what=');
    expect((await unit(sb, 'record', '-h')).code).toBe(0);
    const reopen = await unit(sb, 'reopen', '--help');
    expect(reopen.code).toBe(0);
    expect(reopen.stdout + reopen.stderr).toMatch(/^usage: ctx unit reopen/m);
  });

  it('UP-e: finding update --help and the unit help table show --summary and --ref as optional', async () => {
    const optional = /update <unit> <NAME> \[--summary="\.\.\."\] \[--ref=\.\.\.\]/;
    const verbHelp = await unit(sb, 'finding', 'update', '--help');
    expect(verbHelp.stdout + verbHelp.stderr).toMatch(optional);
    const table = await unit(sb, 'help', 'finding');
    expect(table.stdout + table.stderr).toMatch(optional);
  });
});
