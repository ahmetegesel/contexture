import { describe, expect, it } from 'vitest';
import { parseDocMarkdown } from '../../.contexture/extensions/modules/ast-doc-graph/extractors/docs/extract-docs';

const pitfall = (id: string, summary: string): string[] => [`  - id: ${id}`, `    summary: "${summary}"`, '    class: gotcha', '    severity: low', '    trigger: "A trigger"', '    consequence: "A consequence"', '    evidence: "pitSym"'];

const DOC = [
  '@doc structural eg',
  '  repo: workspace',
  '  description: "A doc keyed in both id forms"',
  '  sources: [src/eg/**]',
  '',
  '@contract',
  '  - rule: "The numbered rule holds"',
  '    id: eg-r2',
  '    evidence: "numberedSym"',
  '  - rule: "The opaque rule holds"',
  '    id: eg-r-k3x9m',
  '    evidence: "opaqueSym"',
  '',
  '@pitfalls',
  ...pitfall('eg-p3', 'A numbered pitfall'),
  ...pitfall('eg-p-a1b2c', 'An opaque pitfall'),
  '',
].join('\n');

describe('the docs extractor over a corpus keyed in either id form', () => {
  it('[ast-doc-graph-r8] skips the id line of a numbered and an opaque contract rule, and keys each pitfall by its id less the doc slug', () => {
    const p = parseDocMarkdown(DOC, 'docs/workspace/eg.md');
    expect(p.rules.map((r) => [r.id, r.statement, r.evidence_symbols, r.detail])).toEqual([
      ['rule:eg:the-numbered-rule-holds', 'The numbered rule holds', ['numberedSym'], null],
      ['rule:eg:the-opaque-rule-holds', 'The opaque rule holds', ['opaqueSym'], null],
    ]);
    expect(p.pitfalls.map((x) => [x.id, x.statement, x.severity])).toEqual([
      ['pitfall:eg:p3', 'A numbered pitfall', 'low'],
      ['pitfall:eg:p-a1b2c', 'An opaque pitfall', 'low'],
    ]);
  });
});
