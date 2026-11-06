import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODULE, PLUGIN } from '../support/corpus';

describe('the docs-discipline package shape', () => {
  it('mirrors the extension root: the module and its rhythms, no shared templates part', () => {
    expect(readdirSync(join(PLUGIN, '.contexture/extensions')).sort()).toEqual(['modules', 'rhythms']);
    expect(existsSync(join(PLUGIN, '.contexture/extensions/templates'))).toBe(false);
  });

  it('carries the grammar asset inside the module scripts', () => {
    expect(existsSync(join(MODULE, 'scripts/doc.grammar'))).toBe(true);
  });

  it.each(['install', 'uninstall'])('ships the %s part hook executable', (hook) => {
    expect(() => accessSync(join(MODULE, hook), constants.X_OK)).not.toThrow();
  });
});
