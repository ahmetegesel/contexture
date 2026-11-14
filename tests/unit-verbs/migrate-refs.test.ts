import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, RECORD_ROOT } from '../support/drawer';
import { readArtifact } from '../support/record';
import { ROOT } from '../support/root';
import { fresh, seed } from '../support/snapshot';
import { treeState } from '../support/tree';
import { must, plantArtifact, run, seedUnit, unit } from '../support/unit';

const U = 'mig-u';

// [the REF value as stored, the REF it becomes (null when it leaves the field), the NOTE it
// leaves (null for none), the census class]: the real samples of the ref census and the text
// census, one per class rule
const REF_CASES: readonly (readonly [string, string | null, string | null, string])[] = [
  ['journal#2026-11-06-event-1793980564', `unit#${U}/entry/2026-11-06-event-1793980564`, null, 'short journal#'],
  ['knowledge#AST_DOC_GRAPH_FILES_ONLY_CORPUS', `unit#${U}/finding/AST_DOC_GRAPH_FILES_ONLY_CORPUS`, null, 'short knowledge#'],
  ['backlog#plugin-version-bumps', `unit#${U}/task/plugin-version-bumps`, null, 'short backlog#'],
  ['lane#exec-dont-fool/report', `unit#${U}/lane/exec-dont-fool/report`, null, 'short lane#'],
  ['lane#ground-ideas/report#IDEAS_DOGFOOD', `unit#${U}/lane/ground-ideas/report/IDEAS_DOGFOOD`, null, 'short lane# with a section'],
  ['lane#k-lane/journal#2026-09-27-k-l1', `unit#${U}/lane/k-lane/journal/2026-09-27-k-l1`, null, 'short lane# with a journal entry'],
  ['lane#idea-triage/audit-repair-verb/recipe', 'unit#idea-triage/lane/audit-repair-verb/recipe', null, 'lane#<unit>/<lane>/<artifact>'],
  ['lanes/recency-recon/recipe', `unit#${U}/lane/recency-recon/recipe`, null, 'legacy lanes/'],
  ['lanes/learner-profile/report.md#identity', `unit#${U}/lane/learner-profile/report/identity`, null, 'legacy lanes/'],
  ['lanes/bilingo-docs-exec/report.md', `unit#${U}/lane/bilingo-docs-exec/report`, null, 'legacy lanes/'],
  ['lanes/research-context-mode/recipe.md#MISSION', `unit#${U}/lane/research-context-mode/recipe/MISSION`, null, 'legacy lanes/'],
  ['lanes/sync-x/batteries.log', 'file#lanes/sync-x/batteries.log', null, 'legacy lanes/ file'],
  ['journal.md#2026-09-12-install-decided', `unit#${U}/entry/2026-09-12-install-decided`, null, 'the .md short forms'],
  ['backlog.md#upgrade-session-help', `unit#${U}/task/upgrade-session-help`, null, 'the .md short forms'],
  ['knowledge.md#CONTEXT_MODE_ARCHITECTURE', `unit#${U}/finding/CONTEXT_MODE_ARCHITECTURE`, null, 'the .md short forms'],
  ['task#sessions-citations-sweep', `unit#${U}/task/sessions-citations-sweep`, null, 'task#, finding#, entry#'],
  ['finding#DT_FINDING_APPENDED', `unit#${U}/finding/DT_FINDING_APPENDED`, null, 'task#, finding#, entry#'],
  ['entry#2026-09-27-x-e1', `unit#${U}/entry/2026-09-27-x-e1`, null, 'task#, finding#, entry#'],
  ['IDEAS.md#hook-system-at-scale', 'store#ideas/hook-system-at-scale', null, 'IDEAS.md slug'],
  ['../../../IDEAS.md#storage-abstraction', 'store#ideas/storage-abstraction', null, 'IDEAS.md slug'],
  ['./IDEAS.md', 'store#containers/ideas', null, 'IDEAS.md bare'],
  ['../workspace-sync/lanes/sync-atl-v0550/report', 'unit#workspace-sync/lane/sync-atl-v0550/report', null, '../<unit>/lanes/'],
  ['../workspace-convention/journal.md#2026-09-15-session-toolbox-shipped', 'unit#workspace-convention/entry/2026-09-15-session-toolbox-shipped', null, '../<unit>/ artifact'],
  ['../workspace-convention/backlog.md#sync-cv-creator', 'unit#workspace-convention/task/sync-cv-creator', null, '../<unit>/ artifact'],
  ['../../lanes/execute-compact-mechanics/report.md#mechanics-landed', 'file#../../lanes/execute-compact-mechanics/report.md#mechanics-landed', null, 'parent relative path'],
  ['docs/the-record.md', 'file#docs/the-record.md', null, 'repo file path'],
  ['base/.contexture/modules/session/lib/render.awk#v_active', 'file#base/.contexture/modules/session/lib/render.awk#v_active', null, 'repo file#symbol'],
  ['./README.md', 'file#./README.md', null, 'root ./ path'],
  ['AGENTS.md#@rhythms', 'file#AGENTS.md#@rhythms', null, 'root file#symbol'],
  ['.gitignore#L21-27', 'file#.gitignore#L21-27', null, 'root file#symbol'],
  ['/Users/ahmetegesel/Projects/pirimedya/piri-workspace/.gitignore', 'file#/Users/ahmetegesel/Projects/pirimedya/piri-workspace/.gitignore', null, 'absolute path'],
  ['AGENTS.workspace.md', 'file#./AGENTS.workspace.md', null, 'root file name'],
  ['file#AGENTS.workspace.md', 'file#AGENTS.workspace.md', null, 'full address'],
  ['unit#storage/entry/2026-11-06-event-1793961790', 'unit#storage/entry/2026-11-06-event-1793961790', null, 'full address'],
  ['journal#nope-dangling', `unit#${U}/entry/nope-dangling`, null, 'short journal#'],
  ['3', null, '3', 'not a pointer'],
  ['units-root-transition', null, 'units-root-transition', 'not a pointer'],
  ['journal#2026-11-06-event-1793961790 (the approved split)', `unit#${U}/entry/2026-11-06-event-1793961790`, '(the approved split)', 'short journal#, annotation to NOTE'],
  ['years of opencode-plugins usage', null, 'years of opencode-plugins usage', 'prose'],
  // a REF value no class rewrites leaves the field word for word into NOTE, so every REF holds a full address
  ['task#nope', null, 'task#nope', 'excluded: placeholder'],
  ['@laws#process-free', null, '@laws#process-free', 'excluded: law pointer'],
  ['https://example.com/x#y', null, 'https://example.com/x#y', 'excluded: url'],
  ['lane#exec-only', null, 'lane#exec-only', 'excluded: lane# naming no artifact'],
  ['lane#l/report#VERDICT', null, 'lane#l/report#VERDICT', 'excluded: placeholder pattern'],
  ['task#nope (a placeholder)', null, 'task#nope (a placeholder)', 'excluded: placeholder, annotated'],
  ['journal#a,journal#b', null, 'journal#a,journal#b', 'pointer glued to text'],
  // an owner shaped address stays as written, a dangling owner or target like a dangling file#
  ['ideas#rust-driver', 'ideas#rust-driver', null, 'address of another owner'],
  ['unit#a', 'unit#a', null, 'full address'],
  // a lane section anchor followed by more words: the artifact's address, the whole value in NOTE
  ['lanes/l1/report.md#claim x', `unit#${U}/lane/l1/report`, 'lanes/l1/report.md#claim x', 'legacy lanes/, anchor followed by words, to NOTE'],
  ['lane#l1/report#A B', `unit#${U}/lane/l1/report`, 'lane#l1/report#A B', 'short lane# with a section, anchor followed by words, to NOTE'],
  ['lane#l1/journal#j1 (that entry)', `unit#${U}/lane/l1/journal/j1`, '(that entry)', 'short lane# with a journal entry, annotation to NOTE'],
  // the completion receipt prefix leaves for NOTE; a path:line takes file#<path>, the token in NOTE;
  // a path followed by a colon takes the path's address, the whole value in NOTE
  ['backlog/t1: DONE', null, 'backlog/t1: DONE', 'excluded: completion receipt prefix, annotated'],
  ['src/a.ts:10', 'file#src/a.ts', 'src/a.ts:10', 'file path:line'],
  ['src/a.ts: the parser', 'file#src/a.ts', 'src/a.ts: the parser', 'path with a trailing colon, the whole value to NOTE'],
  ['src/b.ts:', 'file#src/b.ts', 'src/b.ts:', 'path with a trailing colon'],
  ['README.md: the intro', 'file#./README.md', 'README.md: the intro', 'path with a trailing colon, the whole value to NOTE'],
  ['journal#2026-11-14-r0 (superseded by journal#2026-11-14-r1 and see lanes/l/report.md)', `unit#${U}/entry/2026-11-14-r0`, '(superseded by journal#2026-11-14-r1 and see lanes/l/report.md)', 'short journal#, annotation to NOTE'],
];

