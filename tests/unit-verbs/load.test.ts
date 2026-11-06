import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { must, plantArtifact, seedUnit, unit } from '../support/unit';

async function loadAll(sb: string, ...form: string[]): Promise<string> {
  let text = '';
  for (let page = 1; ; page++) {
    const r = await must(unit(sb, 'load', ...form, String(page)));
    text += r.stdout;
    const total = Number(/^\[load [^|]* \| [^|]* \| page \d+\/(\d+) \| /m.exec(r.stdout)?.[1]);
    if (!total) throw new Error(`no page marker on page ${page}`);
    if (page >= total) return text;
  }
}

describe.concurrent('ctx unit load: paging, the refs form, and the warnings', () => {
  let refs: string;
  beforeAll(async () => {
    refs = await seed(async (sb) => {
      await seedUnit(sb, 'ref-src', 'reference source unit');
      await seedUnit(sb, 'ref-unit', 'reference reader unit');
    }, 'posix', 'load-refs');
  });

  it('R-b [the-record-r14]: load refuses a missing unit naming the state and the unit, path-free, and a page out of range', async () => {
    const sb = fresh(refs);
    const missing = await unit(sb, 'load', 'nosuch');
    expect(missing.code).toBe(1);
    expect(missing.stderr).toMatch(/^ERROR: missing state: unit nosuch$/m);
    expect(missing.stderr).not.toContain('sessions');
    const range = await unit(sb, 'load', 'ref-unit', '99');
    expect(range.code).toBe(1);
    expect(range.stderr).toContain('page out of range');
  });

  it('P: load pages a large journal to completion, hands off to stamp on the last page, and refuses one page past the end', async () => {
    const sb = stage('posix', 'load-paging');
    await seedUnit(sb, 'page-unit', 'paging unit');
    for (const [word, slug] of [['first', 'page-one'], ['second', 'page-two']]) {
      const what = Array.from({ length: 3000 }, (_, i) => `${word}-page-word-${i} `).join('');
      expect((await unit(sb, 'record', 'page-unit', `--what=${what}`, `--slug=2026-09-27-${slug}`)).code).toBe(0);
    }
    const first = await unit(sb, 'load', 'page-unit', '1');
    expect(first.code).toBe(0);
    const pages = Number(/^LOAD INCOMPLETE \(page 1 of (\d+)\)/m.exec(first.stdout)?.[1] ?? 0);
    expect(pages).toBeGreaterThanOrEqual(2);
    const last = await unit(sb, 'load', 'page-unit', String(pages));
    expect(last.code).toBe(0);
    expect(last.stdout).toMatch(new RegExp(`^LOAD COMPLETE: pages ${pages}/${pages}; stamp the new period: ctx unit stamp page-unit$`, 'm'));
    expect(last.stdout.split('\n').find((l) => l.startsWith('  journal:'))).toMatch(new RegExp(`pages \\d+-${pages}$`));
    expect((await unit(sb, 'load', 'page-unit', String(pages + 1))).code).toBe(1);
  });

  it('F [the-record-r1]: the main load renders a ref session read-only with a path-free WRITE SCOPE; clearing the refs drops it', async () => {
    const sb = fresh(refs);
    expect((await unit(sb, 'refs', 'ref-unit', 'ref-src')).code).toBe(0);
    const out = await loadAll(sb, 'ref-unit');
    expect(out).toContain('REF SESSION: ref-src (READ-ONLY)');
    expect(out).toMatch(/WRITE SCOPE: unit ref-unit \+ repos: .*ref sessions READ-ONLY/);
    expect(out).not.toContain('WRITE SCOPE: .contexture/sessions');
    expect(out).toContain('# --- ref knowledge ---');
    expect(out).not.toContain('# --- ref knowledge.md ---');
    expect((await unit(sb, 'refs', 'ref-unit')).code).toBe(0);
    expect(await loadAll(sb, 'ref-unit')).not.toContain('REF SESSION:');
  });

  it('F: the refs form reads complete and read-only; a missing unit refuses rc 1', async () => {
    const sb = fresh(refs);
    const out = await loadAll(sb, 'refs', 'ref-src');
    expect(out).toContain('REF LOAD COMPLETE');
    expect(out).toContain('READ-ONLY');
    expect((await unit(sb, 'load', 'refs', 'nosuch')).code).toBe(1);
  });

  it('RF3 [the-record-r14]: a ref session the store lacks warns naming the artifact and the unit, never a path (posix plant)', async () => {
    const sb = fresh(refs);
    const state = readFileSync(artifactPath(sb, 'ref-unit', 'state'), 'utf8').split('\n').filter((l) => l && !l.startsWith('ref_sessions:'));
    plantArtifact(sb, 'ref-unit', 'state', [...state, 'ref_sessions: [f-ghost]', ''].join('\n'));
    const r = await unit(sb, 'load', 'ref-unit');
    expect(r.code).toBe(0);
    expect(r.stderr).toMatch(/^WARNING: missing knowledge: unit f-ghost$/m);
    expect(r.stderr).toMatch(/^WARNING: missing journal: unit f-ghost$/m);
    expect(r.stderr).not.toContain('sessions/');
    expect(r.stderr).not.toContain('.md');
  });
});
