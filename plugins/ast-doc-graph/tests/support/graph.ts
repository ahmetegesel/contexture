import { cpSync, mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { exec, type Run } from '@support/exec';
import { ROOT } from '@support/root';
import { sandbox } from '@support/sandbox';
import { sqlite } from '@support/sqlite';
import { probeFts5 } from '@support/stage';

export const PLUGIN = join(ROOT, 'plugins/ast-doc-graph');
export const MODULE = join(PLUGIN, '.contexture/extensions/modules/ast-doc-graph');
export const FIXTURES = join(PLUGIN, 'tests/fixtures');
export const SCHEMA = join(MODULE, 'schema.sql');

export const sqliteFts5 = probeFts5();

export function seededDb(label: string): string {
  const db = join(sandbox(label), 'graph.db');
  sqlite(db, readFileSync(SCHEMA, 'utf8'));
  sqlite(db, readFileSync(join(FIXTURES, 'schema-seed.sql'), 'utf8'));
  return db;
}

export const count = (db: string, sql: string): number => Number(sqlite(db, sql).trim());

export function graphQuery(cwd: string, db: string, ...args: string[]): Promise<Run> {
  return exec(join(MODULE, 'bin/graph-query'), [...args, '--db', db], { cwd });
}

export const TYPESCRIPT = join(ROOT, 'tests/node_modules/typescript');

export function compilerApi(): boolean {
  try {
    return typeof createRequire(join(TYPESCRIPT, 'package.json'))('typescript').createSourceFile === 'function';
  } catch {
    return false;
  }
}

export function miniRepo(label: string): string {
  const sb = sandbox(label);
  cpSync(join(FIXTURES, 'mini-repo'), sb, { recursive: true });
  mkdirSync(join(sb, 'node_modules'));
  symlinkSync(TYPESCRIPT, join(sb, 'node_modules/typescript'));
  return sb;
}

export function docsRepo(label: string): string {
  const sb = sandbox(label);
  cpSync(join(FIXTURES, 'mini-repo/docs'), join(sb, 'docs'), { recursive: true });
  return sb;
}

export interface IndexOptions {
  cwd?: string;
  env?: Record<string, string>;
  module?: string;
}

export function astDocIndex(repo: string, args: readonly string[] = [], { cwd = repo, env = {}, module = MODULE }: IndexOptions = {}): Promise<Run> {
  return exec(join(module, 'bin/ast-doc-index'), ['--repo-root', repo, '--db', join(repo, 'graph.db'), ...args], { cwd, env });
}
