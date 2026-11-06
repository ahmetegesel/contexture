import { execFile } from 'node:child_process';
import { accessSync, constants, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Reporter, TestModule, TestRunEndReason, Vitest } from 'vitest/node';
import { ROOT } from './root';

export const CORPUS_ROOT_ENV = 'VITEST_CORPUS_ROOT';

export type RulesOptions = {
  projects: readonly string[];
  outputFile: string;
  reasons: string;
};

export interface DocIds {
  repo: string;
  slug: string;
  contract: string[];
  responsibilities: string[];
  pitfalls: string[];
}

export interface Corpus {
  root: string;
  docs: DocIds[];
}

export interface Need {
  need: string;
}

export interface Tested {
  where: string;
  name: string;
  state: string;
  suite?: boolean;
}

export interface Reasons {
  reasons: Map<string, string>;
  malformed: string[];
}

const TOKEN = '[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[orpc](?:[0-9]+|-[0-9a-z]{5})';
const ONE = new RegExp(`^${TOKEN}$`);
const ANY = new RegExp(`(?<![A-Za-z0-9-])${TOKEN}(?![A-Za-z0-9-])`, 'g');
const GROUP = /\[([^[\]]*)\]/g;
const MARKER = /^index complete: (\d+) entries$/;
const SECTION = /^([A-Z_]+):$/;
const ID_LINE = /^(?: {4}| {2}- )id: (\S+)$/;
const REASON = new RegExp(`^(${TOKEN}) (\\S.*)$`);

const rank = (id: string): [number, number, string] => {
  const n = /-[orpc]([0-9]+)$/.exec(id)?.[1];
  return n === undefined ? [1, 0, id] : [0, Number(n), ''];
};

const byId = (a: string, b: string): number => {
  const [x, y] = [rank(a), rank(b)];
  return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
};

export function citations(name: string): { ids: string[]; offForm: string[] } {
  const ids: string[] = [];
  const rest = name.replace(GROUP, (whole, body: string) => {
    const parts = body.split(', ');
    if (!parts.every((p) => ONE.test(p))) return whole;
    ids.push(...parts);
    return ' ';
  });
  return { ids: [...new Set(ids)], offForm: [...rest.matchAll(ANY)].map((m) => m[0]) };
}

export function indexEntries(text: string): { entries: { repo: string; slug: string }[] } | Need {
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  const at = lines.findIndex((l) => MARKER.test(l));
  if (at === -1) return { need: 'ctx docs query --index to end with its index complete marker' };
  const entries = lines.slice(0, at).map((l) => {
    const [repo = '', slug = ''] = l.split(/\s+/);
    return { repo, slug };
  });
  const count = Number(MARKER.exec(lines[at])?.[1]);
  if (count !== entries.length) return { need: `ctx docs query --index to list the ${count} entries its marker counts (it listed ${entries.length})` };
  return { entries };
}

export function projectionIds(repo: string, slug: string, text: string): DocIds {
  const doc: DocIds = { repo, slug, contract: [], responsibilities: [], pitfalls: [] };
  const into: Record<string, string[]> = { CONTRACT: doc.contract, RESPONSIBILITIES: doc.responsibilities, PITFALLS: doc.pitfalls };
  let section = '';
  for (const line of text.split('\n')) {
    const head = SECTION.exec(line);
    if (head) section = head[1];
    const id = ID_LINE.exec(line);
    if (id) into[section]?.push(id[1]);
  }
  for (const ids of Object.values(into)) ids.sort(byId);
  return doc;
}

export function reasonsTable(text: string): Reasons {
  const reasons = new Map<string, string>();
  const malformed: string[] = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.startsWith('#')) continue;
    const m = REASON.exec(line);
    if (!m || reasons.has(m[1])) malformed.push(line);
    else reasons.set(m[1], m[2]);
  }
  return { reasons, malformed };
}

