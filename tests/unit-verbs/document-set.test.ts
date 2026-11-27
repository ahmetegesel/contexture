import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, RECORD_ROOT } from '../support/drawer';
import { exec } from '../support/exec';
import { fresh, seed } from '../support/snapshot';
import { createLane, lane, must, seedUnit, unit } from '../support/unit';

// the unit declaration's document set: the seven unsearched lines that replaced the eleven
// document rules name the same documents, so the leftovers probe and the sweep read a
// planted record alike under both, and a declaration naming the state alone does not

const HEAD = `root: ${RECORD_ROOT}\nfallback_root: ${FALLBACK_ROOT}\nsuffix: .md\nkey: <unit>/<path...>\n`;
const RULES = [
  'search: documents',
  'document: <unit>/backlog backlog session -',
  'document: <unit>/backlog backlog task @task',
  'document: <unit>/knowledge knowledge session -',
  'document: <unit>/knowledge knowledge finding @finding',
  'document: <unit>/journal journal session -',
  'document: <unit>/journal journal entry @entry',
  'document: <unit>/journal journal session @anchor',
  'document: <unit>/lanes/<lane>/recipe lane_recipe lane -',
  'document: <unit>/lanes/<lane>/journal lane_journal lane -',
  'document: <unit>/lanes/<lane>/journal lane_journal lane_entry @entry',
  'document: <unit>/lanes/<lane>/report lane_report lane -',
  'unsearched: <unit>/state',
].join('\n');
const RULES_DECLARATION = `${HEAD}${RULES}\n`;
const STATE_ONLY = `${HEAD}unsearched: <unit>/state\n`;

const declare = (sb: string, text: string) => writeFileSync(join(sb, '.contexture/modules/unit/data'), text);
const probe = (sb: string) => exec(join(sb, '.contexture/storage/scripts/driver-resolver'), ['storage.leftovers', 'unit'], { cwd: sb, env: { CTX_ROOT: sb } });

async function reads(sb: string): Promise<[string, string]> {
  const lo = await probe(sb);
  expect([lo.code, lo.stderr]).toEqual([0, '']);
  const dry = await unit(sb, 'migrate', '--sweep', '--dry-run', '--all');
  expect([dry.code, dry.stderr]).toEqual([0, '']);
  return [lo.stdout, dry.stdout];
}

describe('the unit declaration\'s document set', () => {
  let snap: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      await seedUnit(sb, 'ds-a', 'the document set unit with a lane');
      await must(unit(sb, 'task', 'add', 'ds-a', 't1', '--objective=the document set task'));
      await must(unit(sb, 'record', 'ds-a', '--what=a document set entry'));
      await must(unit(sb, 'finding', 'add', 'ds-a', 'DS_FINDING', '--summary=a document set finding', '--ref=unit#ds-a/task/t1'));
      await must(createLane(sb, 'ds-a', 'l1'));
      await must(lane(sb, 'record', 'ds-a', 'l1', '--what=a document set lane event'));
      await must(lane(sb, 'report', 'ds-a', 'l1', '--body=@report l1\nVERDICT :: done\n'));
      await seedUnit(sb, 'ds-b', 'the plain unit');
      const stray = join(sb, RECORD_ROOT, 'ds-a/lanes/l1/scratch.md');
      mkdirSync(dirname(stray), { recursive: true });
      writeFileSync(stray, 'lane scratch\n');
    }, 'posix', 'document-set');
  });

  it('[the-record-r-swp02, the-engine-r-lf7vr] the seven unsearched lines read the same leftovers counts and the same sweep dry run as the eleven document rules, a stray key outside them both', async () => {
    const sb = fresh(snap);
    const shipped = await reads(sb);
    declare(sb, RULES_DECLARATION);
    const rules = await reads(sb);
    expect(shipped).toEqual(rules);
    const root = JSON.parse(shipped[0]).root;
    expect([root.documents, root.kinds.outside_keys.count]).toEqual([root.keys - 1, 1]);
    expect(shipped[1]).toContain('unit ds-a: keys outside the document rules 1');
    expect(shipped[1]).toContain('unit ds-b: nothing beyond the documents');
  });

  it('[the-record-r-swp02] null check: a declaration naming the state alone reads every other artifact as a key outside it', async () => {
    const sb = fresh(snap);
    const shipped = await reads(sb);
    declare(sb, STATE_ONLY);
    const stateOnly = await reads(sb);
    expect(stateOnly).not.toEqual(shipped);
    const [was, now] = [JSON.parse(shipped[0]).root, JSON.parse(stateOnly[0]).root];
    expect(now.documents).toBe(2);
    expect(now.kinds.outside_keys.count).toBe(was.documents - 2 + 1);
  });
});
