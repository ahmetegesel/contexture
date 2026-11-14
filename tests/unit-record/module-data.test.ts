import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { ok } from '../support/record';
import { fresh, seedSteps } from '../support/snapshot';
import { answer, payload } from '../support/wire';

const unitPayload = (u: string) => payload().kv('objective', `unit ${u} needle`).kv('attention', 't').kl('repos');
const task = (objective: string, ...refs: string[]) => payload().kv('objective', objective).kl('refs', ...refs).toString();

const seeded = seedSteps('module-data', [
  { name: 'empty', build: async () => undefined },
  {
    name: 'UD1',
    build: async (sb) => {
      expect((await ok(sb, 'session.create', ['u1'], unitPayload('u1'))).state.status).toBe('ACTIVE');
      expect((await ok(sb, 'session.create', ['u2'], unitPayload('u2'))).unit).toBe('u2');
      expect((await ok(sb, 'task.add', ['u1', 't1'], task('a needle in the first task'))).task.slug).toBe('t1');
    },
  },
]);

const at = async () => fresh(await seeded('UD1'));

const slugs = async (sb: string): Promise<string[]> => (await ok(sb, 'task.list', ['u1', 'all'])).tasks.map((t: { slug: string }) => t.slug);

describe.concurrent('the unit module\'s own data cases', () => {
  it('UD-1: the seed holds two ACTIVE units and the task', async () => {
    const sb = await at();
    const units = (await ok(sb, 'session.list', [])).units;
    expect(units.map((u: { unit: string; status: string }) => [u.unit, u.status])).toEqual([
      ['u1', 'ACTIVE'],
      ['u2', 'ACTIVE'],
    ]);
    expect(await slugs(sb)).toEqual(['t1']);
  });

  it.for([
    'journal#2026-01-01-absent',
    'knowledge#F1',
    'backlog#t1',
    'lane#l1/report',
    'task#t1',
    'journal.md#2026-01-01-absent',
    'docs/the-engine.md#the-unit-module',
    'lanes/l1/report',
    'a b#c',
  ])('UD-2 [the-record-r18, the-record-r9]: the data level refuses %j, no full address, before the unit lock, and lands nothing', async (ref) => {
    const sb = await at();
    const r = await data(sb, 'task.add', ['u1', 't-bad'], task('a retired ref task', ref));
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toMatch(new RegExp(`^task\\.add: error: malformed ref '.*': a reference is .*\\(ERR_INVALID_ARGUMENT\\)\\n$`));
    expect(await slugs(sb)).not.toContain('t-bad');
  });

  // the review's input: REFS lines a direct lane.create call stored, under the recipe's REFS :: head
  const recipe = (...items: string[]): string => `@recipe l2\n  UNIT: u1\n  LANE: l2\n\nGOAL ::\n  x\n\nREFS ::\n${items.map((i) => `  ${i}\n`).join('')}\nSCOPE ::\n  1. y\n`;

  it.for(['journal#short', 'lanes/x/report', 'freetext', 'knowledge.md#F1 (annotated)'])('UD-2b [the-record-r18, the-record-r15]: lane.create refuses the REFS block item %j, no full address, before the unit lock, and lands nothing', async (item) => {
    const sb = await at();
    const r = await data(sb, 'lane.create', ['u1', 'l2'], recipe('unit#u1/task/t1', item));
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toMatch(new RegExp(`^lane\\.create: error: malformed ref '${item.split(' ')[0]?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}': a reference is .*\\(ERR_INVALID_ARGUMENT\\)\\n$`));
    expect((await ok(sb, 'lane.create', ['u1', 'l2'], recipe('unit#u1/task/t1'))).lane).toBe('l2');
  });

  it('UD-2b [the-record-r18, the-record-r15]: lane.create takes REFS block items that are full addresses, an annotation beside one kept, and a report carries no REFS grammar', async () => {
    const sb = await at();
    const doc = recipe('unit#u1/task/t1 (the task)', 'file#docs/the-engine.md#the-unit-module', 'store#ideas/x');
    expect((await ok(sb, 'lane.create', ['u1', 'l2'], doc)).lane).toBe('l2');
    expect((await ok(sb, 'lane.get', ['u1', 'l2', 'recipe'])).content).toBe(doc);
    expect((await data(sb, 'lane.write_report', ['u1', 'l2'], '@report l2\nREFS ::\n  journal#short stays report prose\n')).code).toBe(0);
  });

  it('UD-3 [the-record-r18]: the data level takes every full address shape as written; the target check is the verbs\', through each owner\'s get, before the call', async () => {
    const sb = await at();
    const refs = ['unit#u1/task/t1', 'unit#u1/task/missing', 'unit#u1/lane/l1/report/claim', 'file#docs/the-engine.md#the-unit-module', 'store#ideas/x', 'docs#workspace/the-record/header'];
    expect((await ok(sb, 'task.add', ['u1', 't-ok'], task('full address refs', ...refs))).task.refs).toEqual(refs);
  });

  it('UD-10 [the-record-r1]: session.refs sets the read-only unit, session.load reads it, and the per-unit read stays inside its unit', async () => {
    const sb = await at();
    await ok(sb, 'task.add', ['u2', 't2'], task('ref target task'));
    await ok(sb, 'session.refs', ['u1', 'u2']);
    const load = await data(sb, 'session.load', ['u1']);
    const loaded = answer(load, 'session.load');
    expect([loaded.state.ref_sessions, loaded.refs.map((r: { unit: string }) => r.unit)]).toEqual([['u2'], ['u2']]);
    expect(load.stdout).toContain('"refs":[{"unit":"u2"');
    expect((await data(sb, 'session.load', ['u2'])).stdout).not.toContain('"unit":"u1"');
  });
});
