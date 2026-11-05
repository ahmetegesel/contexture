import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { TestProject } from 'vitest/node';
import { ROOT } from './root';

declare module 'vitest' {
  export interface ProvidedContext {
    sandboxRoot: string;
  }
}

export default function setup(project: TestProject): () => void {
  const scratch = join(ROOT, '.contexture', 'tmp');
  mkdirSync(scratch, { recursive: true });
  const root = mkdtempSync(join(scratch, 'vitest-'));
  project.provide('sandboxRoot', root);
  return () => rmSync(root, { recursive: true, force: true });
}
