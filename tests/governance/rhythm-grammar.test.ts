import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { stage } from '../support/stage';
import { kids, walk } from './walk';

const FLOOR = 5;
const DOCS_WORK = 'plugins/docs-discipline/docs/work.md';

function shipped(root: string): string[] {
  const roots = [join(root, 'base/.contexture/extensions/rhythms'), ...kids(join(root, 'plugins')).map((p) => join(p, '.contexture/extensions/rhythms'))];
  const files = roots.flatMap((dir) => walk(dir)).filter((f) => f.endsWith('.md'));
  return existsSync(join(root, DOCS_WORK)) ? [...files, join(root, DOCS_WORK)] : files;
}

function staged(label: string, name: string, body: string): string {
  const sb = stage('posix', label);
  mkdirSync(join(sb, '.contexture/extensions/rhythms'), { recursive: true });
  writeFileSync(join(sb, '.contexture/extensions/rhythms', name), body);
  return sb;
}

const lines = (out: string): string[] => out.replace(/\n$/, '').split('\n').filter(Boolean);
const DEBUG = readFileSync(join(ROOT, 'plugins/starter-rhythms/.contexture/extensions/rhythms/debug.md'), 'utf8');

describe.concurrent('the rhythm grammar census over every shipped rhythm, by the one rule ctx rhythm list runs', () => {
  const files = shipped(ROOT);

  it('[modules-r-6l2ti] the scan walks the base and every plugin rhythm root by directory, the docs work copy beside them, above its floor', () => {
    expect(files.length).toBeGreaterThanOrEqual(FLOOR);
    expect(files.map((f) => f.slice(ROOT.length + 1))).toContain(DOCS_WORK);
  });

  it('[modules-r-6l2ti] a scan with a walk root renamed away falls under the floor and reads red', () => {
    const copy = sandbox('rhythm-grammar-empty');
    for (const file of files) {
      const rel = file.slice(ROOT.length + 1);
      mkdirSync(join(copy, rel, '..'), { recursive: true });
      cpSync(file, join(copy, rel));
    }
    expect(shipped(copy).length).toBe(files.length);
    renameSync(join(copy, 'plugins'), join(copy, 'plugins.away'));
    expect(shipped(copy).length).toBeLessThan(FLOOR);
  });

  it.each(shipped(ROOT).map((f) => [f.slice(ROOT.length + 1), f]))('[modules-r-6l2ti] %s lists in a sandbox extension root by its file name with an empty stderr', async (_rel, file) => {
    const name = basename(file);
    const sb = staged('rhythm-grammar', name, readFileSync(file, 'utf8'));
    const r = await ctx(sb, 'rhythm', 'list');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(lines(r.stdout)[0]).toMatch(new RegExp(`^${name.replace(/\.md$/, '')} \\| extension \\| use when: `));
  });

  it.each([
    ['a missing use when line', DEBUG.replace(/^ {2}use when:.*\n/m, ''), 'no use when line'],
    ['an activation outside propose and auto', DEBUG.replace('activation: propose', 'activation: banana'), "activation 'banana' is neither propose nor auto, read as propose"],
    ['an @rhythm name that is not the file name', DEBUG.replace('@rhythm debug', '@rhythm other'), "its @rhythm line names 'other'"],
    ['a step numbering gap', DEBUG.replace(/^ {2}2\. TRACE:.*\n/m, ''), 'the steps break their 1 to N order at step 3'],
    ['a gate outside the stamp grammar', DEBUG.replace('2. TRACE:', '2. TRACE & TRACK:'), "step 2 gate 'TRACE & TRACK' is outside the stamp grammar"],
  ])('[modules-r-6l2ti] a planted %s reads exactly one warning', async (_label, body, defect) => {
    expect(body).not.toBe(DEBUG);
    const r = await ctx(staged('rhythm-grammar-plant', 'debug.md', body), 'rhythm', 'list');
    expect([r.code, lines(r.stderr)]).toEqual([0, [`rhythm list: warning: debug (extension): ${defect}`]]);
  });

  it('[modules-r-6l2ti, the-record-r-ep8la] docs-authoring step 10 reads TRACE+ACCUMULATE and a stamp of it records rc 0', async () => {
    const authoring = readFileSync(join(ROOT, 'plugins/docs-discipline/.contexture/extensions/rhythms/docs-authoring.md'), 'utf8');
    expect(authoring.split('\n').filter((l) => l.startsWith('  10. '))).toEqual([expect.stringMatching(/^ {2}10\. TRACE\+ACCUMULATE: /)]);
    const sb = staged('rhythm-grammar-stamp', 'docs-authoring.md', authoring);
    expect((await ctx(sb, 'unit', 'bootstrap', 'da-unit', 'the docs authoring stamp')).code).toBe(0);
    const r = await ctx(sb, 'unit', 'record', 'da-unit', '--what=probe', '--rhythm=docs-authoring 10 TRACE+ACCUMULATE');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toContain('rhythm: docs-authoring at 10 TRACE+ACCUMULATE; next gate: 11 REFRESH: run @refresh');
  });
});