const slugOf = (i: number): string => `2026-11-14-r${i}`;
const JOURNAL = [
  ...REF_CASES.map(([ref], i) => `@entry ${slugOf(i)}\n  ANCHOR: A1\n  WHAT: "case ${i}"\n  THREAD: none\n  REF: "${ref}"\n`),
  '@entry 2026-11-14-closer\n  ANCHOR: A1\n  WHAT: "the closer stays: knowledge#F1"\n  THREAD: none\n  CLOSES: 2026-11-14-r0 (done: harvested into knowledge#F1 and journal#2026-11-14-r1)\n',
  '@entry 2026-11-14-quoted\n  ANCHOR: A1\n  WHAT: "the \\"journal#2026-11-14-r0\\" quoted inside and \\\\knowledge#F1\\\\ escaped"\n  THREAD: none\n',
].join('\n');

const BACKLOG = [
  '@task t1',
  '  STATUS: TODO',
  '  OBJECTIVE: "the task names backlog#t2"',
  '  REFS: [journal#2026-11-14-r0, "IDEAS.md#hook-system-at-scale", "AGENTS.md#compact-streams", 3, "journal#2026-11-14-r1 (annot, with, comma)"]',
  '  DESCRIPTION ::',
  '    Context. journal#2026-11-14-r0 and ../workspace-sync/lanes/sync-atl-v0550/report, base/x.sh stays.',
  '',
].join('\n');

const KNOWLEDGE = [
  '@finding F1',
  '  REF: "journal#2026-11-14-r0"',
  '  REF: "years of usage, quoted"',
  '  SUMMARY ::',
  '    a summary naming knowledge#F2 and lanes/l1/report.md#VERDICT.',
  '',
].join('\n');

const RECIPE = [
  '@recipe l1',
  `  UNIT: ${U}`,
  '  LANE: l1',
  '  TASKS: backlog#docs-query-owner (in that order), backlog#t2 (see a, README.md and more)',
  '  DECISIONS: journal#2026-11-06-event-1793961790',
  '',
  'GOAL ::',
  '  the goal names lanes/l2/report and IDEAS.md',
  '',
  'REFS ::',
  '  journal#2026-11-06-event-1793961790 (the approved split, see knowledge#F1)',
  '  the corpus: ctx docs query workspace docs-module (r4, r6)',
  '  ./README.md',
  '',
].join('\n');
const RECIPE_AFTER = RECIPE.replace('backlog#docs-query-owner', `unit#${U}/task/docs-query-owner`)
  .replace('backlog#t2', `unit#${U}/task/t2`)
  .replace('  DECISIONS: journal#2026-11-06-event-1793961790', `  DECISIONS: unit#${U}/entry/2026-11-06-event-1793961790`)
  .replace('lanes/l2/report', `unit#${U}/lane/l2/report`)
  .replace('and IDEAS.md', 'and store#containers/ideas')
  .replace('  journal#2026-11-06-event-1793961790 (the approved split, see knowledge#F1)', `  unit#${U}/entry/2026-11-06-event-1793961790 (the approved split, see unit#${U}/finding/F1)`)
  .replace('  ./README.md', '  file#./README.md');

const LJOURNAL = [
  '@entry 2026-11-14-l1',
  '  WHAT: "a lane event naming recipe.md and report.md#VERDICT in prose"',
  '  THREAD: none',
  '  REF: "recipe.md"',
  '  REF: "report.md#claim the-two-copies"',
  '  REF: "recipe.md#TASK 1"',
  '  REF: "task#gather-context"',
  '',
].join('\n');

// the guard: prose holding the same words, every byte of it kept but the two pointers
const REPORT = [
  '@report l1',
  'VERDICT :: done; the prose and/or 8/8 and unit/knowledge-promotion and origin/main and M/path stay',
  'FINDINGS ::',
  '  task#nope finding#NAME lane#L lane#L/journal#X lane#<lane>/report#<NAME> stay; backlog/t1: DONE stays',
  '  see https://example.com/a#b and /tmp/x and /usr/bin/env and @laws#process-free and task# and lane# and 1/2 and #12',
  '  the short (lane#l1/journal#2026-11-14-l1) and **knowledge#F1**, rewrite',
  "  glued csv journal#a,journal#b ; journal#x's ; journal#x/journal#y and x/journal#y and (journal#c)+(journal#d) stay apart",
  '# a heading names journal#2026-11-14-r0 and stays',
  '@see journal#2026-11-14-r1 on a column 0 line the tokenizer passes by',
  '',
].join('\n');
const REPORT_AFTER = REPORT.replace('(lane#l1/journal#2026-11-14-l1)', `(unit#${U}/lane/l1/journal/2026-11-14-l1)`)
  .replace('**knowledge#F1**,', `**unit#${U}/finding/F1**,`)
  .replace('journal#a,journal#b', `unit#${U}/entry/a,unit#${U}/entry/b`)
  .replace("journal#x's", `unit#${U}/entry/x's`)
  .replace('(journal#c)+(journal#d)', `(unit#${U}/entry/c)+(unit#${U}/entry/d)`);

interface Row {
  unit: string;
  label: string;
  field: string;
  cls: string;
  disp: string;
  token: string;
  next: string;
}

