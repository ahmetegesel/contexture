import { cpSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { exec } from '../support/exec';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { stage } from '../support/stage';
import { put } from '../support/tree';
import { kids } from './walk';

const AWKHELP = join(ROOT, 'tests/governance/awkhelp.awk');
const IDEAS = join(ROOT, '.contexture/modules/ideas');
const FILE_FLOOR = 67;
const VERB_FLOOR = 62;
const SUB_COUNT = 29;

const isFile = (f: string): boolean => statSync(f).isFile();
const scripts = (module: string): string[] => kids(join(module, 'scripts')).filter(isFile);

function censusFiles(root = ROOT): string[] {
  const modules = [
    ...kids(join(root, 'base/.contexture/modules')),
    join(root, '.contexture/modules/ideas'),
    ...kids(join(root, 'plugins')).flatMap((p) => kids(join(p, '.contexture/extensions/modules'))),
  ];
  return modules.flatMap(scripts).filter((f) => !/\.(awk|grammar)$/.test(f));
}

const census = (files: readonly string[]) => exec('awk', ['-f', AWKHELP, ...files], { cwd: sandbox('help-census'), input: '' });

function arms(stdout: string, root = ROOT): string[] {
  return stdout
    .split('\n')
    .filter((l) => /^\S+:\d+: /.test(l))
    .map((l) => {
      const m = /^(\S+):\d+: (.*)$/.exec(l)!;
      return `${relative(root, m[1]!)}: ${m[2]}`;
    });
}

function staged(label: string): string {
  const sb = stage('posix', label);
  for (const p of kids(join(ROOT, 'plugins'))) if (existsSync(join(p, '.contexture'))) cpSync(join(p, '.contexture'), join(sb, '.contexture'), { recursive: true });
  if (existsSync(IDEAS)) cpSync(IDEAS, join(sb, '.contexture/modules/ideas'), { recursive: true });
  return sb;
}

const table = (help: string, head: string): string[] =>
  ((help.split(new RegExp(`^${head}:$`, 'm'))[1] ?? '').split(/\n\n/)[0] ?? '')
    .split('\n')
    .filter((l) => /^ {2}[a-z]/.test(l))
    .map((l) => l.trim().split(/ +/)[0]!);

async function verbs(sb: string): Promise<[string, string][]> {
  const out: [string, string][] = [];
  for (const m of table((await ctx(sb, 'help')).stdout, 'modules')) for (const v of table((await ctx(sb, m, 'help')).stdout, 'verbs')) out.push([m, v]);
  return out;
}

async function subcommands(sb: string, shipped: readonly [string, string][]): Promise<[string, string, string][]> {
  const out: [string, string, string][] = [];
  for (const [m, v] of shipped) for (const s of table((await ctx(sb, m, 'help', v)).stdout, 'subcommands')) out.push([m, v, s]);
  return out;
}

// every shipped verb declaring the help hook, as <module> <module dir> <verb>
function hooked(sb: string): [string, string, string][] {
  const roots = [join(sb, '.contexture/modules'), join(sb, '.contexture/extensions/modules')];
  return roots.flatMap((r) =>
    kids(r).flatMap((md) =>
      scripts(md)
        .filter((f) => /^# help-from: code$/m.test(readFileSync(f, 'utf8')))
        .map((f): [string, string, string] => [md.split('/').pop()!, md, f.split('/').pop()!]),
    ),
  );
}

const direct = (sb: string, m: string, md: string, v: string) =>
  exec(join(md, 'scripts', v), [], {
    cwd: sb,
    input: '',
    env: { CTX_ROOT: sb, CTX_MODULE_DIR: md, CTX_BIN: join(sb, '.contexture/ctx'), CTX_SCRATCH_ROOT: sandbox('help-mode'), LC_ALL: 'C', CTX_HELP: '1', CTX_HELP_MODULE: m, CTX_HELP_VERB: v, CTX_HELP_SUB: '' },
  });

describe.concurrent('the verb help census: the engine owns a sole -h or --help after every verb and every declared subcommand, so no verb script carries a help arm', () => {
  let sb: string;
  let shipped: [string, string][];
  let subs: [string, string, string][];
  beforeAll(async () => {
    sb = staged('help-census');
    shipped = await verbs(sb);
    subs = await subcommands(sb, shipped);
  });

  it('[the-engine-r7] over the census roots, private engines included, above the file and verb floors, no script carries a help arm', async () => {
    const files = censusFiles();
    expect(files.length).toBeGreaterThanOrEqual(FILE_FLOOR);
    expect(files.filter((f) => /^# summary: /m.test(readFileSync(f, 'utf8'))).length).toBeGreaterThanOrEqual(VERB_FLOOR);
    if (existsSync(IDEAS)) expect(files).toContain(join(IDEAS, 'scripts/ideas'));
    expect(files).toContain(join(ROOT, 'base/.contexture/modules/store/scripts/store'));
    const r = await census(files);
    expect(r.code).toBe(0);
    expect(arms(r.stdout)).toEqual([]);
    expect(r.stdout.trimEnd().split('\n').pop()).toBe(`files ${files.length} arms 0`);
  });

  it('[the-engine-r7, the-engine-r4] every declared subcommand\'s sole -h and --help print ctx <module> help <verb> <sub> byte for byte on stdout rc 0 with an empty stderr, its first line naming the subcommand', async () => {
    const per = (m: string, v: string): number => subs.filter(([a, b]) => a === m && b === v).length;
    expect([per('unit', 'entry'), per('unit', 'finding'), per('unit', 'task'), per('store', 'config'), per('ast-doc-graph', 'query')]).toEqual([3, 6, 8, 5, 7]);
    expect(subs).toHaveLength(SUB_COUNT);
    const bad = (
      await Promise.all(
        subs.map(async ([m, v, s]) => {
          const [t, h, help] = await Promise.all([ctx(sb, m, 'help', v, s), ctx(sb, m, v, s, '-h'), ctx(sb, m, v, s, '--help')]);
          const head = t.code === 0 && t.stderr === '' && t.stdout.startsWith(`ctx ${m} ${v} ${s}`) ? [] : [`ctx ${m} help ${v} ${s}: rc ${t.code}: ${t.stderr.split('\n')[0]}`];
          return [...head, ...[h, help].flatMap((r, i) => (r.code === 0 && r.stderr === '' && r.stdout === t.stdout ? [] : [`ctx ${m} ${v} ${s} ${i ? '--help' : '-h'}: rc ${r.code}: ${r.stderr.split('\n')[0]}`]))];
        }),
      )
    ).flat();
    expect(bad).toEqual([]);
  });

  it('[the-engine-r4] a sectioned verb whose summary ends in a parenthesised list names its declared subcommands there in order, so the module table never drifts from the sections', async () => {
    const lists: [string, string, string][] = [];
    for (const mv of [...new Set(subs.map(([m, v]) => `${m} ${v}`))].sort()) {
      const [m = '', v = ''] = mv.split(' ');
      const summary = (await ctx(sb, m, 'help', v)).stdout.split('\n')[0] ?? '';
      const list = /\(([a-z][a-z0-9_-]*(?:, [a-z][a-z0-9_-]*)*)\)$/.exec(summary)?.[1];
      if (list !== undefined) lists.push([mv, list, subs.filter(([a, b]) => a === m && b === v).map(([, , s]) => s).join(', ')]);
    }
    expect(lists.map(([mv]) => mv)).toEqual(['store config', 'unit entry', 'unit finding', 'unit task']);
    expect(lists.filter(([, list, declared]) => list !== declared)).toEqual([]);
  });

  it('[the-engine-r7] the census reads the seven planted help arms, blanks around a bar or before the paren included, and none of the five non help arms', async () => {
    const plant = put(
      join(sandbox('help-census-plant'), 'plant.sh'),
      [
        '  --help|-h) x ;;',
        '  "help") y ;;',
        'case "$1" in -h) z ;; esac',
        '  a) b ;; help|x) c ;;',
        '  "$x"|-h) d ;;',
        '  --help | -h) a ;;',
        '  -h|--help ) b ;;',
        '  --helpx|-hh) n ;;',
        '  # --help|-h) a comment',
        '  printf "-h)"',
        '  --json) j ;;',
        '  helper) h ;;',
        '',
      ].join('\n'),
    );
    const r = await census([plant]);
    expect(r.stdout.split('\n').filter((l) => l.includes('plant.sh:')).map((l) => l.split(':')[1])).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(r.stdout).toContain('files 1 arms 7');
  });

  it('[the-engine-r7] every shipped verb\'s sole -h and --help print ctx <module> help <verb> byte for byte on stdout rc 0 with an empty stderr', async () => {
    expect(shipped.length).toBeGreaterThanOrEqual(VERB_FLOOR);
    for (const must of ['unit fold', 'unit objective', 'lane create', 'rhythm show', 'store config', 'ideas add', 'docs search', 'ast-doc-graph query']) expect(shipped.map((s) => s.join(' '))).toContain(must);
    const bad = (
      await Promise.all(
        shipped.map(async ([m, v]) => {
          const [t, h, help] = await Promise.all([ctx(sb, m, 'help', v), ctx(sb, m, v, '-h'), ctx(sb, m, v, '--help')]);
          return [h, help].flatMap((r, i) => (t.code === 0 && r.code === 0 && r.stderr === '' && r.stdout === t.stdout ? [] : [`ctx ${m} ${v} ${i ? '--help' : '-h'}: rc ${r.code}: ${r.stderr.split('\n')[0]}`]));
        }),
      )
    ).flat();
    expect(bad).toEqual([]);
  });

  it('[the-engine-r7, modules-r2] every shipped verb declaring the help hook, run directly in help mode, exits 0 with an empty stderr, its stdout the tail ctx <module> help <verb> prints after the table; a plant without the line yields no tail', async () => {
    const hooks = hooked(sb);
    expect(hooks.map(([m, , v]) => `${m} ${v}`)).toContain('unit fold');
    const plain = staged('help-census-plain');
    for (const [m, md, v] of hooks) {
      const [full, run] = await Promise.all([ctx(sb, m, 'help', v), direct(sb, m, md, v)]);
      expect([run.code, run.stderr], `${m} ${v}`).toEqual([0, '']);
      expect(run.stdout.length, `${m} ${v}`).toBeGreaterThan(0);
      const file = join(plain, relative(sb, md), 'scripts', v);
      writeFileSync(file, readFileSync(file, 'utf8').replace(/^# help-from: code\n/m, ''));
      const bare = await ctx(plain, m, 'help', v);
      expect([bare.code, bare.stderr]).toEqual([0, '']);
      expect(full.stdout).toBe(`${bare.stdout}\n${run.stdout}`);
      expect(bare.stdout).not.toContain(run.stdout.split('\n')[0]!);
    }
  });

  it('[the-engine-r7] a scratch workspace\'s git status and store listing are unchanged after every hook verb\'s -h', async () => {
    const w = staged('help-census-quiet');
    writeFileSync(join(w, '.gitignore'), '.contexture/tmp/\n');
    const git = (...args: string[]) => exec('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', ...args], { cwd: w, input: '' });
    expect((await git('init', '-q')).code).toBe(0);
    expect((await git('add', '-A')).code).toBe(0);
    expect((await git('commit', '-q', '-m', 'stage')).code).toBe(0);
    const listing = async () => [(await ctx(w, 'store', 'list', 'containers')).stdout, (await ctx(w, 'unit', 'list')).stdout];
    const before = await listing();
    const hooks = hooked(w);
    expect(hooks.length).toBeGreaterThan(0);
    for (const [m, , v] of hooks) expect((await ctx(w, m, v, '-h')).code).toBe(0);
    expect((await git('status', '--porcelain')).stdout).toBe('');
    expect(await listing()).toEqual(before);
  });
});
