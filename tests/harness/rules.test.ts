import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec, type Run } from '../support/exec';
import { ROOT } from '../support/root';
import { citations, indexEntries, projectionIds, reasonsTable } from '../support/rules';
import { sandbox } from '../support/sandbox';
import { put } from '../support/tree';

const VITEST = join(ROOT, 'tests/node_modules/.bin/vitest');
const CONFIG = join(ROOT, 'tests/harness/fixtures/rules.config.mts');

const INDEX = [
  'workspace                 alpha                        structural                      The alpha doc',
  'workspace                 beta                         structural                      The beta doc',
  'workspace                 gamma                        conventions                     The gamma doc',
  'index complete: 3 entries',
  '',
].join('\n');

const contract = (ids: readonly string[]): string[] => ids.flatMap((id) => [`  - rule: the rule ${id} states`, `    id: ${id}`, `    evidence: ${id}_symbol`]);

const ALPHA = [
  '[structural: alpha] ',
  'The alpha doc',
  '',
  '',
  'RESPONSIBILITIES:',
  '  - Owns alpha',
  '    id: alpha-o1',
  '',
  'CONTRACT:',
  ...contract(['alpha-r1', 'alpha-r2', 'alpha-r3', 'alpha-r4', 'alpha-r5', 'alpha-r6']),
  '',
  'PITFALLS:',
  '  - id: alpha-p1',
  '    summary: a pitfall no title cites',
  '',
].join('\n');

const BETA = ['[structural: beta] ', 'The beta doc', '', '', 'CONTRACT:', ...contract(['beta-r10', 'beta-r2', 'beta-r1', 'beta-r4', 'beta-r3']), '', 'PITFALLS:', '  - id: beta-p1', '    summary: a cited pitfall', ''].join('\n');

const GAMMA = ['[conventions: gamma] ', 'The gamma doc', '', '', 'RULES:', '  - rule: a convention without an id', ''].join('\n');

const REASONS = [
  '# the reasons header',
  'alpha-r6 the abbreviated group proves nothing',
  'beta-r2 a reason a passed test makes stale',
  'beta-r4 no fixture test reaches it',
  'gone-r1 a reason for an id the corpus lacks',
  'not a reason line',
  '',
].join('\n');

const CTX = `#!/bin/sh
a=$(dirname "$0")/answers
case "$*" in
  'docs query --index') cat "$a/index" ;;
  'docs query workspace alpha') cat "$a/alpha" ;;
  'docs query workspace beta') cat "$a/beta" ;;
  'docs query workspace gamma') [ -f "$a/gamma" ] && cat "$a/gamma" || exit 1 ;;
  *) echo "unexpected: $*" >&2; exit 1 ;;
esac
`;

function drawer(label: string, answers: Record<string, string> = { index: INDEX, alpha: ALPHA, beta: BETA, gamma: GAMMA }): string {
  const sb = sandbox(label);
  put(join(sb, '.contexture/ctx'), CTX, 0o755);
  for (const [name, text] of Object.entries(answers)) put(join(sb, '.contexture/answers', name), text);
  return sb;
}

async function inner(label: string, corpus: string, args: readonly string[] = [], env: Record<string, string> = {}): Promise<{ r: Run; json: Record<string, unknown> }> {
  const dir = sandbox(label);
  put(join(dir, 'reasons.txt'), REASONS);
  const r = await exec(VITEST, ['run', '--config', CONFIG, ...args], { cwd: dir, env: { RUNNER_DIR: dir, VITEST_CORPUS_ROOT: corpus, ...env } });
  return { r, json: JSON.parse(readFileSync(join(dir, 'rules.json'), 'utf8')) };
}

const at = (test: string): string => `rules-fixture rules-cited.fixture.ts > ${test}`;