function rows(sb: string, stdout: string, which: 'before' | 'after'): Row[] {
  const m = stdout.match(/^token list: (\S+)\/before\.tsv(?:,| and) /m);
  expect(m).not.toBeNull();
  return readFileSync(join(sb, m?.[1] ?? '', `${which}.tsv`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [unit = '', label = '', field = '', cls = '', disp = '', token = '', next = ''] = l.split('\t');
      return { unit, label, field, cls, disp, token, next };
    });
}

const plantAll = (sb: string): void => {
  plantArtifact(sb, U, 'journal', JOURNAL);
  plantArtifact(sb, U, 'backlog', BACKLOG);
  plantArtifact(sb, U, 'knowledge', KNOWLEDGE);
  plantArtifact(sb, U, 'lanes/l1/recipe', RECIPE);
  plantArtifact(sb, U, 'lanes/l1/journal', LJOURNAL);
  plantArtifact(sb, U, 'lanes/l1/report', REPORT);
};

describe.concurrent('ctx unit migrate: the pointer rewrite', () => {
  let sb0: string;
  let migrated: string;
  let out = '';
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, U, 'the migrate unit names IDEAS.md#rust-driver');
      plantAll(sb);
      await seedUnit(sb, 'shut-u', 'the closed unit');
      await must(unit(sb, 'record', 'shut-u', '--what=a closed entry naming journal#2026-11-14-x', '--ref=backlog#t9'));
      await must(unit(sb, 'close', 'shut-u'));
    }, 'posix', 'migrate-refs');
    migrated = fresh(sb0);
    out = (await must(unit(migrated, 'migrate', U, 'shut-u'))).stdout;
  });

  it.for(REF_CASES.map((c, i) => [i, ...c] as const))('[the-record-r-4gj4k] case %i: the REF %s becomes %s', async ([i, ref, next, note, cls]) => {
    const e = JSON.parse((await must(unit(migrated, 'entry', 'show', U, slugOf(i), '--json'))).stdout).entry;
    expect(e.refs).toEqual(next === null ? [] : [next]);
    expect(e.extra_fields).toEqual(note === null ? [] : [{ key: 'NOTE', value: note }]);
    const r = rows(migrated, out, 'before').find((x) => x.label === 'journal' && x.token === ref);
    expect(r?.cls).toBe(cls);
    expect(r?.disp).toBe(next === null ? 'note' : next === ref ? 'kept' : 'rewritten');
  });

  it('[the-record-r-4gj4k] the census reconciles: before is rewritten plus kept plus moved to NOTE, the after census leaves nothing to rewrite, one line per unit, migrated names the units changed', () => {
    const m = out.match(/^census before: (\d+) rewritten, (\d+) kept, (\d+) moved to NOTE \((\d+) \+ (\d+) \+ (\d+) = (\d+)\)$/m);
    const total = out.match(/^census before: (\d+) pointer tokens in 2 units$/m);
    expect(m).not.toBeNull();
    expect(total).not.toBeNull();
    expect(Number(m?.[7])).toBe(Number(total?.[1]));
    expect(Number(m?.[1]) + Number(m?.[2]) + Number(m?.[3])).toBe(Number(total?.[1]));
    expect(rows(migrated, out, 'before')).toHaveLength(Number(total?.[1]));
    expect(out).toMatch(/^census after: \d+ pointer tokens, 0 left to rewrite$/m);
    expect(rows(migrated, out, 'after').filter((r) => r.disp !== 'kept')).toEqual([]);
    expect(out).toMatch(new RegExp(`^unit ${U}: \\d+ tokens, \\d+ rewritten, \\d+ moved to NOTE$`, 'm'));
    // the bootstrap anchor's head line carries the git branch line, so its tokens vary with the checkout
    const shut = rows(migrated, out, 'before').filter((r) => r.unit === 'shut-u');
    expect(shut.filter((r) => r.field !== 'head line')).toHaveLength(2);
    expect(out).toMatch(new RegExp(`^unit shut-u: ${shut.length} tokens, 2 rewritten, 0 moved to NOTE$`, 'm'));
    expect(out.endsWith('migrated: 2\n')).toBe(true);
  });

  it('[the-record-r-4gj4k] a task: its REFS list rewritten, split only on commas outside quotes and parentheses, legacy quotes dropped, a number and an annotation moved to NOTE, and its free text pointers rewritten in place', async () => {
    const t = (await must(unit(migrated, 'get', `${U}/task/t1`))).stdout;
    expect(t).toContain(`  REFS: [unit#${U}/entry/2026-11-14-r0, store#ideas/hook-system-at-scale, file#AGENTS.md#compact-streams, unit#${U}/entry/2026-11-14-r1]\n`);
    expect(t).toContain(`  OBJECTIVE: "the task names unit#${U}/task/t2"\n`);
    expect(t).toContain(`    Context. unit#${U}/entry/2026-11-14-r0 and unit#workspace-sync/lane/sync-atl-v0550/report, base/x.sh stays.\n`);
    expect(t).toContain('  NOTE: 3\n  NOTE: (annot, with, comma)\n');
  });

  it('[the-record-r-4gj4k] a finding: its REF rewritten, its prose REF moved to NOTE, its SUMMARY pointers rewritten keeping the trailing period', async () => {
    const f = (await must(unit(migrated, 'get', `${U}/finding/F1`))).stdout;
    expect(f).toContain(`  REF: "unit#${U}/entry/2026-11-14-r0"\n`);
    expect(f).not.toContain('REF: "years of usage');
    expect(f).toContain('  NOTE: years of usage, quoted\n');
    expect(f).toContain(`    a summary naming unit#${U}/finding/F2 and unit#${U}/lane/l1/report/VERDICT.\n`);
  });

  it('[the-record-r-4gj4k] a lane recipe is rewritten in place, its annotations kept beside the rewritten tokens', () => {
    expect(readArtifact(migrated, U, 'lane/l1/recipe').toString()).toBe(RECIPE_AFTER);
  });

  it('[the-record-r-4gj4k] a lane journal: a lane relative artifact takes its enclosing lane, an anchor holding blanks moves to NOTE whole, its prose kept', async () => {
    const j = (await must(unit(migrated, 'get', `${U}/lane/l1/journal/2026-11-14-l1`))).stdout;
    expect(j).toContain('  WHAT: "a lane event naming recipe.md and report.md#VERDICT in prose"\n');
    expect(j).toContain(`  REF: "unit#${U}/lane/l1/recipe"\n`);
    expect(j).toContain(`  REF: "unit#${U}/task/gather-context"\n`);
    expect(j).toContain('  NOTE: report.md#claim the-two-copies\n');
    expect(j).toContain('  NOTE: recipe.md#TASK 1\n');
  });

  it('[the-record-r-4gj4k] the guard: prose holding the same words comes out byte equal outside the pointer tokens; a glued token splits at a comma, a semicolon, or a glue character before a later pointer, a possessive trimmed, and a pointer glued by a slash is kept and named', () => {
    expect(readArtifact(migrated, U, 'lane/l1/report').toString()).toBe(REPORT_AFTER);
    const kept = rows(migrated, out, 'before').filter((r) => r.label === 'lane/l1/report' && r.disp === 'kept');
    expect(Object.fromEntries(kept.map((r) => [r.token, r.cls]))).toEqual({
      'journal#x/journal#y': 'pointer glued to text',
      'x/journal#y': 'free text path or slash word',
      'journal#2026-11-14-r0': 'excluded: markdown heading',
      'journal#2026-11-14-r1': 'excluded: head line',
      'and/or': 'free text path or slash word',
      '8/8': 'free text path or slash word',
      'unit/knowledge-promotion': 'free text path or slash word',
      'origin/main': 'free text path or slash word',
      'M/path': 'free text path or slash word',
      'task#nope': 'excluded: placeholder',
      'finding#NAME': 'excluded: placeholder',
      'lane#L': 'excluded: placeholder',
      'lane#L/journal#X': 'excluded: placeholder',
      'lane#<lane>/report#<NAME>': 'excluded: placeholder pattern',
      'backlog/t1': 'excluded: completion receipt prefix',
      'https://example.com/a#b': 'excluded: url',
      '/tmp/x': 'free text path',
      '/usr/bin/env': 'free text path',
      '@laws#process-free': 'excluded: law pointer',
      'task#': 'excluded: prefix mention with no target',
      'lane#': 'excluded: prefix mention with no target',
      '1/2': 'free text path or slash word',
      '#12': 'free text hash word',
    });
  });

  it('[the-record-r-4gj4k] a pointer inside escaped quotes or backslashes is rewritten, its escapes kept', () => {
    expect(readArtifact(migrated, U, 'journal').toString()).toContain(`  WHAT: "the \\"unit#${U}/entry/2026-11-14-r0\\" quoted inside and \\\\unit#${U}/finding/F1\\\\ escaped"\n`);
  });

  it('[the-record-r-4gj4k] the text a REF moved to NOTE stays word for word, its pointer shaped tokens counted as kept inside NOTE', async () => {
    const i = REF_CASES.findIndex(([ref]) => ref.includes('superseded by'));
    const e = (await must(unit(migrated, 'entry', 'show', U, slugOf(i)))).stdout;
    expect(e).toContain('NOTE: (superseded by journal#2026-11-14-r1 and see lanes/l/report.md)');
    const inNote = rows(migrated, out, 'after').filter((r) => r.label === 'journal' && r.field === 'NOTE' && r.token.includes('2026-11-14-r1'));
    expect(inNote.map((r) => [r.token, r.cls, r.disp])).toEqual([['journal#2026-11-14-r1', 'excluded: inside NOTE', 'kept']]);
    expect(rows(migrated, out, 'after').find((r) => r.field === 'NOTE' && r.token === 'lanes/l/report.md')?.cls).toBe('excluded: inside NOTE');
  });

  it('[the-record-r-4gj4k] after the run every REF and REFS value of an item is a full address: the census after counts none left and holds no such REF row but a full address', () => {
    const refRows = rows(migrated, out, 'after').filter((r) => (r.field === 'REF' || r.field === 'REFS') && !r.label.endsWith('/recipe'));
    expect(refRows.length).toBeGreaterThan(0);
    expect([...new Set(refRows.map((r) => `${r.cls} ${r.disp}`))].sort()).toEqual(['address of another owner kept', 'full address kept']);
  });

  it('[the-record-r-4gj4k] the residual scan, independent of the tokenizer, reports every token still holding an old form outside NOTE and CLOSES, tallied by the census after\'s class', () => {
    const m = out.match(/^residual scan: (\d+) tokens holding an old form outside NOTE and CLOSES$/m);
    expect(m).not.toBeNull();
    const tally = out.slice(out.indexOf(m?.[0] ?? '')).split('\n').slice(1).filter((l) => /^ +\d+ {2}\S/.test(l));
    expect(Object.fromEntries(tally.map((l) => [l.replace(/^ +\d+ {2}/, ''), Number(l.trim().split(' ')[0])]))).toEqual({
      'excluded: placeholder': 4,
      'excluded: placeholder pattern': 1,
      'excluded: markdown heading': 1,
      'pointer glued to text': 1,
      'free text path or slash word': 1,
      'excluded: head line': 1,
    });
    expect(Number(m?.[1])).toBe(9);
    expect(out).toMatch(/^token list: \S+\/before\.tsv, \S+\/after\.tsv, and \S+\/residual\.tsv$/m);
  });

  it('[the-record-r-4gj4k] CLOSES lines stay as written, their pointer shaped tokens counted as kept', async () => {
    const e = (await must(unit(migrated, 'entry', 'show', U, '2026-11-14-closer'))).stdout;
    expect(e).toContain('  CLOSES: 2026-11-14-r0 (done: harvested into knowledge#F1 and journal#2026-11-14-r1)\n');
    expect(e).toContain(`  WHAT: "the closer stays: unit#${U}/finding/F1"\n`);
    const closers = rows(migrated, out, 'before').filter((r) => r.field === 'CLOSES');
    expect(closers.map((r) => [r.token, r.cls, r.disp])).toEqual([
      ['knowledge#F1', 'excluded: closer line', 'kept'],
      ['journal#2026-11-14-r1', 'excluded: closer line', 'kept'],
    ]);
  });

  it('[the-record-r-4gj4k] the unit objective is rewritten', async () => {
    const r = await must(unit(migrated, 'load', U));
    expect(r.stdout).toContain('objective: "the migrate unit names store#ideas/rust-driver"');
  });

  it('[the-record-r-4gj4k, the-record-r11] a CLOSED unit is reached by the migration while every ops write to it still refuses ERR_UNIT_CLOSED', async () => {
    const e = JSON.parse((await must(unit(migrated, 'entry', 'list', 'shut-u', '--json'))).stdout);
    const slug = e.entries.find((x: { what: string }) => x.what.startsWith('a closed entry')).slug;
    const entry = JSON.parse((await must(unit(migrated, 'entry', 'show', 'shut-u', slug, '--json'))).stdout).entry;
    expect(entry.what).toBe('a closed entry naming unit#shut-u/entry/2026-11-14-x');
    expect(entry.refs).toEqual(['unit#shut-u/task/t9']);
    const w = await unit(migrated, 'record', 'shut-u', '--what=a write after the migration');
    expect([w.code, w.stderr]).toEqual([1, "entry.record: error: unit 'shut-u' is CLOSED; a closed unit takes no writes (ERR_UNIT_CLOSED)\n"]);
  });

  it('[the-record-r-4gj4k] a second run changes nothing: migrated: 0, the census leaves nothing to rewrite, the storage byte equal', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'migrate', '--all'));
    const before = treeState(join(sb, RECORD_ROOT));
    const again = await must(unit(sb, 'migrate', '--all'));
    expect(again.stdout).toMatch(/^census before: \d+ rewritten, 0 kept|^census before: 0 rewritten, \d+ kept, 0 moved to NOTE/m);
    expect(again.stdout.endsWith('migrated: 0\n')).toBe(true);
    expect(treeState(join(sb, RECORD_ROOT))).toBe(before);
  });

  it('[the-record-r-4gj4k] --dry-run prints the same census and writes nothing: the storage byte equal', async () => {
    const sb = fresh(sb0);
    const before = treeState(join(sb, RECORD_ROOT));
    const dry = await must(unit(sb, 'migrate', '--dry-run', U, 'shut-u'));
    expect(treeState(join(sb, RECORD_ROOT))).toBe(before);
    expect(dry.stdout.endsWith('dry run: 2 would migrate, nothing written\n')).toBe(true);
    const strip = (s: string): string => s.replace(/^token list: .*\n/m, '').replace(/\n(migrated|dry run): .*\n$/, '\n');
    expect(strip(dry.stdout)).toBe(strip(out));
  });

  it('[the-record-r-4gj4k] NOTE is migrate\'s alone: a write verb given --note refuses it as an unknown option', async () => {
    const r = await unit(fresh(sb0), 'record', U, '--what=x', '--note=y');
    expect([r.code, r.stderr]).toEqual([1, "record: error: unknown option '--note=y' (ERR_INVALID_ARGUMENT)\n"]);
  });
});

