import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { seedSteps } from '../support/snapshot';
import { must, run, seedUnit, unit } from '../support/unit';

export const D = '2026-09-27';

export async function fcFixture(sb: string, u: string): Promise<void> {
  await seedUnit(sb, u, 'fold fixture');
  const rec = (n: string, what: string, ...extra: string[]) => must(unit(sb, 'record', u, `--what=${what}`, `--slug=${D}-fc-${n}`, ...extra));
  await rec('01', 'Initial kickoff event');
  await rec('02', 'Open thread: waiting on the human', "--thread=the human's answer");
  await rec('03', 'Just a note');
  await must(unit(sb, 'stamp', u));
  await rec('04', 'backlog/task-alpha: DONE verification evidence');
  await rec('05', 'Tail work after the milestone');
  await must(unit(sb, 'stamp', u));
  await rec('06', 'LAND: shipped v0.1.0 (commit abc1234, tag v0.1.0)');
  await rec('07', 'DECIDE (human): architecture choice settled');
  await rec('08', 'Closed constituent');
  await rec('09', 'Closer receipt', `--closes=${D}-fc-08 (done: resolved)`);
}

export interface Plan {
  start: string;
  l1: string;
  l2: string;
  l3: string;
  chunkLanes: Record<number, string>;
}

export function laneOf(plan: string, chunk: number): string | undefined {
  for (const line of plan.split('\n')) {
    const f = line.trim().split(/\s+/);
    const at = f.indexOf('lane');
    if (f[0] === String(chunk) && at >= 0) return f[at + 1];
  }
  return undefined;
}

export function readPlan(sb: string, text = readFileSync(join(sb, 'fold-plan.txt'), 'utf8')): Plan {
  const chunkLanes: Record<number, string> = {};
  for (let n = 1; n <= 6; n++) chunkLanes[n] = laneOf(text, n) ?? '';
  return { start: /^fold start: (\S+)/m.exec(text)?.[1] ?? '', l1: chunkLanes[1]!, l2: chunkLanes[2]!, l3: chunkLanes[4]!, chunkLanes };
}

const ref = (n: string): string => `--ref=journal#${D}-fc-${n}`;
const folded = (n: string): string => `--closes=${D}-fc-${n} (folded: consolidated)`;
const BATCHES: Record<string, string[]> = {
  batch1: ['--what=Batch one: the kickoff, the carried thread, and the note', '--group=fc', ref('01'), ref('02'), ref('03'), '--ref=lanes/fc-unit/report', folded('01'), folded('03')],
  batch2: ['--what=Batch two: the task receipt', ref('04'), folded('04')],
  batch3: ['--what=Batch three: the tail after the milestone', ref('05'), folded('05')],
  batch45: ['--what=Batch four: the release and the decision, merged (merged: same topic)', ref('06'), ref('07'), folded('06'), folded('07')],
  batch6: ['--what=Batch five: the closer receipt tail', ref('09'), folded('09')],
};

export async function foldRecord(sb: string, batch: string): Promise<string> {
  const r = await must(unit(sb, 'record', 'fc-unit', '--thread=none', ...(BATCHES[batch] ?? [])));
  return /^recorded entry: (\S+)/m.exec(r.stdout + r.stderr)?.[1] ?? '';
}

export function foldChain(id: string): (name: string) => Promise<string> {
  return seedSteps(id, [
    { name: 'fixture', build: (sb) => fcFixture(sb, 'fc-unit') },
    {
      name: 'planned',
      build: async (sb) => {
        const r = await must(unit(sb, 'fold', 'fc-unit'));
        writeFileSync(join(sb, 'fold-plan.txt'), r.stdout + r.stderr);
        const { l1, l2, l3 } = readPlan(sb);
        for (const l of [l1, l2, l3]) await must(run(sb, ['lane', 'create', 'fc-unit', l], { input: `fold fixture lane ${l}\n` }));
      },
    },
    { name: 'batch1', build: async (sb) => void (await foldRecord(sb, 'batch1')) },
    { name: 'batch3', build: async (sb) => { await foldRecord(sb, 'batch2'); await foldRecord(sb, 'batch3'); } },
    { name: 'batch6', build: async (sb) => { await foldRecord(sb, 'batch45'); await foldRecord(sb, 'batch6'); } },
  ]);
}
