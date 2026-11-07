import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec, type Run } from './exec';
import { ROOT } from './root';
import { sandbox } from './sandbox';

export const LAW_FIXTURES = join(ROOT, 'tests/laws/fixtures');
export const SYNTH = join(LAW_FIXTURES, 'synthetic');
export const GOLDEN = join(LAW_FIXTURES, 'base-only.golden');
export const CORE_SRC = join(ROOT, 'base/.contexture/laws/core.md');
export const DOCS_MOD = join(ROOT, 'plugins/docs-discipline/.contexture/extensions/modules/docs');
export const LAYER = 'AGENTS.generated.md';

export function synth(overlay?: string): string {
  const sb = sandbox('synth');
  mkdirSync(join(sb, '.contexture/laws'), { recursive: true });
  mkdirSync(join(sb, '.contexture/tmp'), { recursive: true });
  copyFileSync(join(ROOT, 'base/.contexture/ctx'), join(sb, '.contexture/ctx'));
  copyFileSync(join(ROOT, 'base/.contexture/laws/compose'), join(sb, '.contexture/laws/compose'));
  copyFileSync(join(SYNTH, 'core.md'), join(sb, '.contexture/laws/core.md'));
  cpSync(join(SYNTH, 'modules'), join(sb, '.contexture/modules'), { recursive: true });
  cpSync(join(SYNTH, 'extensions'), join(sb, '.contexture/extensions'), { recursive: true });
  if (overlay) copyFileSync(join(SYNTH, overlay), join(sb, 'AGENTS.workspace.md'));
  return sb;
}

export function compose(sb: string, ...args: string[]): Promise<Run> {
  return exec('sh', ['.contexture/laws/compose', ...args], { cwd: sb });
}

export function layerPath(sb: string): string {
  return join(sb, LAYER);
}

export function layer(sb: string): string {
  return readFileSync(layerPath(sb), 'utf8');
}

export function layerBytes(sb: string): Buffer | undefined {
  const p = layerPath(sb);
  return existsSync(p) ? readFileSync(p) : undefined;
}

export function versionOf(text: string): string | undefined {
  return /^[^\n]*v(\d+\.\d+\.\d+)/.exec(text)?.[1];
}

export function blockClauses(text: string, block: string): string[] {
  const out: string[] = [];
  let on = false;
  for (const line of text.split('\n')) {
    if (line === `@${block}`) {
      on = true;
      continue;
    }
    if (line.startsWith('@')) {
      on = false;
      continue;
    }
    if (on && line.startsWith('  ')) out.push(line.slice(2).replace(/:.*/, ''));
  }
  return out;
}

export function moduleBlock(text: string, name: string): string {
  const out: string[] = [];
  let on = false;
  for (const line of text.split('\n')) {
    if (line === `@module ${name}`) on = true;
    if (!on) continue;
    out.push(line);
    if (line.startsWith('  help: ')) break;
  }
  return out.join('\n');
}

export function lineOf(text: string, pattern: RegExp): number {
  const n = text.split('\n').findIndex((l) => pattern.test(l)) + 1;
  if (n === 0) throw new Error(`no line matches ${pattern}`);
  return n;
}

export function count(text: string, pattern: RegExp): number {
  return text.split('\n').filter((l) => pattern.test(l)).length;
}
