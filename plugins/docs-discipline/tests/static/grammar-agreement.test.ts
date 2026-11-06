import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { awk } from '@support/awk';
import { sandbox } from '@support/sandbox';
import { SCRIPTS, TESTS } from '../support/corpus';

const AGREEMENT = join(TESTS, 'grammar-agreement.awk');
const GRAMMAR = join(SCRIPTS, 'doc.grammar');
const AUDIT = join(SCRIPTS, 'docs-audit.awk');

let sb: string;
beforeAll(() => {
  sb = sandbox('agreement');
});

const agree = (grammar: string) => awk(sb, AGREEMENT, { args: [grammar, AUDIT] });

function planted(name: string, edit: (line: string) => string): string {
  const path = join(sb, name);
  writeFileSync(path, readFileSync(GRAMMAR, 'utf8').split('\n').map(edit).join('\n'));
  return path;
}

describe('the grammar agreement check', { concurrent: true }, () => {
  it('[docs-module-o2] reads the schema, the prose shapes, and the audit lists as one AGREE line', async () => {
    const r = await agree(GRAMMAR);
    expect(r.code, r.stdout).toBe(0);
    expect(r.stdout).toMatch(/^AGREE: \d+ kinds, \d+ header fields, \d+ blocks, \d+ block fields, \d+ enums; the prose and the audit lists agree\n$/);
  });

  it('[docs-module-o2] reads an extra field in the prose as DISAGREE', async () => {
    const r = await agree(planted('plant-prose.md', (l) => (l === '    nature: internal | external' ? `${l}\n    planted_field: "x"` : l)));
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/^DISAGREE: field dependencies\.planted_field/m);
  });

  it('[docs-module-o2] reads an extra enum value in the schema as DISAGREE', async () => {
    const r = await agree(planted('plant-schema.md', (l) => (l === '#% field dependencies nature enum required internal external' ? `${l} planted` : l)));
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/^DISAGREE: enum dependencies\.nature/m);
  });
});
