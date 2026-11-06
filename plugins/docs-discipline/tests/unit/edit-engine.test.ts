import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Run } from '@support/exec';
import { sandbox } from '@support/sandbox';
import { edit, fixture, golden, type EditRequest } from '../support/edit';

let sb: string;
const scratch = (name: string, text: string): string => {
  const path = join(sb, name);
  writeFileSync(path, text);
  return path;
};

beforeAll(() => {
  sb = sandbox('edit-engine');
  const written = golden('written.md');
  scratch('nonl.md', written.replace(/^@doc structural written$/m, '@doc structural nonl').replace(/\n$/, ''));
  scratch('written2.md', written.replace('A doc written whole', 'A doc written twice'));
  scratch('cr.md', written.replace(/^@doc structural written$/m, '@doc structural crdoc').replace(/^(.*Own the.*)$/m, '$1\r'));
});

const unitDoc = () => fixture('unit.md');
const conv = () => fixture('conv.md');
const map = () => fixture('map.md');
const pitfallFields = (evidence = true): EditRequest['acts'] => [
  ['set', 'summary', 's'],
  ['set', 'class', 'bug'],
  ['set', 'severity', 'low'],
  ['set', 'trigger', 't'],
  ['set', 'consequence', 'c'],
  ...(evidence ? ([['set', 'evidence', 'e']] as const) : []),
];

function written(r: Run, expected: string): void {
  expect(r.code, r.stderr).toBe(0);
  expect(r.stdout).toBe(expected);
}

const counted = (r: Run): string => r.stderr.split('\n')[0].trim().split(/\s+/).pop() ?? '';

function refused(r: Run, message: string): void {
  expect(r.code).toBe(1);
  expect(r.stdout).toBe('');
  expect(r.stderr.trimEnd().split('\n')).toHaveLength(1);
  expect(r.stderr).toContain(message);
}

