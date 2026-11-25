import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { awk } from '@support/awk';
import type { Run } from '@support/exec';
import { SCRIPTS } from './corpus';

const bytewise = (a: string, b: string): number => (Buffer.from(a) < Buffer.from(b) ? -1 : Buffer.from(a) > Buffer.from(b) ? 1 : 0);

export function docFiles(dir: string, repo?: string): string[] {
  const repos = repo ? [repo] : readdirSync(join(dir, 'docs')).filter((r) => statSync(join(dir, 'docs', r)).isDirectory());
  return repos
    .sort(bytewise)
    .flatMap((r) => readdirSync(join(dir, 'docs', r)).filter((f) => f.endsWith('.md')).sort(bytewise).map((f) => `docs/${r}/${f}`));
}

const engine = (name: string): string => join(SCRIPTS, name);
const ceiling = (dir: string): Record<string, string> => ({ GIT_CEILING_DIRECTORIES: dirname(dir) });

export function audit(dir: string, files: readonly string[] = docFiles(dir)): Promise<Run> {
  return awk(dir, engine('docs-audit.awk'), { args: files, env: { DOCS_TEMPLATE: join(SCRIPTS, 'doc.grammar') } });
}

export interface Query {
  mode?: string;
  repo?: string;
  slug?: string;
  section?: string;
  file?: string;
  category?: string;
  severity?: string;
  channel?: string;
}

export function query(dir: string, q: Query, files: readonly string[] = docFiles(dir, q.repo || undefined)): Promise<Run> {
  const env = {
    DOCS_Q_SLUG: q.slug ?? '',
    DOCS_Q_SECTION: q.section ?? '',
    DOCS_Q_FILE: q.file ?? '',
    DOCS_Q_CATEGORY: q.category ?? '',
    DOCS_Q_SEVERITY: q.severity ?? '',
    DOCS_Q_CHANNEL: q.channel ?? '',
    ...ceiling(dir),
  };
  return awk(dir, [engine('docs-glob.awk'), engine('docs-query.awk')], { args: files, env, vars: { mode: q.mode ?? '', repo: q.repo ?? '' } });
}

export interface Entities {
  mode: 'get' | 'search';
  key?: string;
  query?: string;
  type?: string;
  limit?: number;
  json?: boolean;
}

export function entities(dir: string, e: Entities, files: readonly string[] = docFiles(dir)): Promise<Run> {
  const env = { DE_MODE: e.mode, DE_KEY: e.key ?? '', DE_QUERY: e.query ?? '', DE_TYPE: e.type ?? '', DE_LIMIT: String(e.limit ?? 20), DE_JSON: e.json ? '1' : '', DE_MODULE: 'docs', ...ceiling(dir) };
  return awk(dir, engine('docs-entity.awk'), { args: ['part=1', join(SCRIPTS, 'doc.grammar'), 'part=2', ...files], env });
}

export interface CheckOptions {
  log?: boolean;
  files?: readonly string[];
  shebangs?: string;
  universe?: string;
}

export function check(dir: string, delta: string, { log = false, files = docFiles(dir), shebangs, universe }: CheckOptions = {}): Promise<Run> {
  const env = {
    ...ceiling(dir),
    ...(shebangs ? { DOCS_SHEBANG_LIST: shebangs } : {}),
    ...(universe ? { DOCS_UNIVERSE_LIST: universe, DOCS_UNIVERSE_LABEL: '[CHECK NOTICE]' } : {}),
  };
  return awk(dir, [engine('docs-glob.awk'), engine('docs-check.awk')], { input: delta, args: files, env, vars: log ? { delta_source: 'log' } : {} });
}

export function nudge(dir: string, task: string, files: readonly string[] = docFiles(dir), env: Record<string, string> = {}): Promise<Run> {
  return awk(dir, engine('docs-nudge.awk'), { args: [task, ...files], env: { ...ceiling(dir), ...env } });
}
