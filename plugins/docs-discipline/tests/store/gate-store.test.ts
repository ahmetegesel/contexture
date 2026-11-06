import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Run } from '@support/exec';
import { fresh } from '@support/snapshot';
import { fts5Available } from '@support/stage';
import { docs, gwWorkspace } from '../support/corpus';
import { git, gitCommit } from '../support/git';

describe.skipIf(!fts5Available())('the gate in store mode on fts5: the code half from git, the corpus half from the store', { concurrent: true }, () => {
  let gw: string;
  beforeAll(async () => {
    gw = await gwWorkspace('fts5', 'gw-gate');
  });

  const committed = async (): Promise<string> => {
    const sb = fresh(gw);
    await gitCommit(sb, 'h1', '--allow-empty');
    return sb;
  };
  const head = async (sb: string): Promise<string> => (await git(sb, 'rev-parse', 'HEAD')).stdout.trim();
  const codeChange = (sb: string): void => writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
  const gate = (sb: string): Promise<Run> => docs(sb, ['gate']);

  it('S10 [docs-module-r15, docs-module-r16] reads clean once the doc is older than HEAD', async () => {
    const r = await gate(await committed());
    expect(r.code, r.stdout + r.stderr).toBe(0);
  });

  it('S11 [docs-module-r16] a code change alone reads STALE', async () => {
    const sb = await committed();
    codeChange(sb);
    const r = await gate(sb);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('STALE DOC: workspace/gw-unit');
  });

  it('S13 [docs-module-r15, docs-module-r16] the doc written under the same HEAD reads FRESH', async () => {
    const sb = await committed();
    codeChange(sb);
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    const r = await gate(sb);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH: workspace > gw-unit');
  });

  it('S15 [docs-module-r15, docs-module-r16] a commit empties both halves', async () => {
    const sb = await committed();
    codeChange(sb);
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    await gitCommit(sb, 'h2', '-a');
    const r = await gate(sb);
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toContain('0 modified files');
  });

  it('S21 [docs-module-r15, docs-module-r16] --since reads FRESH over a commit that carried a code change and a doc write, where the plain gate reads 0 modified files', async () => {
    const sb = await committed();
    const h1 = await head(sb);
    codeChange(sb);
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    await gitCommit(sb, 'h2', '-a');
    expect((await gate(sb)).stdout).toBe('docs-check: 0 modified files provided on stdin.\n');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH: workspace > gw-unit');
  });

  it('S22 [docs-module-r16] --since reads STALE over a commit that carried a code change alone', async () => {
    const sb = await committed();
    const h1 = await head(sb);
    codeChange(sb);
    await gitCommit(sb, 'h2', '-a');
    const r = await docs(sb, ['gate', `--since=${h1}`]);
    expect(r.code).toBe(1);
    expect(r.stdout).toContain('STALE DOC: workspace/gw-unit');
    expect(r.stderr).not.toContain('[GATE NOTICE]');
  });

  it('S16 [docs-module-r16] a lingering corpus file is not the corpus', async () => {
    const sb = await committed();
    codeChange(sb);
    mkdirSync(join(sb, 'docs/workspace'), { recursive: true });
    writeFileSync(join(sb, 'docs/workspace/gw-unit.md'), '@doc capability gw-unit\n  repo: workspace\n  description: "a lingering file"\n  sources: [src/gw.sh]\n  keywords: [gw]\n');
    const r = await gate(sb);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('STALE DOC: workspace/gw-unit');
  });
});
