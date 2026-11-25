import { appendFileSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { createLane, lane, must, seedUnit, unit, unitChecksum } from '../support/unit';

const anchor = async (sb: string, u: string): Promise<string | undefined> => (await unit(sb, 'load', u)).stdout.split('\n').find((l) => l.startsWith('current_anchor: '));

describe.concurrent('the unit lifecycle verbs: bootstrap, stamp, close, reopen, refs', () => {
  it('R-a [the-record-r11]: bootstrap refuses no argument, an existing slug, and a malformed slug rc 1', async () => {
    const sb = stage('posix', 'life-boot');
    expect((await unit(sb, 'bootstrap')).code).toBe(1);
    expect((await unit(sb, 'bootstrap', 'u1', 'refusal unit')).code).toBe(0);
    expect((await unit(sb, 'bootstrap', 'u1', 'again')).code).toBe(1);
    expect((await unit(sb, 'bootstrap', 'bad slug', 'x')).code).toBe(1);
  });

  it('R-h: refs refuses the unit itself and a missing unit rc 1', async () => {
    const sb = stage('posix', 'life-refs');
    await seedUnit(sb, 'u1');
    expect((await unit(sb, 'refs', 'u1', 'u1')).code).toBe(1);
    expect((await unit(sb, 'refs', 'u1', 'nosuch')).code).toBe(1);
  });

  it('S1-a [the-record-r1]: stamp and task start keep a state and a task holding sed metacharacters whole, with no next_action', async () => {
    const sb = stage('posix', 'life-sed');
    await seedUnit(sb, 'rw-unit', 'rewrite / & unit');
    expect((await unit(sb, 'stamp', 'rw-unit')).code).toBe(0);
    let page = (await unit(sb, 'load', 'rw-unit', '1')).stdout;
    expect(page).toMatch(/^objective: "rewrite \/ & unit"/m);
    expect(page).toMatch(/^status: ACTIVE/m);
    await must(unit(sb, 'task', 'add', 'rw-unit', 'rw-task', '--objective=rewrite / & task'));
    expect((await unit(sb, 'task', 'start', 'rw-unit', 'rw-task')).code).toBe(0);
    page = (await unit(sb, 'load', 'rw-unit', '1')).stdout;
    expect(page).toMatch(/^objective: "rewrite \/ & unit"/m);
    expect(page).not.toContain('next_action:');
    expect((await unit(sb, 'task', 'show', 'rw-unit', 'rw-task')).stdout).toContain('OBJECTIVE: "rewrite / & task"');
  });

  it('[the-record-r21] close warns on an open task on stderr and still closes rc 0, printing CLOSED', async () => {
    const sb = stage('posix', 'life-close-warn');
    await seedUnit(sb, 'cw-unit');
    await must(unit(sb, 'task', 'add', 'cw-unit', 'cw-open', '--objective=Left open at close'));
    const r = await unit(sb, 'close', 'cw-unit');
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/^WARNING: open tasks: cw-open$/m);
    expect(r.stdout).toMatch(/^CLOSED: cw-unit$/m);
    expect((await unit(sb, 'load', 'cw-unit', '1')).stdout).toMatch(/^status: CLOSED/m);
  });

  it('S1-b [the-record-r21]: reopen refuses an ACTIVE or missing unit; close then reopen flips the status back and lists the unit again', async () => {
    const sb = stage('posix', 'life-reopen');
    await seedUnit(sb, 'rw-unit');
    expect((await unit(sb, 'reopen', 'rw-unit')).code).toBe(1);
    expect((await unit(sb, 'reopen', 'nosuch')).code).toBe(1);
    expect((await unit(sb, 'close', 'rw-unit')).code).toBe(0);
    expect((await unit(sb, 'list')).stdout).not.toMatch(/^rw-unit$/m);
    const r = await unit(sb, 'reopen', 'rw-unit');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('REOPENED: rw-unit');
    expect((await unit(sb, 'load', 'rw-unit', '1')).stdout).toMatch(/^status: ACTIVE/m);
    expect((await unit(sb, 'list')).stdout).toMatch(/^rw-unit$/m);
  });

  it('E3-f [the-record-r3]: stamp takes the unit alone; a receipt text refuses and leaves the anchor; the anchor carries its number and date only', async () => {
    const sb = stage('posix', 'life-stamp');
    await seedUnit(sb, 'e3-unit', 'input checks unit');
    const before = await anchor(sb, 'e3-unit');
    const refusal = await unit(sb, 'stamp', 'e3-unit', 'a receipt text');
    expect(refusal.code).toBe(1);
    expect(refusal.stderr).toContain('ctx unit stamp <unit>');
    expect(refusal.stderr).toMatch(/\(ERR_INVALID_ARGUMENT\)$/m);
    expect(await anchor(sb, 'e3-unit')).toBe(before);
    const stamped = await unit(sb, 'stamp', 'e3-unit');
    expect(stamped.code).toBe(0);
    expect(stamped.stdout + stamped.stderr).toBe('transition: A1 -> A2\n');
    expect((await unit(sb, 'search', '@anchor A2', '--unit=e3-unit', '--json')).stdout).toMatch(/"snippet":"@anchor A2 \d{4}-\d{2}-\d{2}"/);
    expect((await unit(sb, 'search', 'attention', '--unit=e3-unit', '--type=session')).stdout).not.toContain('@anchor A2');
    const journal = artifactPath(sb, 'e3-unit', 'journal');
    expect(readFileSync(journal, 'utf8').split('\n').filter((l) => /^@anchor A2 \d{4}-\d{2}-\d{2}$/.test(l))).toHaveLength(1);
    appendFileSync(journal, '@anchor A3 ("continues A2", attention: a legacy receipt kept)\n');
    expect((await unit(sb, 'search', 'a legacy receipt kept', '--unit=e3-unit', '--json')).stdout).toContain('"snippet":"@anchor A3 (\\"continues A2\\", attention: a legacy receipt kept)"');
  });

  it('X-o [the-record-r11]: a CLOSED unit refuses typed writes through the verbs and nothing lands', async () => {
    const sb = stage('posix', 'life-closed');
    await seedUnit(sb, 'x-closed', 'closed unit');
    await must(createLane(sb, 'x-closed', 'x-cl'));
    await must(unit(sb, 'close', 'x-closed'));
    expect((await unit(sb, 'task', 'add', 'x-closed', 'x-late', '--objective=Added while closed')).code).toBe(1);
    expect((await unit(sb, 'task', 'show', 'x-closed', 'x-late')).code).toBe(1);
    expect((await unit(sb, 'finding', 'add', 'x-closed', 'X_LATE', '--summary=Added while closed')).code).toBe(1);
    expect((await lane(sb, 'record', 'x-closed', 'x-cl', '--what=Lane event while closed', '--slug=2026-09-27-x-late')).code).toBe(1);
    const shown = await lane(sb, 'show', 'x-closed', 'x-cl', 'journal');
    expect(shown.stdout + shown.stderr).not.toContain('while closed');
  });
});

