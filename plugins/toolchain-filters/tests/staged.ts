import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '@support/root';
import { stage } from '@support/stage';

export const MODULE = join(ROOT, 'plugins/toolchain-filters/.contexture/extensions/modules/toolchain-filters');

export function staged(label: string): string {
  const sb = stage('posix', label);
  cpSync(MODULE, join(sb, '.contexture/extensions/modules/toolchain-filters'), { recursive: true });
  return sb;
}
