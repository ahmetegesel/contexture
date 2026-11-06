import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineCall, renderView } from '../support/engine';
import { COMPLIANCE } from '../support/record';
import { sandbox } from '../support/sandbox';
import { fresh } from '../support/snapshot';
import { verbBuilt, VU, WRITE_GOLDENS } from './goldens';

const golden = (name: string): string => readFileSync(join(COMPLIANCE, 'golden/verb-u', `${name}.json`), 'utf8');
const fromEngine = (fn: string, ...args: string[]) => async (): Promise<string> => (await engineCall(fresh(await verbBuilt(VU)), fn, args)).stdout;
const literal = (text: string) => async (): Promise<string> => `${text}\n`;

interface View {
  name: string;
  view: string;
  input: () => Promise<string>;
  env?: Record<string, string>;
  rc?: number;
}

const VIEWS: View[] = [
  { name: 'board', view: 'board', input: async () => golden('session.board') },
  { name: 'task_show', view: 'task_show', input: async () => golden('task.get.canon-task') },
  { name: 'task_list', view: 'task_list', input: async () => golden('task.list.all') },
  { name: 'entry_show', view: 'entry_show', input: async () => golden('entry.get.2026-09-27-verb-one') },
  { name: 'entry_list', view: 'entry_list', input: async () => golden('entry.list') },
  { name: 'closure', view: 'closure', input: async () => golden('entry.closure.2026-09-27-verb-two') },
  { name: 'finding_show', view: 'finding_show', input: async () => golden('finding.get.VERB_NEW') },
  { name: 'finding_list', view: 'finding_list', input: async () => golden('finding.list.all') },
  { name: 'lane_journal', view: 'lane_journal', input: async () => golden('lane.get.verb-lane.journal') },
  { name: 'lane_doc', view: 'lane_doc', input: async () => golden('lane.get.verb-lane.report') },
  { name: 'units', view: 'units', input: fromEngine('session.units', 'alpha') },
  { name: 'active', view: 'active', input: fromEngine('session.active') },
  { name: 'refs_to', view: 'refs_to', input: literal('{"unit":"tc67-c","referrers":["tc67-a","tc67-b"]}') },
  {
    name: 'audit-clean',
    view: 'audit',
    input: literal('{"unit":"tc63-clean","clean":true,"findings":[],"open_threads":[{"slug":"2026-09-20-open","thread":"lane review report","line":11}]}'),
  },
  {
    name: 'audit-dirty',
    view: 'audit',
    rc: 1,
    input: literal(
      '{"unit":"tc64-u","clean":false,"findings":[{"code":"DATELESS_SLUG","severity":"error","slug":"legacy-dateless","line":3,"detail":null,"first_line":null,"occurrence":null},{"code":"INLINE_MARKER","severity":"error","slug":"2026-09-20-inline","line":7,"detail":null,"first_line":null,"occurrence":null},{"code":"BRACKETED_FIELD","severity":"error","slug":"2026-09-20-bracketed","line":14,"detail":"[THREAD: none]","first_line":null,"occurrence":null},{"code":"SLUGLESS_CLOSER","severity":"error","slug":"2026-09-20-slugless","line":19,"detail":null,"first_line":null,"occurrence":null}],"open_threads":[]}',
    ),
  },
  {
    name: 'search',
    view: 'search',
    env: { RV_UNIT: 'compliance-tasks', RV_QUERY: 'architectural' },
    input: literal(
      '{"unit":"compliance-tasks","query":"architectural","mode":"exact","total_matches":1,"results":[{"entity_type":"finding","entity_id":"FINDING_ALPHA","section":"knowledge","snippet":"Alpha architectural decision summary","score":0}]}',
    ),
  },
];

const expected = (name: string): string => join(COMPLIANCE, 'views', `${name}.txt`);

describe.concurrent('the text views (json.awk into render.awk) over canonical answers', () => {
  for (const v of VIEWS) {
    it(`${v.name} [the-engine-r16]: the ${v.view} view prints its expected text`, async () => {
      const r = await renderView(sandbox('views'), v.view, await v.input(), v.env);
      expect([r.code, r.stderr]).toEqual([v.rc ?? 0, '']);
      expect(r.stdout.length).toBeGreaterThan(0);
      if (WRITE_GOLDENS) {
        mkdirSync(join(COMPLIANCE, 'views'), { recursive: true });
        writeFileSync(expected(v.name), r.stdout);
      } else expect(r.stdout).toBe(readFileSync(expected(v.name), 'utf8'));
    });
  }

  it('[the-engine-r16] null check: one changed answer value changes the board text', async () => {
    const changed = golden('session.board').replace('"the first verb entry"', '"a planted entry"');
    expect(changed).not.toBe(golden('session.board'));
    const r = await renderView(sandbox('views'), 'board', changed);
    expect(r.code).toBe(0);
    expect(r.stdout).not.toBe(readFileSync(expected('board'), 'utf8'));
  });
});
