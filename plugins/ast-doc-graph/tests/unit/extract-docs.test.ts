import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '@support/root';
import { extractEvidenceSymbols, parseArray, parseDocMarkdown, slugify, unquote } from '../../.contexture/extensions/modules/ast-doc-graph/extractors/docs/extract-docs';

const DOCS_PLUGIN = join(ROOT, 'plugins/docs-discipline');
const corpus = (): [string, string][] =>
  [join(DOCS_PLUGIN, 'docs'), join(DOCS_PLUGIN, 'tests/sample/docs')].flatMap((root) =>
    readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .flatMap((d) => readdirSync(join(root, d.name)).filter((f) => f.endsWith('.md')).map((f): [string, string] => [`docs/${d.name}/${f}`, join(root, d.name, f)])),
  );

const parsed = () => corpus().map(([rel, path]) => parseDocMarkdown(readFileSync(path, 'utf8'), rel));

describe('the docs extractor in process', { concurrent: true }, () => {
  it('reads the docs-discipline sample and seed: 5 docs, 17 rules, 3 pitfalls', () => {
    const all = parsed();
    expect(all.filter((p) => p.doc).length).toBe(5);
    expect(all.flatMap((p) => p.rules).length).toBe(17);
    expect(all.flatMap((p) => p.pitfalls).length).toBe(3);
  });

  it('parses a doc header: its repo, kind, summary, sources, and keywords', () => {
    const flow = parseDocMarkdown(readFileSync(join(DOCS_PLUGIN, 'tests/sample/docs/demo-orders/order-flow.md'), 'utf8'), 'docs/demo-orders/order-flow.md');
    expect(flow.doc).toMatchObject({ repo: 'demo-orders', kind: 'capability', summary: 'Cart validation, pricing, and order persistence for the demo storefront' });
    expect(flow.doc?.keywords).toEqual(['orders', 'checkout', 'pricing', 'validation']);
    expect(flow.doc?.sources.length).toBeGreaterThan(0);
  });

  it('reads a pitfall with its severity, type, trigger, and evidence symbols', () => {
    const flow = parseDocMarkdown(readFileSync(join(DOCS_PLUGIN, 'tests/sample/docs/demo-orders/order-flow.md'), 'utf8'), 'docs/demo-orders/order-flow.md');
    const p1 = flow.pitfalls.find((p) => p.statement === 'A retried checkout can persist the same cart twice');
    expect(p1).toMatchObject({ severity: 'high', type: 'bug', evidence_symbols: ['validateCart'] });
    expect(p1?.trigger).toContain('retries POST /orders');
  });

  it('[ast-doc-graph-r7] skips and counts every rule or pitfall met before any @doc line, a bang pitfall line among them, and keeps the unit that follows', () => {
    const r = parseDocMarkdown(
      [
        '@contract',
        '  - rule: "A quoted grammar rule"',
        '    evidence: "quotedWork"',
        '',
        '! [high/bug] stray-p1: A quoted bang pitfall',
        '',
        '@pitfalls',
        '  - id: stray-p2',
        '    summary: "A quoted pitfall"',
        '',
        '@doc structural alpha',
        '  repo: w',
        '  description: "alpha"',
        '',
        '@contract',
        '  - rule: "Alpha holds"',
        '    evidence: "alphaWork"',
      ].join('\n'),
      'docs/w/alpha.md',
    );
    expect(r.doc?.id).toBe('doc:w:alpha');
    expect(r.rules.map((x) => [x.doc_id, x.statement])).toEqual([['doc:w:alpha', 'Alpha holds']]);
    expect(r.pitfalls).toEqual([]);
    expect(r.unitless).toBe(3);
  });

  it('extracts evidence symbols: identifiers and qnames kept, file paths and keywords dropped', () => {
    expect(extractEvidenceSymbols('validateCart; OrderService.save, src/order/x.ts')).toEqual(['validateCart', 'OrderService.save']);
    expect(extractEvidenceSymbols('')).toEqual([]);
    expect(extractEvidenceSymbols(null)).toEqual([]);
  });

  it.each([
    ['"quoted"', 'quoted'],
    ["'single'", 'single'],
    ['  bare  ', 'bare'],
    ['"esc \\"inner\\""', 'esc "inner"'],
  ])('unquote %j', (raw, want) => {
    expect(unquote(raw)).toBe(want);
  });

  it('parseArray reads a bracketed, quoted list and drops empties', () => {
    expect(parseArray('[a/**, "b c", , \'d\']')).toEqual(['a/**', 'b c', 'd']);
    expect(parseArray('')).toEqual([]);
  });

  it('slugify keeps the first sentence, lowercased and dashed, within its bound', () => {
    expect(slugify('Record the phase: then more')).toBe('record-the-phase');
    expect(slugify('')).toBe('item');
    expect(slugify('x'.repeat(60)).length).toBe(40);
  });
});