// the class table's fixed entries, each pinned: a new exclusion is a test change
const EXCLUDED: readonly (readonly [string, string])[] = [
  ['task#nope', 'excluded: placeholder'],
  ['finding#NAME', 'excluded: placeholder'],
  ['lane#L', 'excluded: placeholder'],
  ['lane#L/journal#X', 'excluded: placeholder'],
  ['unit#<unit>/entry/<slug>', 'excluded: placeholder pattern'],
  ['lane#x/report#a*b', 'excluded: placeholder pattern'],
  ['lane#a/.../report', 'excluded: placeholder pattern'],
  ['lane#L/report#X', 'excluded: placeholder pattern'],
  ['lane#L/report#VERDICT', 'excluded: placeholder pattern'],
  ['lane#l/report#VERDICT', 'excluded: placeholder pattern'],
  ['lane#x/recipe', 'excluded: placeholder pattern'],
  ['lane#L/journal#2026-11-14-x', 'excluded: placeholder pattern'],
  ['backlog#', 'excluded: prefix mention with no target'],
  ['IDEAS.md#', 'excluded: prefix mention with no target'],
  ['@laws#process-free', 'excluded: law pointer'],
  ['https://example.com/x#y', 'excluded: url'],
  ['backlog/my-task', 'excluded: completion receipt prefix'],
  ['lane#exec-only', 'excluded: lane# naming no artifact'],
];

