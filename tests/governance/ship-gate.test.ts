import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { text } from './walk';

const read = (rel: string): string => text(join(ROOT, rel));

describe.concurrent('the ship-gate lines live on their declared surfaces', () => {
  it('tests/README.md carries the run gate', () => {
    expect(read('tests/README.md')).toContain('ship gate');
    expect(read('tests/README.md')).toContain('tests/run.sh');
  });

  it('docs/plugins.md carries the plugin-suite gate', () => {
    expect(read('docs/plugins.md')).toContain('ship gate');
    expect(read('docs/plugins.md')).toContain('tests/run.sh');
  });

  it('the AGENTS.workspace.md ship breath names the run green', () => {
    expect(read('AGENTS.workspace.md')).toContain('the run green');
  });

  it('the lane-isolation package folder is retired into the lane laws', () => {
    expect(existsSync(join(ROOT, 'plugins/lane-isolation'))).toBe(false);
  });
});
