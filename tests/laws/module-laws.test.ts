import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { count, DOCS_MOD } from '../support/laws';

const DOCS_LAWS = join(DOCS_MOD, 'laws');
const LANE_LAWS = join(ROOT, 'base/.contexture/extensions/modules/lane/laws');

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
    expect(lawSlugs(text)).toEqual(['docs-first', 'docs-are-code', 'corpus-untracked', 'corpus-reconcile', 'gap', 'harness-free', 'dont-fool-yourself', 'docs-audience-separation']);
    expect(count(text, /^@append @/)).toBe(4);
    expect(text).toMatch(/^@append @layout$/m);
    expect(text).toContain('ctx docs query workspace conventions');
    expect(text).toContain('  the docs module: the corpus module\'s contract and verbs, read through ctx docs help');
    expect(text).not.toContain('extensions/modules/docs/README.md');
    expect(text).toMatch(/^@append @boot$/m);
    expect(text).toContain('ctx docs query --index');
    expect(text).toMatch(/^@append @close$/m);
    expect(text).toContain('ctx docs gate');
  });

  it('[modules-r12] keeps the lane subagent clauses and the git clause in the lane module', () => {
    const text = readFileSync(LANE_LAWS, 'utf8');
    expect(text).toMatch(/^@append @subagents$/m);
    for (const clause of ['branch/worktree', 'landing', 'boundary-warning', 'drift']) expect(text).toMatch(new RegExp(`^ {2}${clause}: `, 'm'));
    expect(text).toMatch(/^@append @git$/m);
    expect(text).toMatch(/^ {2}branch\/worktree on demand: /m);
  });
});