describe.concurrent('ctx unit migrate: the class table', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, U, 'the table unit');
      plantArtifact(sb, U, 'journal', EXCLUDED.map(([tok], i) => `@entry 2026-11-14-x${i}\n  WHAT: "the token ${tok} stays"\n  THREAD: none\n`).join('\n'));
    }, 'posix', 'migrate-table');
  });

  it.for(EXCLUDED.map((c, i) => [i, ...c] as const))('[the-record-r-4gj4k] exclusion %i: %s stays, counted as %s', async ([i, tok, cls]) => {
    const sb = fresh(sb0);
    const r = await must(unit(sb, 'migrate', '--dry-run', U));
    const row = rows(sb, r.stdout, 'before').find((x) => x.token === tok);
    expect([row?.cls, row?.disp]).toEqual([cls, 'kept']);
    expect((await must(unit(sb, 'entry', 'show', U, `2026-11-14-x${i}`))).stdout).toContain(`the token ${tok} stays`);
  });
});

describe.concurrent('ctx unit migrate: the corpus doc paths', () => {
  let sb: string;
  let out = '';
  beforeAll(async () => {
    sb = await seed(async (s) => {
      cpSync(join(ROOT, 'plugins/docs-discipline/.contexture'), join(s, '.contexture'), { recursive: true });
      await must(run(s, ['docs', 'new', 'workspace', 'the-record', '--kind=structural', '--description=the record doc', '--sources=base/x', '--keywords=record']));
      await seedUnit(s, U, 'the docs unit');
      plantArtifact(
        s,
        U,
        'journal',
        [
          '@entry 2026-11-14-d1\n  WHAT: "the text keeps docs/workspace/conventions.md:56 and rewrites docs/workspace/the-record.md#the-record-r18"\n  THREAD: none\n  REF: "docs/workspace/the-record.md#the-record-r18"\n',
          '@entry 2026-11-14-d2\n  WHAT: "d2"\n  THREAD: none\n  REF: "docs/workspace/the-record.md"\n',
          '@entry 2026-11-14-d3\n  WHAT: "d3"\n  THREAD: none\n  REF: "docs/workspace/conventions.md:56"\n',
          '@entry 2026-11-14-d4\n  WHAT: "d4"\n  THREAD: none\n  REF: "docs/other/x.md#y"\n',
          '@entry 2026-11-14-d5\n  WHAT: "d5"\n  THREAD: none\n  REF: "docs/workspace/the-record.md: the record doc"\n',
        ].join('\n'),
      );
    }, 'posix', 'migrate-docs');
    out = (await must(unit(sb, 'migrate', U))).stdout;
  });

  it.for([
    ['2026-11-14-d1', 'docs#workspace/the-record/the-record-r18', []],
    ['2026-11-14-d2', 'docs#workspace/the-record/header', []],
    ['2026-11-14-d3', 'docs#workspace/conventions/header', [{ key: 'NOTE', value: 'docs/workspace/conventions.md:56' }]],
    ['2026-11-14-d4', 'file#docs/other/x.md#y', []],
    ['2026-11-14-d5', 'docs#workspace/the-record/header', [{ key: 'NOTE', value: 'docs/workspace/the-record.md: the record doc' }]],
  ] as const)('[the-record-r-4gj4k] %s: a docs/<repo>/ path is a corpus doc only for a repo the docs module lists; its REF reads %s', async ([slug, ref, notes]) => {
    const e = JSON.parse((await must(unit(sb, 'entry', 'show', U, slug, '--json'))).stdout).entry;
    expect(e.refs).toEqual([ref]);
    expect(e.extra_fields).toEqual(notes);
  });

  it('[the-record-r-4gj4k] in free text a corpus doc path is rewritten while its path:line spelling stays prose, counted and named', async () => {
    const e = (await must(unit(sb, 'entry', 'show', U, '2026-11-14-d1'))).stdout;
    expect(e).toContain('the text keeps docs/workspace/conventions.md:56 and rewrites docs#workspace/the-record/the-record-r18"');
    const row = rows(sb, out, 'before').find((r) => r.field === 'WHAT' && r.token === 'docs/workspace/conventions.md:56');
    expect([row?.cls, row?.disp]).toEqual(['corpus doc path:line in text', 'kept']);
  });
});

