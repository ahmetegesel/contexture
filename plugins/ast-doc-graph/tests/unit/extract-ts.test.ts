import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveTypeScript } from '../../.contexture/extensions/modules/ast-doc-graph/extractors/ts/extract-ts';
import { compilerApi, miniRepo, noCompilerApiAround, TYPESCRIPT, TYPESCRIPT_7_STUB } from '../support/graph';

const STUB_ENTRY = join(realpathSync(TYPESCRIPT_7_STUB), 'lib/index.js');

describe('the compiler API resolution in process', { concurrent: true }, () => {
  it('an override at the typescript 7 stub refuses naming the variable, the version, and the path', () => {
    expect(() => resolveTypeScript([], TYPESCRIPT_7_STUB)).toThrow(`AST_DOC_GRAPH_TYPESCRIPT names typescript 7.0.2 at ${STUB_ENTRY}, which has no compiler API (createSourceFile)`);
  });

  it.skipIf(!compilerApi())('an override at the tests typescript 6.0.3 is the compiler API, whatever the search paths hold', () => {
    const ts = resolveTypeScript([miniRepo('resolve-beside-stub', TYPESCRIPT_7_STUB)], TYPESCRIPT);
    expect([ts.version, typeof ts.createSourceFile]).toEqual(['6.0.3', 'function']);
  });

  it.skipIf(!compilerApi())('unset, a search path holding typescript 6.0.3 resolves it', () => {
    const ts = resolveTypeScript([miniRepo('resolve-six')], '');
    expect([ts.version, typeof ts.createSourceFile]).toEqual(['6.0.3', 'function']);
  });

  it.skipIf(!noCompilerApiAround())('unset, a search path holding only the typescript 7 stub refuses naming each typescript found and the variable (needs no TypeScript 5 or 6 reachable from the module or the sandbox ancestors)', () => {
    const run = () => resolveTypeScript([miniRepo('resolve-stub', TYPESCRIPT_7_STUB)], '');
    expect(run).toThrow(`typescript 7.0.2 at ${STUB_ENTRY}`);
    expect(run).toThrow('AST_DOC_GRAPH_TYPESCRIPT');
  });
});
