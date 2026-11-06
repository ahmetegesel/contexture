import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { seedUnit, unit } from '../support/unit';

const D = '2026-09-27';
const RESIDUE: readonly [string, RegExp][] = [
  ['.contexture/sessions/p2', /^\.tmp/],
  ['.contexture/sessions/p2', /\.XXXXXX$/],
  ['.contexture/tmp', /^rec\./],
  ['.contexture/tmp', /^fts5-ws\./],
  ['.contexture/tmp', /^posix\./],
  ['.contexture/tmp', /^verb\./],
];
const matches = (sb: string, [dir, re]: readonly [string, RegExp]): boolean => existsSync(join(sb, dir)) && readdirSync(join(sb, dir)).some((f) => re.test(f));
const residueHits = (sb: string): number => RESIDUE.filter((p) => matches(sb, p)).length;
const oneLsProbe = (sb: string): boolean => RESIDUE.every((p) => matches(sb, p));

function tornBlocks(journal: string): boolean {
  let pending = false;
  for (const line of journal.split('\n')) {
    if (line.startsWith('@entry ')) {
      if (pending) return true;
      pending = true;
    } else if (line.startsWith('  THREAD: ')) pending = false;
  }
  return pending;
}

describe.concurrent('concurrent writers of one unit serialize: no refusal, no residue, no torn block', () => {
  let p2: string;
  beforeAll(async () => {
    p2 = await seed((sb) => seedUnit(sb, 'p2', 'parallel probe same-target'), 'posix', 'concurrency');
  });

  it.for(Array.from({ length: 10 }, (_, i) => i + 1))('L-a [the-record-r9]: a record and a task add landing at once on unit p1-%i both land with no refusal', async (i) => {
    const sb = stage('posix', `concurrency-p1-${i}`);
    await seedUnit(sb, `p1-${i}`, `parallel probe unit ${i}`);
    const [a, b] = await Promise.all([
      unit(sb, 'record', `p1-${i}`, `--what=journal write ${i}`, `--slug=${D}-probe-journal-${i}`),
      unit(sb, 'task', 'add', `p1-${i}`, `p1-task-${i}`, `--objective=parallel ${i}`),
    ]);
    expect([a.code, a.stderr, b.code, b.stderr]).toEqual([0, '', 0, '']);
    expect((await unit(sb, 'entry', 'show', `p1-${i}`, `${D}-probe-journal-${i}`)).code).toBe(0);
    expect((await unit(sb, 'task', 'show', `p1-${i}`, `p1-task-${i}`)).code).toBe(0);
  });

  it('L-b [the-record-r9]: two records landing at once on one unit, five rounds: every write rc 0, no residue, no torn block, both land', async () => {
    const sb = fresh(p2);
    for (let i = 1; i <= 5; i++) {
      const runs = await Promise.all(['x', 'y'].map((e) => unit(sb, 'record', 'p2', `--what=${e} ${i}`, `--slug=${D}-probe-${e}-${i}`)));
      expect(runs.map((r) => [r.code, r.stderr])).toEqual([[0, ''], [0, '']]);
      expect(residueHits(sb)).toBe(0);
      expect(tornBlocks(readFileSync(artifactPath(sb, 'p2', 'journal'), 'utf8'))).toBe(false);
      for (const e of ['x', 'y']) expect((await unit(sb, 'entry', 'show', 'p2', `${D}-probe-${e}-${i}`)).stdout.split('\n')).toContain(`  WHAT: "${e} ${i}"`);
    }
  });

  it.for(['.contexture/sessions/p2/.tmpplant', '.contexture/sessions/p2/plant.XXXXXX', '.contexture/tmp/rec.plant', '.contexture/tmp/fts5-ws.plant', '.contexture/tmp/posix.plant', '.contexture/tmp/verb.plant'])('L-c [the-record-r9]: a single planted leak %s reads as residue, while the retired one-ls probe misses it', async (plant) => {
    const sb = fresh(p2);
    const path = join(sb, plant);
    mkdirSync(dirname(path), { recursive: true });
    expect(residueHits(sb)).toBe(0);
    writeFileSync(path, '');
    expect(residueHits(sb)).toBe(1);
    expect(oneLsProbe(sb)).toBe(false);
    rmSync(path);
  });

  it('L-c [the-record-r9]: the torn-block instrument reads an entry without its THREAD line as torn', () => {
    expect(tornBlocks('@entry a\n  WHAT: "x"\n  THREAD: none\n')).toBe(false);
    expect(tornBlocks('@entry a\n  WHAT: "x"\n@entry b\n  WHAT: "y"\n  THREAD: none\n')).toBe(true);
  });
});

