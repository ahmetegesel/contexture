import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { count, DOCS_MOD } from '../support/laws';

const DOCS_LAWS = join(DOCS_MOD, 'laws');
const LANE_LAWS = join(ROOT, 'base/.contexture/modules/lane/laws');
const UNIT_LAWS = join(ROOT, 'base/.contexture/modules/unit/laws');

function lawSlugs(text: string): string[] {
  const out: string[] = [];
  let on = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('@')) {
      on = line === '@laws' || line === '@append @laws';
      continue;
    }
    const m = /^ {2}([A-Za-z0-9][A-Za-z0-9_-]*):/.exec(line);
    if (on && m) out.push(m[1]!);
  }
  return out;
}

describe.concurrent('the module law fragments', () => {
  it('[modules-r12, plugins-r2] keeps the eight docs laws and the layout, boot, and close clauses in the docs module', () => {
    expect(existsSync(DOCS_LAWS)).toBe(true);
    const text = readFileSync(DOCS_LAWS, 'utf8');
    expect(lawSlugs(text)).toEqual(['docs-first', 'docs-are-code', 'git-dependency', 'corpus-untracked', 'corpus-reconcile', 'gap', 'harness-free', 'docs-audience-separation']);
    expect(count(text, /^@append @/)).toBe(4);
    expect(text).toMatch(/^@append @layout$/m);
    expect(text).toContain('ctx docs query workspace conventions');
    expect(text).not.toContain('extensions/modules/docs/README.md');
    expect(text).toMatch(/^@append @boot$/m);
    expect(text).toContain('ctx docs query --index');
    expect(text).toMatch(/^@append @close$/m);
    expect(text).toContain('ctx docs gate');
  });

  it('[modules-r12] keeps the lane subagent clauses in the lane module', () => {
    const text = readFileSync(LANE_LAWS, 'utf8');
    expect(text).toMatch(/^@append @subagents$/m);
    for (const clause of ['branch/worktree', 'landing', 'boundary-warning', 'drift']) expect(text).toMatch(new RegExp(`^ {2}${clause}: `, 'm'));
    expect(text).not.toMatch(/^@append @git$/m);
  });

  it('[the-record-r-lst33] names the unit listing among the unit laws\' named looks by a form the verb runs, ctx unit list --repo=<repo>', () => {
    const queries = readFileSync(UNIT_LAWS, 'utf8').split('\n').filter((l) => l.startsWith('  queries: named looks: '));
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('named looks: ctx unit entry closure, ctx unit list --repo=<repo>, ctx unit refs-to (');
    expect(queries[0]).not.toMatch(/ctx unit list --repo(?!=<repo>)/);
  });
});