describe('the edit engine: every success is the golden byte for byte', { concurrent: true }, () => {
  it('W1 new builds the header from the fields', async () => {
    written(await edit(sb, { op: 'new', slug: 'fresh', doc: '/dev/null', kind: 'structural', acts: [['set', 'description', 'A fresh doc'], ['set', 'sources', 'src/fresh/**'], ['set', 'keywords', 'fresh']] }), golden('exp-new.md'));
  });
  it('W2 write passes a whole doc through', async () => {
    written(await edit(sb, { op: 'write', slug: 'written', doc: fixture('written.md') }), golden('written.md'));
  });
  it('W3 write of a second version yields its bytes', async () => {
    written(await edit(sb, { op: 'write', slug: 'written', doc: join(sb, 'written2.md') }), readFileSync(join(sb, 'written2.md'), 'utf8'));
  });
  it('W5 a doc without its final newline is kept so', async () => {
    const r = await edit(sb, { op: 'write', slug: 'nonl', doc: join(sb, 'nonl.md') });
    written(r, readFileSync(join(sb, 'nonl.md'), 'utf8'));
    expect(r.stdout.endsWith('\n')).toBe(false);
  });
  it('W6 header adds a source, removes a keyword, sets upstream', async () => {
    written(await edit(sb, { op: 'header', slug: 'unit', doc: unitDoc(), acts: [['add', 'sources', 'src/more/**'], ['remove', 'keywords', 'unit'], ['set', 'upstream', 'An upstream note']] }), golden('exp-header.md'));
  });
  it('W7 a header list emptied by its last removal drops the field', async () => {
    const added = await edit(sb, { op: 'header', slug: 'map', doc: map(), acts: [['add', 'children', 'unit']] });
    expect(added.code).toBe(0);
    expect(added.stdout).not.toBe(golden('map.md'));
    const doc = join(sb, 'map-with-child.md');
    writeFileSync(doc, added.bytes);
    written(await edit(sb, { op: 'header', slug: 'map', doc, acts: [['remove', 'children', 'unit']] }), golden('map.md'));
  });
  it('W8 rule add --after', async () => {
    const acts = [['set', 'directive', 'never'], ['set', 'statement', 'The third rule'], ['set', 'status', 'aspirational'], ['set', 'prevalence', 'rare'], ['set', 'layer', 'repo'], ['set', 'provenance', 'ratified'], ['set', 'evidence', 'thirdSym']] as const;
    written(await edit(sb, { op: 'rule', slug: 'conv', doc: conv(), block: 'rule', key: 'docs/third', after: 'docs/first', acts }), golden('exp-rule-add.md'));
  });
  it('W9 rule update', async () => {
    written(await edit(sb, { op: 'rule', slug: 'conv', doc: conv(), block: 'rule', key: 'docs/second', acts: [['set', 'caution', 'Mind it'], ['set', 'status', 'violated']] }), golden('exp-rule-update.md'));
  });
  it('W10 rule remove', async () => {
    written(await edit(sb, { op: 'rule', slug: 'conv', doc: conv(), block: 'rule', key: 'docs/first', remove: true }), golden('exp-rule-remove.md'));
  });
  it('W11 [docs-module-r22] pitfall add takes an opaque id drawn from the seed', async () => {
    const acts = [['set', 'summary', 'The second pitfall'], ['set', 'class', 'gotcha'], ['set', 'severity', 'low'], ['set', 'trigger', 'Another trigger'], ['set', 'consequence', 'Another consequence'], ['set', 'evidence', 'pitTwo']] as const;
    written(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', acts }), golden('exp-pitfall-add.md'));
  });
  it('W12 pitfall update to one line', async () => {
    written(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', key: 'unit-p1', acts: [['set', 'severity', 'high'], ['set', 'consequence', 'Now one line']] }), golden('exp-pitfall-update.md'));
  });
  it('W13 pitfall remove', async () => {
    written(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', key: 'unit-p1', remove: true }), golden('exp-pitfall-remove.md'));
  });
  it('W14 entry add --after=#1 with a new id', async () => {
    written(await edit(sb, { op: 'entry', slug: 'unit', doc: unitDoc(), block: 'contract', after: '#1', acts: [['set', 'rule', 'The middle invariant'], ['set', 'evidence', 'midSym']] }), golden('exp-entry-contract-add.md'));
  });
  it('W15 entry by its legacy ordinal #2', async () => {
    written(await edit(sb, { op: 'entry', slug: 'unit', doc: unitDoc(), block: 'contract', key: '#2', acts: [['set', 'evidence', 'secondSym2']] }), golden('exp-entry-legacy.md'));
  });
  it('W16 entry --first', async () => {
    written(await edit(sb, { op: 'entry', slug: 'unit', doc: unitDoc(), block: 'responsibilities', first: true, acts: [['set', 'text', 'Own the first thing']] }), golden('exp-entry-resp-first.md'));
  });
  it('W17 entry by a composite key', async () => {
    written(await edit(sb, { op: 'entry', slug: 'unit', doc: unitDoc(), block: 'edges', key: 'exposes:GET /unit', acts: [['set', 'detail', 'Serves the unit twice.']] }), golden('exp-entry-edges.md'));
  });
  it('W18 entry remove', async () => {
    written(await edit(sb, { op: 'entry', slug: 'unit', doc: unitDoc(), block: 'see_also', key: 'other', remove: true }), golden('exp-entry-seealso-remove.md'));
  });
  it('W19 a text value with a newline renders as a block scalar', async () => {
    written(await edit(sb, { op: 'entry', slug: 'map', doc: map(), block: 'data_flow', acts: [['set', 'from', 'beta'], ['set', 'to', 'gamma'], ['set', 'evidence', 'flowTwo'], ['set', 'detail', 'line one\nline two']] }), golden('exp-entry-dataflow.md'));
  });
  it('W20 a --stdin value arrives as the payload operand', async () => {
    written(await edit(sb, { op: 'entry', slug: 'map', doc: map(), block: 'dependency_rules', key: '#1', acts: [['set', 'detail', '']], stdin: 1, payload: fixture('deprule-detail.txt') }), golden('exp-entry-deprule-stdin.md'));
  });
  it('W22 section replace', async () => {
    written(await edit(sb, { op: 'section', slug: 'unit', doc: unitDoc(), block: 'see_also', payload: fixture('see-also.block') }), golden('exp-section-replace.md'));
  });
  it('W23 section of one rule --first', async () => {
    written(await edit(sb, { op: 'section', slug: 'conv', doc: conv(), block: 'rule', key: 'docs/fourth', first: true, payload: fixture('rule-fourth.block') }), golden('exp-section-rule-first.md'));
  });
  it('W24 replace swaps every occurrence and counts them', async () => {
    const r = await edit(sb, { op: 'replace', slug: 'unit', doc: unitDoc(), old: 'invariant holds', new: 'invariant stands' });
    written(r, golden('exp-replace.md'));
    expect(counted(r)).toBe('2');
  });
  it('W27 ids keys the legacy entries', async () => {
    const r = await edit(sb, { op: 'ids', slug: 'unit', doc: unitDoc() });
    written(r, golden('exp-ids.md'));
    expect(counted(r)).toBe('4');
  });
  it('W29 show prints one entry raw (query --entry)', async () => {
    written(await edit(sb, { op: 'show', slug: 'unit', doc: unitDoc(), block: 'pitfalls', key: 'unit-p1' }), golden('exp-entry-show.txt'));
  });
});

describe('the edit engine: every refusal is rc 1, no output, one line', { concurrent: true }, () => {
  it('W31 an unknown field', async () => {
    refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', key: 'unit-p1', acts: [['set', 'bogus', 'x']] }), "unknown field 'bogus'");
  });
  it('W32 an enum value outside its set (severity)', async () => {
    refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', key: 'unit-p1', acts: [['set', 'severity', 'urgent']] }), 'severity takes one of');
  });
  it('W33 an enum value outside its set (directive)', async () => {
    refused(await edit(sb, { op: 'rule', slug: 'conv', doc: conv(), block: 'rule', key: 'docs/second', acts: [['set', 'directive', 'maybe']] }), 'directive takes one of');
  });
  it('W34 a missing required field (pitfall evidence)', async () => {
    refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', acts: pitfallFields(false) }), 'requires evidence');
  });
  it('W35 a missing required field (rule statement)', async () => {
    const acts = [['set', 'directive', 'must'], ['set', 'status', 'followed'], ['set', 'prevalence', 'rare'], ['set', 'layer', 'repo'], ['set', 'provenance', 'ratified'], ['set', 'evidence', 'e']] as const;
    refused(await edit(sb, { op: 'rule', slug: 'conv', doc: conv(), block: 'rule', key: 'docs/fifth', acts }), 'requires statement');
  });
  it('W36 a duplicate key', async () => {
    refused(await edit(sb, { op: 'entry', slug: 'unit', doc: unitDoc(), block: 'see_also', acts: [['set', 'ref', 'other'], ['set', 'why', 'again']] }), "already has an entry keyed 'other' (ERR_ENTITY_EXISTS)");
  });
  it('W37 a duplicate id', async () => {
    refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', id: 'unit-p1', acts: pitfallFields() }), 'the id unit-p1 already exists');
  });
  it('W38 a missing entry', async () => {
    refused(await edit(sb, { op: 'entry', slug: 'unit', doc: unitDoc(), block: 'contract', key: 'unit-r9', acts: [['set', 'evidence', 'x']] }), "has no entry 'unit-r9' (ERR_ENTITY_NOT_FOUND)");
  });
  it('W39 a missing rule', async () => {
    refused(await edit(sb, { op: 'rule', slug: 'conv', doc: conv(), block: 'rule', key: 'docs/nosuch', remove: true }), 'no rule/docs/nosuch');
  });
  it('W44 a newline in a one-line field', async () => {
    refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', key: 'unit-p1', acts: [['set', 'severity', 'low\nx']] }), 'a newline in the one-line field severity');
  });
  it('W45 a carriage return in a flag value', async () => {
    refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', key: 'unit-p1', acts: [['set', 'summary', 'a\rb']] }), 'a carriage return in the value of summary');
  });
  it('W46 a carriage return in a whole doc', async () => {
    refused(await edit(sb, { op: 'write', slug: 'crdoc', doc: join(sb, 'cr.md') }), 'a carriage return in the doc');
  });
  it('W47 a carriage return in --new', async () => {
    refused(await edit(sb, { op: 'replace', slug: 'unit', doc: unitDoc(), old: 'invariant holds', new: 'a\rb' }), 'a carriage return in --new');
  });
  it('W48 a carriage return in --old', async () => {
    refused(await edit(sb, { op: 'replace', slug: 'unit', doc: unitDoc(), old: 'holds\r', new: 'x' }), 'a carriage return in --old');
  });
  it('W50 an id set by hand on an existing entry', async () => {
    refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', key: 'unit-p1', id: 'unit-p3' }), 'ids are stable');
  });
  it('W54 a slug mismatch', async () => {
    refused(await edit(sb, { op: 'write', slug: 'other', doc: fixture('written.md') }), "names slug 'written'");
  });
  it('W55 a required field unset', async () => {
    refused(await edit(sb, { op: 'header', slug: 'unit', doc: unitDoc(), acts: [['unset', 'description']] }), 'description is required');
  });
  it('W56 a required list emptied by its last removal', async () => {
    refused(await edit(sb, { op: 'header', slug: 'unit', doc: unitDoc(), acts: [['remove', 'sources', 'src/unit/**']] }), 'sources is required');
  });
  it('W57 a line-number evidence', async () => {
    refused(await edit(sb, { op: 'entry', slug: 'unit', doc: unitDoc(), block: 'contract', key: '#1', acts: [['set', 'evidence', 'file.sh:12']] }), 'never line numbers');
  });
  it('W58 a section header mismatch', async () => {
    refused(await edit(sb, { op: 'section', slug: 'unit', doc: unitDoc(), block: 'see_also', payload: fixture('rule-fourth.block') }), 'must open with @see_also');
  });
  it('W59 an empty value', async () => {
    refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', key: 'unit-p1', acts: [['set', 'summary', '']] }), 'an empty value for summary');
  });
  it('W60 a block the kind lacks', async () => {
    refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'conv', doc: conv(), block: 'pitfalls', acts: pitfallFields() }), 'a conventions doc carries no @pitfalls block');
  });
});

