import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exec, type Run } from '@support/exec';
import { ROOT } from '@support/root';
import { sandbox } from '@support/sandbox';
import { seed } from '@support/snapshot';
import { stage, type Driver } from '@support/stage';
import { store } from '@support/store';
import { answer } from '@support/wire';
import { git, gitCommit, gitInit } from './git';

export const PLUGIN = join(ROOT, 'plugins/docs-discipline');
export const MODULE = join(PLUGIN, '.contexture/extensions/modules/docs');
export const SCRIPTS = join(MODULE, 'scripts');
export const TESTS = join(PLUGIN, 'tests');
export const WRITE = join(TESTS, 'write');
export const SAMPLE = join(TESTS, 'sample');
export const STAGED_SCRIPTS = '.contexture/extensions/modules/docs/scripts';

export function addModule(sb: string): void {
  cpSync(MODULE, join(sb, '.contexture/extensions/modules/docs'), { recursive: true });
}

function addDocs(sb: string): void {
  addModule(sb);
  cpSync(join(PLUGIN, 'docs'), join(sb, 'docs'), { recursive: true });
  cpSync(join(SAMPLE, 'docs'), join(sb, 'docs'), { recursive: true });
  copyFileSync(join(SAMPLE, 'backlog.md'), join(sb, 'backlog.md'));
}

export function stageDocs(driver: Driver = 'posix', label = 'docs'): string {
  const sb = stage(driver, label);
  addDocs(sb);
  return sb;
}

export interface DocsOptions {
  input?: string | Buffer;
  env?: Record<string, string>;
}

export function docs(sb: string, args: readonly string[], { input = '', env = {} }: DocsOptions = {}): Promise<Run> {
  return exec('./.contexture/ctx', ['docs', ...args], { cwd: sb, input, env: { GIT_CEILING_DIRECTORIES: dirname(sb), ...env } });
}

export const SEED_HEAD = '0000000';

export async function putDocs(sb: string, driver: Driver, docsByKey: Record<string, string | Buffer>): Promise<void> {
  const s = store(sb, driver);
  for (const [key, value] of Object.entries(docsByKey)) answer(await s.put('docs', key, value, `--head=${SEED_HEAD}`), 'store.put');
}


export function stageSeed(driver: Driver, label: string, build: (sb: string) => Promise<void> = async () => undefined): Promise<string> {
  return seed(async (sb) => {
    addDocs(sb);
    await build(sb);
  }, driver, label);
}

export function lines(text: string): string[] {
  return text.split('\n').filter(Boolean);
}


export const ENGINE_FIXTURES = join(TESTS, 'fixtures/engine');

export function corpusDir(label: string, ...roots: string[]): string {
  const dir = sandbox(label);
  for (const root of roots.length ? roots : [PLUGIN, SAMPLE]) cpSync(join(root, 'docs'), join(dir, 'docs'), { recursive: true });
  return dir;
}

export function matches(actual: string, expectedFile: string): string {
  if (process.env.DOCS_WRITE_EXPECTED === '1') {
    mkdirSync(dirname(expectedFile), { recursive: true });
    writeFileSync(expectedFile, actual);
  }
  return readFileSync(expectedFile, 'utf8');
}

export async function gwWorkspace(driver: Driver, label: string): Promise<string> {
  return seed(async (sb) => {
    addModule(sb);
    mkdirSync(join(sb, 'src'));
    writeFileSync(join(sb, 'src/gw.sh'), 'echo gw\n');
    writeFileSync(join(sb, '.gitignore'), '.contexture/\n');
    await gitInit(sb);
    await git(sb, 'add', '-A');
    await gitCommit(sb, 'h0');
    const r = await docs(sb, ['new', 'workspace', 'gw-unit', '--kind=capability', "--description=the suite's own unit", '--sources=src/gw.sh', '--keywords=gw']);
    if (r.code !== 0) throw new Error(`gw docs new: rc ${r.code}: ${r.stderr}`);
  }, driver, label);
}