function ctx(root: string, args: readonly string[]): Promise<{ code: number; stdout: string }> {
  const env = { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', LC_ALL: 'C' };
  return new Promise((done) => {
    execFile(join(root, '.contexture/ctx'), args, { cwd: root, env, timeout: 60_000, maxBuffer: 1 << 26 }, (error, stdout) => {
      done({ code: error ? (typeof error.code === 'number' ? error.code : -1) : 0, stdout });
    });
  });
}

export async function readCorpus(root: string): Promise<Corpus | Need> {
  const bin = join(root, '.contexture/ctx');
  try {
    accessSync(bin, constants.X_OK);
  } catch {
    return { need: `the live drawer's ctx at ${bin}, absent in a worktree and a fresh clone (${CORPUS_ROOT_ENV} names a workspace root that holds one)` };
  }
  const index = await ctx(root, ['docs', 'query', '--index']);
  if (index.code !== 0) return { need: `the live corpus: ctx docs query --index answered rc ${index.code}` };
  const listed = indexEntries(index.stdout);
  if ('need' in listed) return listed;
  const runs = await Promise.all(listed.entries.map(async (e) => ({ ...e, run: await ctx(root, ['docs', 'query', e.repo, e.slug]) })));
  const failed = runs.find((r) => r.run.code !== 0);
  if (failed) return { need: `the live corpus: ctx docs query ${failed.repo} ${failed.slug} answered rc ${failed.run.code}` };
  return { root, docs: runs.map((r) => projectionIds(r.repo, r.slug, r.run.stdout)) };
}

function add(map: Map<string, string[]>, id: string, where: string): void {
  map.set(id, [...(map.get(id) ?? []), where]);
}

export function coverage(tests: readonly Tested[], corpus: Corpus, table: Reasons, partial: readonly string[]) {
  const passed = new Map<string, string[]>();
  const cited = new Map<string, string[]>();
  const offForm: string[] = [];
  const onDescribe: string[] = [];
  for (const t of tests) {
    const c = citations(t.name);
    if (t.suite) {
      if (c.ids.length + c.offForm.length > 0) onDescribe.push(`${[...c.ids, ...c.offForm].join(', ')} in ${t.where}`);
      continue;
    }
    if (c.offForm.length > 0) offForm.push(`${c.offForm.join(', ')} in ${t.where}`);
    for (const id of c.ids) {
      add(cited, id, t.where);
      if (t.state === 'passed') add(passed, id, t.where);
    }
  }
  const contract = new Set(corpus.docs.flatMap((d) => d.contract));
  const known = new Set(corpus.docs.flatMap((d) => [...d.contract, ...d.responsibilities, ...d.pitfalls]));
  const docs = corpus.docs
    .filter((d) => d.contract.length > 0)
    .map((d) => ({
      repo: d.repo,
      slug: d.slug,
      contract: d.contract.length,
      covered: d.contract.filter((id) => passed.has(id)),
      reasoned: d.contract.filter((id) => !passed.has(id) && table.reasons.has(id)),
      uncovered: d.contract.filter((id) => !passed.has(id) && !table.reasons.has(id)),
    }));
  const apart = (pick: (d: DocIds) => string[]) => {
    const ids = corpus.docs.flatMap(pick);
    return { total: ids.length, cited: ids.filter((id) => passed.has(id)) };
  };
  return {
    status: partial.length > 0 ? 'partial' : 'complete',
    partial,
    root: corpus.root,
    total: contract.size,
    read: corpus.docs.length,
    docs,
    responsibilities: apart((d) => d.responsibilities),
    pitfalls: apart((d) => d.pitfalls),
    unknown: Object.fromEntries([...cited].filter(([id]) => !known.has(id))),
    offForm,
    onDescribe,
    stale: [...table.reasons.keys()].filter((id) => contract.has(id) && passed.has(id)),
    orphanReasons: [...table.reasons.keys()].filter((id) => !contract.has(id)),
    malformedReasons: table.malformed,
    tests: Object.fromEntries([...passed].sort(([a], [b]) => (a < b ? -1 : 1))),
  };
}

export type Coverage = ReturnType<typeof coverage>;

const list = (ids: readonly string[]): string => (ids.length > 0 ? ids.join(', ') : 'none');

export function render(c: Coverage): string[] {
  const sum = (pick: (d: Coverage['docs'][number]) => readonly string[]) => c.docs.reduce((n, d) => n + pick(d).length, 0);
  return [
    `rules: ${c.total} contract rule ids in ${c.docs.length} of the ${c.read} docs of the corpus at ${c.root}: ${sum((d) => d.covered)} covered, ${sum((d) => d.reasoned)} reasoned, ${sum((d) => d.uncovered)} uncovered`,
    ...(c.partial.length > 0 ? [`rules: partial run, so the counts read low: ${c.partial.join('; ')}`] : []),
    ...c.docs.map((d) => `rules:   ${d.slug} ${d.covered.length} of ${d.contract} covered, ${d.reasoned.length} reasoned; uncovered: ${list(d.uncovered)}`),
    `rules: cited apart: responsibilities ${c.responsibilities.cited.length} of ${c.responsibilities.total}, pitfalls ${c.pitfalls.cited.length} of ${c.pitfalls.total}`,
    ...Object.entries(c.unknown).map(([id, where]) => `rules: cited but absent from the corpus: ${id} in ${where.join('; ')}`),
    ...c.offForm.map((o) => `rules: outside the canonical form [<id>] or [<id>, <id>]: ${o}`),
    ...c.onDescribe.map((o) => `rules: on a describe, which proves nothing: ${o}`),
    ...(c.stale.length > 0 ? [`rules: stale reasons, the id is covered now: ${list(c.stale)}`] : []),
    ...(c.orphanReasons.length > 0 ? [`rules: reasons naming no contract rule id of the corpus: ${list(c.orphanReasons)}`] : []),
    ...c.malformedReasons.map((l) => `rules: malformed reason line: ${l}`),
  ];
}

export default class Rules implements Reporter {
  private vitest: Vitest | undefined;
  private corpus: Promise<Corpus | Need> = Promise.resolve({ need: 'the reporter to be initialized' });

  constructor(private readonly options: RulesOptions) {}

  onInit(vitest: Vitest): void {
    this.vitest = vitest;
    this.corpus = readCorpus(resolve(process.env[CORPUS_ROOT_ENV] || ROOT));
  }

  async onTestRunEnd(modules: ReadonlyArray<TestModule>, _errors: unknown, reason: TestRunEndReason): Promise<void> {
    let lines: string[];
    try {
      lines = await this.report(modules, reason);
    } catch (e) {
      lines = [`rules: no report: ${e instanceof Error ? e.message : String(e)}`];
    }
    process.stdout.write(`\n${lines.join('\n')}\n`);
  }

  private async partial(modules: ReadonlyArray<TestModule>, reason: TestRunEndReason): Promise<string[]> {
    const running = new Set(this.vitest?.projects.map((p) => p.name) ?? []);
    const absent = this.options.projects.filter((p) => !running.has(p));
    const ran = new Set(modules.map((m) => m.moduleId));
    const files = (await this.vitest?.globTestSpecifications()) ?? [];
    const unrun = new Set(files.filter((s) => !ran.has(s.moduleId)).map((s) => s.moduleId));
    return [
      ...(absent.length > 0 ? [`the projects ${absent.join(', ')} did not run`] : []),
      ...(this.vitest?.config.testNamePattern ? ['a test name pattern is set'] : []),
      ...(unrun.size > 0 ? [`${unrun.size} test files did not run`] : []),
      ...(reason !== 'passed' ? [`the run ended ${reason}`] : []),
    ];
  }

  private async report(modules: ReadonlyArray<TestModule>, reason: TestRunEndReason): Promise<string[]> {
    const corpus = await this.corpus;
    const written = `rules: written to ${this.options.outputFile}`;
    mkdirSync(dirname(this.options.outputFile), { recursive: true });
    if ('need' in corpus) {
      writeFileSync(this.options.outputFile, `${JSON.stringify({ status: 'skipped', need: corpus.need }, null, 1)}\n`);
      return [`rules: skipped, needs ${corpus.need}`, written];
    }
    const tests: Tested[] = modules.flatMap((m) => [
      ...[...m.children.allSuites()].map((s) => ({ where: `${m.project.name} ${m.relativeModuleId} > ${s.fullName}`, name: s.name, state: s.state(), suite: true })),
      ...[...m.children.allTests()].map((t) => ({ where: `${m.project.name} ${m.relativeModuleId} > ${t.fullName}`, name: t.name, state: t.result().state })),
    ]);
    const table = reasonsTable(readFileSync(this.options.reasons, 'utf8'));
    const result = coverage(tests, corpus, table, await this.partial(modules, reason));
    writeFileSync(this.options.outputFile, `${JSON.stringify(result, null, 1)}\n`);
    return [...render(result), written];
  }
}
