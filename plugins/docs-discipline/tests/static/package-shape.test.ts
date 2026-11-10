import { accessSync, constants, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODULE, PLUGIN } from '../support/corpus';

describe('the docs-discipline package shape', () => {
  it('[plugins-r1] mirrors the extension root: the module and its rhythms, no shared templates part', () => {
    expect(readdirSync(join(PLUGIN, '.contexture/extensions')).sort()).toEqual(['modules', 'rhythms']);
    expect(existsSync(join(PLUGIN, '.contexture/extensions/templates'))).toBe(false);
  });

  it('[plugins-r1, plugins-r2] carries the grammar asset inside the module scripts', () => {
    expect(existsSync(join(MODULE, 'scripts/doc.grammar'))).toBe(true);
  });

  it.each(['install', 'uninstall'])('[plugins-r2, modules-r13] ships the %s part hook executable', (hook) => {
    expect(() => accessSync(join(MODULE, hook), constants.X_OK)).not.toThrow();
  });

  it.each(['task-landing', 'load-end'])('[plugins-r2, modules-r5] ships the %s handler executable', (hook) => {
    expect(() => accessSync(join(MODULE, 'hooks', hook), constants.X_OK)).not.toThrow();
  });
});
