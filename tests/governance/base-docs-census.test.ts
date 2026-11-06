import { cpSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sandbox } from '../support/sandbox';
import { stage } from '../support/stage';
import { put } from '../support/tree';
import { text, walk } from './walk';

const DOCS_REF = /modules\/docs|docs-edit\.awk|docs-model\.awk/;

const census = (dir: string): string[] => walk(dir).filter((f) => DOCS_REF.test(text(f)));

describe.concurrent('the no-base-to-docs census', () => {
  it('the shipped base carries no docs module or docs parser reference', () => {
    const drawer = join(stage('posix', 'census'), '.contexture');
    expect(walk(drawer).length).toBeGreaterThan(50);
    expect(census(drawer)).toEqual([]);
  });

  it('a planted base-to-docs reference reads red', () => {
    const copy = join(sandbox('census-plant'), 'base');
    cpSync(join(stage('posix', 'census'), '.contexture'), copy, { recursive: true });
    put(join(copy, 'plant'), 'modules/docs\n');
    expect(census(copy)).toEqual([join(copy, 'plant')]);
  });
});
