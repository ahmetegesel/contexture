import { join } from 'node:path';
import { exec, type Run } from './exec';

export function data(sb: string, fn: string, args: readonly string[] = [], payload = '', env: Record<string, string> = {}): Promise<Run> {
  return exec(join(sb, '.contexture/modules/unit/scripts/data'), [fn, ...args], {
    cwd: sb,
    input: payload,
    env: { CTX_STORE_ROOT: sb, CTX_STORE_RESOLVER: join(sb, '.contexture/storage/scripts/driver-resolver'), ...env },
  });
}
