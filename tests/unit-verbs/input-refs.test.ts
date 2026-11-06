import { beforeAll, describe, expect, it } from 'vitest';
import { appendArtifact } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { lane, must, run, seedUnit, unit, unitChecksum } from '../support/unit';
import { SHAPES } from './inputs';

const D = '2026-09-27';
const SEVEN = ['/abs/file', '../x', './README.md', 'lanes/l/recipe', 'journal#x', 'README.md#top', '###'];
const refs = (...r: string[]): string[] => r.map((v) => `--ref=${v}`);

const PATHS: readonly [string, (bad: string) => string[]][] = [
  ['record --ref', (v) => ['unit', 'record', 'e3-unit', '--what=ref probe', `--ref=${v}`]],
  ['finding add --ref', (v) => ['unit', 'finding', 'add', 'e3-unit', 'E3_TWO', '--summary=two', `--ref=${v}`]],
  ['finding update --ref', (v) => ['unit', 'finding', 'update', 'e3-unit', 'E3_ONE', `--ref=${v}`]],
  ['finding supersede --ref', (v) => ['unit', 'finding', 'supersede', 'e3-unit', 'E3_ONE', 'E3_THREE', '--summary=three', `--ref=${v}`]],
  ['lane record --ref', (v) => ['lane', 'record', 'e3-unit', 'e3-lane', '--what=lane probe', `--ref=${v}`]],
  ['task add --refs', (v) => ['unit', 'task', 'add', 'e3-unit', 'e3-bad', '--objective=bad refs', `--refs=journal#x ${v}`]],
  ['task update --refs', (v) => ['unit', 'task', 'update', 'e3-unit', 'e3-task', `--refs=${v}`]],
];

describe.concurrent('the REF shapes on every write path through the verbs', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'e3-unit', 'end review checks');
      await must(unit(sb, 'record', 'e3-unit', '--what=the target', `--slug=${D}-e3-t`));
      await must(unit(sb, 'finding', 'add', 'e3-unit', 'E3_ONE', '--summary=one'));
      await must(unit(sb, 'task', 'add', 'e3-unit', 'e3-task', '--objective=a task'));
      await must(run(sb, ['lane', 'create', 'e3-unit', 'e3-lane'], { input: 'the e3 recipe\n' }));
    }, 'posix', 'input-refs');
  });

  it.for(PATHS)('E3-a [the-record-r9, the-record-r18]: %s refuses a malformed ref naming both shapes, and nothing lands', async ([, argv]) => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, 'e3-unit', ['e3-lane']);
    const r = await run(sb, argv('bareword'));
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toContain(`malformed ref 'bareword': ${SHAPES}`);
    expect(await unitChecksum(sb, 'e3-unit', ['e3-lane'])).toBe(before);
  });

  it('E3-b [the-record-r18]: a control byte in a ref refuses through the verb too, nothing landed', async () => {
    const sb = fresh(sb0);
    const before = await unitChecksum(sb, 'e3-unit', ['e3-lane']);
    const r = await unit(sb, 'record', 'e3-unit', '--what=e7 probe', '--ref=journal#x\fy');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(SHAPES);
    expect(await unitChecksum(sb, 'e3-unit', ['e3-lane'])).toBe(before);
  });

  it('E3-b [the-record-r14, the-record-r18]: record lands the seven shapes and a root-level file, each its own REF line', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'record', 'e3-unit', '--what=e7 refs ok', `--slug=${D}-e7-refs`, ...refs(...SEVEN))).code).toBe(0);
    expect((await unit(sb, 'entry', 'show', 'e3-unit', `${D}-e7-refs`)).stdout.split('\n').filter((l) => l.startsWith('  REF: '))).toHaveLength(7);
    expect((await unit(sb, 'record', 'e3-unit', '--what=refs ok', `--slug=${D}-e3-refs`, ...refs(`journal#${D}-e3-t`, 'lanes/e3-lane/recipe', 'src/a.sh#fn'))).code).toBe(0);
    expect((await unit(sb, 'entry', 'show', 'e3-unit', `${D}-e3-refs`)).stdout.split('\n').filter((l) => l.startsWith('  REF: '))).toHaveLength(3);
  });

  it('E3-b [the-record-r14, the-record-r18]: task add and task update land the shapes as the REFS list', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'task', 'add', 'e3-unit', 'e7-good', '--objective=e7 good refs', `--refs=${SEVEN.join(' ')}`)).code).toBe(0);
    expect((await unit(sb, 'task', 'show', 'e3-unit', 'e7-good')).stdout).toMatch(/^ {2}REFS: \[\/abs\/file, \.\.\/x, \.\/README\.md, lanes\/l\/recipe, journal#x, README\.md#top, ###\]$/m);
    expect((await unit(sb, 'task', 'update', 'e3-unit', 'e3-task', `--refs=journal#${D}-e3-t, lanes/e3-lane/recipe`)).code).toBe(0);
    expect((await unit(sb, 'task', 'show', 'e3-unit', 'e3-task')).stdout).toMatch(new RegExp(`^ {2}REFS: \\[journal#${D}-e3-t, lanes/e3-lane/recipe\\]$`, 'm'));
  });

  it('E3-b [the-record-r14, the-record-r18]: finding add, update, and supersede, and lane record land the shapes', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'finding', 'add', 'e3-unit', 'E7_GOOD', '--summary=e7 good', ...refs(...SEVEN))).code).toBe(0);
    expect((await unit(sb, 'finding', 'show', 'e3-unit', 'E7_GOOD')).stdout.split('\n').filter((l) => l.startsWith('  REF: '))).toHaveLength(7);
    expect((await unit(sb, 'finding', 'update', 'e3-unit', 'E3_ONE', ...refs('knowledge#E3_ONE', 'docs/the-record.md'))).code).toBe(0);
    expect((await unit(sb, 'finding', 'supersede', 'e3-unit', 'E3_ONE', 'E3_THREE', '--summary=three', ...refs('lanes/e3-lane/report#claim'))).code).toBe(0);
    expect((await lane(sb, 'record', 'e3-unit', 'e3-lane', '--what=e7 lane refs ok', ...refs(...SEVEN))).code).toBe(0);
    expect((await lane(sb, 'show', 'e3-unit', 'e3-lane', 'journal')).stdout).toContain('e7 lane refs ok');
  });

  it('E3-c [the-record-r18]: a legacy free-text REF reads as stored (posix plant)', async () => {
    const sb = fresh(sb0);
    appendArtifact(sb, 'e3-unit', 'journal', '\n@entry 2026-09-20-e3-legacy\n  ANCHOR: A1\n  WHAT: "legacy ref"\n  THREAD: none\n  REF: "a free text legacy reference"\n');
    expect((await unit(sb, 'entry', 'show', 'e3-unit', '2026-09-20-e3-legacy')).stdout).toMatch(/^ {2}REF: "a free text legacy reference"$/m);
  });
});
