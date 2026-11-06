import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { appendArtifact, artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { must, seedUnit, unit } from '../support/unit';

const D = '2026-09-27';
const OBJ = 'the "quoted" objective of the human\'s unit';

async function loadAll(sb: string, u: string): Promise<string> {
  let out = '';
  for (let p = 1; p <= 20; p++) {
    const page = (await unit(sb, 'load', u, String(p))).stdout;
    out += page;
    if (/load complete/i.test(page)) break;
  }
  return out;
}

describe.concurrent('one quote rule for every one-line quoted field', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'q-unit', 'one-line field unit');
      await must(unit(sb, 'record', 'q-unit', '--what=the typed "quoted" what', '--slug=q-typed-quote'));
      await must(unit(sb, 'record', 'q-unit', '--what=an appended "quoted" what', `--slug=${D}-q-appended-quote`));
      await seedUnit(sb, 'u-unit', 'quote rule unit');
      await must(unit(sb, 'task', 'add', 'u-unit', 'u-a', '--objective=Task "A" typed'));
      await must(unit(sb, 'task', 'start', 'u-unit', 'u-a'));
      await must(unit(sb, 'task', 'add', 'u-unit', 'u-b', '--objective=an "appended" objective'));
      await must(unit(sb, 'task', 'add', 'u-unit', 'u-c', '--objective=to be amended'));
      await must(unit(sb, 'task', 'update', 'u-unit', 'u-c', '--objective=an "amended" objective'));
    }, 'posix', 'quote-rule');
  });

  it('Q-b: a WHAT carrying double quotes lands verbatim and every reader returns it', async () => {
    const sb = fresh(sb0);
    expect(readFileSync(artifactPath(sb, 'q-unit', 'journal'), 'utf8').split('\n')).toContain('  WHAT: "an appended "quoted" what"');
    const board = (await unit(sb, 'board', 'q-unit')).stdout;
    expect(board).toContain('WHAT: "an appended "quoted" what"');
    expect(board).toContain('WHAT: "the typed "quoted" what"');
    expect((await unit(sb, 'entry', 'show', 'q-unit', `${D}-q-appended-quote`)).stdout).toContain('WHAT: "an appended "quoted" what"');
    expect(await loadAll(sb, 'q-unit')).toContain('WHAT: "an appended "quoted" what"');
    expect((await unit(sb, 'audit', 'q-unit')).code).toBe(0);
    expect((await unit(sb, 'search', 'q-unit', 'appended "quoted" what', '--mode=exact', '--json')).stdout).toContain(`"entity_id":"${D}-q-appended-quote"`);
  });

  it('Q-d: a legacy two-line WHAT still audits rc 0 and loads on the board (posix plant)', async () => {
    const sb = fresh(sb0);
    appendArtifact(sb, 'q-unit', 'journal', `\n@entry ${D}-q-legacy-two-line\n  ANCHOR: A1\n  WHAT: "legacy first line\nlegacy second line"\n  THREAD: none\n`);
    expect((await unit(sb, 'audit', 'q-unit')).code).toBe(0);
    expect((await unit(sb, 'board', 'q-unit')).stdout).toContain(`@entry ${D}-q-legacy-two-line`);
  });

  it('U-a: bootstrap takes a state objective with double and single quotes; load, active, and the audit read it verbatim', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'bootstrap', 'u-obj', OBJ)).code).toBe(0);
    expect((await unit(sb, 'load', 'u-obj', '1')).stdout.split('\n')).toContain(`objective: "${OBJ}"`);
    expect((await unit(sb, 'active')).stdout).toContain('objective: "the "quoted" objective of the human');
    expect((await unit(sb, 'load', 'u-obj')).stdout).toContain(`objective: "${OBJ}"`);
    expect((await unit(sb, 'audit', 'u-obj')).code).toBe(0);
    expect((await unit(sb, 'bootstrap', 'u-nl', 'first\nsecond')).code).toBe(1);
  });

  it('U-a: a task OBJECTIVE with double quotes from task add and task update reads back verbatim everywhere', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'task', 'show', 'u-unit', 'u-b')).stdout.split('\n')).toContain('  OBJECTIVE: "an "appended" objective"');
    expect((await unit(sb, 'task', 'show', 'u-unit', 'u-c')).stdout.split('\n')).toContain('  OBJECTIVE: "an "amended" objective"');
    expect((await unit(sb, 'task', 'show', 'u-unit', 'u-c', '--json')).stdout).toContain('"objective":"an \\"amended\\" objective"');
    const load = await loadAll(sb, 'u-unit');
    expect(load).toContain('OBJECTIVE: "an "appended" objective"');
    expect(load).toContain('OBJECTIVE: "an "amended" objective"');
    expect((await unit(sb, 'board', 'u-unit')).stdout).toContain('u-b');
    expect((await unit(sb, 'audit', 'u-unit')).code).toBe(0);
    const found = (await unit(sb, 'search', 'u-unit', 'amended', '--mode=exact', '--json')).stdout;
    expect(found).toContain('"entity_id":"u-c"');
    expect(found).toContain('an \\"amended\\" objective');
  });
});
