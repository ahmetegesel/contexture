import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exec, type Run } from '@support/exec';
import { ROOT } from '@support/root';
import { sandbox } from '@support/sandbox';
import { seed, seedSteps } from '@support/snapshot';
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

export function stagedDocs(): [string, string][] {
  return [PLUGIN, SAMPLE].flatMap((root) =>
    readdirSync(join(root, 'docs'), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => readdirSync(join(root, 'docs', d.name)).filter((f) => f.endsWith('.md')).map((f): [string, string] => [`${d.name}/${f.slice(0, -3)}`, join(root, 'docs', d.name, f)])),
  );
}

async function writeCorpus(sb: string): Promise<void> {
  let pending = stagedDocs();
  for (let pass = 0; pending.length && pass < stagedDocs().length; pass++) {
    const left: [string, string][] = [];
    for (const [key, path] of pending) {
      const [repo, slug] = key.split('/');
      if ((await docs(sb, ['write', repo, slug], { input: readFileSync(path) })).code !== 0) left.push([key, path]);
    }
    pending = left;
  }
  if (pending.length) throw new Error(`the store seed refused: ${pending.map(([k]) => k).join(', ')}`);
}

export const fts5Corpus = seedSteps('docs-fts5', [
  {
    name: 'corpus',
    build: async (sb) => {
      addDocs(sb);
      await writeCorpus(sb);
      rmSync(join(sb, 'docs'), { recursive: true });
    },
  },
], 'fts5');
