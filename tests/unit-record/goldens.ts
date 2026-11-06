import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { Run } from '../support/exec';
import { COMPLIANCE, DATE, mk, ok, rec } from '../support/record';
import { seedSteps } from '../support/snapshot';
import { answer, payload } from '../support/wire';

export const WRITE_GOLDENS = process.env.COMPLIANCE_WRITE_GOLDENS === '1';

export interface Golden {
  file: string;
  fn: string;
  args: string[];
}

export function goldens(unit: string, dir: string): Golden[] {
  const path = join(COMPLIANCE, 'golden', dir);
  return readdirSync(path)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => {
      const base = f.slice(0, -5);
      const after = (prefix: string) => base.slice(prefix.length);
      const file = join(path, f);
      for (const fn of ['task.get', 'finding.get', 'entry.get', 'entry.closure', 'task.list', 'finding.list']) {
        if (base.startsWith(`${fn}.`)) return { file, fn, args: [unit, after(`${fn}.`)] };
      }
      if (base.startsWith('lane.get.')) {
        const rest = after('lane.get.');
        const dot = rest.lastIndexOf('.');
        return { file, fn: 'lane.get', args: [unit, rest.slice(0, dot), rest.slice(dot + 1)] };
      }
      if (['session.board', 'session.load', 'entry.list'].includes(base)) return { file, fn: base, args: [unit] };
      throw new Error(`unknown golden ${f}`);
    });
}

export async function holdsGoldens(unit: string, dir: string, call: (fn: string, args: string[]) => Promise<Run>): Promise<void> {
  const set = goldens(unit, dir);
  expect(set.length).toBe(23);
  const runs = await Promise.all(set.map((g) => call(g.fn, g.args)));
  for (const [i, g] of set.entries()) {
    const r = runs[i];
    answer(r, `${g.fn} ${g.args.join(' ')}`);
    if (WRITE_GOLDENS) writeFileSync(g.file, r.bytes);
    else expect(r.stdout, `${g.fn} ${g.args.join(' ')} against ${g.file}`).toBe(readFileSync(g.file, 'utf8'));
  }
}

export const VU = 'verb-u';

async function verbUnit(sb: string): Promise<void> {
  answer(await mk(sb, 'verb-ref'), 'session.create');
  await ok(sb, 'session.create', [VU], payload().kv('objective', 'The verb fixture unit').kl('repos', 'alpha', 'beta').kv('attention', 'verb fixture'));
  await ok(sb, 'session.refs', [VU, 'verb-ref']);
  const canon = payload()
    .kv('objective', 'Every section filled')
    .kl('refs', 'journal#2026-09-27-verb-one', 'knowledge#VERB_CANON')
    .kv('desc', 'first description line\n\nthird line after an empty one')
    .kv('criteria', 'one criterion')
    .kv('details', 'detail one\ndetail two');
  await ok(sb, 'task.add', [VU, 'canon-task'], canon);
  await ok(sb, 'task.add', [VU, 'plain-task'], payload().kv('objective', 'Only an objective'));
  await ok(sb, 'task.add', [VU, 'done-task'], payload().kv('objective', 'Completed in the walk'));
  await ok(sb, 'task.complete', [VU, 'done-task'], payload().kv('evidence', 'the walk verified it').kv('date', DATE));
  await ok(sb, 'task.add', [VU, 'active-task'], payload().kv('objective', 'Started in the walk'));
  await ok(sb, 'task.start', [VU, 'active-task']);
  await ok(sb, 'finding.add', [VU, 'VERB_CANON'], payload().kv('summary', 'a canonical finding\nover two lines').kl('refs', 'journal#2026-09-27-verb-one'));
  await ok(sb, 'finding.add', [VU, 'VERB_OLD'], payload().kv('summary', 'the older reading'));
  await ok(sb, 'finding.supersede', [VU, 'VERB_OLD', 'VERB_NEW'], payload().kv('summary', 'the newer reading').kv('reason', 'replaced by the walk'));
  const first = payload().kv('slug', '2026-09-27-verb-one').kv('group', 'verb-group').kv('rhythm', 'probe').kv('knowledge', 'true').kl('refs', 'task#canon-task', 'lanes/verb-lane/report');
  answer(await rec(sb, VU, 1790000761, 'the first verb entry', { thread: 'the human', with: first }), 'entry.record');
  answer(await rec(sb, VU, 1790000762, 'the second verb entry', { with: payload().kv('slug', '2026-09-27-verb-two').kv('group', 'verb-group') }), 'entry.record');
  answer(await rec(sb, VU, 1790000763, 'the third verb entry', { with: payload().kv('slug', '2026-09-27-verb-three') }), 'entry.record');
  await ok(sb, 'session.stamp', [VU], payload().kv('date', DATE));
  const folds = payload().kv('slug', '2026-09-27-verb-four').kv('closers.count', '1').kcl(1, 'CLOSES', 'folded', 'read together', '2026-09-27-verb-two', '2026-09-27-verb-three');
  answer(await rec(sb, VU, 1790000764, 'folds the second and the third', { with: folds }), 'entry.record');
  await ok(sb, 'lane.create', [VU, 'verb-lane'], '# recipe grammar\nMISSION\n  GOAL: "walk the verbs"\n');
  const step = payload().kv('what', 'a lane step').kv('thread', 'none').kl('refs', 'task#canon-task').kv('slug', '2026-09-27-verb-lane-one').kv('date', DATE).kv('epoch', '1790000765');
  await ok(sb, 'lane.record', [VU, 'verb-lane'], step);
  await ok(sb, 'lane.write_report', [VU, 'verb-lane'], '@claim one\n  the walk landed, a \\ backslash and a "quote"\n');
  await ok(sb, 'lane.create', [VU, 'quiet-lane'], '# a quiet lane\n');
}

export const verbBuilt = seedSteps('verb', [
  { name: 'empty', build: async () => undefined },
  { name: 'verb-u', build: verbUnit },
]);
