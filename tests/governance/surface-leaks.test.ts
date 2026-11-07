import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { FALLBACK_ROOT, FTS5_DB, leaks, lockPath, namespaceLock, RECORD_ROOT, unitLock } from '../support/drawer';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { stage } from '../support/stage';
import { kids, walk } from './walk';

const FILE_FLOOR = 16;
const HELP_FLOOR = 120;
const DOCS_WORK = 'plugins/docs-discipline/docs/work.md';
const ONBOARDING = 'base/.contexture/ONBOARDING.md';

interface Hit {
  key: string;
  line: string;
}

const ALLOW: readonly Hit[] = [
  { key: ONBOARDING, line: '    set script permissions: `chmod +x .contexture/ctx .contexture/modules/*/scripts/* .contexture/modules/*/filters/*.awk .contexture/extensions/modules/*/scripts/*`' },
  { key: ONBOARDING, line: `      per confirmed plan: ignore or track ${RECORD_ROOT}/ (and the deprecated ${FALLBACK_ROOT}/ while units remain in it) and .contexture/rhythms/ based on team choice` },
];

function surfaceFiles(root: string): string[] {
  const fixed = ['base/AGENTS.md', ONBOARDING, 'base/.contexture/laws/core.md'].map((rel) => join(root, rel)).filter((f) => existsSync(f));
  const drawers = [join(root, 'base/.contexture'), ...kids(join(root, 'plugins')).map((p) => join(p, '.contexture'))];
  const named = drawers.flatMap((dir) => walk(dir)).filter((f) => /\/(laws|module)$/.test(f));
  const rhythmRoots = [join(root, 'base/.contexture/extensions/rhythms'), ...kids(join(root, 'plugins')).map((p) => join(p, '.contexture/extensions/rhythms'))];
  const rhythms = rhythmRoots.flatMap((dir) => walk(dir)).filter((f) => f.endsWith('.md'));
  const work = existsSync(join(root, DOCS_WORK)) ? [join(root, DOCS_WORK)] : [];
  return [...new Set([...fixed, ...named, ...rhythms, ...work])].sort();
}

const scanText = (key: string, body: string): Hit[] => body.split('\n').filter(leaks).map((line) => ({ key, line }));

function scanFiles(root: string): { files: string[]; hits: Hit[] } {
  const files = surfaceFiles(root);
  return { files, hits: files.flatMap((f) => scanText(relative(root, f), readFileSync(f, 'utf8'))) };
}

function staged(label: string): string {
  const sb = stage('posix', label);
  for (const p of kids(join(ROOT, 'plugins'))) if (existsSync(join(p, '.contexture'))) cpSync(join(p, '.contexture'), join(sb, '.contexture'), { recursive: true });
  return sb;
}

const table = (help: string, head: string): [string, string][] =>
  ((help.split(new RegExp(`^${head}:$`, 'm'))[1] ?? '').split(/\n\n/)[0] ?? '')
    .split('\n')
    .filter((l) => /^ {2}[a-z]/.test(l))
    .map((l) => {
      const m = /^ {2}(\S+) *(.*)$/.exec(l);
      return [m?.[1] ?? '', m?.[2] ?? ''];
    });

function builtins(help: string): string[][] {
  const forms: string[][] = [];
  for (const l of ((help.split(/^usage:$/m)[1] ?? '').split(/\n\n/)[0] ?? '').split('\n')) {
    const m = /^ {2}ctx ([a-z][a-z-]*)(?: ([a-z][a-z-]*))?(?: |$)/.exec(l);
    if (!m?.[1] || m[1] === 'help') continue;
    if (!forms.some((f) => f.length === 2 && f[0] === m[1])) forms.push([m[1], '--help']);
    if (m[2]) forms.push([m[1], m[2], '--help']);
  }
  return forms;
}

async function helpForms(sb: string): Promise<{ checked: string[][]; own: string[][] }> {
  const top = (await ctx(sb, 'help')).stdout;
  const checked: string[][] = [['help', '--all']];
  const own: string[][] = [];
  for (const [m] of table(top, 'modules')) {
    checked.push([m, 'help']);
    for (const [v, summary] of table((await ctx(sb, m, 'help')).stdout, 'verbs')) {
      checked.push([m, 'help', v]);
      if (v === 'diagnose') checked.push([m, '--diagnose']);
      own.push([m, v, '--help']);
      const subs = /\(([a-z, ]+)\)$/.exec(summary)?.[1]?.split(/, */) ?? [];
      if (subs.length && /<subcommand>/.test((await ctx(sb, m, 'help', v)).stdout)) for (const s of subs) own.push([m, v, s, '--help']);
    }
  }
  checked.push(...builtins(top));
  for (const [b] of builtins(top).filter((f) => f.length === 2)) if (/\[--diagnose\]/.test((await ctx(sb, b!, '--help')).stdout)) checked.push([b!, '--diagnose']);
  return { checked, own };
}