// the live dry run's three gaps, on the real samples of its token lists: a recipe REFS line
// holding a comma separated list, a pointer into a record storage path, and the .md short
// forms spelled under file# or ./; a storage path takes its unit address only for a unit the
// store holds, in either root, active or closed
const G = 'gap-u';
const HELD_UNITS: readonly (readonly [string, string, string])[] = [
  ['automated-test-learning', FALLBACK_ROOT, 'ACTIVE'],
  ['u2', RECORD_ROOT, 'ACTIVE'],
  ['context-mode-rtk', RECORD_ROOT, 'ACTIVE'],
  ['piri-semantic-reconciliation', RECORD_ROOT, 'ACTIVE'],
  ['piri-workspace-integration', FALLBACK_ROOT, 'CLOSED'],
  ['storage', RECORD_ROOT, 'ACTIVE'],
  ['hook-system', RECORD_ROOT, 'CLOSED'],
];
const UNHELD = 'storage path of a unit this record does not hold';
const GAP_REFS: readonly (readonly [string, string, string])[] = [
  [`${FALLBACK_ROOT}/automated-test-learning/journal.md#2026-09-12-shape-asked`, 'unit#automated-test-learning/entry/2026-09-12-shape-asked', 'record storage artifact'],
  [`${FALLBACK_ROOT}/automated-test-learning/backlog.md#atl-workspace-install`, 'unit#automated-test-learning/task/atl-workspace-install', 'record storage artifact'],
  ['units/u2/journal.md#2026-11-14-e1', 'unit#u2/entry/2026-11-14-e1', 'record storage artifact'],
  [`${FALLBACK_ROOT}/context-mode-rtk/lanes/research-rtk/report.md#token-reduction-mechanics`, 'unit#context-mode-rtk/lane/research-rtk/report/token-reduction-mechanics', 'record storage lane artifact'],
  ['sessions/piri-semantic-reconciliation/lanes/lane-audit-v3/recipe.md', 'unit#piri-semantic-reconciliation/lane/lane-audit-v3/recipe', 'record storage lane artifact'],
  [`${FALLBACK_ROOT}/storage/lanes/fold-1792950098-18/report.md`, 'unit#storage/lane/fold-1792950098-18/report', 'record storage lane artifact'],
  [`${FALLBACK_ROOT}/hook-system/lanes/ground-contract/journal.md`, 'unit#hook-system/lane/ground-contract/journal', 'record storage lane artifact'],
  [`${RECORD_ROOT}/u2/lanes/l9/report.md#VERDICT`, 'unit#u2/lane/l9/report/VERDICT', 'record storage lane artifact'],
  // another workspace's record cited by a storage path: a unit the store does not hold keeps its bytes, under file# in a REF value
  [`${FALLBACK_ROOT}/content-creator-prep/knowledge.md#TRI_LINGUAL_CONTENT_MODEL`, `file#${FALLBACK_ROOT}/content-creator-prep/knowledge.md#TRI_LINGUAL_CONTENT_MODEL`, UNHELD],
  [`${RECORD_ROOT}/story-foundations/lanes/loop-ground/report.md#g3`, `file#${RECORD_ROOT}/story-foundations/lanes/loop-ground/report.md#g3`, UNHELD],
  [`${FALLBACK_ROOT}/docs-system-map/journal.md#2026-09-17-corpus-migration-done`, `file#${FALLBACK_ROOT}/docs-system-map/journal.md#2026-09-17-corpus-migration-done`, UNHELD],
  ['sessions/content-revamp/lanes/x-realizer/recipe.md', 'file#sessions/content-revamp/lanes/x-realizer/recipe.md', UNHELD],
  // a backup, another repository, a checkout's absolute path, a lane's scratch file, and an
  // artifact named with no anchor stay file# of the same path
  ['.contexture/backups/storage-before-fold/journal.md#2026-09-26-event-1790416860', 'file#.contexture/backups/storage-before-fold/journal.md#2026-09-26-event-1790416860', 'repo file#symbol'],
  [`../bilingo-mvp/${FALLBACK_ROOT}/adopt-contexture/journal.md#2026-09-11-assess-findings`, `file#../bilingo-mvp/${FALLBACK_ROOT}/adopt-contexture/journal.md#2026-09-11-assess-findings`, 'parent relative path'],
  [`/srv/other/${FALLBACK_ROOT}/u2/backlog.md#t1`, `file#/srv/other/${FALLBACK_ROOT}/u2/backlog.md#t1`, 'absolute path'],
  [`${FALLBACK_ROOT}/context-mode-rtk/lanes/native-replication/compact-filter.awk`, `file#${FALLBACK_ROOT}/context-mode-rtk/lanes/native-replication/compact-filter.awk`, 'repo file path'],
  [`${FALLBACK_ROOT}/u2/knowledge.md`, `file#${FALLBACK_ROOT}/u2/knowledge.md`, 'repo file path'],
  // the .md short forms win over a root file rule, under file# or ./ too; a file# root name with no anchor stays
  ['file#backlog.md#command-interface-ergonomics', `unit#${G}/task/command-interface-ergonomics`, 'the .md short forms'],
  ['./backlog.md#storage-posix-driver', `unit#${G}/task/storage-posix-driver`, 'the .md short forms'],
  ['file#backlog.md', 'file#backlog.md', 'full address'],
];
const gapSlug = (i: number): string => `2026-11-15-g${i}`;

const GAP_RECIPE = [
  '@recipe l3',
  `  UNIT: ${G}`,
  '  LANE: l3',
  '',
  'GOAL ::',
  `  the goal cites ${FALLBACK_ROOT}/automated-test-learning/backlog.md#atl-workspace-install and sessions/piri-workspace-integration/lanes/kb-survey/recipe.md;`,
  `  .contexture/backups/storage-before-fold/journal.md#2026-09-26-event-1790416860, ../bilingo-mvp/${FALLBACK_ROOT}/adopt-contexture/journal.md#2026-09-11-assess-findings, and /srv/other/${FALLBACK_ROOT}/u2/backlog.md#t1 stay`,
  '',
  'REFS ::',
  '  backlog#internals-leak-audit, backlog#refusal-warning-order (the specifications)',
  '  lanes/gather-leak-audit/report (the recon), lanes/ground-leak-audit/report (the grounding at f76f193: its scan instruments sit in M/.contexture/tmp/ground-leak-audit, its GAPS G1 to G10 the decisions)',
  "  journal#2026-11-07-event-1794038937, journal#2026-11-07-event-1794039045 (the human's verdicts)",
  '  lanes/exec-dispatch-guide/report, lanes/exec-rhythm/report, lanes/exec-compose/report (the surfaces the earlier tasks built)',
  '  knowledge#ORCHESTRATOR_DELEGATES_SEARCH, knowledge#DRAWER_PATH_OWNERS, knowledge#WRITE_PATH_ONE_CALL',
  '  tests/README.md (How to maintain; the golden command, now sh base/.contexture/ctx compose), AGENTS.workspace.md (@laws installs, test-scope, docs-sync, workspace-tmp; @git plugin versions)',
  '  tests/support/timing.ts, tests/support/locks.ts (the shared helpers)',
  '  unit#test-suite-future/lane/tsf-runner-workflow/report, the earlier runner, and journal#2026-11-06-docs-plugins-seed',
  '',
  'GROUND_AND_REFS',
  '  SOURCE_OF_TRUTH: file#backlog.md#command-interface-ergonomics',
  '  REFS: [knowledge.md#COMMAND_INTERFACE_ERGONOMICS, file#backlog.md, file#tests/session-tests.sh]',
  '',
].join('\n');
const GAP_RECIPE_AFTER = [
  '@recipe l3',
  `  UNIT: ${G}`,
  '  LANE: l3',
  '',
  'GOAL ::',
  '  the goal cites unit#automated-test-learning/task/atl-workspace-install and unit#piri-workspace-integration/lane/kb-survey/recipe;',
  `  .contexture/backups/storage-before-fold/journal.md#2026-09-26-event-1790416860, ../bilingo-mvp/${FALLBACK_ROOT}/adopt-contexture/journal.md#2026-09-11-assess-findings, and /srv/other/${FALLBACK_ROOT}/u2/backlog.md#t1 stay`,
  '',
  'REFS ::',
  `  unit#${G}/task/internals-leak-audit, unit#${G}/task/refusal-warning-order (the specifications)`,
  `  unit#${G}/lane/gather-leak-audit/report (the recon), unit#${G}/lane/ground-leak-audit/report (the grounding at f76f193: its scan instruments sit in M/.contexture/tmp/ground-leak-audit, its GAPS G1 to G10 the decisions)`,
  `  unit#${G}/entry/2026-11-07-event-1794038937, unit#${G}/entry/2026-11-07-event-1794039045 (the human's verdicts)`,
  `  unit#${G}/lane/exec-dispatch-guide/report, unit#${G}/lane/exec-rhythm/report, unit#${G}/lane/exec-compose/report (the surfaces the earlier tasks built)`,
  `  unit#${G}/finding/ORCHESTRATOR_DELEGATES_SEARCH, unit#${G}/finding/DRAWER_PATH_OWNERS, unit#${G}/finding/WRITE_PATH_ONE_CALL`,
  '  file#tests/README.md (How to maintain; the golden command, now sh base/.contexture/ctx compose), file#./AGENTS.workspace.md (@laws installs, test-scope, docs-sync, workspace-tmp; @git plugin versions)',
  '  file#tests/support/timing.ts, file#tests/support/locks.ts (the shared helpers)',
  `  unit#test-suite-future/lane/tsf-runner-workflow/report, the earlier runner, and unit#${G}/entry/2026-11-06-docs-plugins-seed`,
  '',
  'GROUND_AND_REFS',
  `  SOURCE_OF_TRUTH: unit#${G}/task/command-interface-ergonomics`,
  `  REFS: [unit#${G}/finding/COMMAND_INTERFACE_ERGONOMICS, file#backlog.md, file#tests/session-tests.sh]`,
  '',
].join('\n');

