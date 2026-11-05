import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { inject } from 'vitest';

export function sandbox(label: string): string {
  return mkdtempSync(join(inject('sandboxRoot'), `${label}-`));
}