describe.concurrent('the rule id coverage reporter reads the ids from each test title alone', () => {
  it('a bracket group of full ids cites them; any id outside such a group is outside the canonical form', () => {
    expect(citations('[the-engine-r7] help prints the table')).toEqual({ ids: ['the-engine-r7'], offForm: [] });
    expect(citations('[the-engine-r4, modules-r2] two rules')).toEqual({ ids: ['the-engine-r4', 'modules-r2'], offForm: [] });
    expect(citations('CT-A1 [docs-module-r3] [ast-doc-graph-p2] an old case id beside two groups')).toEqual({ ids: ['docs-module-r3', 'ast-doc-graph-p2'], offForm: [] });
    expect(citations('the-record-r17: a prefix')).toEqual({ ids: [], offForm: ['the-record-r17'] });
    expect(citations('a parenthesized list (the-engine-r1, r5)')).toEqual({ ids: [], offForm: ['the-engine-r1'] });
    expect(citations('[the-engine-r1, r5] an abbreviated group')).toEqual({ ids: [], offForm: ['the-engine-r1'] });
    expect(citations('[the-engine-r1,the-engine-r5] a group without its blank')).toEqual({ ids: [], offForm: ['the-engine-r1', 'the-engine-r5'] });
    expect(citations('[GATE NOTICE] store-b64 and TC22 cite nothing')).toEqual({ ids: [], offForm: [] });
  });

  it('the index needs its marker and its count; a projection yields its contract, responsibility, and pitfall ids by section', () => {
    expect(indexEntries(INDEX)).toEqual({ entries: [{ repo: 'workspace', slug: 'alpha' }, { repo: 'workspace', slug: 'beta' }, { repo: 'workspace', slug: 'gamma' }] });
    expect(indexEntries(INDEX.replace('index complete: 3 entries', ''))).toEqual({ need: 'ctx docs query --index to end with its index complete marker' });
    expect(indexEntries(INDEX.replace('3 entries', '4 entries'))).toEqual({ need: 'ctx docs query --index to list the 4 entries its marker counts (it listed 3)' });
    expect(projectionIds('workspace', 'alpha', ALPHA)).toEqual({
      repo: 'workspace',
      slug: 'alpha',
      contract: ['alpha-r1', 'alpha-r2', 'alpha-r3', 'alpha-r4', 'alpha-r5', 'alpha-r6'],
      responsibilities: ['alpha-o1'],
      pitfalls: ['alpha-p1'],
    });
    expect(projectionIds('workspace', 'beta', BETA).contract).toEqual(['beta-r1', 'beta-r2', 'beta-r3', 'beta-r4', 'beta-r10']);
    expect(projectionIds('workspace', 'gamma', GAMMA)).toEqual({ repo: 'workspace', slug: 'gamma', contract: [], responsibilities: [], pitfalls: [] });
  });

  it('the reasons table keys one reason per id and names every line it cannot read', () => {
    const t = reasonsTable(`${REASONS}alpha-r6 a second reason for one id\n`);
    expect([...t.reasons]).toEqual([
      ['alpha-r6', 'the abbreviated group proves nothing'],
      ['beta-r2', 'a reason a passed test makes stale'],
      ['beta-r4', 'no fixture test reaches it'],
      ['gone-r1', 'a reason for an id the corpus lacks'],
    ]);
    expect(t.malformed).toEqual(['not a reason line', 'alpha-r6 a second reason for one id']);
  });
});

