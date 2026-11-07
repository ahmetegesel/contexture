import { appendFileSync, cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { data } from './data';
import { RECORD_ROOT } from './drawer';
import type { Run } from './exec';
import { ROOT } from './root';
import { answer, payload, type Payload } from './wire';

export const DATE = '2026-09-27';
export const COMPLIANCE = join(ROOT, 'tests/fixtures/compliance');

export function mk(sb: string, unit: string, objective = `compliance unit ${unit}`): Promise<Run> {
  return data(sb, 'session.create', [unit], payload().kv('objective', objective).kv('attention', 'compliance fixture').toString());
}

export interface RecOptions {
  thread?: string;
  with?: Payload;
  date?: string;
}

export function rec(sb: string, unit: string, epoch: number, what: string, { thread = 'none', with: before = payload(), date = DATE }: RecOptions = {}): Promise<Run> {
  return data(sb, 'entry.record', [unit], before.kv('what', what).kv('thread', thread).kv('date', date).kv('epoch', String(epoch)).toString());
}

export async function ok(sb: string, fn: string, args: readonly string[], input: Payload | string = ''): Promise<any> {
  return answer(await data(sb, fn, args, input.toString()), fn);
}

export async function reads(sb: string, unit: string): Promise<string> {
  const calls: string[][] = [['session.load', unit], ['session.board', unit], ['task.list', unit, 'all'], ['entry.list', unit], ['finding.list', unit, 'all']];
  let text = '';
  for (const [fn, ...args] of calls) {
    const r = await data(sb, fn, args);
    text += `${fn}: rc ${r.code}\n${r.stdout}`;
  }
  return text;
}

export function entryJson(slug: string, occ: number, seq: number, anchor: string, what: string, group: string, thread: string, refs: string, closers: string, next: string, closure?: [string, string, string]): string {
  const closed = closure ? `,"closed":${closure[0]},"closed_by":${closure[1]},"close_reason":${closure[2]}` : '';
  return `{"kind":"entry","slug":"${slug}","occurrence":${occ},"seq":${seq},"anchor":${anchor},"what":"${what}","group":${group},"rhythm":null,"knowledge":false,"thread":${thread},"legacy_status":null,"refs":${refs},"closers":${closers},"extra_fields":[],"head_text":null,"extra_lines":[]${closed},"next":${next}}`;
}

export const receiptJson = (slug: string, seq: number, what: string): string => entryJson(slug, 1, seq, '"A1"', what, 'null', '"none"', '[]', '[]', 'null');

export function artifactPath(sb: string, unit: string, artifact: string): string {
  return join(sb, RECORD_ROOT, unit, `${artifact.replace(/^lane\//, 'lanes/')}.md`);
}

export function plantUnit(sb: string, unit: string, fixture = unit, root = RECORD_ROOT): void {
  const dest = join(sb, root, unit);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(COMPLIANCE, 'units', fixture), dest, { recursive: true });
}

export function readArtifact(sb: string, unit: string, artifact: string): Buffer {
  return readFileSync(artifactPath(sb, unit, artifact));
}

export function appendArtifact(sb: string, unit: string, artifact: string, text: string): void {
  appendFileSync(artifactPath(sb, unit, artifact), text);
}
