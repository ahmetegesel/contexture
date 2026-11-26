import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Run } from '@support/exec';
import { fresh } from '@support/snapshot';
import { sqliteAvailable } from '@support/stage';
import { docs, gwWorkspace } from '../support/corpus';
import { git, gitCommit } from '../support/git';

const PROCESS_OWNED = 'UNTRACKED CLAIMANT: workspace/gw-unit';
const CLEAN = 'CLEAN (PROCESS-OWNED)';

describe.skipIf(!sqliteAvailable())('the gate on sqlite the posix way: git carries the delta, the store keeps no corpus file, so every claimant reads untracked', { concurrent: true }, () => {
  let gw: string;
  let px: string;
  beforeAll(async () => {
    [gw, px] = await Promise.all([gwWorkspace('sqlite', 'gw-gate'), gwWorkspace('posix', 'gw-gate-posix')]);
  });

  const committed = async (snap: string): Promise<string> => {
    const sb = fresh(snap);
    await gitCommit(sb, 'h1', '--allow-empty');
    return sb;
  };
  const head = async (sb: string): Promise<string> => (await git(sb, 'rev-parse', 'HEAD')).stdout.trim();
  const codeChange = (sb: string): void => writeFileSync(join(sb, 'src/gw.sh'), 'echo gw2\n');
  const gate = (sb: string, ...args: string[]): Promise<Run> => docs(sb, ['gate', ...args]);

  it('S10 [docs-module-r15, docs-module-r16] a clean tree hands the check nothing', async () => {
    const r = await gate(await committed(gw));
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stderr).toContain('[GATE NOTICE] the delta is empty');
  });

  it('S11 [docs-module-r14, docs-module-r16] a code change alone reads UNTRACKED CLAIMANT and the process-owned clean, the same lines posix prints', async () => {
    const out: string[] = [];
    for (const snap of [gw, px]) {
      const sb = await committed(snap);
      codeChange(sb);
      const r = await gate(sb);
      expect(r.code, r.stdout + r.stderr).toBe(0);
      expect(r.stdout).toContain(PROCESS_OWNED);
      expect(r.stdout).toContain(CLEAN);
      out.push(r.stdout);
    }
    expect(out[0]).toBe(out[1]);
  });

  it('S13 [docs-module-r16] a doc written through the store never rides the git delta: the claimant stays untracked', async () => {
    const sb = await committed(gw);
    codeChange(sb);
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    const r = await gate(sb);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain(PROCESS_OWNED);
    expect(r.stdout).not.toContain('FRESH: workspace > gw-unit');
  });

  it('S21 [docs-module-r16] --since over a committed code change names the untracked corpus in a notice and reads the process-owned clean', async () => {
    const sb = await committed(gw);
    const h1 = await head(sb);
    codeChange(sb);
    await gitCommit(sb, 'h2', '-a');
    const r = await gate(sb, `--since=${h1}`);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stderr).toContain('[GATE NOTICE] the corpus is untracked here (1 of 1 docs not tracked by git)');
    expect(r.stdout).toContain(PROCESS_OWNED);
  });

  it('S22 [docs-module-r16] --stdin takes the caller\'s list: the doc named at its logical address rides and reads FRESH', async () => {
    const sb = await committed(gw);
    codeChange(sb);
    const r = await docs(sb, ['gate', '--stdin'], { input: 'M\tsrc/gw.sh\nM\tdocs/workspace/gw-unit.md\n' });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH: workspace > gw-unit');
  });

  it('S16 [docs-module-r16] an untracked file lingering at a doc\'s address is not the corpus and never rides', async () => {
    const sb = await committed(gw);
    codeChange(sb);
    mkdirSync(join(sb, 'docs/workspace'), { recursive: true });
    writeFileSync(join(sb, 'docs/workspace/gw-unit.md'), '@doc capability gw-unit\n  repo: workspace\n  description: "a lingering file"\n  sources: [src/gw.sh]\n  keywords: [gw]\n');
    const r = await gate(sb);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain(PROCESS_OWNED);
  });
});
