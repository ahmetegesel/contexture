import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOCS_SHAPED, dataFile } from './data-file';
import { driverOp } from './driver';
import type { Run } from './exec';
import { seed } from './snapshot';
import type { Driver } from './stage';
import { answer, b64 } from './wire';

export type Action = { action: 'put'; key: string; value: Buffer | string; head?: string } | { action: 'delete'; key: string; head?: string };

export function batchPayload(actions: readonly Action[]): string {
  return actions
    .map((a) => {
      const head = a.head === undefined ? '' : `head=${a.head}\n`;
      return a.action === 'put' ? `action=put\nkey=${a.key}\n${head}value_b64=${b64(a.value)}\n` : `action=delete\nkey=${a.key}\n${head}`;
    })
    .join('');
}

export function store(sb: string, driver: Driver, env: Record<string, string> = {}) {
  const op = (name: string, args: readonly string[], input: string | Buffer = '') => driverOp(sb, driver, name, args, input, env);
  return {
    put: (ns: string, key: string, value: Buffer | string, ...flags: string[]): Promise<Run> => op('store.put', [ns, key, ...flags], value),
    get: (ns: string, key: string): Promise<Run> => op('store.get', [ns, key]),
    del: (ns: string, key: string, ...flags: string[]): Promise<Run> => op('store.delete', [ns, key, ...flags]),
    list: (...args: string[]): Promise<Run> => op('store.list', args),
    scan: (...args: string[]): Promise<Run> => op('store.scan', args),
    changes: (...args: string[]): Promise<Run> => op('store.changes', args),
    batch: (ns: string, actions: readonly Action[] | string): Promise<Run> =>
      op('store.batch', [ns], typeof actions === 'string' ? actions : batchPayload(actions)),
    search: (ns: string, mode: string, limit: string, input: string): Promise<Run> => op('store.search', [ns, mode, limit], input),
    op,
  };
}

export const DOCS_KEYS: [string, Buffer][] = [
  ['workspace/B', Buffer.from('B\n')],
  ['workspace/a', Buffer.from('a\n')],
  ['workspace/aa', Buffer.from('aa\n')],
  ['workspace/binary', Buffer.from([0x61, 0x00, 0x62, 0xff])],
  ['workspace/q"uote', Buffer.from('quote\n')],
  ['workspace/türkçe', Buffer.from('turkce\n')],
];

export const listAnswer = (ns: string, keys: readonly string[]) => `${JSON.stringify({ namespace: ns, keys })}\n`;

export function docsStore(driver: Driver, withKeys: boolean): Promise<string> {
  return seed(async (sb) => {
    dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
    if (!withKeys) return;
    const s = store(sb, driver);
    for (const [key, value] of DOCS_KEYS) answer(await s.put('docs', key, value), 'store.put');
  }, driver, withKeys ? 'docs-keys' : 'docs-store');
}

export function plantScript(sb: string, script: string, body: string): () => void {
  const path = join(sb, '.contexture/storage/scripts', script);
  const saved = `${path}.real`;
  copyFileSync(path, saved);
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return () => copyFileSync(saved, path);
}
