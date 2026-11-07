import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { data } from './data';
import { RECORD_ROOT } from './drawer';
import { exec, type Run } from './exec';
import { artifactPath } from './record';

export interface CtxOptions {
  input?: string | Buffer | null;
  env?: Record<string, string>;
}

export function run(sb: string, args: readonly string[], { input = '', env }: CtxOptions = {}): Promise<Run> {
  return exec('./.contexture/ctx', args, { cwd: sb, input, env });
}

export function printfFormat(value: string | Buffer): string {
  let format = '';
  for (const c of typeof value === 'string' ? Buffer.from(value) : value) format += c >= 0x20 && c < 0x7f && c !== 0x5c && c !== 0x25 ? String.fromCharCode(c) : `\\${c.toString(8).padStart(3, '0')}`;
  return format;
}

const DECODE = 'for a; do v=$(printf "x${a}y"); v=${v#x}; v=${v%y}; set -- "$@" "$v"; shift; done; exec "$@"';

export function execBytes(sb: string, argv: readonly (string | Buffer)[], { input = '', env }: CtxOptions = {}): Promise<Run> {
  return exec('sh', ['-c', DECODE, 'sh', ...argv.map(printfFormat)], { cwd: sb, input, env });
}

export const unit = (sb: string, ...args: string[]): Promise<Run> => run(sb, ['unit', ...args]);
export const lane = (sb: string, ...args: string[]): Promise<Run> => run(sb, ['lane', ...args]);

export async function must(r: Promise<Run>): Promise<Run> {
  const done = await r;
  if (done.code !== 0) throw new Error(`rc ${done.code}: ${done.stderr}${done.stdout}`);
  return done;
}

export async function seedUnit(sb: string, slug: string, objective = `${slug} objective`): Promise<void> {
  await must(unit(sb, 'bootstrap', slug, objective));
}

export const LANE_BRIEF: Readonly<Record<string, string>> = {
  goal: 'the test lane goal; it stops at its report',
  branch: 'the sandbox checkout on its current branch',
  writes: 'read only',
  scope: 'answer the test question; stop when it is answered',
  report: 'FINDINGS :: each answer with its grounding',
};

export function laneFlags(extra: readonly string[] = []): string[] {
  const given = new Set(extra.map((f) => /^--([a-z]+)/.exec(f)?.[1]));
  return [...Object.entries(LANE_BRIEF).filter(([name]) => !given.has(name)).map(([name, v]) => `--${name}=${v}`), ...extra];
}

export function createLane(sb: string, unitSlug: string, laneSlug: string, extra: readonly string[] = []): Promise<Run> {
  return run(sb, ['lane', 'create', unitSlug, laneSlug, ...laneFlags(extra)]);
}

export function rhythm(name: string, use: string, gates: readonly [string, string][]): string {
  return [`@rhythm ${name}`, `  use when: ${use}`, '  activation: propose', ...gates.map(([g, t], i) => `  ${i + 1}. ${g}: ${t}`), ''].join('\n');
}

export function plantRhythms(sb: string): void {
  const ws = join(sb, '.contexture/rhythms');
  const ext = join(sb, '.contexture/extensions/rhythms');
  mkdirSync(ws, { recursive: true });
  mkdirSync(ext, { recursive: true });
  writeFileSync(join(ws, 'probe.md'), rhythm('probe', 'the suite needs an index line', [['OPEN', 'the workspace probe gate'], ['CLOSE', 'the workspace probe close gate']]));
  writeFileSync(join(ext, 'extprobe.md'), rhythm('extprobe', 'the suite needs an extension index line', [['OPEN', 'the extension probe gate'], ['CLOSE', 'the extension probe close gate']]));
}

export function plantArtifact(sb: string, unitSlug: string, artifact: string, text: string | Buffer): void {
  const path = artifactPath(sb, unitSlug, artifact);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
}

export async function unitChecksum(sb: string, unitSlug: string, lanes: readonly string[] = []): Promise<string> {
  const said = async (fn: string, ...args: string[]): Promise<Run> => {
    const r = await data(sb, fn, args);
    picture.push(`${fn} ${args.join(' ')}: rc ${r.code}\n${r.stdout}${r.stderr}`);
    return r;
  };
  const picture: string[] = [];
  await said('session.load', unitSlug);
  await said('task.list', unitSlug, 'all');
  const entries = await said('entry.list', unitSlug);
  await said('finding.list', unitSlug, 'all');
  const slugs = [...new Set([...entries.stdout.matchAll(/"slug":"([^"]*)"/g)].map((m) => m[1] ?? ''))].sort();
  for (const s of slugs) await said('entry.get', unitSlug, s);
  for (const l of lanes) for (const a of ['recipe', 'journal', 'report']) await said('lane.get', unitSlug, l, a);
  const files = await exec('sh', ['-c', 'd=$2/$1; [ -d "$d" ] || exit 0; find "$d" -type f -name "*.md" | LC_ALL=C sort | while IFS= read -r f; do printf "%s\\n" "$f"; cat "$f"; done', 'sh', unitSlug, RECORD_ROOT], { cwd: sb });
  picture.push(files.stdout);
  return picture.join('\n');
}

export function activeBlocks(listing: string): Record<string, string> {
  const blocks: Record<string, string> = {};
  for (const block of listing.split(/\n\n+/)) {
    const head = block.split('\n')[0]?.trim();
    if (head) blocks[head] = block;
  }
  return blocks;
}

export function lines(text: string): string[] {
  return text.split('\n').filter((l) => l !== '');
}

export async function waitFor(pred: () => boolean, ms: number, step = 20): Promise<boolean> {
  const end = Date.now() + ms;
  for (;;) {
    if (pred()) return true;
    if (Date.now() > end) return false;
    await new Promise((done) => setTimeout(done, step));
  }
}
