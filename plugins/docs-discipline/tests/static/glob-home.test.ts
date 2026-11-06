import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCRIPTS } from '../support/corpus';

const definers = (name: string): string[] =>
  readdirSync(SCRIPTS)
    .sort()
    .filter((f) => readFileSync(join(SCRIPTS, f), 'utf8').includes(`function ${name}(`));

describe('the one glob definition the check and the owner query share', { concurrent: true }, () => {
  it.each(['split_sources', 'glob_to_regex', 'source_matches', 'source_literal', 'source_wildcards', 'source_beats'])('only docs-glob.awk defines %s', (name) => {
    expect(definers(name)).toEqual(['docs-glob.awk']);
  });
});