interface HelpScan {
  forms: string[][];
  empty: string[];
  errors: string[];
  hits: Hit[];
}

async function scanHelp(sb: string): Promise<HelpScan> {
  const { checked, own } = await helpForms(sb);
  const forms = [...checked, ...own];
  const runs = await Promise.all(forms.map((f) => ctx(sb, ...f)));
  const empty = forms.filter((_f, i) => (runs[i]!.stdout + runs[i]!.stderr).trim() === '').map((f) => f.join(' '));
  const errors = checked.flatMap((f, i) => (runs[i]!.code !== 0 || runs[i]!.stderr !== '' ? [`ctx ${f.join(' ')}: rc ${runs[i]!.code}: ${runs[i]!.stderr.split('\n')[0]}`] : []));
  return { forms, empty, errors, hits: runs.flatMap((r, i) => scanText(`ctx ${forms[i]!.join(' ')}`, r.stdout + r.stderr)) };
}

const same = (a: Hit, b: Hit): boolean => a.key === b.key && a.line === b.line;
const remainder = (hits: readonly Hit[]): Hit[] => hits.filter((h) => !ALLOW.some((a) => same(a, h)));

function copyFiles(label: string): string {
  const copy = sandbox(label);
  for (const f of surfaceFiles(ROOT)) {
    const rel = relative(ROOT, f);
    mkdirSync(join(copy, rel, '..'), { recursive: true });
    cpSync(f, join(copy, rel));
  }
  return copy;
}

