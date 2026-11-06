import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';

const WORKED = join(ROOT, 'tests/fixtures/worked-package');

describe('the worked example package', () => {
  it('[modules-r18] carries its package manifest and its test, which the packages project runs', () => {
    expect(existsSync(join(WORKED, 'manifest'))).toBe(true);
    expect(existsSync(join(WORKED, 'tests/notes.test.ts'))).toBe(true);
  });
});
