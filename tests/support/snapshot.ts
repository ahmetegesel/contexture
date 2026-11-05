import { constants, cpSync } from 'node:fs';
import { basename } from 'node:path';
import { sandbox } from './sandbox';
import { stage, type Driver } from './stage';

export async function seed(build: (sb: string) => Promise<void>, driver: Driver = 'posix', label = 'seed'): Promise<string> {
  const sb = stage(driver, label);
  await build(sb);
  return sb;
}

export function fresh(snapshot: string): string {
  const sb = sandbox(`${basename(snapshot)}-copy`);
  cpSync(snapshot, sb, { recursive: true, mode: constants.COPYFILE_FICLONE, preserveTimestamps: true });
  return sb;
}
