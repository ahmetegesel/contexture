import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { text } from './walk';

const overlay = (): string => text(join(ROOT, 'AGENTS.workspace.md'));
const has = (body: string, line: RegExp): boolean => body.split('\n').some((l) => line.test(l));

const MOVED_LAWS = ['docs-first', 'docs-are-code', 'git-dependency', 'corpus-untracked', 'corpus-reconcile', 'gap', 'harness-free', 'dont-fool-yourself', 'docs-audience-separation'];

const MOVED_CLAUSES: [string, RegExp][] = [
  ['the docs layout clause', /^@append @layout$/],
  ['the docs boot clause', /^@append @boot$/],
  ['the docs close clause', /^@append @close$/],
  ['the lane branch clause', /^  branch\/worktree: /],
  ['the lane landing clause', /^  landing: /],
  ['the lane boundary-warning', /^  boundary-warning: /],
  ['the lane drift clause', /^  drift: /],
  ['the lane git clause', /^  branch\/worktree on demand: /],
];

describe.concurrent('the workspace overlay keeps only what the modules do not carry', () => {
  it('the instrument reads a planted moved law and clause', () => {
    const planted = `${overlay()}\n@append @laws\n  docs-first: planted\n  landing: planted\n`;
    expect(has(planted, /^  docs-first:/)).toBe(true);
    expect(has(planted, /^  landing: /)).toBe(true);
  });

  it.each(MOVED_LAWS)('the %s law left the overlay', (slug) => {
    expect(has(overlay(), new RegExp(`^  ${slug}:`))).toBe(false);
  });

  it.each(MOVED_CLAUSES)('%s left the overlay', (_name, line) => {
    expect(has(overlay(), line)).toBe(false);
  });

  it('the repository-specific corpus law stays', () => {
    expect(has(overlay(), /^  corpus-untracked-here: /)).toBe(true);
  });

  it('the docs plugin overlay is retired and its README records it', () => {
    expect(existsSync(join(ROOT, 'plugins/docs-discipline/AGENTS.workspace.md'))).toBe(false);
    expect(text(join(ROOT, 'plugins/docs-discipline/README.md'))).toContain('retired: no root overlay fragment ships');
  });
});
