import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { FALLBACK_ROOT, FTS5_DB, leaks, RECORD_ROOT } from '../support/drawer';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { stage } from '../support/stage';
import { kids, walk } from './walk';

const FILE_FLOOR = 16;
const HELP_FLOOR = 56;
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

const listed = (help: string, head: string): string[] =>
  ((help.split(new RegExp(`^${head}:$`, 'm'))[1] ?? '').split(/\n\n/)[0] ?? '')
    .split('\n')
    .filter((l) => /^ {2}[a-z]/.test(l))
    .map((l) => l.trim().split(/ +/)[0] ?? '');

async function helpForms(sb: string): Promise<string[][]> {
  const forms: string[][] = [['help', '--all']];
  for (const m of listed((await ctx(sb, 'help')).stdout, 'modules')) {
    forms.push([m, 'help']);
    for (const v of listed((await ctx(sb, m, 'help')).stdout, 'verbs')) forms.push([m, 'help', v]);
  }
  forms.push(['run', '--help'], ['compose', '--help'], ['package', '--help'], ['package', 'install', '--help'], ['package', 'uninstall', '--help']);
  return forms;
}

async function scanHelp(sb: string): Promise<{ forms: string[][]; empty: string[]; hits: Hit[] }> {
  const forms = await helpForms(sb);
  const runs = await Promise.all(forms.map((f) => ctx(sb, ...f)));
  const empty = forms.filter((_f, i) => (runs[i]!.stdout + runs[i]!.stderr).trim() === '').map((f) => f.join(' '));
  return { forms, empty, hits: runs.flatMap((r, i) => scanText(`ctx ${forms[i]!.join(' ')}`, r.stdout + r.stderr)) };
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
  let help: { forms: string[][]; empty: string[]; hits: Hit[] };
  beforeAll(async () => {
    files = scanFiles(ROOT);
    help = await scanHelp(staged('surface-leaks'));
  });

  it('the instrument flags each part of the pattern once its quotes and backslashes are stripped, and passes the ctx forms', () => {
    const planted = [`${RECORD_ROOT}/u/state`, `${FALLBACK_ROOT}/u`, FTS5_DB, 'lanes/x/report', 'the backlog.md file', 'the session folder', "'.contexture/'modules/unit/data", '.contexture\\/extensions/modules/docs/README', `"${RECORD_ROOT}"`];
    expect(planted.filter(leaks)).toEqual(planted);
    expect(['ctx unit load u', 'ctx lane show u l report', 'lane#l/report#VERDICT', '.contexture/ctx compose', '.contexture/tmp/lane/', 'ctx docs help check'].filter(leaks)).toEqual([]);
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

  it('the help scan reads ctx help --all, every module table, every verb each table lists, and the engine builtins, each printing, above its floor', () => {
    expect(help.forms.length).toBeGreaterThanOrEqual(HELP_FLOOR);
    expect(help.empty).toEqual([]);
    const keys = help.forms.map((f) => f.join(' '));
    for (const must of ['help --all', 'unit help list', 'unit help resolve', 'lane help create', 'rhythm help show', 'docs help nudge', 'docs help check', 'compose --help', 'package uninstall --help']) expect(keys).toContain(must);
  });

  it('every flagged line stands on the exact allow list, the flagged count equal to the list, so a dead entry reads red', () => {
    const flagged = [...files.hits, ...help.hits];
    expect(remainder(flagged)).toEqual([]);
    expect(flagged).toHaveLength(ALLOW.length);
    for (const a of ALLOW) expect(flagged.some((h) => same(a, h))).toBe(true);
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

  it('a planted verb help header leaves exactly one remainder', async () => {
    const sb = staged('surface-leaks-help');
    const script = join(sb, '.contexture/extensions/modules/rhythm/scripts/list');
    const body = readFileSync(script, 'utf8').split('\n');
    body.splice(2, 0, `# help: the planted line names ${FALLBACK_ROOT}/<unit>`);
    writeFileSync(script, body.join('\n'));
    expect(remainder((await scanHelp(sb)).hits)).toEqual([{ key: 'ctx rhythm help list', line: `  the planted line names ${FALLBACK_ROOT}/<unit>` }]);
  });
});
