import { cpSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, leaks, RECORD_ROOT } from '../support/drawer';
import type { Run } from '../support/exec';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { lane, laneFlags, run } from '../support/unit';

const D = '2026-09-27';
const REPO = 'census-repo';
const REPORT = ['@report cl', 'VERDICT: done', '', 'FINDINGS ::', '  F1 the census finding', '', 'OPEN ::', '  none', ''].join('\n');
const MODULES = ['unit', 'lane', 'rhythm'];
const REQUIRED_FLOOR = 43;

interface Row {
  key: string;
  code: number;
  out: string;
}

type Tables = Map<string, Map<string, string[]>>;

function staged(label: string): string {
  const sb = stage('posix', label);
  for (const p of readPlugins()) cpSync(join(p, '.contexture'), join(sb, '.contexture'), { recursive: true });
  return sb;
}

function readPlugins(): string[] {
  return readdirSync(join(ROOT, 'plugins')).sort().map((n) => join(ROOT, 'plugins', n)).filter((p) => existsSync(join(p, '.contexture')));
}

function toFallback(sb: string, slug: string): void {
  mkdirSync(join(sb, FALLBACK_ROOT), { recursive: true });
  renameSync(join(sb, RECORD_ROOT, slug), join(sb, FALLBACK_ROOT, slug));
}

const hitsOf = (rows: readonly Row[]): string[] => rows.flatMap((r) => r.out.split('\n').filter(leaks).map((l) => `${r.key}: ${l}`));

const listed = (help: string): [string, string][] =>
  ((help.split(/^verbs:$/m)[1] ?? '').split(/\n\n/)[0] ?? '')
    .split('\n')
    .filter((l) => /^ {2}[a-z]/.test(l))
    .map((l) => {
      const m = /^ {2}(\S+) +(.*)$/.exec(l);
      return [m?.[1] ?? '', m?.[2] ?? ''];
    });

async function readTables(sb: string): Promise<Tables> {
  const tables: Tables = new Map();
  for (const module of MODULES) {
    const verbs = new Map<string, string[]>();
    for (const [verb, summary] of listed((await run(sb, [module, 'help'])).stdout)) verbs.set(verb, /\(([a-z, ]+)\)$/.exec(summary)?.[1]?.split(/, */) ?? []);
    tables.set(module, verbs);
  }
  return tables;
}

const required = (tables: Tables): string[] =>
  [...tables].flatMap(([module, verbs]) => [...verbs].flatMap(([verb, subs]) => (subs.length ? subs.map((s) => `${module} ${verb} ${s}`) : [`${module} ${verb}`])));

function keyOf(tables: Tables, argv: readonly string[]): string {
  const [module = '', verb = ''] = argv;
  const subs = tables.get(module)?.get(verb) ?? [];
  const sub = argv.slice(2).find((a) => subs.includes(a));
  return [module, verb, ...(sub ? [sub] : [])].join(' ');
}