// the real storage paths another workspace's record left in a lane report: kept as prose;
// a held unit's paths rewrite; a heading's storage lane paths are leftovers the residual lists
const GAP_REPORT = [
  '@report l3',
  'FINDINGS ::',
  `  the bilingo record cites ${FALLBACK_ROOT}/story-foundations/lanes/loop-ground/report.md#g3 and ${RECORD_ROOT}/story-foundations/lanes/loop-ground/report.md#g3,`,
  `  ${FALLBACK_ROOT}/content-revamp/backlog.md#learning-loop (${RECORD_ROOT}/content-revamp/backlog.md#learning-loop), ${FALLBACK_ROOT}/story-foundations/knowledge.md#SCENE_EQUATION;`,
  `  ${FALLBACK_ROOT}/content-creator-prep/knowledge.md#TRI_LINGUAL_CONTENT_MODEL and ${FALLBACK_ROOT}/content-creator-prep/knowledge.md#CREATOR_AUTONOMY_AND_GATE stay`,
  `  while ${FALLBACK_ROOT}/hook-system/knowledge.md#HOOKS and sessions/u2/lanes/l9/report.md#VERDICT rewrite`,
  `# a heading keeps sessions/u2/lanes/l9/report.md and ${RECORD_ROOT}/u2/lanes/l9/recipe.md#GOAL`,
  '',
].join('\n');
const GAP_REPORT_AFTER = GAP_REPORT.replace(`${FALLBACK_ROOT}/hook-system/knowledge.md#HOOKS`, 'unit#hook-system/finding/HOOKS')
  .replace('sessions/u2/lanes/l9/report.md#VERDICT rewrite', 'unit#u2/lane/l9/report/VERDICT rewrite');
const UNHELD_TEXT = [
  `${FALLBACK_ROOT}/story-foundations/lanes/loop-ground/report.md#g3`,
  `${RECORD_ROOT}/story-foundations/lanes/loop-ground/report.md#g3`,
  `${FALLBACK_ROOT}/content-revamp/backlog.md#learning-loop`,
  `${RECORD_ROOT}/content-revamp/backlog.md#learning-loop`,
  `${FALLBACK_ROOT}/story-foundations/knowledge.md#SCENE_EQUATION`,
  `${FALLBACK_ROOT}/content-creator-prep/knowledge.md#TRI_LINGUAL_CONTENT_MODEL`,
  `${FALLBACK_ROOT}/content-creator-prep/knowledge.md#CREATOR_AUTONOMY_AND_GATE`,
];

function residual(sb: string, stdout: string): { label: string; token: string }[] {
  const m = stdout.match(/^token list: (\S+)\/before\.tsv(?:,| and) /m);
  expect(m).not.toBeNull();
  return readFileSync(join(sb, m?.[1] ?? '', 'residual.tsv'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      const [, label = '', , token = ''] = l.split('\t');
      return { label, token };
    });
}

const plantState = (sb: string, slug: string, root: string, status: string): void => {
  mkdirSync(join(sb, root, slug), { recursive: true });
  writeFileSync(join(sb, root, slug, 'state.md'), `status: ${status}\ncurrent_anchor: A1\nobjective: "${slug} objective"\nrepos: []\n`);
};

