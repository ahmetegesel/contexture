import { appendFileSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { execBytes, lane, must, run, seedUnit, unit, unitChecksum } from '../support/unit';
import { latin1, UTF8_OK } from './inputs';

const D = '2026-09-27';
const BAD = latin1('bad \xff byte');
const NL = 'first line\nsecond line';
const CR = 'carriage\rreturn';
const lanes = ['in-lane'];
const picture = (sb: string) => unitChecksum(sb, 'in-unit', lanes);
const ctxArgs = (...a: (string | Buffer)[]) => ['./.contexture/ctx', ...a];
const flag = (name: string, v: string | Buffer): Buffer => Buffer.concat([Buffer.from(`--${name}=`), Buffer.from(v)]);
const bodyLines = (out: string): number => out.split('\n').filter((l) => l === '    first body line' || l === '    second body line').length;

describe.concurrent('the byte rules on every write path through the verbs', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'in-unit', 'input bytes unit');
      await must(unit(sb, 'task', 'add', 'in-unit', 'in-task', '--objective=a task'));
      await must(unit(sb, 'finding', 'add', 'in-unit', 'IN_ONE', '--summary=One'));
      await must(run(sb, ['lane', 'create', 'in-unit', 'in-lane'], { input: '# recipe grammar\nMISSION\n  GOAL: "in lane"\n' }));
    }, 'posix', 'input-bytes');
  });

  it.for([
    ['record --what', 'what', ['unit', 'record', 'in-unit', flag('what', BAD)]],
    ['record --thread', 'thread', ['unit', 'record', 'in-unit', '--what=ok', flag('thread', BAD)]],
    ['task add --objective', 'objective', ['unit', 'task', 'add', 'in-unit', 'in-u8', flag('objective', BAD)]],
    ['task add --desc', 'desc', ['unit', 'task', 'add', 'in-unit', 'in-u8', '--objective=fine', flag('desc', Buffer.concat([Buffer.from('line one\nline '), latin1('\xff two')]))]],
    ['task update --details', 'details', ['unit', 'task', 'update', 'in-unit', 'in-task', flag('details', BAD)]],
    ['task complete --evidence', 'evidence', ['unit', 'task', 'complete', 'in-unit', 'in-task', flag('evidence', BAD)]],
    ['finding add --summary', 'summary', ['unit', 'finding', 'add', 'in-unit', 'IN_U8', flag('summary', BAD)]],
    ['lane record --what', 'what', ['lane', 'record', 'in-unit', 'in-lane', flag('what', BAD)]],
    ['bootstrap objective', 'objective', ['unit', 'bootstrap', 'in-u8-unit', BAD]],
    ['search query', 'query', ['unit', 'search', 'in-unit', BAD, '--mode=exact']],
    ['lane report --body', 'the report', ['lane', 'report', 'in-unit', 'in-lane', flag('body', BAD)]],
  ] as const)('E3-d [the-record-r9, the-record-r12]: %s refuses bytes that are not UTF-8 naming the field %s, nothing landed', async ([, field, argv]) => {
    const sb = fresh(sb0);
    const before = await picture(sb);
    const r = await execBytes(sb, ctxArgs(...argv));
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toMatch(new RegExp(`error: ${field} is not valid UTF-8 \\(ERR_INVALID_ARGUMENT\\)\\n$`));
    expect(await picture(sb)).toBe(before);
    if (argv[1] === 'bootstrap') expect((await unit(sb, 'load', 'in-u8-unit')).code).toBe(1);
  });

  it.for([
    ['create', 'a recipe not UTF-8', latin1('a recipe \xff\n'), 'the recipe is not valid UTF-8'],
    ['create', 'a recipe holding a NUL', Buffer.from('a recipe\0with a NUL\n'), 'the recipe holds a NUL byte'],
    ['report', 'a report holding a NUL', Buffer.from('a report\0with a NUL\n'), 'the report holds a NUL byte'],
    ['report', 'a report not UTF-8', latin1('a report \xc0\x80\n'), 'the report is not valid UTF-8'],
  ] as const)('E3-d [the-record-r9, the-record-r12]: lane %s refuses %s on stdin naming it, nothing landed', async ([verb, , doc, message]) => {
    const sb = fresh(sb0);
    const r = await run(sb, ['lane', verb, 'in-unit', verb === 'create' ? 'in-u8-lane' : 'in-lane'], { input: doc });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(new RegExp(`error: ${message} \\(ERR_INVALID_ARGUMENT\\)\\n$`));
    expect((await lane(sb, 'show', 'in-unit', 'in-u8-lane', 'recipe')).code).toBe(1);
    expect((await lane(sb, 'show', 'in-unit', 'in-lane', 'report')).stdout.trim()).toBe('');
  });

  it('E3-d [the-record-r12]: valid UTF-8 of every length lands in a WHAT and a recipe and reads back byte for byte', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'record', 'in-unit', `--what=${UTF8_OK}`, `--slug=${D}-e3-u8ok`)).code).toBe(0);
    expect((await unit(sb, 'entry', 'show', 'in-unit', `${D}-e3-u8ok`)).stdout).toContain(`WHAT: "${UTF8_OK}"`);
    const recipe = `# recipe ${UTF8_OK}\n`;
    await must(run(sb, ['lane', 'create', 'in-unit', 'in-u8-lane'], { input: recipe }));
    expect((await lane(sb, 'show', 'in-unit', 'in-u8-lane', 'recipe')).stdout).toBe(recipe);
  });

  it('E3-e [the-record-r12]: a legacy entry holding a byte that is not UTF-8 reads as stored (posix plant)', async () => {
    const sb = fresh(sb0);
    appendFileSync(artifactPath(sb, 'in-unit', 'journal'), latin1('\n@entry 2026-09-20-e3-bytes\n  ANCHOR: A1\n  WHAT: "legacy \xff bytes"\n  THREAD: none\n'));
    const shown = await unit(sb, 'entry', 'show', 'in-unit', '2026-09-20-e3-bytes');
    expect(shown.code).toBe(0);
    expect(shown.bytes.includes(latin1('legacy \xff bytes'))).toBe(true);
    expect((await unit(sb, 'board', 'in-unit')).code).toBe(0);
  });

  it('Y-a R1 [the-record-r12]: a two-line block lands as indented body lines; literal backslash sequences stay verbatim', async () => {
    const sb = fresh(sb0);
    const added = await unit(sb, 'task', 'add', 'in-unit', 'y-multi', '--objective=Multi-line task', '--desc=first body line\nsecond body line');
    expect(added.code).toBe(0);
    expect(added.stdout + added.stderr).not.toContain('newline in string');
    expect(bodyLines((await unit(sb, 'task', 'show', 'in-unit', 'y-multi')).stdout)).toBe(2);
    await must(unit(sb, 'task', 'add', 'in-unit', 'y-bs', '--objective=path C:\\new\\table', '--desc=literal \\n and \\t stay'));
    const bs = (await unit(sb, 'task', 'show', 'in-unit', 'y-bs')).stdout.split('\n');
    expect(bs).toContain('  OBJECTIVE: "path C:\\new\\table"');
    expect(bs).toContain('    literal \\n and \\t stay');
    expect((await unit(sb, 'task', 'show', 'in-unit', 'y-bs', '--json')).stdout).toContain('"objective":"path C:\\\\new\\\\table"');
    expect((await unit(sb, 'search', 'in-unit', 'C:\\new', '--mode=exact', '--json')).stdout).not.toContain('"total_matches":0');
  });

  it('Y-a R1 [the-record-r12]: task update and finding add and update with a two-line block keep every item', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'task', 'update', 'in-unit', 'in-task', '--desc=first body line\nsecond body line')).code).toBe(0);
    expect((await unit(sb, 'task', 'list', 'in-unit', '--status=all')).stdout.split('\n').filter((l) => l.startsWith('  ['))).toHaveLength(1);
    expect(bodyLines((await unit(sb, 'task', 'show', 'in-unit', 'in-task')).stdout)).toBe(2);
    expect((await unit(sb, 'finding', 'add', 'in-unit', 'Y_MULTI', `--summary=${NL}`)).code).toBe(0);
    expect((await unit(sb, 'finding', 'show', 'in-unit', 'Y_MULTI')).code).toBe(0);
    await must(unit(sb, 'finding', 'add', 'in-unit', 'Y_BS', '--summary=literal \\n here'));
    expect((await unit(sb, 'finding', 'show', 'in-unit', 'Y_BS')).stdout.split('\n')).toContain('    literal \\n here');
    expect((await unit(sb, 'finding', 'update', 'in-unit', 'Y_BS', `--summary=${NL}`)).code).toBe(0);
    expect((await unit(sb, 'finding', 'list', 'in-unit')).stdout.split('\n').filter((l) => /^ {2}(Y_|IN_)/.test(l))).toHaveLength(3);
  });

  it.for([
    ['task add --desc', ['unit', 'task', 'add', 'in-unit', 'y-cr', '--objective=CR task', `--desc=${CR}`]],
    ['finding add --summary', ['unit', 'finding', 'add', 'in-unit', 'Y_CR', `--summary=${CR}`]],
    ['record --what', ['unit', 'record', 'in-unit', `--what=${CR}`]],
    ['lane record --what', ['lane', 'record', 'in-unit', 'in-lane', `--what=${CR}`]],
  ] as const)('Y-c R2 [the-record-r9, the-record-r12]: %s with a carriage return refuses rc 1 and changes nothing', async ([, argv]) => {
    const sb = fresh(sb0);
    const before = await picture(sb);
    expect((await run(sb, argv)).code).toBe(1);
    expect(await picture(sb)).toBe(before);
    expect((await unit(sb, 'task', 'start', 'in-unit', 'in-task')).code).toBe(0);
  });

  it.for([
    ['record --what', ['unit', 'record', 'in-unit', `--what=${NL}`]],
    ['record --thread', ['unit', 'record', 'in-unit', '--what=one line', `--thread=${NL}`]],
    ['record --group', ['unit', 'record', 'in-unit', '--what=one line', `--group=${NL}`]],
    ['record --ref', ['unit', 'record', 'in-unit', '--what=one line', `--ref=${NL}`]],
    ['task add --objective', ['unit', 'task', 'add', 'in-unit', 'q-b', `--objective=${NL}`]],
    ['task add --refs', ['unit', 'task', 'add', 'in-unit', 'q-c', '--objective=Task C', `--refs=${NL}`]],
    ['task update --objective', ['unit', 'task', 'update', 'in-unit', 'in-task', `--objective=${NL}`]],
    ['task complete --evidence', ['unit', 'task', 'complete', 'in-unit', 'in-task', `--evidence=${NL}`]],
    ['task drop --reason', ['unit', 'task', 'drop', 'in-unit', 'in-task', `--reason=${NL}`]],
    ['finding add --ref', ['unit', 'finding', 'add', 'in-unit', 'Q_TWO', '--summary=Two', `--ref=${NL}`]],
    ['finding update --ref', ['unit', 'finding', 'update', 'in-unit', 'IN_ONE', `--ref=${NL}`]],
    ['finding supersede --ref', ['unit', 'finding', 'supersede', 'in-unit', 'IN_ONE', 'Q_THREE', '--summary=Three', `--ref=${NL}`]],
    ['lane record --what', ['lane', 'record', 'in-unit', 'in-lane', `--what=${NL}`]],
    ['lane record --thread', ['lane', 'record', 'in-unit', 'in-lane', '--what=one line', `--thread=${NL}`]],
  ] as const)('Q-a R3 [the-record-r9, the-record-r12]: %s with an embedded newline refuses naming it and changes nothing', async ([, argv]) => {
    const sb = fresh(sb0);
    const before = await picture(sb);
    const r = await run(sb, argv);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('newline');
    expect(await picture(sb)).toBe(before);
  });

  it('Q-a R3 [the-record-r12]: a block scalar keeps its newline', async () => {
    expect((await unit(fresh(sb0), 'task', 'add', 'in-unit', 'q-d', '--objective=Task D', `--desc=${NL}`)).code).toBe(0);
  });

  it('B [the-record-r12]: backslash payloads travel through task add, show, and the --json views byte for byte', async () => {
    const sb = fresh(sb0);
    const obj = 'B a\\b c\\\\d \\n e\\';
    const json = 'B a\\\\b c\\\\\\\\d \\\\n e\\\\';
    const l1 = 'body a\\b c\\\\d';
    const l2 = 'body \\n lit \\t lit end\\';
    expect((await unit(sb, 'task', 'add', 'in-unit', 'b-task', `--objective=${obj}`, `--desc=${l1}\n${l2}`)).code).toBe(0);
    const text = (await unit(sb, 'task', 'show', 'in-unit', 'b-task')).stdout.split('\n');
    expect(text).toContain(`  OBJECTIVE: "${obj}"`);
    expect(text.filter((l) => l === `    ${l1}` || l === `    ${l2}`)).toHaveLength(2);
    expect(readFileSync(artifactPath(sb, 'in-unit', 'backlog'), 'utf8').split('\n').filter((l) => l === `    ${l1}` || l === `    ${l2}`)).toHaveLength(2);
    expect((await unit(sb, 'task', 'show', 'in-unit', 'b-task', '--json')).stdout).toContain(`"objective":"${json}"`);
    expect((await unit(sb, 'task', 'list', 'in-unit', '--json')).stdout).toContain(`"objective":"${json}"`);
  });

  it('B [the-record-r12]: backslash payloads travel through finding add, record, board, entry show, and search', async () => {
    const sb = fresh(sb0);
    const sum = 'S a\\b c\\\\d \\n e\\';
    expect((await unit(sb, 'finding', 'add', 'in-unit', 'B_BS', `--summary=${sum}`)).code).toBe(0);
    expect(readFileSync(artifactPath(sb, 'in-unit', 'knowledge'), 'utf8').split('\n')).toContain(`    ${sum}`);
    expect((await unit(sb, 'finding', 'show', 'in-unit', 'B_BS')).stdout.split('\n')).toContain(`    ${sum}`);
    expect((await unit(sb, 'finding', 'list', 'in-unit', '--json')).stdout).toContain('S a\\\\b c\\\\\\\\d \\\\n e\\\\');
    const what = 'W a\\b c\\\\d \\n e\\';
    expect((await unit(sb, 'record', 'in-unit', `--what=${what}`, `--slug=${D}-b-bs`)).code).toBe(0);
    expect((await unit(sb, 'entry', 'show', 'in-unit', `${D}-b-bs`)).stdout.split('\n')).toContain(`  WHAT: "${what}"`);
    expect((await unit(sb, 'board', 'in-unit')).stdout.split('\n')).toContain(`  WHAT: "${what}"`);
    expect((await unit(sb, 'entry', 'show', 'in-unit', `${D}-b-bs`, '--json')).stdout).toContain('W a\\\\b c\\\\\\\\d \\\\n e\\\\');
    expect((await unit(sb, 'search', 'in-unit', 'c\\\\d', '--mode=exact', '--json')).stdout).not.toContain('"total_matches":0');
  });

  it('B [the-record-r12, the-record-r16]: backslash payloads travel through lane record and a lane report, the write echo one line with its size', async () => {
    const sb = fresh(sb0);
    const lw = 'L a\\b c\\\\d \\n e\\';
    expect((await lane(sb, 'record', 'in-unit', 'in-lane', `--what=${lw}`)).code).toBe(0);
    expect((await lane(sb, 'show', 'in-unit', 'in-lane', 'journal')).stdout).toContain(lw);
    const report = 'r1 a\\b\nr2 c\\\\d\nr3 \\n lit\n\\\nr5 trailing\\\n';
    const echo = await run(sb, ['lane', 'report', 'in-unit', 'in-lane'], { input: report });
    expect([echo.code, echo.stdout + echo.stderr]).toEqual([0, `lane report written: in-lane in in-unit (${Buffer.byteLength(report)} bytes)\n`]);
    expect((await lane(sb, 'show', 'in-unit', 'in-lane', 'report')).stdout).toBe(report);
    expect(readFileSync(artifactPath(sb, 'in-unit', 'lane/in-lane/report'), 'utf8')).toBe(report);
  });
});
