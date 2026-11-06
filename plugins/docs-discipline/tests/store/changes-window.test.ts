import { beforeAll, describe, expect, it } from 'vitest';
import { fresh } from '@support/snapshot';
import { fts5Available } from '@support/stage';
import { docs, gwWorkspace } from '../support/corpus';
import { git, gitCommit } from '../support/git';

const A = 'A\tdocs/workspace/gw-unit.md\n';

describe.skipIf(!fts5Available())('ctx docs changes: the corpus window since HEAD on fts5', { concurrent: true }, () => {
  let gw: string;
  beforeAll(async () => {
    gw = await gwWorkspace('fts5', 'gw-fts5');
  });

  const changes = async (sb: string, ...args: string[]): Promise<string> => {
    const r = await docs(sb, ['changes', ...args]);
    expect(r.code, r.stderr).toBe(0);
    return r.stdout;
  };

  it('S7 prints A for the doc created under the current HEAD', async () => {
    expect(await changes(fresh(gw))).toBe(A);
  });

  it('S8 a commit empties the window', async () => {
    const sb = fresh(gw);
    await gitCommit(sb, 'h1', '--allow-empty');
    expect(await changes(sb)).toBe('');
  });

  it('S9 --since brings the earlier HEAD back', async () => {
    const sb = fresh(gw);
    const h0 = (await git(sb, 'rev-parse', 'HEAD')).stdout.trim();
    await gitCommit(sb, 'h1', '--allow-empty');
    expect(await changes(sb, `--since=${h0}`)).toBe(A);
  });

  it('S12 prints M after a write of a doc older than the window', async () => {
    const sb = fresh(gw);
    await gitCommit(sb, 'h1', '--allow-empty');
    expect((await docs(sb, ['header', 'workspace', 'gw-unit', '--add-keyword=fresh'])).code).toBe(0);
    expect(await changes(sb)).toBe('M\tdocs/workspace/gw-unit.md\n');
  });

  it('S14 prints D after a remove of a doc older than the window', async () => {
    const sb = fresh(gw);
    await gitCommit(sb, 'h1', '--allow-empty');
    expect((await docs(sb, ['remove', 'workspace', 'gw-unit'])).code).toBe(0);
    expect(await changes(sb)).toBe('D\tdocs/workspace/gw-unit.md\n');
  });

  it.each([['a bad flag', ['--bogus']], ['an unknown revision', ['--since=nosuchrev']]])('S17 refuses %s rc 1', async (_, args) => {
    const r = await docs(fresh(gw), ['changes', ...args]);
    expect([r.code, r.stdout]).toEqual([1, '']);
  });
});