describe.concurrent('ctx unit migrate: the live dry run gaps', () => {
  let sb0: string;
  let migrated: string;
  let out = '';
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, G, 'the gap unit');
      for (const [slug, root, status] of HELD_UNITS) plantState(sb, slug, root, status);
      plantArtifact(sb, G, 'journal', GAP_REFS.map(([ref], i) => `@entry ${gapSlug(i)}\n  ANCHOR: A1\n  WHAT: "gap ${i}"\n  THREAD: none\n  REF: "${ref}"\n`).join('\n'));
      plantArtifact(sb, G, 'lanes/l3/recipe', GAP_RECIPE);
      plantArtifact(sb, G, 'lanes/l3/report', GAP_REPORT);
    }, 'posix', 'migrate-gaps');
    migrated = fresh(sb0);
    out = (await must(unit(migrated, 'migrate', G))).stdout;
  });

  it.for(GAP_REFS.map((c, i) => [i, ...c] as const))('[the-record-r-4gj4k] gap REF %i: %s becomes %s', async ([i, ref, next, cls]) => {
    const e = JSON.parse((await must(unit(migrated, 'entry', 'show', G, gapSlug(i), '--json'))).stdout).entry;
    expect(e.refs).toEqual([next]);
    expect(e.extra_fields).toEqual([]);
    const r = rows(migrated, out, 'before').find((x) => x.label === 'journal' && x.field === 'REF' && x.token === ref);
    expect([r?.cls, r?.disp]).toEqual([cls, next === ref ? 'kept' : 'rewritten']);
  });

  it('[the-record-r-4gj4k] a recipe REFS line holding a comma separated list rewrites each pointer in place, the separators and annotations kept; a record storage path in free text takes its unit address while a backup, another repository, or an absolute path stays; file#backlog.md#x takes the task address', () => {
    expect(readArtifact(migrated, G, 'lane/l3/recipe').toString()).toBe(GAP_RECIPE_AFTER);
  });

  it('[the-record-r-4gj4k] each comma separated item of a recipe REFS line is counted by its own token, the comma never glued to it', () => {
    const refs = rows(migrated, out, 'before').filter((r) => r.label === 'lane/l3/recipe' && r.field === 'REFS');
    expect(refs.filter((r) => /[,;]$/.test(r.token))).toEqual([]);
    const byToken = Object.fromEntries(refs.map((r) => [r.token, [r.cls, r.disp]]));
    expect(byToken['backlog#internals-leak-audit']).toEqual(['short backlog#', 'rewritten']);
    expect(byToken['lanes/exec-dispatch-guide/report']).toEqual(['legacy lanes/', 'rewritten']);
    expect(byToken['tests/support/timing.ts']).toEqual(['repo file path', 'rewritten']);
    expect(byToken['AGENTS.workspace.md']).toEqual(['root file name', 'rewritten']);
    expect(byToken['unit#test-suite-future/lane/tsf-runner-workflow/report']).toEqual(['full address', 'kept']);
    expect(byToken.the).toBeUndefined();
  });

  it('[the-record-r-4gj4k] a storage path naming a unit the store does not hold stays as written in free text, counted under its own class, while a held unit\'s path, in either root, active or closed, takes its unit address', () => {
    expect(readArtifact(migrated, G, 'lane/l3/report').toString()).toBe(GAP_REPORT_AFTER);
    const text = rows(migrated, out, 'before').filter((r) => r.label === 'lane/l3/report' && r.field === 'report text');
    const byToken = Object.fromEntries(text.map((r) => [r.token, [r.cls, r.disp, r.next]]));
    for (const tok of UNHELD_TEXT) expect(byToken[tok], tok).toEqual([UNHELD, 'kept', tok]);
    expect(byToken[`${FALLBACK_ROOT}/hook-system/knowledge.md#HOOKS`]).toEqual(['record storage artifact', 'rewritten', 'unit#hook-system/finding/HOOKS']);
    expect(byToken['sessions/u2/lanes/l9/report.md#VERDICT']).toEqual(['record storage lane artifact', 'rewritten', 'unit#u2/lane/l9/report/VERDICT']);
  });

  it('[the-record-r-4gj4k] the residual scan lists a storage path to a lane artifact after a path character, bare or under the root, with or without its anchor, tallied by its census class', () => {
    const left = residual(migrated, out).filter((r) => r.label === 'lane/l3/report').map((r) => r.token);
    expect(left).toEqual(expect.arrayContaining([
      'sessions/u2/lanes/l9/report.md',
      `${RECORD_ROOT}/u2/lanes/l9/recipe.md#GOAL`,
      `${FALLBACK_ROOT}/story-foundations/lanes/loop-ground/report.md#g3`,
      `${RECORD_ROOT}/story-foundations/lanes/loop-ground/report.md#g3`,
    ]));
    const m = out.match(/^residual scan: (\d+) tokens holding an old form outside NOTE and CLOSES$/m);
    const tally = out.slice(out.indexOf(m?.[0] ?? '')).split('\n').slice(1).filter((l) => /^ +\d+ {2}\S/.test(l));
    expect(tally.some((l) => l.endsWith(`  ${UNHELD}`))).toBe(true);
    expect(tally.some((l) => l.endsWith('  excluded: markdown heading'))).toBe(true);
  });

  it('[the-record-r-4gj4k] --all hands the engine the same held set', async () => {
    const sb = fresh(sb0);
    const r = await must(unit(sb, 'migrate', '--dry-run', '--all'));
    const refs = rows(sb, r.stdout, 'before');
    const cls = (tok: string): string | undefined => refs.find((x) => x.unit === G && x.field === 'REF' && x.token === tok)?.cls;
    expect(cls(`${FALLBACK_ROOT}/docs-system-map/journal.md#2026-09-17-corpus-migration-done`)).toBe(UNHELD);
    expect(cls(`${FALLBACK_ROOT}/automated-test-learning/journal.md#2026-09-12-shape-asked`)).toBe('record storage artifact');
    expect(cls(`${FALLBACK_ROOT}/hook-system/lanes/ground-contract/journal.md`)).toBe('record storage lane artifact');
  });

  it('[the-record-r-4gj4k] the residual scan finds no token outside the census and no held unit\'s storage path left; a second run changes nothing', async () => {
    const m = out.match(/^residual scan: (\d+) tokens holding an old form outside NOTE and CLOSES$/m);
    expect(m).not.toBeNull();
    const tally = out.slice(out.indexOf(m?.[0] ?? '')).split('\n').slice(1).filter((l) => /^ +\d+ {2}\S/.test(l));
    expect(tally.filter((l) => l.includes('not in the census'))).toEqual([]);
    const after = rows(migrated, out, 'after');
    const storage = /^(file#)?(\.contexture\/)?(sessions|units)\/([^/]+)\/((journal|backlog|knowledge)\.md#|lanes\/[^/]+\/(recipe|journal|report))/;
    const left = after.filter((r) => storage.test(r.token) && r.cls !== 'excluded: markdown heading');
    expect(left.length).toBeGreaterThan(0);
    expect(left.filter((r) => HELD_UNITS.some(([slug]) => storage.exec(r.token)?.[4] === slug))).toEqual([]);
    expect(after.filter((r) => /^(file#)?(\.\/)?(journal|backlog|knowledge)\.md#/.test(r.token))).toEqual([]);
    const sb = fresh(sb0);
    await must(unit(sb, 'migrate', G));
    const before = treeState(join(sb, RECORD_ROOT));
    const again = await must(unit(sb, 'migrate', G));
    expect(again.stdout.endsWith('migrated: 0\n')).toBe(true);
    expect(treeState(join(sb, RECORD_ROOT))).toBe(before);
  });
});

describe.concurrent('ctx unit migrate: column 0 head lines', () => {
  const A = 'anc-u';
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, A, 'the anchor unit names journal#2026-11-14-a1 and IDEAS.md#rust-driver');
    }, 'posix', 'migrate-head');
  });

  it('[the-record-r-4gj4k] the bootstrap anchor copies the objective: its pointer tokens are counted as excluded: head line and never rewritten, the objective is, and the residual scan tallies them under that class', async () => {
    const sb = fresh(sb0);
    const anchor = (): string | undefined => readArtifact(sb, A, 'journal').toString().split('\n').find((l) => l.startsWith('@anchor '));
    const head = anchor();
    expect(head).toContain('journal#2026-11-14-a1');
    const r = await must(unit(sb, 'migrate', A));
    const heads = rows(sb, r.stdout, 'before').filter((x) => x.label === 'journal' && x.field === 'head line' && x.token.includes('#'));
    expect(heads.map((x) => [x.token, x.cls, x.disp])).toEqual([
      ['journal#2026-11-14-a1', 'excluded: head line', 'kept'],
      ['IDEAS.md#rust-driver', 'excluded: head line', 'kept'],
    ]);
    expect(anchor()).toBe(head);
    expect(readArtifact(sb, A, 'state').toString()).toContain(`the anchor unit names unit#${A}/entry/2026-11-14-a1 and store#ideas/rust-driver`);
    expect(r.stdout).toMatch(/^residual scan: 2 tokens holding an old form outside NOTE and CLOSES\n {8}2 {2}excluded: head line\n/m);
  });
});
