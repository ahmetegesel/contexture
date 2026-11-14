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

  it('UD-2 [the-engine-r21]: the write time check answers a canonical task ref through the unit\'s own read: a held one lands, a missing one refuses naming the target', async () => {
    const sb = await at();
    expect((await ok(sb, 'task.add', ['u1', 't-held'], task('a held task ref', 'unit#u1/task/t1'))).task.refs).toEqual(['unit#u1/task/t1']);
    const missing = await data(sb, 'task.add', ['u1', 't-missing'], task('a missing task ref', 'unit#u1/task/missing'));
    expect([missing.code, missing.stdout, missing.stderr]).toEqual([1, '', "task.add: error: ref 'unit#u1/task/missing': task 'missing' not found in unit 'u1' (ERR_ENTITY_NOT_FOUND)\n"]);
    expect(await slugs(sb)).not.toContain('t-missing');
  });

  it('UD-3 [the-engine-r21]: a write with a missing canonical ref refuses re-framed and lands nothing; a held ref lands; a file pointer and a legacy ref are exempt', async () => {
    const sb = await at();
    const bad = await data(sb, 'task.add', ['u1', 't-bad'], task('bad ref task', 'unit#u1/task/missing'));
    expect([bad.code, bad.stderr]).toEqual([1, "task.add: error: ref 'unit#u1/task/missing': task 'missing' not found in unit 'u1' (ERR_ENTITY_NOT_FOUND)\n"]);
    expect(await slugs(sb)).not.toContain('t-bad');
    expect((await ok(sb, 'task.add', ['u1', 't-ok'], task('a canonical ref task', 'unit#u1/task/t1'))).task.refs).toEqual(['unit#u1/task/t1']);
    expect((await ok(sb, 'task.add', ['u1', 't-file'], task('a file pointer task', 'docs/the-engine.md#the-unit-module'))).task.refs).toEqual(['docs/the-engine.md#the-unit-module']);
    expect((await ok(sb, 'task.add', ['u1', 't-legacy'], task('a legacy ref task', 'journal#2026-01-01-absent'))).task.refs).toEqual(['journal#2026-01-01-absent']);
  });

  it('UD-7: the write time check answers the canonical finding and lane recipe refs: held ones land, missing ones refuse and land nothing', async () => {
    const sb = await at();
    await ok(sb, 'finding.add', ['u1', 'F1'], payload().kv('summary', 'a finding summary').kl('refs'));
    await ok(sb, 'lane.create', ['u1', 'l1'], '# a needle lane recipe\n');
    expect((await ok(sb, 'task.add', ['u1', 't-f'], task('a finding ref task', 'unit#u1/finding/F1', 'unit#u1/lane/l1/recipe'))).task.refs).toEqual(['unit#u1/finding/F1', 'unit#u1/lane/l1/recipe']);
    for (const ref of ['unit#u1/finding/F9', 'unit#u1/lane/l9/recipe']) {
      const r = await data(sb, 'task.add', ['u1', 't-gone'], task('a missing ref task', ref));
      expect([r.code, r.stdout, r.stderr.startsWith(`task.add: error: ref '${ref}': `), r.stderr.endsWith('(ERR_ENTITY_NOT_FOUND)\n')]).toEqual([1, '', true, true]);
    }
    expect(await slugs(sb)).not.toContain('t-gone');
  });

  it('UD-8 [the-engine-r21]: a held canonical lane ref lands; a claim-shaped unit ref refuses naming the ref and lands nothing', async () => {
    const sb = await at();
    await ok(sb, 'lane.create', ['u1', 'l1'], '# a needle lane recipe\n');
    await ok(sb, 'lane.record', ['u1', 'l1'], payload().kv('what', 'a needle lane entry').kv('thread', 'none').kv('slug', 'lane-needle').kl('refs'));
    await ok(sb, 'lane.write_report', ['u1', 'l1'], 'a needle lane report\n');
    expect((await ok(sb, 'task.add', ['u1', 't-lane'], task('a lane ref task', 'unit#u1/lane/l1/report'))).task.refs).toEqual(['unit#u1/lane/l1/report']);
    const claim = await data(sb, 'task.add', ['u1', 't-claim'], task('a claim ref task', 'unit#u1/lane/l1/report#claim'));
    expect([claim.code, claim.stdout, claim.stderr.startsWith("task.add: error: ref 'unit#u1/lane/l1/report#claim':")]).toEqual([1, '', true]);
    expect(await slugs(sb)).not.toContain('t-claim');
  });

  it('UD-9: the write time check answers the canonical entry ref: a held entry lands, a missing one refuses', async () => {
    const sb = await at();
    const { entry } = await ok(sb, 'entry.record', ['u1'], payload().kv('what', 'an entry').kv('thread', 'none').kv('date', '2026-11-03').kv('epoch', '1793687300').kl('refs'));
    expect((await ok(sb, 'task.add', ['u1', 't-e'], task('an entry ref task', `unit#u1/entry/${entry.slug}`))).task.refs).toEqual([`unit#u1/entry/${entry.slug}`]);
    const r = await data(sb, 'task.add', ['u1', 't-e9'], task('a missing entry ref task', 'unit#u1/entry/2026-01-01-absent'));
    expect([r.code, r.stderr.startsWith("task.add: error: ref 'unit#u1/entry/2026-01-01-absent': "), r.stderr.endsWith('(ERR_ENTITY_NOT_FOUND)\n')]).toEqual([1, true, true]);
    expect(await slugs(sb)).not.toContain('t-e9');
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