describe('the edit engine: opaque ids beside the numbered ones', { concurrent: true }, () => {
  const ids = (r: Run): string[] => r.stdout.split('\n').filter((l) => /^ {2}- id: |^ {4}id: /.test(l)).map((l) => l.replace(/^ *(- )?id: /, ''));
  let opaqueDoc: string;
  beforeAll(() => {
    opaqueDoc = scratch('opaque.md', golden('unit.md').replace('  - id: unit-p1', '  - id: unit-p-kb1uj'));
  });

  it('[docs-module-r22] a new id is drawn from the seed, and a draw the doc already holds is drawn again', async () => {
    const first = await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', acts: pitfallFields() });
    expect([first.code, ids(first)]).toEqual([0, ['unit-p1', 'unit-p-kb1uj']]);
    const again = await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: opaqueDoc, block: 'pitfalls', acts: pitfallFields() });
    expect([again.code, ids(again)]).toEqual([0, ['unit-p-kb1uj', 'unit-p-p1cup']]);
    const other = await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', acts: pitfallFields(), seed: '0' });
    expect(ids(other)).toEqual(['unit-p1', 'unit-p-04rgj']);
  });

  it('[docs-module-r22] --id names an id in either form, and any other shape refuses naming both', async () => {
    for (const id of ['unit-p7', 'unit-p-zz9zz']) {
      const r = await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', id, acts: pitfallFields() });
      expect([r.code, ids(r)]).toEqual([0, ['unit-p1', id]]);
    }
    for (const id of ['unit-p-ZZ9ZZ', 'unit-p-abcd', 'unit-p-abcdef', 'unit-p0', 'unit-r-abcde', 'other-p-abcde', 'unit-p-ab_cd']) {
      refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: unitDoc(), block: 'pitfalls', id, acts: pitfallFields() }), `reads unit-p<N> or unit-p-<5 lowercase letters or digits> (got '${id}')`);
    }
  });

  it('[docs-module-r22] an opaque id addresses its entry, and naming it again for a new entry refuses', async () => {
    written(await edit(sb, { op: 'show', slug: 'unit', doc: opaqueDoc, block: 'pitfalls', key: 'unit-p-kb1uj' }), golden('exp-entry-show.txt').replace('unit-p1', 'unit-p-kb1uj'));
    const changed = await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: opaqueDoc, block: 'pitfalls', key: 'unit-p-kb1uj', acts: [['set', 'severity', 'high']] });
    expect([changed.code, changed.stdout]).toEqual([0, golden('unit.md').replace('  - id: unit-p1', '  - id: unit-p-kb1uj').replace('    severity: medium', '    severity: high')]);
    refused(await edit(sb, { op: 'entry', verb: 'pitfall', slug: 'unit', doc: opaqueDoc, block: 'pitfalls', id: 'unit-p-kb1uj', acts: pitfallFields() }), 'the id unit-p-kb1uj already exists');
  });

  it('[docs-module-r22] ids keys each keyless entry with an opaque id and keeps every id present', async () => {
    const doc = scratch('mixed.md', golden('unit.md').replace('    evidence: "firstSym"', '    id: unit-r1\n    evidence: "firstSym"'));
    const r = await edit(sb, { op: 'ids', slug: 'unit', doc });
    expect([r.code, counted(r), ids(r)]).toEqual([0, '3', ['unit-o-kb1uj', 'unit-o-p1cup', 'unit-r1', 'unit-r-07m9y', 'unit-p1']]);
  });
});