describe.concurrent('the agent surface census: no shipped law, rhythm, or help names the record storage or a module implementation path', () => {
  let files: { files: string[]; hits: Hit[] };
  let help: HelpScan;
  beforeAll(async () => {
    files = scanFiles(ROOT);
    help = await scanHelp(staged('surface-leaks'));
  });

  it('the instrument flags each part of the pattern once its quotes and backslashes are stripped, and passes the ctx forms', () => {
    const locks = lockPath('/', '');
    const planted = [
      `${RECORD_ROOT}/u/state`,
      `${FALLBACK_ROOT}/u`,
      FTS5_DB,
      lockPath('/', unitLock('u')),
      lockPath('/', namespaceLock('unit')),
      namespaceLock('<namespace>'),
      `the ${relative(join('/', '.contexture'), locks)} folder`,
      `the ${join(basename(locks), dirname(unitLock('u')))} folder`,
      'lanes/x/recipe',
      'lanes/x/journal',
      'lanes/x/report',
      ...['state', 'backlog', 'journal', 'knowledge', 'recipe', 'report'].map((n) => `the ${n}.md file`),
      'the session folder',
      'the sessions folder',
      'the sessions drawer',
      'the sessions directory',
      'run .contexture/modules',
      'or .contexture/extensions/modules.',
      "'.contexture/'modules/unit/data",
      '.contexture\\/extensions/modules/docs/README',
      `"${RECORD_ROOT}"`,
    ];
    expect(planted.filter((l) => !leaks(l))).toEqual([]);
    expect(['ctx unit load u', 'ctx lane show u l report', 'lane#l/report#VERDICT', '.contexture/ctx compose', '.contexture/tmp/lane/', 'ctx docs help check', 'the lanes/x/ folder', 'units/x', 'sessions/x', 'the session', '.contexture/modulesx'].filter(leaks)).toEqual([]);
  });

  it('the file walk reads the loader, ONBOARDING, the core law source, every laws and module file, and every shipped rhythm, by directory, above its floor', () => {
    const rel = files.files.map((f) => relative(ROOT, f));
    expect(rel.length).toBeGreaterThanOrEqual(FILE_FLOOR);
    for (const must of ['base/AGENTS.md', ONBOARDING, 'base/.contexture/laws/core.md', 'base/.contexture/modules/unit/laws', 'base/.contexture/modules/unit/module', 'base/.contexture/extensions/modules/lane/laws', 'plugins/docs-discipline/.contexture/extensions/modules/docs/laws', 'plugins/docs-discipline/.contexture/extensions/rhythms/docs-drift.md', DOCS_WORK]) {
      expect(rel).toContain(must);
    }
  });

  it('a copy with the plugins root renamed away falls under the file floor', () => {
    const copy = copyFiles('surface-leaks-floor');
    expect(surfaceFiles(copy).length).toBe(files.files.length);
    renameSync(join(copy, 'plugins'), join(copy, 'plugins.away'));
    expect(surfaceFiles(copy).length).toBeLessThan(FILE_FLOOR);
  });

  it('the help scan reads ctx help --all, every module table, every verb each table lists, each verb\'s own --help and each sub-verb\'s of a verb taking a <subcommand>, the engine builtins its usage block lists, and the --diagnose of a module listing diagnose and of a builtin whose usage names it, each printing, above its floor', () => {
    expect(help.forms.length).toBeGreaterThanOrEqual(HELP_FLOOR);
    expect(help.empty).toEqual([]);
    expect(help.errors).toEqual([]);
    const keys = help.forms.map((f) => f.join(' '));
    for (const must of ['help --all', 'unit help list', 'unit help resolve', 'lane help create', 'rhythm help show', 'docs help nudge', 'docs help check', 'run --help', 'compose --help', 'package --help', 'package install --help', 'package uninstall --help', 'unit fold --help', 'unit task --help', 'unit task add --help', 'unit entry closure --help', 'lane show --help', 'docs nudge --help', 'run --diagnose', 'unit --diagnose']) expect(keys).toContain(must);
    expect(keys).not.toContain('lane show recipe --help');
  });

  it('every flagged line stands on the exact allow list, the flagged count equal to the list, so a dead entry reads red', () => {
    const flagged = [...files.hits, ...help.hits];
    expect(remainder(flagged)).toEqual([]);
    expect(flagged).toHaveLength(ALLOW.length);
    for (const a of ALLOW) expect(flagged.some((h) => same(a, h))).toBe(true);
  });

  it('a builtin renamed away from the dispatch while its usage line stays reads in the error list', async () => {
    const sb = staged('surface-leaks-builtin');
    const engine = join(sb, '.contexture/ctx');
    const body = readFileSync(engine, 'utf8');
    expect(body.split('\n').filter((l) => l === '  compose)')).toHaveLength(1);
    writeFileSync(engine, body.replace(/^ {2}compose\)$/m, '  composed)'));
    expect((await scanHelp(sb)).errors).toEqual(['ctx compose --help: rc 1: ctx: unknown command: compose']);
  });

  it('a planted laws line leaves exactly one remainder', () => {
    const copy = copyFiles('surface-leaks-laws');
    appendFileSync(join(copy, 'base/.contexture/modules/unit/laws'), `  planted: the record lives under ${RECORD_ROOT}/<unit>\n`);
    expect(remainder(scanFiles(copy).hits)).toEqual([{ key: 'base/.contexture/modules/unit/laws', line: `  planted: the record lives under ${RECORD_ROOT}/<unit>` }]);
  });

  it('a planted rhythm step leaves exactly one remainder', () => {
    const copy = copyFiles('surface-leaks-rhythm');
    const rhythm = 'plugins/docs-discipline/.contexture/extensions/rhythms/docs-drift.md';
    appendFileSync(join(copy, rhythm), `  9. PLANT: open ${FTS5_DB} and read the units\n`);
    expect(remainder(scanFiles(copy).hits)).toEqual([{ key: rhythm, line: `  9. PLANT: open ${FTS5_DB} and read the units` }]);
  });

  it('a planted verb help header leaves exactly one remainder in each form printing it, the module detail and the verb\'s own --help', async () => {
    const sb = staged('surface-leaks-help');
    const script = join(sb, '.contexture/extensions/modules/rhythm/scripts/list');
    const body = readFileSync(script, 'utf8').split('\n');
    body.splice(2, 0, `# help: the planted line names ${FALLBACK_ROOT}/<unit>`);
    writeFileSync(script, body.join('\n'));
    const line = `  the planted line names ${FALLBACK_ROOT}/<unit>`;
    expect(remainder((await scanHelp(sb)).hits)).toEqual([
      { key: 'ctx rhythm help list', line },
      { key: 'ctx rhythm list --help', line },
    ]);
  });
});