const USAGE = 'Usage: ctx unit objective <unit> "<objective>"\nhelp: ctx unit help\n';
const OBJECTIVE_LINES = [
  ['an empty objective', '', 'ERROR: empty objective\n'],
  ['an embedded newline', 'first\nsecond', 'ERROR: embedded newline in objective\n'],
  ['an embedded carriage return', 'carriage\rreturn', 'ERROR: embedded carriage return in objective (the dialect is LF)\n'],
  ['a whitespace-only objective', ' \t ', 'ERROR: whitespace-only objective\n'],
] as const;

describe.concurrent('the objective verb', () => {
  let sb0: string;
  const picture = async (sb: string): Promise<string> => (await unitChecksum(sb, 'ob-unit')) + (await unitChecksum(sb, 'ob-closed'));
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'ob-unit', 'the first wording');
      await seedUnit(sb, 'ob-closed', 'the closed wording');
      await must(unit(sb, 'close', 'ob-closed'));
    }, 'posix', 'objective');
  });

  it('OB-a [the-record-r1, the-record-r-objv1]: objective rewords an ACTIVE unit, prints the new wording, and lands its receipt of the old and new wording with no thread', async () => {
    const sb = fresh(sb0);
    const r = await unit(sb, 'objective', 'ob-unit', 'the second wording');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'objective: "the second wording"\n', '']);
    expect((await unit(sb, 'load', 'ob-unit', '1')).stdout.split('\n')).toContain('objective: "the second wording"');
    const board = (await unit(sb, 'board', 'ob-unit')).stdout;
    expect(board).toMatch(/^@entry \d{4}-\d{2}-\d{2}-objective\n {2}ANCHOR: A1\n {2}WHAT: "objective reworded from "the first wording" to "the second wording""\n {2}THREAD: none$/m);
    expect((await unit(sb, 'audit', 'ob-unit')).code).toBe(0);
  });

  it.for([
    ...OBJECTIVE_LINES.map(([why, text, line]) => [why, ['ob-unit', text], line] as const),
    ['a malformed slug', ['bad slug', 'a wording'], USAGE],
    ['one argument', ['ob-unit'], USAGE],
    ['three arguments', ['ob-unit', 'a wording', 'extra'], USAGE],
    ['a missing unit', ['nosuch', 'a wording'], 'ERROR: missing state: unit nosuch\n'],
    ['an unchanged objective', ['ob-unit', 'the first wording'], 'session.objective: error: the objective is unchanged (ERR_INVALID_ARGUMENT)\n'],
    ['a CLOSED unit', ['ob-closed', 'a wording'], "session.objective: error: unit 'ob-closed' is CLOSED; a closed unit takes no writes (ERR_UNIT_CLOSED)\n"],
  ] as const)('OB-b [the-record-r-objv1]: objective refuses %s rc 1 by its exact line, nothing written', async ([, args, line]) => {
    const sb = fresh(sb0);
    const before = await picture(sb);
    const r = await unit(sb, 'objective', ...args);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', line]);
    expect(await picture(sb)).toBe(before);
  });

  it.for(OBJECTIVE_LINES)('OB-c [the-record-r12, the-record-r-objv1]: bootstrap and objective refuse %s by the same line through the shared check, no unit created', async ([, text, line]) => {
    const sb = fresh(sb0);
    const boot = await unit(sb, 'bootstrap', 'ob-new', text);
    expect([boot.code, boot.stdout, boot.stderr]).toEqual([1, '', line]);
    expect((await unit(sb, 'objective', 'ob-unit', text)).stderr).toBe(line);
    expect((await unit(sb, 'load', 'ob-new')).code).toBe(1);
  });

  it('OB-d [the-engine-r7]: objective --help, -h, and help print the one usage line rc 0; unit help objective prints its usage, the function, the exit codes, and an example', async () => {
    const sb = fresh(sb0);
    for (const flag of ['--help', '-h', 'help']) expect(await unit(sb, 'objective', flag).then((r) => [r.code, r.stdout, r.stderr])).toEqual([0, 'usage: ctx unit objective <unit> "<objective>"\n', '']);
    const table = await unit(sb, 'help', 'objective');
    expect(table.code).toBe(0);
    expect(table.stdout).toMatch(/^ctx unit objective: /);
    expect(table.stdout).toMatch(/^ {2}ctx unit objective <slug> "<objective>"$/m);
    expect(table.stdout).toContain('(session.objective)');
    expect(table.stdout).toMatch(/^ {2}exit codes: 0 /m);
    expect(table.stdout).toMatch(/^ {2}example: ctx unit objective /m);
  });
});
