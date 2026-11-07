import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { RECORD_ROOT } from '../support/drawer';
import { engineCall } from '../support/engine';
import type { Run } from '../support/exec';
import { DATE } from '../support/record';
import { fresh } from '../support/snapshot';
import { payload } from '../support/wire';
import { at, GAMMA, OTHER, RECIPE, TUNIT, UNIT } from './chain';

type Op = [fn: string, argv: string[], input?: string];

const p = payload;
const OPS: Op[] = [
  ['session.create', ['diff-new'], p().kv('objective', 'a differential unit').kv('attention', 'differential').toString()],
  ['session.list', []],
  ['session.active', []],
  ['session.load', [TUNIT]],
  ['session.refload', [TUNIT, UNIT]],
  ['session.board', [TUNIT]],
  ['session.audit', [TUNIT]],
  ['session.stamp', [TUNIT], p().kv('date', DATE).toString()],
  ['session.close', [TUNIT]],
  ['session.reopen', [UNIT]],
  ['session.refs', [TUNIT, UNIT]],
  ['session.units', ['alpha']],
  ['session.refs_to', [UNIT]],
  ['task.add', [TUNIT, 'diff-task'], p().kv('objective', 'a differential task').kl('refs', 'backlog#one').toString()],
  ['task.update', [TUNIT, 'task-sample'], p().kv('objective', 'updated by both').kv('details', 'a detail').toString()],
  ['task.start', [TUNIT, 'task-sample']],
  ['task.complete', [TUNIT, 'task-sample'], p().kv('evidence', 'both landed').kv('date', DATE).toString()],
  ['task.reopen', [TUNIT, 'task-keeper']],
  ['task.drop', [TUNIT, 'task-refs'], p().kv('reason', 'differential drop').kv('date', DATE).toString()],
  ['task.get', [TUNIT, 'task-sample']],
  ['task.list', [TUNIT, 'all']],
  ['entry.record', [TUNIT], p().kv('group', 'topic-group').kv('closers.count', '1').kcl(1, 'CLOSES', 'done', 'differential', OTHER).kv('what', 'a differential entry').kv('thread', 'none').kv('date', DATE).kv('epoch', '1790000900').toString()],
  ['entry.get', [TUNIT, GAMMA]],
  ['entry.closure', [TUNIT, GAMMA]],
  ['entry.list', [TUNIT, '--group=topic-group']],
  ['finding.add', [TUNIT, 'DIFF_F'], p().kv('summary', 'a differential finding').kl('refs', `journal#${GAMMA}`).toString()],
  ['finding.update', [TUNIT, 'FINDING_BETA'], p().kv('summary', 'updated by both').toString()],
  ['finding.drop', [TUNIT, 'FINDING_BETA']],
  ['finding.get', [TUNIT, 'FINDING_ALPHA']],
  ['finding.supersede', [TUNIT, 'FINDING_BETA', 'DIFF_G'], p().kv('summary', 'the successor').toString()],
  ['finding.list', [TUNIT, 'all']],
  ['lane.create', [TUNIT, 'diff-lane'], RECIPE],
  ['lane.record', [TUNIT, 'lane-worker'], p().kv('what', 'a differential step').kv('thread', 'none').kv('date', DATE).kv('epoch', '1790000901').toString()],
  ['lane.write_report', [TUNIT, 'lane-worker'], '# a differential report\n'],
  ['lane.get', [TUNIT, 'lane-worker', 'journal']],
  ['search.query', [TUNIT, '--mode=exact', '--limit=5'], p().kv('query', 'objective').toString()],
];

function artifacts(sb: string): Record<string, string> {
  const root = join(sb, RECORD_ROOT);
  const out: Record<string, string> = {};
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, `${rel}${name}/`);
      else out[`${rel}${name}`] = readFileSync(path, 'latin1');
    }
  };
  if (existsSync(root)) walk(root, '');
  return out;
}

async function both(op: Op, engineInput = op[2]): Promise<{ engine: Run; script: Run; engineStore: Record<string, string>; scriptStore: Record<string, string> }> {
  const [fn, argv, input = ''] = op;
  const snapshot = await at('T37');
  const a = fresh(snapshot);
  const b = fresh(snapshot);
  const engine = await engineCall(a, fn, argv, engineInput ?? '');
  const script = await data(b, fn, argv, input);
  return { engine, script, engineStore: artifacts(a), scriptStore: artifacts(b) };
}

describe.concurrent('the engine against the data script on the same fresh snapshot', () => {
  it('covers every function of the data script dispatch once', () => {
    expect(new Set(OPS.map(([fn]) => fn)).size).toBe(36);
    expect(OPS.length).toBe(36);
  });

  for (const op of OPS) {
    it(`${op[0]}: the same answer and the same landed artifacts`, async () => {
      const { engine, script, engineStore, scriptStore } = await both(op);
      expect(script.code, `${op[0]} through the data script [${script.stderr}]`).toBe(0);
      expect([engine.code, engine.stderr]).toEqual([script.code, script.stderr]);
      expect(engine.stdout).toBe(script.stdout);
      expect(engineStore).toEqual(scriptStore);
    });
  }

  it('null check: a planted payload difference reads unequal in the answer and the landed artifacts', async () => {
    const op = OPS.find(([fn]) => fn === 'task.add') as Op;
    const { engine, script, engineStore, scriptStore } = await both(op, p().kv('objective', 'a planted difference').kl('refs', 'backlog#one').toString());
    expect([engine.code, script.code]).toEqual([0, 0]);
    expect(engine.stdout).not.toBe(script.stdout);
    expect(engineStore).not.toEqual(scriptStore);
  });
});
