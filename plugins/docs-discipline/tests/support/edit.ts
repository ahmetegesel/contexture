import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { awk } from '@support/awk';
import type { Run } from '@support/exec';
import { SCRIPTS, WRITE } from './corpus';

export type Act = readonly ['set' | 'add' | 'remove' | 'unset', string, string?];

export interface EditRequest {
  op: string;
  slug: string;
  doc: string;
  verb?: string;
  repo?: string;
  block?: string;
  key?: string;
  kind?: string;
  after?: string;
  first?: boolean;
  remove?: boolean;
  id?: string;
  dry?: boolean;
  old?: string;
  new?: string;
  acts?: readonly Act[];
  payload?: string;
  stdin?: number;
  seed?: string;
}

export const ID_SEED = '20261107';
export const fixture = (name: string): string => join(WRITE, name);
export const golden = (name: string): string => readFileSync(fixture(name), 'utf8');

function noEol(path: string): boolean {
  const bytes = readFileSync(path);
  return bytes.length > 0 && bytes[bytes.length - 1] !== 0x0a;
}

export function edit(cwd: string, r: EditRequest): Promise<Run> {
  const acts = r.acts ?? [];
  const env: Record<string, string> = {
    EDIT_VERB: `ctx docs ${r.verb ?? r.op}`,
    EDIT_OP: r.op,
    EDIT_REPO: r.repo ?? 'wtest',
    EDIT_SLUG: r.slug,
    EDIT_NOEOL: noEol(r.doc) ? '1' : '0',
    EDIT_KIND: r.kind ?? '',
    EDIT_BLOCK: r.block ?? '',
    EDIT_KEY: r.key ?? '',
    EDIT_AFTER: r.after ?? '',
    EDIT_FIRST: r.first ? '1' : '0',
    EDIT_REMOVE: r.remove ? '1' : '0',
    EDIT_ID: r.id ?? '',
    EDIT_DRY: r.dry ? '1' : '0',
    EDIT_OLD: r.old ?? '',
    EDIT_NEW: r.new ?? '',
    EDIT_NA: String(acts.length),
    EDIT_SEED: r.seed ?? ID_SEED,
  };
  acts.forEach(([a, f, v = ''], i) => Object.assign(env, { [`EDIT_A_${i + 1}`]: a, [`EDIT_F_${i + 1}`]: f, [`EDIT_V_${i + 1}`]: v }));
  if (r.stdin !== undefined) env.EDIT_STDIN_N = String(r.stdin);
  return awk(cwd, join(SCRIPTS, 'docs-edit.awk'), {
    env,
    args: ['part=1', join(SCRIPTS, 'doc.grammar'), 'part=2', r.doc, 'part=3', r.payload ?? '/dev/null'],
  });
}
