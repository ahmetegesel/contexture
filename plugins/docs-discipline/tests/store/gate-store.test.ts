import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Run } from '@support/exec';
import { fresh } from '@support/snapshot';
import { fts5Available } from '@support/stage';
import { docs, gwWorkspace } from '../support/corpus';
import { gitCommit } from '../support/git';

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
  const codeChange = (sb: string): void => writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
  const gate = (sb: string): Promise<Run> => docs(sb, ['gate']);

  it('S10 reads clean once the doc is older than HEAD', async () => {
    const r = await gate(await committed());
    expect(r.code, r.stdout + r.stderr).toBe(0);
  });

  it('S11 a code change alone reads STALE', async () => {
    const sb = await committed();
    codeChange(sb);
    const r = await gate(sb);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('STALE DOC: workspace/gw-unit');
  });

  it('S13 the doc written under the same HEAD reads FRESH', async () => {
    const sb = await committed();
    codeChange(sb);
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    const r = await gate(sb);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH: workspace > gw-unit');
  });

  it('S15 a commit empties both halves', async () => {
    const sb = await committed();
    codeChange(sb);
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    await gitCommit(sb, 'h2', '-a');
    const r = await gate(sb);
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toContain('0 modified files');
  });

  it('S16 a lingering corpus file is not the corpus', async () => {
    const sb = await committed();
    codeChange(sb);
    mkdirSync(join(sb, 'docs/workspace'), { recursive: true });
    writeFileSync(join(sb, 'docs/workspace/gw-unit.md'), '@doc capability gw-unit\n  repo: workspace\n  description: "a lingering file"\n  sources: [src/gw.sh]\n  keywords: [gw]\n');
    const r = await gate(sb);
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('STALE DOC: workspace/gw-unit');
  });
});
