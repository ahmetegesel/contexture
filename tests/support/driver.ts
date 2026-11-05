import { join } from 'node:path';
import { exec, type Run } from './exec';
import type { Driver } from './stage';

export function driverPath(sb: string, driver: Driver): string {
  return driver === 'fts5'
    ? join(sb, '.contexture/extensions/storage/drivers/fts5/driver')
    : join(sb, '.contexture/storage/drivers/posix/driver');
}

export function driverOp(sb: string, driver: Driver, op: string, args: readonly string[] = [], input: string | Buffer = ''): Promise<Run> {
  return exec(driverPath(sb, driver), [op, ...args], { cwd: sb, input });
}
