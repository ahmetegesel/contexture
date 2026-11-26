import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { PRERELEASE, probeFts5, probeSqlite } from './probe';
import { ROOT } from './root';

declare module 'vitest' {
  export interface ProvidedContext {
    sandboxRoot: string;
  }
}

export default function setup(project: TestProject): () => void {
  if (PRERELEASE && !(probeSqlite() && probeFts5())) {
    throw new Error('the pre-release set needs sqlite3 3.44 or later with FTS5 on PATH: a skipped sqlite driver case, FTS5 graph case, or bypass guard proves nothing');
  }
  const scratch = join(ROOT, '.contexture', 'tmp');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'vitest-'));
  project.provide('sandboxRoot', root);
  return () => rmSync(root, { recursive: true, force: true });
}
