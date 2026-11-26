import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh } from '@support/snapshot';
import { sqliteAvailable } from '@support/stage';
import { docs, sqliteCorpus, stagedDocs } from '../support/corpus';

describe.skipIf(!sqliteAvailable())('the corpus in the sqlite store', { concurrent: true }, () => {
  let corpus: string;
  beforeAll(async () => {
    corpus = await sqliteCorpus('corpus');
  });

  it('RS8 [docs-module-r1, plugins-r2] every staged doc was written through ctx docs write, and the docs folder is gone', async () => {
    const sb = fresh(corpus);
    expect(existsSync(join(sb, 'docs'))).toBe(false);
    const r = await docs(sb, ['query', '--index']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain(`index complete: ${stagedDocs().length} entries`);
  });

  it.each(stagedDocs())('RS9 [docs-module-r1] %s reads back unchanged through write --replace --dry-run', async (key, path) => {
    const [repo, slug] = key.split('/');
    const r = await docs(fresh(corpus), ['write', repo, slug, '--replace', '--dry-run'], { input: readFileSync(path) });
    expect([r.code, r.stdout]).toEqual([0, `docs write: ${key} unchanged (nothing written)\n`]);
  });

  it('RS9 [docs-module-r1] null check: a planted line never reads unchanged', async () => {
    const [key, path] = stagedDocs()[0];
    const [repo, slug] = key.split('/');
    const r = await docs(fresh(corpus), ['write', repo, slug, '--replace', '--dry-run'], { input: `${readFileSync(path, 'utf8')}planted line\n` });
    expect(r.stdout).not.toBe(`docs write: ${key} unchanged (nothing written)\n`);
  });
});
