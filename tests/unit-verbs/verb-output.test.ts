import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, leaks, namespaceLock, RECORD_ROOT, unitLock } from '../support/drawer';
import type { Run } from '../support/exec';
import { holdLock, sleepShim } from '../support/locks';
import { ROOT_USER } from '../support/plants';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { lane, laneFlags, must, run } from '../support/unit';

const D = '2026-09-27';
const REPO = 'census-repo';
const REPORT = ['@report cl', 'VERDICT: done', '', 'FINDINGS ::', '  F1 the census finding', '', 'OPEN ::', '  none', ''].join('\n');
const MODULES = ['unit', 'lane', 'rhythm', 'store'];
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

const listed = (help: string, head: string): string[] =>
  ((help.split(new RegExp(`^${head}:$`, 'm'))[1] ?? '').split(/\n\n/)[0] ?? '')
    .split('\n')
    .filter((l) => /^ {2}[a-z]/.test(l))
    .map((l) => l.trim().split(/ +/)[0]!);

async function readTables(sb: string): Promise<Tables> {
  const tables: Tables = new Map();
  for (const module of MODULES) {
    const verbs = new Map<string, string[]>();
    for (const verb of listed((await run(sb, [module, 'help'])).stdout, 'verbs')) verbs.set(verb, listed((await run(sb, [module, 'help', verb])).stdout, 'subcommands'));
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

describe('the verb output census: no unit, lane, rhythm, or store verb prints the record storage', () => {
  let rows: Row[];
  let refusals: Row[];
  let sb: string;
  let tables: Tables;

  beforeAll(async () => {
    sb = staged('verb-output');
    const rb = staged('verb-output-refusals');
    tables = await readTables(sb);
    rows = [];
    refusals = [];
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

    const refuse = async (): Promise<void> => {
      const keep = (why: string, argv: readonly string[], done: Run): void => void refusals.push({ key: `${keyOf(tables, argv)} (${why})`, code: done.code, out: done.stdout + done.stderr });
      const R = (why: string, argv: string[], env?: Record<string, string>): Promise<void> => run(rb, argv, { env }).then((done) => keep(why, argv, done));
      await must(run(rb, U('bootstrap', 'ru', 'the refusal unit')));
      await must(run(rb, U('bootstrap', 'rl', 'the unit in both roots')));
      await must(run(rb, ['lane', 'create', 'ru', 'rk', ...laneFlags()]));
      toFallback(rb, 'rl');
      cpSync(join(rb, FALLBACK_ROOT, 'rl'), join(rb, RECORD_ROOT, 'rl'), { recursive: true });
      await Promise.all([
        R('a missing unit', U('load', 'nounit')),
        R('a write to a missing unit', U('record', 'nounit', '--what=the missing unit write')),
        R('a missing task', U('task', 'show', 'ru', 'nope')),
        R('a missing finding', U('finding', 'show', 'ru', 'NOPE')),
        R('a missing entry', U('entry', 'show', 'ru', 'nope')),
        R('a missing reference', U('get', 'ru/task/nope')),
        R('a missing entity', U('get', 'ru/task/nope')),
        R('a missing plan', U('fold', 'ru', '--check')),
        R('a missing unit to move', U('migrate', 'nounit')),
        R('a missing lane', ['lane', 'show', 'ru', 'nolane']),
        R('a write to a missing lane', ['lane', 'record', 'ru', 'nolane', '--what=the missing lane write']),
        R('a missing rhythm', ['rhythm', 'show', 'nosuch']),
        R('a missing unit for the rhythm', ['rhythm', 'current', 'nounit']),
        R('a missing container', ['store', 'get', 'containers/nope']),
        R('a write to a missing container', ['store', 'put', 'nope/x', '--what=w']),
        R('a missing record', ['store', 'set', 'nope/x', '--what=w']),
        R('an unknown store config key', ['store', 'config', 'get', 'nope']),
      ]);
      const shim = sleepShim();
      for (const [why, lock] of [['a held unit lock', unitLock('ru')], ['a held namespace lock', namespaceLock('unit')]] as const) {
        const release = holdLock(rb, lock, 'live');
        await R(why, U('record', 'ru', '--what=the locked write'), shim);
        release();
      }
      if (!ROOT_USER) {
        chmodSync(join(rb, RECORD_ROOT, 'ru'), 0o555);
        await R('a read only unit folder', U('record', 'ru', '--what=the read only write'));
        chmodSync(join(rb, RECORD_ROOT, 'ru'), 0o755);
      }
      await R('a unit in both roots', U('record', 'rl', '--what=the write to both roots'));
    };

    const census = async (): Promise<void> => {
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
      await u('get', 'lg/task/lg-task');
      await u('get', `lg/entry/${D}-lg-e1`);
      await u('record', 'lg', '--what=the first landing write moves the unit', `--slug=${D}-lg-e2`);

      await u('record', 'cu', '--what=the first census entry', `--slug=${D}-cu-e1`, '--thread=the census reader');
      await u('record', 'cu', '--what=a stamped census entry', `--slug=${D}-cu-e2`, '--rhythm=debug 1 REPRODUCE', `--ref=unit#cu/entry/${D}-cu-e1`);
      await u('record', 'cu', '--what=the census reader answered', `--slug=${D}-cu-e3`, `--closes=${D}-cu-e1 (done: answered)`);
      await u('stamp', 'cu');
      for (const t of ['t1', 't2', 't3']) await u('task', 'add', 'cu', t, `--objective=the census task ${t}`, `--refs=unit#cu/entry/${D}-cu-e1`);
      await u('task', 'update', 'cu', 't1', '--desc=the census description', '--criteria=the census criterion');
      await u('task', 'start', 'cu', 't1');
      await u('task', 'complete', 'cu', 't1', '--evidence=the census evidence');
      await u('task', 'reopen', 'cu', 't1');
      await u('task', 'start', 'cu', 't2');
      await u('task', 'drop', 'cu', 't3', '--reason=the census drop');
      await u('finding', 'add', 'cu', 'F_ONE', '--summary=the census finding', `--ref=unit#cu/entry/${D}-cu-e1`);
      await u('finding', 'update', 'cu', 'F_ONE', '--summary=the census finding, updated');
      await u('finding', 'supersede', 'cu', 'F_ONE', 'F_TWO', '--summary=the census successor', `--ref=unit#cu/entry/${D}-cu-e1`);
      await u('finding', 'add', 'cu', 'F_DROP', '--summary=the finding to drop');
      await u('finding', 'drop', 'cu', 'F_DROP');
      await take(['lane', 'create', 'cu', 'cl', ...laneFlags(['--ref=unit#cu/task/t1', '--task=unit#cu/task/t1', '--rhythm=debug 2 TRACE'])]);
      await take(['lane', 'create', 'cu', 'cr', ...laneFlags()]);
      await take(['lane', 'create', 'cu', 'cr', ...laneFlags(['--fact=the replaced census brief', '--replace'])]);
      await take(['lane', 'record', 'cu', 'cl', '--what=the census lane event', `--slug=${D}-cl-l1`, '--ref=unit#cu/task/t1']);
      await take(['lane', 'report', 'cu', 'cl'], REPORT);
      await u('refs', 'cu', 'lg');
      await u('bootstrap', 'ct', 'the transfer target', REPO);
      await u('task', 'add', 'cu', 't4', '--objective=the census task that moves', `--refs=unit#cu/entry/${D}-cu-e1`);
      await u('transfer', 'cu', 'ct', '--task=t4', '--dry-run');
      await u('transfer', 'cu', 'ct', '--task=t4');
      await take(['store', 'put', 'containers/cn', '--description=the census container', '--minting=given', '--add-fields=what: required line']);
      await together([['store', 'get', 'containers/cn'], ['store', 'get', 'containers/cn', '--json'], ['store', 'list', 'containers'], ['store', 'list', 'containers', '--json']]);
      await take(['store', 'put', 'cn/c1', '--what=one', '--add-ref=unit#cu/task/t1']);
      await take(['store', 'set', 'cn/c1', '--what=two']);
      await together([['store', 'get', 'cn/c1'], ['store', 'get', 'cn/c1', '--json'], ['store', 'list', 'cn'], ['store', 'list', 'cn', '--what=two', '--json'], ['store', 'check', 'cn'], ['store', 'check', '--leftovers'], ['store', 'search', 'two'], ['store', 'search', 'two', '--json']]);
      await take(['store', 'put', 'cn/c2', '--what=gone']);
      await take(['store', 'delete', 'cn/c2']);
      await take(['store', 'set', 'containers/cn', '--add-fields=note: optional line']);
      await take(['store', 'put', 'containers/cd', '--description=the dropped census container', '--minting=generated']);
      await take(['store', 'delete', 'containers/cd']);
      await take(['store', 'list', 'containers', '--dropped']);
      await together([['store', 'config', 'load'], ['store', 'config', 'get', 'driver'], ['store', 'config', 'schema']]);
      await take(['store', 'config', 'set', 'driver', 'posix']);
      await take(['store', 'config', 'unset', 'driver']);

      const [first, listing] = await together([U('load', 'cu'), ['rhythm', 'list']]);
      const pages = Number(/(\d+) pages?/.exec(first!.stdout)?.[1] ?? '1');
      const names = listing!.stdout.split('\n').filter((l) => / \| /.test(l)).map((l) => l.split(' | ')[0] ?? '');
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
        U('refs-to', 'lg'),
        ...['cu/task/t1', `cu/entry/${D}-cu-e2`, 'cu/finding/F_TWO', 'cu/lane/cl/recipe', 'cu/lane/cl/report', 'cu/lane/cl/report/FINDINGS', `cu/lane/cl/journal/${D}-cl-l1`].flatMap((p) => [U('get', p), U('get', p, '--json')]),
        U('search', 'census', '--unit=cu'),
        U('search', 'census', '--all', '--json'),
        ...names.map((n) => ['rhythm', 'show', n]),
        ['rhythm', 'current', 'cu'],
      ]);

      await u('diagnose');
      await u('diagnose', '--leftovers');
      await u('diagnose', '--leftovers', '--json');
      await u('migrate', '--all');
      await u('migrate', '--sweep', '--dry-run', '--all');
      await u('migrate', '--sweep', '--all');
      await take(['store', 'check', '--leftovers', '--sweep', '--dry-run']);
      await take(['store', 'check', '--leftovers', '--sweep']);
      const plan = await u('fold', 'cu');
      await u('fold', 'cu');
      const foldLane = /--lane=([A-Za-z0-9_-]+)/.exec(plan.stdout)?.[1] ?? '';
      await u('fold', 'cu', `--lane=${foldLane}`);
      await u('objective', 'cu', 'the census unit, reworded');
      await u('close', 'cu');
      await u('reopen', 'cu');
    };

    await Promise.all([census(), refuse()]);
  }, 300_000);

  it('[the-record-r14] every verb and sub-verb the unit, lane, rhythm, and store help tables list has a row keyed from the argv it ran, above the table floor, so a new verb without one reads red', () => {
    const want = required(tables);
    expect(want.length).toBeGreaterThanOrEqual(REQUIRED_FLOOR);
    for (const module of MODULES) expect(want.some((k) => k.startsWith(`${module} `))).toBe(true);
    const keys = new Set(rows.map((r) => r.key));
    expect(want.filter((k) => !keys.has(k))).toEqual([]);
    expect(rows.filter((r) => r.key === 'unit fold').length).toBe(3);
    expect(rows.filter((r) => r.key === 'lane show').length).toBe(3);
    expect(keyOf(tables, ['lane', 'show', 'cu', 'cl', 'journal'])).toBe('lane show');
    expect(keyOf(tables, ['unit', 'task', 'add', 'cu', 't1'])).toBe('unit task add');
    expect(keyOf(tables, ['store', 'config', 'get', 'driver'])).toBe('store config get');
    expect([...tables.get('unit')!].filter(([, subs]) => subs.length).map(([v, subs]) => `${v} ${subs.length}`)).toEqual(['entry 3', 'finding 6', 'task 8']);
  });

  it('[the-record-r14, the-record-r-4gj4k] every row answers rc 0, the legacy unit read before its first landing write, the store swept after', () => {
    expect(rows.filter((r) => r.code !== 0).map((r) => `${r.key}: rc ${r.code}: ${r.out.split('\n')[0]}`)).toEqual([]);
    expect(rows.filter((r) => r.out.includes('WARNING: the record was read from its deprecated root')).length).toBeGreaterThanOrEqual(5);
    expect(rows.find((r) => r.key === 'unit migrate')?.out.split('\n').slice(-3)).toEqual([expect.stringMatching(/^token list: /), 'migrated: 1', '']);
    expect(rows.length).toBeGreaterThan(90);
  });

  it('[the-record-r14] no row prints a record root, the database, the lock layout, a lane artifact path, an artifact file name, or a module implementation path', () => {
    expect(hitsOf(rows)).toEqual([]);
  });

  it('[the-record-r14] every refusal row, a missing entity per verb family, a write under a held unit lock and under a held namespace lock, a write into a read only unit folder, and a write to a unit in both roots, answers rc not 0 with a line and prints no record storage', () => {
    expect(refusals.length).toBeGreaterThanOrEqual(ROOT_USER ? 15 : 16);
    expect(refusals.filter((r) => r.code === 0 || r.out.trim() === '').map((r) => `${r.key}: rc ${r.code}: ${r.out.split('\n')[0]}`)).toEqual([]);
    expect(hitsOf(refusals)).toEqual([]);
  });

  it('[the-record-r14, the-record-r16] a lane report holding a planted record path, read back through ctx lane show, leaves exactly one remainder', async () => {
    const s = sb;
    const planted = `the record sits in ${RECORD_ROOT}/cu`;
    expect((await run(s, ['lane', 'report', 'cu', 'cl'], { input: `@report cl\nVERDICT: planted\nNOTE ::\n  ${planted}\n` })).code).toBe(0);
    const shown = await lane(s, 'show', 'cu', 'cl', 'report');
    expect(hitsOf([{ key: 'lane show report', code: shown.code, out: shown.stdout + shown.stderr }])).toEqual([`lane show report:   ${planted}`]);
  });
});
