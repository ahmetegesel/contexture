import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, FTS5_DB, lockPath, RECORD_ROOT, unitLock } from '../support/drawer';
import { launch } from '../support/exec';
import { artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { createLane, LANE_BRIEF, lane, laneFlags, must, plantRhythms, run, seedUnit, unit } from '../support/unit';
import { SHAPES } from './inputs';

const D = '2026-09-27';
const FIDELITY = '# fidelity\n\nA1 :: printf \'@task x\\n  STATUS: TODO\\n\' | ctx x\ncols\tsplit by a tab\n"a", "b" quote-comma\nends in a backslash \\\nlast line\n';
const written = (u: string, l: string, body: string): string => `lane report written: ${l} in ${u} (${Buffer.byteLength(body)} bytes)\n`;
const report = (sb: string, u: string, l: string, input: string) => run(sb, ['lane', 'report', u, l], { input });
const recipeOf = async (sb: string, l: string): Promise<string> => (await must(lane(sb, 'show', 'sem-unit', l, 'recipe'))).stdout;

const S_TMP = 'never use /tmp or any path outside the workspace';
const S_PROMPT = 'a harness permission prompt for a path outside the workspace is the signal to stop and report, never an ask to reach';
const bounded = (text: string): boolean => text.includes(S_TMP) && text.includes(S_PROMPT);
const esc = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const lockSegments = lockPath('/', unitLock('u')).split('/').filter(Boolean);
const LEAK = new RegExp([RECORD_ROOT, FALLBACK_ROOT, FTS5_DB.split('/').pop() ?? '', lockSegments.slice(1, 3).join('/'), lockSegments.slice(2, 4).join('/')].map(esc).concat(['lanes\\/[^ ]*\\/(recipe|journal|report)', '(state|backlog|journal|knowledge|recipe|report)\\.md', 'AGENTS\\.generated\\.md', 'ctx docs']).join('|'));
const PURPOSE = {
  goal: '--goal (the deliverable or decision the lane feeds, and where it stops)',
  branch: '--branch (the checkout or worktree and its branch, at a commit)',
  writes: '--writes (read only, or the roots it edits and how it commits)',
  scope: '--scope (a step or question with its exit condition)',
  report: '--report (a section the report owes: its name and what it carries)',
};
const missing = (...flags: (keyof typeof PURPOSE)[]): string => `lane create: error: missing ${flags.map((f) => PURPOSE[f]).join(', ')}; the brief comes only as flags, stdin is never read: ctx lane help create (ERR_INVALID_ARGUMENT)\n`;
const refusal = (message: string): string => `lane create: error: ${message} (ERR_INVALID_ARGUMENT)\n`;

const prompt = (u: string, l: string): string[] => [
  `You are a dispatched subagent working lane ${l} of unit ${u}. Your full brief is the lane recipe: read it first and follow it exactly: .contexture/ctx lane show ${u} ${l} recipe`,
  `Hard rules: never use /tmp or any path outside the workspace; scratch only under .contexture/tmp/${l}/; a harness permission prompt for a path outside the workspace is the signal to stop and report, never an ask to reach. Every shell command runs through .contexture/ctx run. The record only through ctx: your record writes are your lane journal and your report, plus only what the recipe's write scope adds.`,
  'Return a short summary only; the report carries the substance.',
];

const FULL = [
  '--goal=map the probe callers for the probe task; stop at the report',
  '--branch', 'the sandbox checkout on its current branch, at its seed',
  '--writes=read only',
  '--scope=list every probe caller; done when each names its file and symbol',
  '--scope', 'mark the callers the task touches',
  '--report=CALLERS: each caller with its file and symbol',
  '--report=OPEN: anything the lane could not settle',
  `--ref=journal#${D}-x-e1`,
  '--ref=lane#x-lane/report',
  '--ref', 'lanes/x-lane/report',
  '--task=backlog#probe-task',
  `--decision=journal#${D}-x-d1`,
  `--decision=journal#${D}-x-d2`,
  '--rhythm=probe 1 OPEN',
  '--fact=the probe module is base',
  '--fact=no install of any kind',
  '--substrate=the sandbox holds the shipped base alone',
];
const FULL_RECIPE = [
  '@recipe full-lane',
  '  UNIT: sem-unit',
  '  LANE: full-lane',
  '  BRANCH: the sandbox checkout on its current branch, at its seed',
  '  RHYTHM: probe 1 OPEN',
  '  TASKS: backlog#probe-task',
  `  DECISIONS: journal#${D}-x-d1, journal#${D}-x-d2`,
  '',
  'GOAL ::',
  '  map the probe callers for the probe task; stop at the report',
  '',
  'REFS ::',
  `  journal#${D}-x-e1`,
  '  lane#x-lane/report',
  '  lanes/x-lane/report',
  '',
  'SCOPE ::',
  '  1. list every probe caller; done when each names its file and symbol',
  '  2. mark the callers the task touches',
  '',
  'FACTS ::',
  '  the probe module is base',
  '  no install of any kind',
  '',
  'SUBSTRATE ::',
  '  the sandbox holds the shipped base alone',
  '',
  'BOUNDARY (hard rules) ::',
  '  1. never use /tmp or any path outside the workspace; scratch only under .contexture/tmp/full-lane/; a harness permission prompt for a path outside the workspace is the signal to stop and report, never an ask to reach',
  '  2. every shell command runs through the runner: .contexture/ctx run <cmd>, or piped through it',
  '  3. the record only through ctx: your record writes are your lane journal (ctx lane record sem-unit full-lane) and your report (ctx lane report sem-unit full-lane), plus only what the write scope adds',
  '  4. write scope: read only',
  '  5. a decision within this recipe is yours: decide it and journal it; a wall or a decision beyond it is drift: stop and report, never improvise past it',
  '',
  'BOOT (read only, before any work) ::',
  "  the loader's law layer and both overlays (AGENTS.md, AGENTS.workspace.md, AGENTS.local.md); ctx unit load sem-unit until a page reads complete; this recipe (ctx lane show sem-unit full-lane recipe); every REF it names. Your first lane journal entry is the load receipt: the refs loaded, one per line; an unresolved REF is a brief defect: stop and report it.",
  '',
  'JOURNAL ::',
  '  ctx lane record sem-unit full-lane at action granularity as things happen: every command whose result is not obvious, every claim, decision point, and drift notice; each WHAT carries the action, its result, and why the next step follows; an entry awaiting an act outside the lane carries --thread.',
  '',
  'REPORT (ctx lane report sem-unit full-lane, the body on stdin; self-sufficient: the dispatcher reads only the report) ::',
  '  @report full-lane',
  '  VERDICT: done, partial, or drifted, with one line why',
  '  CALLERS: each caller with its file and symbol',
  '  OPEN: anything the lane could not settle',
  '  The report and the journal land no matter the outcome; return a short summary only.',
  '',
].join('\n');

describe.concurrent('ctx lane: create, record, report, show', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      plantRhythms(sb);
      await seedUnit(sb, 'sem-unit', 'semantic interface test');
      await must(createLane(sb, 'sem-unit', 'sub-lane', ['--goal=lane test subagent']));
      await seedUnit(sb, 'x-unit', 'defect regression unit');
      await must(createLane(sb, 'x-unit', 'x-lane'));
      await must(lane(sb, 'record', 'x-unit', 'x-lane', '--what=First lane event', `--slug=${D}-x-l1`));
    }, 'posix', 'lane');
  });

  it('E-14 [the-record-r11, the-record-r15]: lane create composes the recipe from its brief flags; an existing lane refuses rc 1 ERR_ENTITY_EXISTS with its recipe unchanged', async () => {
    const sb = fresh(sb0);
    expect((await createLane(sb, 'sem-unit', 'new-lane')).code).toBe(0);
    const before = await recipeOf(sb, 'sub-lane');
    expect(before).toContain('\nGOAL ::\n  lane test subagent\n');
    const again = await createLane(sb, 'sem-unit', 'sub-lane', ['--goal=again']);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('ERR_ENTITY_EXISTS');
    expect(await recipeOf(sb, 'sub-lane')).toBe(before);
  });

  it('[the-record-r15, the-record-r18]: a full flag set stores the composed recipe, both flag forms alike, the planted rhythm on its RHYTHM line', async () => {
    const sb = fresh(sb0);
    await must(run(sb, ['lane', 'create', 'sem-unit', 'full-lane', ...FULL]));
    expect(await recipeOf(sb, 'full-lane')).toBe(FULL_RECIPE);
  });

  it('[the-record-r15]: a minimal flag set prints the blocks in order, every optional line and block absent', async () => {
    const sb = fresh(sb0);
    await must(createLane(sb, 'sem-unit', 'min-lane'));
    const recipe = await recipeOf(sb, 'min-lane');
    expect(recipe.split('\n').filter((l) => /^\S/.test(l))).toEqual(['@recipe min-lane', 'GOAL ::', 'SCOPE ::', 'BOUNDARY (hard rules) ::', 'BOOT (read only, before any work) ::', 'JOURNAL ::', 'REPORT (ctx lane report sem-unit min-lane, the body on stdin; self-sufficient: the dispatcher reads only the report) ::']);
    expect(recipe.split('\n').slice(0, 5)).toEqual(['@recipe min-lane', '  UNIT: sem-unit', '  LANE: min-lane', `  BRANCH: ${LANE_BRIEF.branch}`, '']);
    expect(recipe).toContain(`\nSCOPE ::\n  1. ${LANE_BRIEF.scope}\n\nBOUNDARY`);
    expect(recipe).toContain(`  4. write scope: ${LANE_BRIEF.writes}\n`);
    expect(recipe).toContain(`  VERDICT: done, partial, or drifted, with one line why\n  ${LANE_BRIEF.report}\n  The report and the journal land`);
  });

  it('[the-record-r15]: the recipe carries the boundary sentence, null checked, and for flags naming none no storage location, a planted --fact read by the same assertion', async () => {
    const sb = fresh(sb0);
    const created = await must(createLane(sb, 'sem-unit', 'clean-lane', ['--ref=lane#x-lane/report', '--fact=a plain fact']));
    const recipe = await recipeOf(sb, 'clean-lane');
    expect(bounded(recipe)).toBe(true);
    expect(bounded(recipe.split('\n').filter((l) => !l.includes(S_TMP)).join('\n'))).toBe(false);
    expect(recipe).not.toMatch(LEAK);
    expect(created.stdout).not.toMatch(LEAK);
    await must(createLane(sb, 'sem-unit', 'leak-lane', [`--fact=the record sits in ${RECORD_ROOT}/x`]));
    expect(await recipeOf(sb, 'leak-lane')).toMatch(LEAK);
  });

  it('[the-record-r15]: a value holding %s, a backslash, and a double quote reads back verbatim', async () => {
    const sb = fresh(sb0);
    const odd = 'a %s format, a \\ backslash, a "double quote", and a \\n kept literal';
    await must(createLane(sb, 'sem-unit', 'odd-lane', [`--goal=${odd}`, `--fact=${odd}`, `--report=${odd}`]));
    const recipe = await recipeOf(sb, 'odd-lane');
    expect(recipe).toContain(`\nGOAL ::\n  ${odd}\n`);
    expect(recipe).toContain(`\nFACTS ::\n  ${odd}\n`);
    expect(recipe).toContain(`with one line why\n  ${odd}\n`);
  });

  it('[the-record-r15]: a create prints the lane line and the dispatch prompt alone, rc 0 with an empty stderr; the stored recipe holds no prompt line', async () => {
    const sb = fresh(sb0);
    const r = await createLane(sb, 'sem-unit', 'p-lane');
    const lines = prompt('sem-unit', 'p-lane');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, ['lane created: p-lane in sem-unit', '', "dispatch prompt (the subagent's launch message; never stored):", ...lines, ''].join('\n'), '']);
    expect(bounded(lines.join('\n'))).toBe(true);
    const recipe = await recipeOf(sb, 'p-lane');
    for (const line of [...lines, 'dispatch prompt']) expect(recipe).not.toContain(line);
  });

  it.for([
    ['with no flag and a recipe on stdin', ['sem-unit', 'r-lane'], missing('goal', 'branch', 'writes', 'scope', 'report')],
    ['missing two flags', ['sem-unit', 'r-lane', '--goal=g', '--branch=b', '--writes=w'], missing('scope', 'report')],
    ['with an empty value', ['sem-unit', 'r-lane', ...laneFlags(['--goal='])], missing('goal')],
    ['given a single flag twice', ['sem-unit', 'r-lane', ...laneFlags(), '--writes=again'], refusal('--writes given twice; it takes one value')],
    ['ending in a flag with no value', ['sem-unit', 'r-lane', ...laneFlags(), '--fact'], refusal('--fact needs a value')],
    ['with an unknown flag', ['sem-unit', 'r-lane', ...laneFlags(), '--bogus=1'], refusal("unknown option '--bogus=1'")],
    ['with an extra argument', ['sem-unit', 'r-lane', 'extra', ...laneFlags()], refusal("unexpected argument 'extra'")],
    ['with a malformed unit', ['bad.unit', 'r-lane', ...laneFlags()], refusal("malformed unit 'bad.unit'")],
    ['with a malformed lane', ['sem-unit', 'bad.lane', ...laneFlags()], refusal("malformed lane 'bad.lane'")],
    ['with a malformed ref', ['sem-unit', 'r-lane', ...laneFlags(['--ref=lanes/'])], `lane create: error: malformed ref 'lanes/': ${SHAPES}\n`],
    ['with a malformed task', ['sem-unit', 'r-lane', ...laneFlags(['--task=probe-task'])], refusal("malformed task 'probe-task': a task is backlog#<slug>")],
    ['with a malformed decision', ['sem-unit', 'r-lane', ...laneFlags(['--decision=journal#bad slug'])], refusal("malformed decision 'journal#bad slug': a decision is journal#<slug>")],
    ['with a malformed rhythm', ['sem-unit', 'r-lane', ...laneFlags(['--rhythm=probe one OPEN'])], 'ERROR: RHYTHM step malformed: one\n'],
    ['with a rhythm gate its step does not read, as ctx unit record refuses it', ['sem-unit', 'r-lane', ...laneFlags(['--rhythm=probe 1 WRONG'])], 'ERROR: RHYTHM step 1 of probe reads OPEN, not WRONG\n'],
  ] as const)('[the-record-r9, the-record-r-xbt3g]: lane create %s refuses rc 1 with its one stderr line, nothing written', async ([, argv, line]) => {
    const sb = fresh(sb0);
    const r = await run(sb, ['lane', 'create', ...argv], { input: '# a recipe on stdin\nMISSION\n  GOAL: "never read"\n' });
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', line]);
    const shown = await lane(sb, 'show', 'sem-unit', 'r-lane', 'recipe');
    expect(shown.code).toBe(1);
    expect(shown.stderr).toContain('ERR_ENTITY_NOT_FOUND');
  });

  it.for([
    ['a carriage return', '--goal=a carriage\rreturn', refusal('--goal holds a carriage return; the dialect is LF')],
    ['a newline', '--scope=first line\nsecond line', refusal('--scope holds a newline; each value is one line')],
  ] as const)('UP-c [the-record-r12, the-record-r-xbt3g]: a lane create flag value holding %s refuses rc 1 naming the flag, nothing written', async ([, flag, line]) => {
    const sb = fresh(sb0);
    const r = await run(sb, ['lane', 'create', 'sem-unit', 'up-cr', ...laneFlags([flag])]);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', line]);
    expect((await lane(sb, 'show', 'sem-unit', 'up-cr', 'recipe')).code).toBe(1);
  });

  it('[the-record-r15, the-record-r17]: lane create never reads stdin: a full flag set returns rc 0 under a stdin held open, and beside a recipe on stdin it stores the composed recipe', async () => {
    const sb = fresh(sb0);
    const held = launch('./.contexture/ctx', ['lane', 'create', 'sem-unit', 'held-lane', ...laneFlags()], { cwd: sb, input: null });
    const done = await Promise.race([held.result, new Promise<null>((r) => setTimeout(() => r(null), 20_000))]);
    held.child.stdin?.end();
    expect(done?.code).toBe(0);
    await must(run(sb, ['lane', 'create', 'sem-unit', 'beside-lane', ...laneFlags()], { input: '# a stdin recipe\nMISSION\n  GOAL: "never stored"\n' }));
    const recipe = await recipeOf(sb, 'beside-lane');
    expect(recipe.startsWith('@recipe beside-lane\n')).toBe(true);
    expect(recipe).not.toContain('a stdin recipe');
  });

  it('[the-engine-r4, the-engine-r7]: ctx lane help create and ctx lane create --help, -h, and help, alone or after the unit and lane, print the same table rc 0', async () => {
    const sb = fresh(sb0);
    const table = await lane(sb, 'help', 'create');
    expect(table.code).toBe(0);
    for (const args of [['--help'], ['-h'], ['help'], ['sem-unit', 'h-lane', '--help'], ['sem-unit', 'h-lane', '-h'], ['sem-unit', 'h-lane', 'help']]) {
      const r = await lane(sb, 'create', ...args);
      expect([r.code, r.stdout, r.stderr]).toEqual([0, table.stdout, '']);
    }
    expect(table.stdout).toMatch(/^ctx lane create: create a subagent lane from its brief parameters$/m);
    expect(table.stdout).toMatch(/^ {2}ctx lane create <unit> <lane-slug> --goal="\.\.\." --branch="\.\.\." --writes="\.\.\." --scope="\.\.\."\.\.\. --report="\.\.\."\.\.\. \[--ref=/m);
    for (const flag of ['goal', 'branch', 'writes', 'scope', 'report']) expect(table.stdout).toMatch(new RegExp(`^ {2}--${flag}="\\.\\.\\." +required`, 'm'));
    for (const flag of ['ref', 'task', 'decision', 'rhythm', 'fact', 'substrate']) expect(table.stdout).toMatch(new RegExp(`^ {2}--${flag}=`, 'm'));
    expect(table.stdout).toContain('stdin is never read');
    expect(table.stdout).toContain(prompt('<unit>', '<lane>')[0]);
    expect(table.stdout).not.toMatch(LEAK);
    expect(table.stdout).not.toMatch(/rhythms\/|< \S/);
    expect((await lane(sb, 'show', 'sem-unit', 'h-lane', 'recipe')).code).toBe(1);
  });

  it('E-14 [the-record-r15]: lane record lands in the lane journal and never in the unit journal', async () => {
    const sb = fresh(sb0);
    expect((await lane(sb, 'record', 'sem-unit', 'sub-lane', '--what=lane event 1')).code).toBe(0);
    expect((await lane(sb, 'show', 'sem-unit', 'sub-lane', 'journal')).stdout).toContain('lane event 1');
    expect((await unit(sb, 'entry', 'list', 'sem-unit')).stdout).not.toContain('lane event 1');
  });

  it('E-14 [the-record-r16, the-record-r17]: a --body report reads back; a stdin report reads back byte for byte through report and show, the write printing one line with its size', async () => {
    const sb = fresh(sb0);
    expect((await lane(sb, 'report', 'sem-unit', 'sub-lane', '--body=lane report summary')).code).toBe(0);
    expect((await lane(sb, 'show', 'sem-unit', 'sub-lane', 'report')).stdout).toContain('lane report summary');
    const write = await report(sb, 'sem-unit', 'sub-lane', FIDELITY);
    expect(write.code).toBe(0);
    expect(write.stdout + write.stderr).toBe(written('sem-unit', 'sub-lane', FIDELITY));
    expect((await report(sb, 'sem-unit', 'sub-lane', '')).bytes.toString()).toBe(FIDELITY);
    expect((await lane(sb, 'show', 'sem-unit', 'sub-lane', 'report')).bytes.toString()).toBe(FIDELITY);
    expect(readFileSync(artifactPath(sb, 'sem-unit', 'lane/sub-lane/report'), 'utf8')).toBe(FIDELITY);
  });

  it('X-d [the-record-r11, the-record-r16]: a repeated lane entry slug refuses ERR_ENTITY_EXISTS; the journal reads back as stored with headers and THREAD lines', async () => {
    const sb = fresh(sb0);
    const again = await lane(sb, 'record', 'x-unit', 'x-lane', '--what=Repeated lane slug', `--slug=${D}-x-l1`);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('ERR_ENTITY_EXISTS');
    await must(lane(sb, 'record', 'x-unit', 'x-lane', '--what=Second lane event', `--slug=${D}-x-l2`, '--thread=the dispatcher'));
    const journal = (await lane(sb, 'show', 'x-unit', 'x-lane', 'journal')).stdout;
    expect(journal).toMatch(new RegExp(`^@entry ${D}-x-l2$`, 'm'));
    expect(journal).toMatch(/^ {2}THREAD: the dispatcher$/m);
    expect(journal.split('\n').filter((l) => l === `@entry ${D}-x-l1`)).toHaveLength(1);
  });

  it.for(['', 'true', 'false'])('X-d E5-T [the-record-r7]: lane record --thread="%s" refuses naming the THREAD shape and nothing lands', async (thread) => {
    const sb = fresh(sb0);
    const r = await lane(sb, 'record', 'x-unit', 'x-lane', '--what=E5-T bad thread', `--thread=${thread}`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`THREAD malformed: [${thread}]`);
    expect((await lane(sb, 'show', 'x-unit', 'x-lane', 'journal')).stdout).not.toContain('E5-T bad thread');
  });

  it('X-d F6 [the-record-r16, the-record-r17]: a --body report reads back through the empty stdin read; the stdin write echo carries no JSON tail', async () => {
    const sb = fresh(sb0);
    await must(lane(sb, 'report', 'x-unit', 'x-lane', '--body=report by the body flag'));
    const read = await report(sb, 'x-unit', 'x-lane', '');
    expect(read.stdout + read.stderr).toBe('report by the body flag\n');
    const echo = await report(sb, 'x-unit', 'x-lane', '# x report\n\n@claim x1\n  VERDICT: "from stdin"\n');
    expect(echo.stdout + echo.stderr).not.toContain('"}');
  });

  it('X-p [the-engine-r9]: a 2 MB lane report lands through the verb and reads back byte for byte', async () => {
    const sb = fresh(sb0);
    const big = Array.from({ length: 26000 }, (_, i) => `line ${String(i + 1).padStart(6, '0')} of the big report, eighty bytes wide, padded to width ....\n`).join('');
    expect((await report(sb, 'x-unit', 'x-lane', big)).code).toBe(0);
    expect((await report(sb, 'x-unit', 'x-lane', '')).bytes.equals(Buffer.from(big))).toBe(true);
  });

  it('[the-record-r17] lane show exits under a stdin held open, while lane report without --body waits on it', async () => {
    const sb = fresh(sb0);
    await must(lane(sb, 'report', 'sem-unit', 'sub-lane', '--body=held stdin report'));
    const shown = launch('./.contexture/ctx', ['lane', 'show', 'sem-unit', 'sub-lane', 'report'], { cwd: sb, input: null });
    const done = await Promise.race([shown.result, new Promise<null>((r) => setTimeout(() => r(null), 20_000))]);
    expect(done?.stdout).toBe('held stdin report\n');
    const waiting = launch('./.contexture/ctx', ['lane', 'report', 'sem-unit', 'sub-lane'], { cwd: sb, input: null });
    const early = await Promise.race([waiting.result, new Promise<null>((r) => setTimeout(() => r(null), 3_000))]);
    expect(early).toBeNull();
    waiting.child.stdin?.end();
    expect((await waiting.result).stdout).toBe('held stdin report\n');
  });
});
