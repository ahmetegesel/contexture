import { createRequire } from 'node:module';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sandbox } from '@support/sandbox';
import { astDocIndex, compilerApi, count, miniRepo, noCompilerApiAround, sqliteFts5, TYPESCRIPT, TYPESCRIPT_7_STUB } from '../support/graph';

const STUB_ENTRY = join(realpathSync(TYPESCRIPT_7_STUB), 'lib/index.js');
const isolated = noCompilerApiAround();

function refusedCleanly(r: { code: number; stdout: string; stderr: string }, repo: string): void {
  expect(r.code).toBe(1);
  expect(r.stdout).toBe('');
  expect(r.stderr).not.toContain('src/orders/');
  expect(r.stderr).not.toMatch(/^\s+at /m);
  expect(existsSync(join(repo, 'graph.db'))).toBe(false);
}

describe.skipIf(!isolated)('a repository whose only typescript is 7 (needs no TypeScript 5 or 6 reachable from the module or the sandbox ancestors)', { concurrent: true }, () => {
  it('refuses rc 1 naming typescript 7.0.2 with its path, the variable, and the need, and writes no database', async () => {
    const repo = miniRepo('ts7-refusal', TYPESCRIPT_7_STUB);
    const r = await astDocIndex(repo, ['--clean']);
    refusedCleanly(r, repo);
    expect(r.stderr).toContain('no TypeScript compiler API reachable');
    expect(r.stderr).toContain(`typescript 7.0.2 at ${STUB_ENTRY}`);
    expect(r.stderr).toContain('AST_DOC_GRAPH_TYPESCRIPT');
    expect(r.stderr).toContain('TypeScript 5 or 6');
  });

  it.skipIf(!sqliteFts5 || !compilerApi()).each([
    ['its package folder', TYPESCRIPT],
    ['its entry file', compilerApi() ? createRequire(join(TYPESCRIPT, 'package.json')).resolve('typescript') : TYPESCRIPT],
  ])('AST_DOC_GRAPH_TYPESCRIPT naming a TypeScript 6 package by %s indexes the repository', async (_by, override) => {
    const repo = miniRepo('ts7-override', TYPESCRIPT_7_STUB);
    const r = await astDocIndex(repo, ['--clean'], { env: { AST_DOC_GRAPH_TYPESCRIPT: override } });
    expect(r.code, r.stderr).toBe(0);
    expect(count(join(repo, 'graph.db'), "SELECT count(*) FROM symbols WHERE qname = 'validateCart';")).toBe(1);
  });
});

describe.skipIf(!compilerApi())('the variable is the only candidate when set, even beside a reachable TypeScript 6', { concurrent: true }, () => {
  it('naming typescript 7 refuses rc 1 naming the variable, the version, and the path', async () => {
    const repo = miniRepo('ts7-override-stub');
    const r = await astDocIndex(repo, ['--clean'], { env: { AST_DOC_GRAPH_TYPESCRIPT: TYPESCRIPT_7_STUB } });
    refusedCleanly(r, repo);
    expect(r.stderr).toContain(`AST_DOC_GRAPH_TYPESCRIPT names typescript 7.0.2 at ${STUB_ENTRY}, which has no compiler API (createSourceFile)`);
    expect(r.stderr).toContain('TypeScript 5 or 6');
  });

  it('naming a path that loads no package refuses rc 1 naming the variable and the path', async () => {
    const repo = miniRepo('ts7-override-absent');
    const absent = join(sandbox('ts7-absent'), 'typescript');
    const r = await astDocIndex(repo, ['--clean'], { env: { AST_DOC_GRAPH_TYPESCRIPT: absent } });
    refusedCleanly(r, repo);
    expect(r.stderr).toContain(`AST_DOC_GRAPH_TYPESCRIPT names ${absent}, which loads no typescript package`);
  });
});
