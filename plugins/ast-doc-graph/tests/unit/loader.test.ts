import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sandbox } from '@support/sandbox';
import {
  candidateDocIdsForFile,
  computeDerivedEdges,
  docFileCandidates,
  type DocPitfallRecord,
  type DocRecord,
  type DocRuleRecord,
  fileMatchesGlobs,
  reconcileFiles,
  resolveDocFile,
  type SymbolRecord,
  unitsOfFile,
} from '../../.contexture/extensions/modules/ast-doc-graph/loader/index-graph';

const sym = (id: string, name: string, qname: string, file: string): SymbolRecord => ({ id, name, qname, kind: 'function', file, line_start: 1, line_end: 2 }) as SymbolRecord;
const byKey = (all: SymbolRecord[], key: 'name' | 'qname') => {
  const m = new Map<string, SymbolRecord[]>();
  for (const s of all) m.set(s[key], [...(m.get(s[key]) ?? []), s]);
  return m;
};

describe('the loader helpers in process', { concurrent: true }, () => {
  it.each<[string, string[], boolean]>([
    ['src/order/validate.ts', ['src/order/**'], true],
    ['src/order/deep/validate.ts', ['src/**/validate.ts'], true],
    ['src/order/validate.ts', ['src/*.ts'], false],
    ['./src/a.ts', ['src/a.ts'], true],
    ['src/cart/a.ts', ['src/cart/'], true],
    ['src/cart/a.ts', ['src/order/**'], false],
  ])('[ast-doc-graph-r9] fileMatchesGlobs %s against %j is %s', (file, sources, want) => {
    expect(fileMatchesGlobs(file, sources)).toBe(want);
  });

  it('[ast-doc-graph-r6] candidateDocIdsForFile maps a docs path to its id forms', () => {
    expect(candidateDocIdsForFile('docs/demo-orders/order-flow.md')).toEqual(['doc:demo-orders:order-flow', 'doc:order-flow', 'doc:docs:demo-orders:order-flow']);
  });

  it('[ast-doc-graph-r6] resolveDocFile finds the file a doc id names under the project root, and null otherwise', () => {
    const root = sandbox('loader-resolve');
    mkdirSync(join(root, 'docs/demo-orders'), { recursive: true });
    writeFileSync(join(root, 'docs/demo-orders/order-flow.md'), '@doc capability order-flow\n');
    expect(resolveDocFile('doc:demo-orders:order-flow', root)).toBe('docs/demo-orders/order-flow.md');
    expect(resolveDocFile('doc:nosuch', root)).toBeNull();
    expect(resolveDocFile('sym:1', root)).toBeNull();
  });

  it('[ast-doc-graph-r1] reconcileFiles names the indexed files the disk lacks and the discovered files the graph lacks inside a folder it covers for their kind', () => {
    const indexed = ['src/a.ts', 'src/gone.ts', 'docs/w/x.md'];
    const discovered = ['src/a.ts', 'src/new/b.ts', 'tools/c.ts', 'docs/w/y.md', 'src/notes.md', 'docs/w/z.ts'];
    const disk = new Set(['docs/w/x.md', ...discovered]);
    expect(reconcileFiles(indexed, discovered, (f) => disk.has(f))).toEqual({ added: ['src/new/b.ts', 'docs/w/y.md'], gone: ['src/gone.ts'] });
  });

  it('[ast-doc-graph-r1] unitsOfFile inverts resolveDocFile: the units whose first existing candidate file is the one named, present or gone', () => {
    const ids = ['doc:w:x', 'doc:w:y', 'doc:x'];
    expect(unitsOfFile('docs/w/x.md', ids, () => false)).toEqual(['doc:w:x']);
    expect(unitsOfFile('docs/x.md', ids, () => false)).toEqual(['doc:w:x', 'doc:x']);
    expect(unitsOfFile('docs/x.md', ids, (f) => f === 'docs/w/x.md')).toEqual(['doc:x']);
    expect(docFileCandidates('sym:1')).toEqual([]);
  });

  it('[ast-doc-graph-r9] computeDerivedEdges links rules, pitfalls, and docs, a bare name disambiguated by the doc sources', () => {
    const symbols = [
      sym('sym:1', 'validateCart', 'validateCart', 'src/order/validate.ts'),
      sym('sym:2', 'save', 'OrderStore.save', 'src/order/store.ts'),
      sym('sym:3', 'save', 'CartStore.save', 'src/cart/store.ts'),
    ];
    const doc: DocRecord = { id: 'doc:order-flow', repo: 'demo', kind: 'capability', summary: 's', sources: ['src/order/**'], keywords: [] } as DocRecord;
    const rule = { id: 'rule:r1', doc_id: doc.id, statement: 's', evidence_symbols: ['validateCart', 'save'], evidence_raw: null, detail: null, anti: null, good: null } as DocRuleRecord;
    const pitfall = { id: 'pitfall:p1', doc_id: doc.id, severity: 'high', type: 'bug', statement: 's', trigger: null, evidence_symbols: ['CartStore.save'], evidence_raw: null } as DocPitfallRecord;
    const edges: string[] = [];
    computeDerivedEdges([rule], [pitfall], [doc], symbols, byKey(symbols, 'qname'), byKey(symbols, 'name'), new Map([[doc.id, doc]]), (s, t, k) => edges.push(`${k} ${s} ${t}`));
    expect(edges).toContain('GOVERNS rule:r1 sym:1');
    expect(edges).toContain('GOVERNS rule:r1 sym:2');
    expect(edges).not.toContain('GOVERNS rule:r1 sym:3');
    expect(edges).toContain('WARNS pitfall:p1 sym:3');
    expect(edges).toContain('COVERS doc:order-flow sym:1');
    expect(edges).toContain('COVERS doc:order-flow sym:2');
    expect(edges).not.toContain('COVERS doc:order-flow sym:3');
  });
});