describe('the verb output census: no unit, lane, or rhythm verb prints the record storage', () => {
  let rows: Row[];
  let sb: string;
  let tables: Tables;

  beforeAll(async () => {
    sb = staged('verb-output');
    tables = await readTables(sb);
    rows = [];
    const push = (argv: readonly string[], done: Run): void => void rows.push({ key: keyOf(tables, argv), code: done.code, out: done.stdout + done.stderr });
    const take = async (argv: string[], input = ''): Promise<Run> => {
      const done = await run(sb, argv, { input });
      push(argv, done);
      return done;
    };
    const u = (...args: string[]): Promise<Run> => take(['unit', ...args]);
    const U = (...args: string[]): string[] => ['unit', ...args];
    const together = async (argvs: readonly string[][]): Promise<Run[]> => {
      const done = await Promise.all(argvs.map((argv) => run(sb, argv)));
      argvs.forEach((argv, i) => push(argv, done[i]!));
      return done;
    };

    await u('bootstrap', 'cu', 'the census unit', REPO);
    await u('bootstrap', 'lg', 'the legacy unit', REPO);
    await u('bootstrap', 'lh', 'the unit nobody writes', 'other-repo');
    await u('task', 'add', 'lg', 'lg-task', '--objective=the legacy task');
    await u('record', 'lg', '--what=the legacy entry', `--slug=${D}-lg-e1`);
    toFallback(sb, 'lg');
    toFallback(sb, 'lh');
    await u('load', 'lg');
    await u('board', 'lg');
    await u('audit', 'lg');
    await u('list');
    await u('list', '--all');
    await u('resolve', 'lg', 'task#lg-task');
    await u('resolve', 'lg', `entry#${D}-lg-e1`);
    await u('record', 'lg', '--what=the first landing write moves the unit', `--slug=${D}-lg-e2`);

    await u('record', 'cu', '--what=the first census entry', `--slug=${D}-cu-e1`, '--thread=the census reader');
    await u('record', 'cu', '--what=a stamped census entry', `--slug=${D}-cu-e2`, '--rhythm=debug 1 REPRODUCE', `--ref=journal#${D}-cu-e1`);
    await u('record', 'cu', '--what=the census reader answered', `--slug=${D}-cu-e3`, `--closes=${D}-cu-e1 (done: answered)`);
    await u('stamp', 'cu');
    for (const t of ['t1', 't2', 't3']) await u('task', 'add', 'cu', t, `--objective=the census task ${t}`, '--refs=lane#cl/report#FINDINGS');
    await u('task', 'update', 'cu', 't1', '--desc=the census description', '--criteria=the census criterion');
    await u('task', 'start', 'cu', 't1');
    await u('task', 'complete', 'cu', 't1', '--evidence=the census evidence');
    await u('task', 'reopen', 'cu', 't1');
    await u('task', 'start', 'cu', 't2');
    await u('task', 'drop', 'cu', 't3', '--reason=the census drop');
    await u('finding', 'add', 'cu', 'F_ONE', '--summary=the census finding', `--ref=journal#${D}-cu-e1`);
    await u('finding', 'update', 'cu', 'F_ONE', '--summary=the census finding, updated');
    await u('finding', 'supersede', 'cu', 'F_ONE', 'F_TWO', '--summary=the census successor', '--ref=lane#cl/report#FINDINGS');
    await u('finding', 'add', 'cu', 'F_DROP', '--summary=the finding to drop');
    await u('finding', 'drop', 'cu', 'F_DROP');
    await take(['lane', 'create', 'cu', 'cl', ...laneFlags(['--ref=lane#cl/report#FINDINGS', '--task=backlog#t1', '--rhythm=debug 2 TRACE'])]);
    await take(['lane', 'record', 'cu', 'cl', '--what=the census lane event', `--slug=${D}-cl-l1`, '--ref=backlog#t1']);
    await take(['lane', 'report', 'cu', 'cl'], REPORT);
    await u('refs', 'cu', 'lg');

    const [first, listing] = await together([U('load', 'cu'), ['rhythm', 'list']]);
    const pages = Number(/(\d+) pages?/.exec(first!.stdout)?.[1] ?? '1');
    const names = listing!.stdout.split('\n').filter((l) => / \| /.test(l)).map((l) => l.split(' | ')[0] ?? '');
    const refs = [
      'task#t1',
      'backlog#t1',
      'finding#F_TWO',
      'knowledge#F_TWO',
      `entry#${D}-cu-e2`,
      `journal#${D}-cu-e2`,
      'lane#cl/recipe',
      'lane#cl/journal',
      'lane#cl/report',
      'lane#cl/report#FINDINGS',
      'lanes/cl/report',
      'lanes/cl/report#FINDINGS',
      'unit#cu/task/t1',
      `unit#cu/entry/${D}-cu-e2`,
      'unit#cu/finding/F_TWO',
      'unit#cu/lane/cl/report',
    ];
    await together([
      U('task', 'list', 'cu', '--status=all'),
      U('task', 'show', 'cu', 't1'),
      U('finding', 'show', 'cu', 'F_TWO'),
      U('finding', 'list', 'cu'),
      U('entry', 'show', 'cu', `${D}-cu-e2`),
      U('entry', 'list', 'cu'),
      U('entry', 'closure', 'cu', `${D}-cu-e1`),
      ['lane', 'report', 'cu', 'cl'],
      ...['recipe', 'journal', 'report'].map((a) => ['lane', 'show', 'cu', 'cl', a]),
      ...Array.from({ length: pages - 1 }, (_v, i) => U('load', 'cu', String(i + 2))),
      U('board', 'cu'),
      ...[[], ['--active'], ['--all'], [`--repo=${REPO}`], ['--active', `--repo=${REPO}`], ['--all', `--repo=${REPO}`]].map((flags) => U('list', ...flags)),
      U('audit', 'cu'),
      U('refresh', 'cu'),
      ...refs.flatMap((ref) => [U('resolve', 'cu', ref), U('resolve', 'cu', ref, '--json')]),
      U('refs-to', 'lg'),
      U('search', 'cu', 'census', '--mode=exact'),
      ...names.map((n) => ['rhythm', 'show', n]),
      ['rhythm', 'current', 'cu'],
    ]);

    await u('diagnose');
    await u('migrate', '--all');
    const plan = await u('fold', 'cu');
    await u('fold', 'cu');
    const foldLane = /--lane=([A-Za-z0-9_-]+)/.exec(plan.stdout)?.[1] ?? '';
    await u('fold', 'cu', `--lane=${foldLane}`);
    await u('close', 'cu');
    await u('reopen', 'cu');
  }, 300_000);

  it('[the-record-r14] every verb and sub-verb the unit, lane, and rhythm help tables list has a row keyed from the argv it ran, above the table floor, so a new verb without one reads red', () => {
    const want = required(tables);
    expect(want.length).toBeGreaterThanOrEqual(REQUIRED_FLOOR);
    for (const module of MODULES) expect(want.some((k) => k.startsWith(`${module} `))).toBe(true);
    const keys = new Set(rows.map((r) => r.key));
    expect(want.filter((k) => !keys.has(k))).toEqual([]);
    expect(rows.filter((r) => r.key === 'unit fold').length).toBe(3);
    expect(keyOf(tables, ['lane', 'show', 'cu', 'cl', 'journal'])).toBe('lane show journal');
    expect(keyOf(tables, ['unit', 'task', 'add', 'cu', 't1'])).toBe('unit task add');
  });

  it('[the-record-r14, the-record-r-4gj4k] every row answers rc 0, the legacy unit read before its first landing write, the store swept after', () => {
    expect(rows.filter((r) => r.code !== 0).map((r) => `${r.key}: rc ${r.code}: ${r.out.split('\n')[0]}`)).toEqual([]);
    expect(rows.filter((r) => r.out.includes('WARNING: the record was read from its deprecated root')).length).toBeGreaterThanOrEqual(5);
    expect(rows.find((r) => r.key === 'unit migrate')?.out).toBe('migrated: 1\n');
    expect(rows.length).toBeGreaterThan(90);
  });

  it('[the-record-r14] no row prints a record root, the database, the lock layout, a lane artifact path, an artifact file name, or a module implementation path', () => {
    expect(hitsOf(rows)).toEqual([]);
  });

  it('[the-record-r14, the-record-r16] a lane report holding a planted record path, read back through ctx lane show, leaves exactly one remainder', async () => {
    const s = sb;
    const planted = `the record sits in ${RECORD_ROOT}/cu`;
    expect((await run(s, ['lane', 'report', 'cu', 'cl'], { input: `@report cl\nVERDICT: planted\nNOTE ::\n  ${planted}\n` })).code).toBe(0);
    const shown = await lane(s, 'show', 'cu', 'cl', 'report');
    expect(hitsOf([{ key: 'lane show report', code: shown.code, out: shown.stdout + shown.stderr }])).toEqual([`lane show report:   ${planted}`]);
  });
});
