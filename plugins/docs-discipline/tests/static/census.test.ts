import { appendFileSync, cpSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { awk } from '@support/awk';
import type { Run } from '@support/exec';
import { sandbox } from '@support/sandbox';
import { SCRIPTS, TESTS } from '../support/corpus';

function scripts(dir: string): string[] {
  return readdirSync(dir)
    .sort()
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).isFile() && (/\.(sh|awk)$/.test(p) || readFileSync(p, 'utf8').startsWith('#!')));
}

const census = (dir: string): Promise<Run> =>
  awk(sandbox('census-run'), join(TESTS, 'census.awk'), { args: scripts(dir), env: { CENSUS_ALLOW: join(TESTS, 'census-allow.txt') } });

function plantCopy(): string {
  const dir = sandbox('census-plant');
  cpSync(SCRIPTS, dir, { recursive: true });
  return dir;
}

const remainder = (r: Run, file: string): string[] => r.stdout.split('\n').filter((l) => l.startsWith(`REMAINDER ${file}:`));

describe('the single-door census of the docs module', { concurrent: true }, () => {
  it('lists the verbs and engines, never the grammar asset', () => {
    const names = scripts(SCRIPTS).map((p) => p.slice(SCRIPTS.length + 1));
    expect(names).toContain('docs-io.sh');
    expect(names).toContain('docs-edit.awk');
    expect(names).toContain('query');
    expect(names).not.toContain('doc.grammar');
  });

  it('reads remainder 0 over the shipped scripts, every flagged line a helper or classified', async () => {
    const r = await census(SCRIPTS);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    const summary = r.stdout.match(/^census: flagged (\d+) = helper (\d+) \+ classified (\d+) \+ remainder (\d+)$/m);
    expect(summary).not.toBeNull();
    const [flagged, helper, classified, rest] = summary!.slice(1).map(Number);
    expect(rest).toBe(0);
    expect(helper + classified).toBe(flagged);
    expect(helper).toBeGreaterThan(0);
    expect(classified).toBeGreaterThan(0);
  });

  it('reads a cat of a composed corpus path planted in a verb as REMAINDER', async () => {
    const dir = plantCopy();
    appendFileSync(join(dir, 'query'), 'cat "$ROOT_DIR/docs/$REPO/x.md" >/dev/null\n');
    const r = await census(dir);
    expect(r.code).toBe(1);
    expect(remainder(r, 'query')).toHaveLength(1);
  });

  it('reads a getline over a computed path planted in an engine as REMAINDER', async () => {
    const dir = plantCopy();
    const engine = readFileSync(join(dir, 'docs-check.awk'), 'utf8');
    const at = engine.search(/^END \{\n/m) + 'END {\n'.length;
    writeFileSync(join(dir, 'docs-check.awk'), `${engine.slice(0, at)}    while ((getline pl < (root "/do" "cs/x/y" ".m" "d")) > 0) n++\n${engine.slice(at)}`);
    const r = await census(dir);
    expect(r.code).toBe(1);
    expect(remainder(r, 'docs-check.awk')).toHaveLength(1);
  });

  it('reads a quote-split corpus path read by awk without -f as REMAINDER twice', async () => {
    const dir = plantCopy();
    appendFileSync(join(dir, 'query'), 'pf="$DOCS_ROOT/do""cs/$REPO/x.m""d"\nawk \'NR == 1\' "$pf" >/dev/null 2>&1\n');
    const r = await census(dir);
    expect(r.code).toBe(1);
    expect(remainder(r, 'query')).toHaveLength(2);
  });
});
