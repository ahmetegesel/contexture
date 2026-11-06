import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { UNIT_LIB } from '../support/engine';
import { exec } from '../support/exec';
import { COMPLIANCE, ok } from '../support/record';
import { sandbox } from '../support/sandbox';
import { shFunction } from '../support/sh';
import { fts5Available, stage } from '../support/stage';
import { answer, answerLine, payload, refused } from '../support/wire';
import { WRITE_GOLDENS } from './goldens';

const CANNED = join(COMPLIANCE, 'ranked/needle.hybrid.json');
const MAPPED = ['canon.awk', 'model.awk', 'ranked.awk'].flatMap((p) => ['-f', join(UNIT_LIB, p)]);

async function seedNeedles(sb: string): Promise<void> {
  for (const u of ['u1', 'u2']) await ok(sb, 'session.create', [u], payload().kv('objective', `unit ${u} needle`).kv('attention', 't').kl('repos'));
  await ok(sb, 'task.add', ['u1', 't1'], payload().kv('objective', 'a needle in the first task').kl('refs'));
  await ok(sb, 'lane.create', ['u1', 'l1'], '# a needle lane recipe\n');
  await ok(sb, 'lane.record', ['u1', 'l1'], payload().kv('what', 'a needle lane entry').kv('thread', 'none').kv('slug', 'lane-needle').kl('refs'));
  await ok(sb, 'lane.write_report', ['u1', 'l1'], 'a needle lane report\n');
}

async function ranked(env: Record<string, string>): Promise<any> {
  const cwd = sandbox('ranked');
  const flat = await exec('awk', ['-f', join(UNIT_LIB, 'store-json.awk')], { cwd, input: readFileSync(CANNED) });
  expect(flat.code, flat.stderr).toBe(0);
  const mapped = await exec('awk', MAPPED, { cwd, input: flat.stdout, env: { RQ_UNIT: 'u1', RQ_QUERY: 'needle', RQ_MODE: 'hybrid', RQ_LIMIT: '20', RQ_ENTITY: 'all', ...env } });
  return answer(mapped, 'ranked.awk');
}

type Row = { entity_type: string; entity_id: string; section: string };
const identities = (results: Row[]): string[] => results.map((r) => `${r.entity_type} ${r.entity_id} ${r.section}`);

describe.concurrent('the ranked search mapping (ranked.awk) over a canned fts5 store answer', () => {
  it.runIf(WRITE_GOLDENS && fts5Available())('captures the fts5 store.search answer of the needle units (the golden switch only)', async () => {
    const sb = stage('fts5', 'ranked-capture');
    await seedNeedles(sb);
    const r = await shFunction(sb, join(sb, '.contexture/storage/scripts/library'), 'store_search', ['unit', 'needle', 'hybrid', '0'], {
      env: { CTX_STORE_ROOT: sb, CTX_STORE_RESOLVER: join(sb, '.contexture/storage/scripts/driver-resolver') },
    });
    answer(r, 'store.search');
    mkdirSync(join(COMPLIANCE, 'ranked'), { recursive: true });
    writeFileSync(CANNED, r.bytes);
  });

  it('UD-11 [the-record-r13]: maps the store identities to the record ids of one unit in rank order, keeping the mode', async () => {
    const a = await ranked({});
    expect(a.mode).toBe('hybrid');
    const ids = identities(a.results);
    for (const want of ['session u1 state', 'task t1 backlog', 'lane l1 lane_recipe', 'lane l1 lane_report', 'lane_entry l1/lane-needle lane_journal']) expect(ids).toContain(want);
    expect(ids.some((id) => id.includes('u2'))).toBe(false);
    expect(a.results.length).toBe(a.total_matches);
  });

  it('UD-11 [the-record-r13]: --entity keeps one entity type and the limit caps after the complete walk', async () => {
    const all = await ranked({});
    const lanes = await ranked({ RQ_ENTITY: 'lane' });
    expect(identities(lanes.results)).toEqual(identities(all.results).filter((id) => id.startsWith('lane ')));
    const one = await ranked({ RQ_LIMIT: '1' });
    expect([one.results.length, one.total_matches, identities(one.results)]).toEqual([1, all.total_matches, identities(all.results).slice(0, 1)]);
  });

  it('UD-11 [the-record-r13]: the posix data script refuses a ranked mode naming the declared modes', async () => {
    const sb = stage('posix', 'ranked-posix');
    await seedNeedles(sb);
    refused(await data(sb, 'search.query', ['u1', '--mode=hybrid'], payload().kv('query', 'needle').toString()), 'search.query', 1, 'ERR_CAPABILITY_UNSUPPORTED', "mode 'hybrid' is not supported; declared modes: exact");
    expect(answerLine(await data(sb, 'search.query', ['u1', '--mode=exact', '--entity=finding'], payload().kv('query', 'needle').toString()), 'search.query')).toContain('"total_matches":0,"results":[]');
  });
});
