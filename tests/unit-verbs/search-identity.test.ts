import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { DATE, mk, ok, plantUnit, rec } from '../support/record';
import { ROOT } from '../support/root';
import { fresh, seed } from '../support/snapshot';
import { run } from '../support/unit';
import { answer, payload } from '../support/wire';

const WRITE = process.env.COMPLIANCE_WRITE_GOLDENS === '1';
const GOLDEN = join(ROOT, 'tests/unit-verbs/search-identity.golden.json');
const PLANTED = ['legacy-u', 'tc57-u', 'tc63-dangling', 'tc63-done', 'tc64-u', 'tc73-u'];

const QUERIES: [string, string][] = [
  ['common', 'the'],
  ['rare', 'çalışma'],
  ['backslash', 'backslash'],
  ['finding', 'LEGACY_CANON'],
  ['successor', 'SEARCH_V2'],
  ['entry-slug', '2026-09-20-legacy-one'],
  ['task-slug', 'canon-task'],
  ['field', 'STATUS'],
  ['zero', 'zz-no-such-needle'],
];

const FORMS: [string, string[], Record<string, string>?][] = [
  ['default', []],
  ['all', ['--all']],
  ['unit', ['--unit=legacy-u']],
  ['closed', ['--unit=search-closed']],
  ['finding', ['--type=finding']],
  ['lane', ['--type=lane', '--all']],
  ['lane-entry', ['--type=lane_entry', '--all']],
  ['limit', ['--type=entry', '--limit=3', '--all']],
  ['fanout', ['--all', '--limit=50'], { CTX_SEARCH_FANOUT: '1' }],
];

async function searchUnits(sb: string): Promise<void> {
  for (const u of PLANTED) plantUnit(sb, u);
  answer(await mk(sb, 'search-verbs', 'the search identity unit'), 'session.create');
  await ok(sb, 'session.refs', ['search-verbs']);
  const canon = payload()
    .kv('objective', 'the canon task of the verb unit')
    .kl('refs', 'journal#2026-09-27-search-one', 'knowledge#SEARCH_V1')
    .kv('desc', 'first description line\n\nthird line after an empty one')
    .kv('criteria', 'one criterion, STATUS named in prose')
    .kv('details', 'detail one\ndetail two');
  await ok(sb, 'task.add', ['search-verbs', 'canon-task'], canon);
  await ok(sb, 'task.add', ['search-verbs', 'done-task'], payload().kv('objective', 'completed in the walk'));
  await ok(sb, 'task.complete', ['search-verbs', 'done-task'], payload().kv('evidence', 'the walk verified it').kv('date', DATE));
  await ok(sb, 'task.add', ['search-verbs', 'active-task'], payload().kv('objective', 'started in the walk'));
  await ok(sb, 'task.start', ['search-verbs', 'active-task']);
  await ok(sb, 'finding.add', ['search-verbs', 'SEARCH_V1'], payload().kv('summary', 'the first reading\nover two lines').kl('refs', 'journal#2026-09-27-search-one'));
  await ok(sb, 'finding.supersede', ['search-verbs', 'SEARCH_V1', 'SEARCH_V2'], payload().kv('summary', 'the newer reading').kv('reason', 'replaced by the walk'));
  const first = payload().kv('slug', '2026-09-27-search-one').kv('group', 'search-group').kv('knowledge', 'true').kl('refs', 'task#canon-task', 'lanes/search-lane/report');
  answer(await rec(sb, 'search-verbs', 1790000861, 'the first entry names the canon-task', { thread: 'the human', with: first }), 'entry.record');
  answer(await rec(sb, 'search-verbs', 1790000862, 'the second entry, a backslash \\ kept', { with: payload().kv('slug', '2026-09-27-search-two') }), 'entry.record');
  await ok(sb, 'session.stamp', ['search-verbs'], payload().kv('date', DATE));
  const folds = payload().kv('slug', '2026-09-27-search-three').kv('closers.count', '1').kcl(1, 'CLOSES', 'done', 'the walk closed it', '2026-09-27-search-two');
  answer(await rec(sb, 'search-verbs', 1790000863, 'closes the second entry', { with: folds }), 'entry.record');
  await ok(sb, 'lane.create', ['search-verbs', 'search-lane'], '# recipe grammar, the comment never matches\nMISSION\n  GOAL: "walk the search, the canon-task first"\n');
  const step = payload().kv('what', 'a lane step over the canon-task').kv('thread', 'none').kv('slug', '2026-09-27-search-lane-one').kv('date', DATE).kv('epoch', '1790000864');
  await ok(sb, 'lane.record', ['search-verbs', 'search-lane'], step);
  await ok(sb, 'lane.write_report', ['search-verbs', 'search-lane'], '@report search-lane\nVERDICT :: the walk landed, a \\ backslash and a "quote"\n');
  await ok(sb, 'lane.create', ['search-verbs', 'quiet-lane'], '# a quiet lane\n');
  answer(await mk(sb, 'search-closed', 'the closed unit of the search identity'), 'session.create');
  await ok(sb, 'session.refs', ['search-closed']);
  await ok(sb, 'task.add', ['search-closed', 'canon-task'], payload().kv('objective', 'the canon task of a closed unit'));
  await ok(sb, 'finding.add', ['search-closed', 'CLOSED_FINDING'], payload().kv('summary', 'the closed reading of LEGACY_CANON'));
  await ok(sb, 'session.close', ['search-closed']);
}

