import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { install } from '../support/packages';
import { DATE } from '../support/record';
import { ROOT } from '../support/root';
import { fresh, seed } from '../support/snapshot';
import { createLane, lane, must, run, unit } from '../support/unit';
import { inSqliteStore, needFts5, recordAndList, sqliteStage } from './smoke';

const U = 'sq';
const show = async (sb: string, ...args: string[]): Promise<string> => (await must(unit(sb, ...args))).stdout;

let seeded: string;
beforeAll(async () => {
  needFts5();
  seeded = await seed(async (sb) => {
    await must(unit(sb, 'bootstrap', U, 'the sqlite smoke unit'));
  }, 'fts5', 'sq-seed');
});

describe.concurrent('the SQLite smoke set: every command family lands in the fts5 store and nowhere else (C14 runtime half)', () => {
  it('SF1 [the-record-r2, the-record-r10] the unit lifecycle: bootstrap, list, list --all --repo, stamp, close, the closed refusal, reopen, board', async () => {
    const sb = sqliteStage('sf1');
    await must(unit(sb, 'bootstrap', 'sf1', 'the lifecycle unit', 'sq-repo'));
    expect(await show(sb, 'list')).toContain('sf1');
    expect(await show(sb, 'list', '--all', '--repo=sq-repo')).toContain('sf1 [ACTIVE]');
    await must(unit(sb, 'stamp', 'sf1'));
    expect(await show(sb, 'list')).toMatch(/^ {2}current_anchor: A2$/m);
    await must(unit(sb, 'close', 'sf1'));
    expect((await unit(sb, 'record', 'sf1', '--what=a write into a closed unit')).code).toBe(1);
    await must(unit(sb, 'reopen', 'sf1'));
    expect(await show(sb, 'board', 'sf1')).toContain('board sf1:');
    await inSqliteStore(sb, 'unit', ['sf1/state', 'sf1/journal', 'sf1/backlog', 'sf1/knowledge']);
  });

  it('SF2 [the-record-r2, the-record-r10] the task family: add, update, start, complete, reopen, drop; task show and list read them', async () => {
    const sb = fresh(seeded);
    await must(unit(sb, 'task', 'add', U, 'sq-t1', '--objective=the sqlite task'));
    await must(unit(sb, 'task', 'add', U, 'sq-t2', '--objective=a task to drop'));
    await must(unit(sb, 'task', 'update', U, 'sq-t1', '--desc=the updated description'));
    await must(unit(sb, 'task', 'start', U, 'sq-t1'));
    await must(unit(sb, 'task', 'complete', U, 'sq-t1', '--evidence=the smoke ran'));
    expect(await show(sb, 'task', 'show', U, 'sq-t1')).toContain('STATUS: DONE');
    await must(unit(sb, 'task', 'reopen', U, 'sq-t1'));
    await must(unit(sb, 'task', 'drop', U, 'sq-t2', '--reason=not needed'));
    const t1 = await show(sb, 'task', 'show', U, 'sq-t1');
    expect(t1).toContain('the updated description');
    expect(t1).not.toContain('STATUS: DONE');
    const list = await show(sb, 'task', 'list', U, '--status=all');
    expect(list).toContain('sq-t1');
    expect(list).not.toContain('sq-t2');
    await inSqliteStore(sb, 'unit', [`${U}/backlog`]);
  });

  it('SF3 [the-record-r2, the-record-r10] the journal family: record with a closer; entry show, list, closure, and the fold plan read them', async () => {
    const sb = fresh(seeded);
    const first = `${DATE}-sq-first`;
    expect(await recordAndList(sb, U, first, 'the first sqlite entry')).toEqual({ code: 0, listed: true, residue: [] });
    await must(unit(sb, 'record', U, `--slug=${DATE}-sq-second`, '--what=the second sqlite entry', `--closes=${first} (done: closed by the smoke)`));
    expect(await show(sb, 'entry', 'show', U, first)).toContain('the first sqlite entry');
    expect(await show(sb, 'entry', 'list', U)).toContain(`${DATE}-sq-second`);
    expect(await show(sb, 'entry', 'closure', U, first)).toContain('closed by the smoke');
    await must(unit(sb, 'fold', U));
    await inSqliteStore(sb, 'unit', [`${U}/journal`]);
  });

  it('SF4 [the-record-r2, the-record-r10] the finding family: add, update, supersede, drop; finding show and the active list read them', async () => {
    const sb = fresh(seeded);
    await must(unit(sb, 'finding', 'add', U, 'SQ_OLD', '--summary=the old sqlite finding'));
    await must(unit(sb, 'finding', 'update', U, 'SQ_OLD', '--summary=the updated sqlite finding'));
    await must(unit(sb, 'finding', 'supersede', U, 'SQ_OLD', 'SQ_NEW', '--summary=the new sqlite finding'));
    await must(unit(sb, 'finding', 'add', U, 'SQ_GONE', '--summary=a finding to drop'));
    await must(unit(sb, 'finding', 'drop', U, 'SQ_GONE'));
    expect(await show(sb, 'finding', 'show', U, 'SQ_OLD')).toContain('the updated sqlite finding');
    const active = await show(sb, 'finding', 'list', U, '--active-only');
    expect(active).toContain('SQ_NEW');
    expect(active).not.toContain('SQ_OLD');
    expect(active).not.toContain('SQ_GONE');
    await inSqliteStore(sb, 'unit', [`${U}/knowledge`]);
  });

  it('SF5 [the-record-r2, the-record-r10] the lane family: create from its brief flags, record, report; lane show and resolve read them', async () => {
    const sb = fresh(seeded);
    await must(createLane(sb, U, 'sq-lane', ['--goal=the sqlite recipe']));
    await must(lane(sb, 'record', U, 'sq-lane', '--what=the sqlite lane event'));
    await must(run(sb, ['lane', 'report', U, 'sq-lane'], { input: '# the sqlite report\n\n@claim sq-claim\n  VERDICT: "the sqlite claim"\n' }));
    expect((await must(lane(sb, 'show', U, 'sq-lane', 'recipe'))).stdout).toContain('the sqlite recipe');
    expect((await must(lane(sb, 'show', U, 'sq-lane', 'journal'))).stdout).toContain('the sqlite lane event');
    expect((await must(lane(sb, 'show', U, 'sq-lane', 'report'))).stdout).toContain('the sqlite report');
    expect(await show(sb, 'resolve', U, 'lane#sq-lane/report#sq-claim')).toMatch(/^@claim sq-claim/m);
    await inSqliteStore(sb, 'unit', ['recipe', 'journal', 'report'].map((a) => `${U}/lanes/sq-lane/${a}`));
  });

  it('SF6 [the-record-r2, the-record-r10] the read views: load to its complete page, audit, refresh, resolve, refs and refs-to', async () => {
    const sb = fresh(seeded);
    await must(unit(sb, 'task', 'add', U, 'sq-t6', '--objective=the sqlite view task'));
    await must(unit(sb, 'record', U, `--slug=${DATE}-sq-view`, '--what=the sqlite view entry'));
    await must(unit(sb, 'finding', 'add', U, 'SQ_VIEW', '--summary=the sqlite view finding'));
    await must(unit(sb, 'bootstrap', 'sq-ref', 'the referring unit'));
    await must(unit(sb, 'refs', 'sq-ref', U));
    let pages = '';
    for (let p = 1; p <= 40 && !/load complete/i.test(pages); p++) pages += (await must(unit(sb, 'load', U, String(p)))).stdout;
    expect(pages).toMatch(/load complete/i);
    expect(pages).toContain('the sqlite view task');
    await must(unit(sb, 'audit', U));
    await must(unit(sb, 'refresh', U));
    for (const [ref, text] of [['task#sq-t6', 'the sqlite view task'], [`entry#${DATE}-sq-view`, 'the sqlite view entry'], ['finding#SQ_VIEW', 'the sqlite view finding']]) {
      expect(await show(sb, 'resolve', U, ref)).toContain(text);
    }
    expect(await show(sb, 'refs-to', U)).toContain('sq-ref');
    await inSqliteStore(sb, 'unit', [`${U}/state`, 'sq-ref/state']);
  });

  it('SF7 [the-record-r2, the-record-r10, the-record-r13, plugins-r8] search: exact, hybrid, and trigram each find the written task', async () => {
    const sb = fresh(seeded);
    await must(unit(sb, 'task', 'add', U, 'sq-t7', '--objective=the sqlite search task'));
    for (const [mode, query] of [['exact', 'sqlite search task'], ['hybrid', 'sqlite search task'], ['trigram', 'sqlite']]) {
      expect(await show(sb, 'search', U, query, `--mode=${mode}`), mode).toContain('task sq-t7');
    }
    await inSqliteStore(sb, 'unit', [`${U}/backlog`]);
  });

  it('SF8 [the-record-r2, the-record-r10, the-engine-r19, the-engine-r24, plugins-r8] the descriptor: diagnose names fts5 with a healthy store, and the resolver answers the same card', async () => {
    const sb = fresh(seeded);
    const d = JSON.parse(await show(sb, 'diagnose', '--json'));
    expect(d.driver.name).toBe('fts5');
    expect([d.storage.health, d.storage.store]).toEqual(['ok', 'present']);
    expect(d.driver.descriptor.search_modes).toEqual(['exact', 'hybrid', 'trigram']);
    const cap = await exec('.contexture/storage/scripts/driver-resolver', ['capability'], { cwd: sb });
    expect(cap.code, cap.stderr).toBe(0);
    expect(JSON.parse(cap.stdout)).toEqual(d.driver.descriptor);
    await inSqliteStore(sb, 'unit', [`${U}/state`]);
  });

  it('SF9 [the-engine-r15, plugins-r8] the module store: the worked notes module puts, shows, and lists its notes in the database, never in a notes folder', async () => {
    const sb = sqliteStage('sf9');
    const pkg = join(sb, 'catalog/worked-package');
    cpSync(join(ROOT, 'tests/fixtures/worked-package'), pkg, { recursive: true });
    const installed = await install(sb, pkg);
    expect(installed.code, installed.stderr).toBe(0);
    await must(run(sb, ['notes', 'put', 'demo/first'], { input: 'the first sqlite note\n' }));
    expect((await must(run(sb, ['notes', 'show', 'demo/first']))).stdout).toBe('the first sqlite note\n');
    const keys = (await must(run(sb, ['notes', 'keys']))).stdout;
    expect(keys).toContain('"demo/first"');
    expect(keys).toContain('"welcome/readme"');
    await inSqliteStore(sb, 'notes', ['demo/first', 'welcome/readme']);
  });
});