describe.concurrent('an inner vitest run reports the coverage per corpus doc and never fails the run', () => {
  it('a complete run counts only passed tests by their own titles, and names the unknown, off-form, describe, stale, orphan, and malformed lines', async () => {
    const corpus = drawer('rules-corpus');
    const { r, json } = await inner('rules-complete', corpus);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain(`rules: 11 contract rule ids in 2 of the 3 docs of the corpus at ${corpus}: 5 covered, 2 reasoned, 4 uncovered\n`);
    expect(r.stdout).not.toContain('rules: partial run');
    expect(r.stdout).toContain('rules:   alpha 2 of 6 covered, 1 reasoned; uncovered: alpha-r3, alpha-r4, alpha-r5\n');
    expect(r.stdout).toContain('rules:   beta 3 of 5 covered, 1 reasoned; uncovered: beta-r10\n');
    expect(r.stdout).not.toContain('rules:   gamma');
    expect(r.stdout).toContain('rules: cited apart: responsibilities 1 of 1, pitfalls 1 of 2\n');
    expect(r.stdout).toContain(`rules: cited but absent from the corpus: alpha-r9 in ${at('[alpha-r9] an id the corpus lacks')}\n`);
    expect(r.stdout).toContain(`rules: outside the canonical form [<id>] or [<id>, <id>]: alpha-r5 in ${at('alpha-r5: a prefix outside the canonical form')}\n`);
    expect(r.stdout).toContain(`rules: outside the canonical form [<id>] or [<id>, <id>]: alpha-r1 in ${at('[alpha-r1, r6] an abbreviated group')}\n`);
    expect(r.stdout).toContain(`rules: on a describe, which proves nothing: alpha-r3 in ${at('[alpha-r3] a describe tag proves nothing')}\n`);
    expect(r.stdout).toContain('rules: stale reasons, the id is covered now: beta-r2\n');
    expect(r.stdout).toContain('rules: reasons naming no contract rule id of the corpus: gone-r1\n');
    expect(r.stdout).toContain('rules: malformed reason line: not a reason line\n');
    expect(json).toMatchObject({ status: 'complete', partial: [], total: 11, read: 3 });
    expect((json.tests as Record<string, string[]>)['alpha-r1']).toEqual([at('[alpha-r3] a describe tag proves nothing > [alpha-r1] a passed citation')]);
    expect(Object.keys(json.tests as object)).not.toContain('alpha-r3');
    expect(Object.keys(json.tests as object)).not.toContain('alpha-r4');
  });

  it('a run narrowed by a project, a name pattern, or a file filter, or ending failed, reports partial', async () => {
    const corpus = drawer('rules-corpus');
    const projects = await inner('rules-projects', corpus, [], { RUNNER_PROJECTS: 'rules-fixture,elsewhere' });
    expect(projects.r.stdout).toContain('rules: partial run, so the counts read low: the projects elsewhere did not run\n');
    const pattern = await inner('rules-pattern', corpus, ['-t', 'passed citation']);
    expect(pattern.r.code, pattern.r.stdout + pattern.r.stderr).toBe(0);
    expect(pattern.r.stdout).toContain('rules: partial run, so the counts read low: a test name pattern is set\n');
    const files = await inner('rules-files', corpus, ['rules-cited']);
    expect(files.r.stdout).toContain('rules: partial run, so the counts read low: 1 test files did not run\n');
    const failed = await inner('rules-failed', corpus, [], { RUNNER_FAIL: '1' });
    expect(failed.r.code).toBe(1);
    expect(failed.r.stdout).toContain('rules: partial run, so the counts read low: the run ended failed\n');
    expect(failed.r.stdout).toContain('rules:   beta 2 of 5 covered, 1 reasoned; uncovered: beta-r3, beta-r10\n');
    expect(failed.json).toMatchObject({ status: 'partial', partial: ['the run ended failed'] });
  });

  it('null check: with no drawer, no index marker, or a projection refused, it skips naming the need and the run stays green', async () => {
    const empty = sandbox('rules-no-drawer');
    const none = await inner('rules-skip-drawer', empty);
    expect(none.r.code, none.r.stdout + none.r.stderr).toBe(0);
    expect(none.r.stdout).toContain(`rules: skipped, needs the live drawer's ctx at ${empty}/.contexture/ctx, absent in a worktree and a fresh clone (VITEST_CORPUS_ROOT names a workspace root that holds one)\n`);
    expect(none.r.stdout).not.toContain('covered');
    expect(none.json).toEqual({ status: 'skipped', need: `the live drawer's ctx at ${empty}/.contexture/ctx, absent in a worktree and a fresh clone (VITEST_CORPUS_ROOT names a workspace root that holds one)` });
    const unmarked = await inner('rules-skip-marker', drawer('rules-unmarked', { index: INDEX.replace('index complete: 3 entries\n', ''), alpha: ALPHA, beta: BETA, gamma: GAMMA }));
    expect(unmarked.r.code).toBe(0);
    expect(unmarked.r.stdout).toContain('rules: skipped, needs ctx docs query --index to end with its index complete marker\n');
    const refused = await inner('rules-skip-doc', drawer('rules-refused', { index: INDEX, alpha: ALPHA, beta: BETA }));
    expect(refused.r.code).toBe(0);
    expect(refused.r.stdout).toContain('rules: skipped, needs the live corpus: ctx docs query workspace gamma answered rc 1\n');
  });
});
