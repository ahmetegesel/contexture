import { cpSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, leaks, RECORD_ROOT } from '../support/drawer';
import type { Run } from '../support/exec';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { createLane, lane, run, unit } from '../support/unit';

const D = '2026-09-27';
const REPO = 'census-repo';
const REPORT = ['@report cl', 'VERDICT: done', '', 'FINDINGS ::', '  F1 the census finding', '', 'OPEN ::', '  none', ''].join('\n');

interface Row {
  key: string;
  code: number;
  out: string;
}

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

async function required(sb: string): Promise<string[]> {
  const keys: string[] = [];
  for (const module of ['unit', 'lane', 'rhythm']) {
    for (const [verb, summary] of listed((await run(sb, [module, 'help'])).stdout)) {
      const subs = /\(([a-z, ]+)\)$/.exec(summary)?.[1]?.split(/, */) ?? [];
      if (subs.length) for (const s of subs) keys.push(`${module} ${verb} ${s}`);
      else keys.push(`${module} ${verb}`);
    }
  }
  return keys;
}

describe('the verb output census: no unit, lane, or rhythm verb prints the record storage', () => {
  let rows: Row[];
  let sb: string;

  beforeAll(async () => {
    sb = staged('verb-output');
    rows = [];
    const take = async (key: string, r: Promise<Run>): Promise<Run> => {
      const done = await r;
      rows.push({ key, code: done.code, out: done.stdout + done.stderr });
      return done;
    };
    const u = (key: string, ...args: string[]): Promise<Run> => take(key, unit(sb, ...args));

    await u('unit bootstrap', 'bootstrap', 'cu', 'the census unit', REPO);
    await u('unit bootstrap', 'bootstrap', 'lg', 'the legacy unit', REPO);
    await u('unit bootstrap', 'bootstrap', 'lh', 'the unit nobody writes', 'other-repo');
    await u('unit task add', 'task', 'add', 'lg', 'lg-task', '--objective=the legacy task');
    await u('unit record', 'record', 'lg', '--what=the legacy entry', `--slug=${D}-lg-e1`);
    toFallback(sb, 'lg');
    toFallback(sb, 'lh');
    await u('unit load', 'load', 'lg');
    await u('unit board', 'board', 'lg');
    await u('unit audit', 'audit', 'lg');
    await u('unit list', 'list');
    await u('unit list', 'list', '--all');
    await u('unit resolve', 'resolve', 'lg', 'task#lg-task');
    await u('unit resolve', 'resolve', 'lg', `entry#${D}-lg-e1`);
    await u('unit record', 'record', 'lg', '--what=the first landing write moves the unit', `--slug=${D}-lg-e2`);

    await u('unit record', 'record', 'cu', '--what=the first census entry', `--slug=${D}-cu-e1`, '--thread=the census reader');
    await u('unit record', 'record', 'cu', '--what=a stamped census entry', `--slug=${D}-cu-e2`, '--rhythm=debug 1 REPRODUCE', `--ref=journal#${D}-cu-e1`);
    await u('unit record', 'record', 'cu', '--what=the census reader answered', `--slug=${D}-cu-e3`, `--closes=${D}-cu-e1 (done: answered)`);
    await u('unit stamp', 'stamp', 'cu');
    for (const t of ['t1', 't2', 't3']) await u('unit task add', 'task', 'add', 'cu', t, `--objective=the census task ${t}`, '--refs=lane#cl/report#FINDINGS');
    await u('unit task update', 'task', 'update', 'cu', 't1', '--desc=the census description', '--criteria=the census criterion');
    await u('unit task start', 'task', 'start', 'cu', 't1');
    await u('unit task complete', 'task', 'complete', 'cu', 't1', '--evidence=the census evidence');
    await u('unit task reopen', 'task', 'reopen', 'cu', 't1');
    await u('unit task start', 'task', 'start', 'cu', 't2');
    await u('unit task drop', 'task', 'drop', 'cu', 't3', '--reason=the census drop');
    await u('unit task list', 'task', 'list', 'cu', '--status=all');
    await u('unit task show', 'task', 'show', 'cu', 't1');
    await u('unit finding add', 'finding', 'add', 'cu', 'F_ONE', '--summary=the census finding', `--ref=journal#${D}-cu-e1`);
    await u('unit finding show', 'finding', 'show', 'cu', 'F_ONE');
    await u('unit finding update', 'finding', 'update', 'cu', 'F_ONE', '--summary=the census finding, updated');
    await u('unit finding supersede', 'finding', 'supersede', 'cu', 'F_ONE', 'F_TWO', '--summary=the census successor', '--ref=lane#cl/report#FINDINGS');
    await u('unit finding add', 'finding', 'add', 'cu', 'F_DROP', '--summary=the finding to drop');
    await u('unit finding drop', 'finding', 'drop', 'cu', 'F_DROP');
    await u('unit finding list', 'finding', 'list', 'cu');
    await u('unit entry show', 'entry', 'show', 'cu', `${D}-cu-e2`);
    await u('unit entry list', 'entry', 'list', 'cu');
    await u('unit entry closure', 'entry', 'closure', 'cu', `${D}-cu-e1`);

    await take('lane create', createLane(sb, 'cu', 'cl', ['--ref=lane#cl/report#FINDINGS', '--task=backlog#t1', '--rhythm=debug 2 TRACE']));
    await take('lane record', lane(sb, 'record', 'cu', 'cl', '--what=the census lane event', `--slug=${D}-cl-l1`, '--ref=backlog#t1'));
    await take('lane report', run(sb, ['lane', 'report', 'cu', 'cl'], { input: REPORT }));
    await take('lane report', run(sb, ['lane', 'report', 'cu', 'cl'], { input: '' }));
    for (const a of ['recipe', 'journal', 'report']) await take(`lane show ${a}`, lane(sb, 'show', 'cu', 'cl', a));

    const first = await u('unit load', 'load', 'cu');
    const pages = Number(/(\d+) pages?/.exec(first.stdout)?.[1] ?? '1');
    for (let p = 2; p <= pages; p++) await u('unit load', 'load', 'cu', String(p));
    await u('unit board', 'board', 'cu');
    for (const flags of [[], ['--active'], ['--all'], [`--repo=${REPO}`], ['--active', `--repo=${REPO}`], ['--all', `--repo=${REPO}`]]) await u('unit list', 'list', ...flags);
    await u('unit audit', 'audit', 'cu');
    await u('unit refresh', 'refresh', 'cu');
    for (const ref of [
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
    ]) {
      await u('unit resolve', 'resolve', 'cu', ref);
      await u('unit resolve', 'resolve', 'cu', ref, '--json');
    }
    await u('unit refs', 'refs', 'cu', 'lg');
    await u('unit refs-to', 'refs-to', 'lg');
    await u('unit search', 'search', 'cu', 'census', '--mode=exact');
    await u('unit diagnose', 'diagnose');
    await u('unit migrate', 'migrate', '--all');
    const plan = await u('unit fold', 'fold', 'cu');
    await u('unit fold', 'fold', 'cu');
    const foldLane = /--lane=([A-Za-z0-9_-]+)/.exec(plan.stdout)?.[1] ?? '';
    await u('unit fold', 'fold', 'cu', `--lane=${foldLane}`);
    await u('unit close', 'close', 'cu');
    await u('unit reopen', 'reopen', 'cu');

    const names = (await take('rhythm list', run(sb, ['rhythm', 'list']))).stdout.split('\n').filter((l) => / \| /.test(l)).map((l) => l.split(' | ')[0] ?? '');
    for (const n of names) await take('rhythm show', run(sb, ['rhythm', 'show', n]));
    await take('rhythm current', run(sb, ['rhythm', 'current', 'cu']));
  });

  it('[the-record-r14] every verb and sub-verb the unit, lane, and rhythm help tables list has a row, so a new verb without one reads red', async () => {
    const keys = new Set(rows.map((r) => r.key));
    const missing = (await required(sb)).filter((k) => ![...keys].some((have) => have === k || have.startsWith(`${k} `)));
    expect(missing).toEqual([]);
    expect(rows.filter((r) => r.key.startsWith('unit fold')).length).toBe(3);
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
