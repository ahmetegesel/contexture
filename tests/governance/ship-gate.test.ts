import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { text } from './walk';

const read = (rel: string): string => text(join(ROOT, rel));
const RELEASE = 'bun run test:prerelease';
const RETIRED = /tests\/(run|fast)\.sh/;

const guides = (): string[] => [
  'README.md',
  'AGENTS.workspace.md',
  'tests/README.md',
  ...readdirSync(join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...readdirSync(join(ROOT, 'plugins')).flatMap((p) => ['README.md', 'tests/README.md'].map((f) => `plugins/${p}/${f}`)).filter((f) => existsSync(join(ROOT, f))),
];

const naming = (files: readonly string[], body: (f: string) => string): string[] => files.filter((f) => RETIRED.test(body(f)));

describe.concurrent('the ship-gate lines live on their declared surfaces', () => {
  it('tests/README.md carries the release command as the ship gate', () => {
    expect(read('tests/README.md')).toContain('ship gate');
    expect(read('tests/README.md')).toContain(RELEASE);
  });

  it('docs/plugins.md carries the plugin project convention and the release command', () => {
    expect(read('docs/plugins.md')).toContain('plugins/<name>/tests/');
    expect(read('docs/plugins.md')).toContain(RELEASE);
  });

  it('the AGENTS.workspace.md ship breath names the run green on the release command', () => {
    expect(read('AGENTS.workspace.md')).toContain(`the run green (${RELEASE} from tests/)`);
  });

  it('no guide names a retired shell runner, and the runners are gone', () => {
    expect(guides().length).toBeGreaterThan(10);
    expect(naming(guides(), read)).toEqual([]);
    expect(existsSync(join(ROOT, 'tests/run.sh'))).toBe(false);
    expect(existsSync(join(ROOT, 'tests/fast.sh'))).toBe(false);
  });

  it('null check: a guide planted with a retired runner name reads as naming it', () => {
    expect(naming(['planted.md'], () => 'run `tests/run.sh` before a release')).toEqual(['planted.md']);
  });

  it('the lane-isolation package folder is retired into the lane laws', () => {
    expect(existsSync(join(ROOT, 'plugins/lane-isolation'))).toBe(false);
  });
});
