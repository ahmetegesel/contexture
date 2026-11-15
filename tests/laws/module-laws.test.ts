import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leaks } from '../support/drawer';
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

  it('[modules-r12, the-record-r-nudge] keeps the sweep consent law in the unit module: its one @laws slug binding every sweep that writes, both forms with or without --delete, to the human\'s word in the session, naming the dry run as the one form run without it, and on the leftovers nudge the dry run shown and the move or the delete asked, naming no storage path and no dash as punctuation', () => {
    const text = readFileSync(UNIT_LAWS, 'utf8');
    expect(lawSlugs(text)).toEqual(['sweep-consent']);
    const law = text.split('\n').filter((l) => l.startsWith('  sweep-consent: '));
    expect(law).toHaveLength(1);
    for (const part of [
      'the agent never runs a sweep that writes (ctx unit migrate --sweep or ctx store check --leftovers --sweep, with or without --delete) without the human\'s word in the session',
      'the dry run (--dry-run), which writes nothing, is the one form it runs without that word',
      'on the leftovers nudge of ctx unit list it tells the human what was found, runs the dry run (ctx unit migrate --sweep --dry-run --all), shows it, and asks whether to move the leftovers into a backup or delete them',
      'the nudge, a plan, or a word from an earlier session is never that word',
    ]) expect(law[0]).toContain(part);
    expect(leaks(law[0]!), 'the law names no record storage path').toBe(false);
    expect(law[0]).not.toMatch(/ - |—|–|\.contexture\//);
  });

  it('[the-record-r-lst33] names the unit listing among the unit laws\' named looks by a form the verb runs, ctx unit list --repo=<repo>', () => {
    const queries = readFileSync(UNIT_LAWS, 'utf8').split('\n').filter((l) => l.startsWith('  queries: named looks: '));
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain('named looks: ctx unit entry closure, ctx unit list --repo=<repo>, ctx unit refs-to (');
    expect(queries[0]).not.toMatch(/ctx unit list --repo(?!=<repo>)/);
  });
});