type Answer = { code: number; stdout: string; stderr: string };

describe.concurrent('ctx unit search byte identity over the fixtures (posix)', () => {
  let sb0: string;
  const golden: Record<string, Answer> = !WRITE && existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : {};
  const written: Record<string, Answer> = {};
  beforeAll(async () => {
    sb0 = await seed(searchUnits, 'posix', 'search-identity');
  });

  for (const [qname, query] of QUERIES) {
    it(`[the-record-r13] the ${qname} query answers byte for byte as pinned, in every form, text and --json`, async () => {
      const sb = fresh(sb0);
      const cases = FORMS.flatMap(([fname, flags, env]) =>
        [false, true].map((json) => ({ name: `${qname}/${fname}/${json ? 'json' : 'text'}`, args: ['unit', 'search', query, ...flags, ...(json ? ['--json'] : [])], env })),
      );
      for (const c of cases) {
        const r = await run(sb, c.args, { env: c.env });
        const got: Answer = { code: r.code, stdout: r.stdout, stderr: r.stderr };
        if (WRITE) written[c.name] = got;
        else expect(got, c.name).toEqual(golden[c.name]);
      }
      if (WRITE) {
        const merged = { ...(existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : {}), ...written };
        writeFileSync(GOLDEN, `${JSON.stringify(Object.fromEntries(Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : 1))), null, 1)}\n`);
      }
    });
  }

  it('[the-record-r13] null check: the pinned set holds rows in every form, every query, and a closed label, so a changed answer reads red', () => {
    if (WRITE) return;
    const names = Object.keys(golden);
    expect(names.length).toBe(QUERIES.length * FORMS.length * 2);
    const total = (a: Answer) => (a.code === 0 && a.stdout.startsWith('{') ? JSON.parse(a.stdout).total : 0);
    for (const [fname] of FORMS) expect(QUERIES.some(([q]) => total(golden[`${q}/${fname}/json`]!) > 0), fname).toBe(true);
    for (const [q] of QUERIES.filter(([n]) => n !== 'zero')) expect(FORMS.some(([f]) => total(golden[`${q}/${f}/json`]!) > 0), q).toBe(true);
    expect(golden['zero/all/json']!.stdout).toBe('{"query":"zz-no-such-needle","mode":"exact","total":0,"rows":[]}\n');
    expect(golden['finding/closed/json']!.stdout).toContain('"label":"closed"');
  });
});
