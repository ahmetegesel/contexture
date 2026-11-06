import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { corpusDir, ENGINE_FIXTURES, WRITE } from '../support/corpus';
import { audit, docFiles } from '../support/engines';

let sample: string;
let engine: string;
beforeAll(() => {
  sample = corpusDir('audit-sample');
  engine = corpusDir('audit-engine', ENGINE_FIXTURES);
});

const plant = (dir: string, path: string, text: string): string => {
  writeFileSync(join(dir, path), text);
  return path;
};

describe('the audit engine', { concurrent: true }, () => {
  it('[docs-module-r7] reads the staged corpus clean: silent, rc 0', async () => {
    const files = docFiles(sample);
    expect(files.length).toBeGreaterThanOrEqual(5);
    const r = await audit(sample, files);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });

  it('EC1 [docs-module-r7] keeps one id namespace per repo across kinds (a rule id reused as a pitfall id)', async () => {
    const r = await audit(engine, docFiles(engine, 'etest'));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("docs/etest/idtwo.md:8: error: duplicate id 'idone-r1' in repo 'etest' (first seen at docs/etest/idone.md:9)");
  });

  it('EC1 [docs-module-r7] null check: the same ids in two repos read clean', async () => {
    const dir = corpusDir('audit-two-repos', ENGINE_FIXTURES);
    mkdirSync(join(dir, 'docs/eother'));
    const moved = plant(dir, 'docs/eother/idtwo.md', readFileSync(join(dir, 'docs/etest/idtwo.md'), 'utf8').replace('repo: etest', 'repo: eother'));
    const r = await audit(dir, ['docs/etest/idone.md', moved]);
    expect([r.code, r.stderr]).toEqual([0, '']);
  });

  it('EC7 [docs-module-r7] reads the pitfall schema from the grammar: the class enum and a missing trigger', async () => {
    const r = await audit(engine, docFiles(engine, 'ebad'));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("pitfall 'badpf-p1' class must be one of: bug tech-debt gotcha drift-risk (got 'urgent')");
    expect(r.stderr).toContain("pitfall 'badpf-p1' missing 'trigger:'");
  });

  it('[docs-module-r7] refuses an unknown block header', async () => {
    const dir = corpusDir('audit-block');
    const bad = readFileSync(join(WRITE, 'bad-block.md'), 'utf8');
    const r = await audit(dir, [plant(dir, 'docs/workspace/badblock.md', bad)]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("unknown block header '@bogus'");
  });

  it('[docs-module-r7] refuses a line-number evidence, an invalid kind, and a slug that is not the file name', async () => {
    const dir = corpusDir('audit-header');
    const doc = readFileSync(join(WRITE, 'unit.md'), 'utf8');
    const files = [
      plant(dir, 'docs/workspace/unit.md', doc.replace('"firstSym"', '"file.sh:12"')),
      plant(dir, 'docs/workspace/kind.md', doc.replace('@doc capability unit', '@doc bogus kind')),
      plant(dir, 'docs/workspace/named.md', doc.replace('@doc capability unit', '@doc capability other')),
    ];
    const r = await audit(dir, files);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('evidence must be greppable code symbols, never line numbers');
    expect(r.stderr).toContain("docs/workspace/kind.md:1: error: invalid doc kind 'bogus'");
    expect(r.stderr).toContain("docs/workspace/named.md:1: error: slug 'other' does not match filename 'named'");
  });

  it('W42 [docs-module-r7] engine side: an id another doc of the repo holds', async () => {
    const dir = corpusDir('audit-dup');
    const unit = readFileSync(join(WRITE, 'unit.md'), 'utf8').replace('repo: wtest', 'repo: workspace');
    plant(dir, 'docs/workspace/dup.md', readFileSync(join(WRITE, 'dup.md'), 'utf8').replace('repo: wtest', 'repo: workspace'));
    plant(dir, 'docs/workspace/unit.md', unit);
    expect((await audit(dir, docFiles(dir, 'workspace'))).code).toBe(0);
    plant(dir, 'docs/workspace/unit.md', unit.replace('  - id: unit-p1', '  - id: unit-p5'));
    const r = await audit(dir, docFiles(dir, 'workspace'));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("duplicate id 'unit-p5'");
  });

  it('[docs-module-r7] an opaque id reads as one id: clean alone, a duplicate across the repo refused', async () => {
    const dir = corpusDir('audit-opaque');
    const unit = readFileSync(join(WRITE, 'unit.md'), 'utf8').replace('repo: wtest', 'repo: workspace').replace('  - id: unit-p1', '  - id: unit-p-kb1uj');
    const dup = readFileSync(join(WRITE, 'dup.md'), 'utf8').replace('repo: wtest', 'repo: workspace');
    plant(dir, 'docs/workspace/unit.md', unit);
    plant(dir, 'docs/workspace/dup.md', dup);
    expect((await audit(dir, docFiles(dir, 'workspace'))).code).toBe(0);
    plant(dir, 'docs/workspace/dup.md', dup.replace('  - id: unit-p5', '  - id: unit-p-kb1uj'));
    const r = await audit(dir, docFiles(dir, 'workspace'));
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("docs/workspace/unit.md:26: error: duplicate id 'unit-p-kb1uj' in repo 'workspace' (first seen at docs/workspace/dup.md:6)");
  });
});
