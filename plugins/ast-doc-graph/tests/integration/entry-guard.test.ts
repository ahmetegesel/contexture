import { cpSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sandbox } from '@support/sandbox';
import { astDocIndex, compilerApi, count, docsRepo, miniRepo, MODULE, sqliteFts5 } from '../support/graph';

const placements: [string, (sb: string) => string][] = [
  ['through a symbolic link', (sb) => {
    symlinkSync(MODULE, join(sb, 'ast-doc-graph'));
    return join(sb, 'ast-doc-graph');
  }],
  ['under a folder whose name holds a space', (sb) => {
    mkdirSync(join(sb, 'a folder'));
    cpSync(MODULE, join(sb, 'a folder/ast-doc-graph'), { recursive: true });
    return join(sb, 'a folder/ast-doc-graph');
  }],
  ['under a non-ASCII folder', (sb) => {
    mkdirSync(join(sb, 'çalışma'));
    cpSync(MODULE, join(sb, 'çalışma/ast-doc-graph'), { recursive: true });
    return join(sb, 'çalışma/ast-doc-graph');
  }],
];

describe.skipIf(!sqliteFts5)('the entry points run as the script wherever the module sits', { concurrent: true }, () => {
  it.each(placements)('a module reached %s indexes a docs-only repository', async (_where, place) => {
    const module = place(sandbox('guard-module'));
    const repo = docsRepo('guard-docs');
    const r = await astDocIndex(repo, ['--clean'], { module });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('DOCS: 1');
    expect(count(join(repo, 'graph.db'), 'SELECT count(*) FROM rules;')).toBe(2);
  });

  it.skipIf(!compilerApi()).each(placements)('a module reached %s indexes the mini repository symbols', async (_where, place) => {
    const module = place(sandbox('guard-module'));
    const repo = miniRepo('guard-mini');
    const r = await astDocIndex(repo, ['--clean'], { module });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('SYMBOLS: ');
    expect(count(join(repo, 'graph.db'), "SELECT count(*) FROM symbols WHERE qname = 'validateCart';")).toBe(1);
  });
});
