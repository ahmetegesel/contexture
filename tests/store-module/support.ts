import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Run } from '../support/exec';
import { fresh, seed } from '../support/snapshot';
import { run } from '../support/unit';

export const INV = 'ERR_INVALID_ARGUMENT';
export const SV = 'ERR_SCHEMA_VIOLATION';
export const EXISTS = 'ERR_ENTITY_EXISTS';
export const MISSING = 'ERR_ENTITY_NOT_FOUND';

export const store = (sb: string, args: readonly string[], input = ''): Promise<Run> => run(sb, ['store', ...args], { input });

export const IDEAS = [
  'what: required block',
  'why: optional block',
  'status: optional line one-of OPEN|PICKED|DROPPED default OPEN',
  'dumped: optional line default today',
  'picked_by: optional line',
];

export const declareFlags = (description: string, minting: 'given' | 'generated', fields: readonly string[]): string[] => [
  `--description=${description}`,
  `--minting=${minting}`,
  ...fields.map((f) => `--add-fields=${f}`),
];

export async function declare(sb: string, name: string, minting: 'given' | 'generated' = 'given', fields: readonly string[] = IDEAS): Promise<void> {
  const r = await store(sb, ['put', `containers/${name}`, ...declareFlags(`the ${name} container`, minting, fields)]);
  if (r.code !== 0) throw new Error(`declare ${name}: rc ${r.code}: ${r.stderr}`);
}

export async function snapshot(label: string, build: (sb: string) => Promise<void> = async () => undefined): Promise<() => string> {
  const snap = await seed(build, 'posix', label);
  return () => fresh(snap);
}

export function stored(sb: string): string[] {
  const root = join(sb, '.contexture/store');
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true }).map(String).sort();
}

export const refused = (r: Run, verb: string, code: string, message: string): void => {
  if (r.code !== 1 || r.stdout !== '' || r.stderr !== `store ${verb}: error: ${message} (${code})\n`) {
    throw new Error(`expected rc 1 store ${verb}: ${message} (${code}); got rc ${r.code} stdout ${JSON.stringify(r.stdout)} stderr ${JSON.stringify(r.stderr)}`);
  }
};
