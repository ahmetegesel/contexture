import { mkdirSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, RECORD_ROOT } from '../support/drawer';
import type { Run } from '../support/exec';
import { appendArtifact } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { must, plantRhythms, rhythm, run, seedUnit, unit } from '../support/unit';

const D = '2026-09-27';
const SELECT = "select: match the request against each use when; a propose match is proposed and waits for the human's confirm, an auto match applies and says so; no match runs the design loop (@rhythms default); read a rhythm with ctx rhythm show <name>";
const PROBE = 'probe | workspace | use when: the suite needs an index line | activation: propose';
const EXTPROBE = 'extprobe | extension | use when: the suite needs an extension index line | activation: propose';
const WARNING = 'WARNING: the record was read from its deprecated root; each unit moves at its next write, and ctx unit migrate --all moves the rest when the human chooses\n';
const NAME_RULE = "ERROR: RHYTHM b declares @rhythm beta; a rhythm's file name and its @rhythm line must agree\n";
const NONE = (u: string): string => `rhythm none in force in ${u}: the design loop runs until the human confirms a rhythm (ctx rhythm list)`;
const STAMP = (n: string): string => `stamp: ctx unit record <unit> --rhythm="${n} <N> <GATE>" on each entry that advances this rhythm`;
const FOLDER = /\.contexture\/|rhythms\//;
const lines = (out: string): string[] => out.replace(/\n$/, '').split('\n');
const last = (out: string): string => lines(out).at(-1) ?? '';
const rh = (sb: string, ...args: string[]): Promise<Run> => run(sb, ['rhythm', ...args]);
const ws = (sb: string, name: string, body: string): void => {
  mkdirSync(join(sb, '.contexture/rhythms'), { recursive: true });
  writeFileSync(join(sb, '.contexture/rhythms', `${name}.md`), body);
};
const ext = (sb: string, name: string, body: string): void => {
  mkdirSync(join(sb, '.contexture/extensions/rhythms'), { recursive: true });
  writeFileSync(join(sb, '.contexture/extensions/rhythms', `${name}.md`), body);
};
const three = (): string => rhythm('probe', 'the suite needs an index line', [['OPEN', 'the workspace probe gate'], ['CLOSE', 'the workspace probe close gate'], ['LAND', 'the workspace probe land gate']]);

function rhythmStage(label: string): string {
  const sb = stage('posix', label);
  plantRhythms(sb);
  return sb;
}

async function loadPages(sb: string, slug: string): Promise<string> {
  let all = '';
  for (let page = 1; page < 20; page++) {
    const r = await unit(sb, 'load', slug, String(page));
    expect(r.code).toBe(0);
    all += r.stdout;
    if (r.stdout.includes('LOAD COMPLETE')) return all;
  }
  throw new Error('the load never read complete');
}

describe.concurrent('ctx rhythm list: the rhythms over both roots', () => {
  it('V-d [modules-r20]: list prints the workspace rhythm, then the extension rhythm, then the select line', async () => {
    const r = await rh(rhythmStage('rhythm-list'), 'list');
    expect([r.code, lines(r.stdout), r.stderr]).toEqual([0, [PROBE, EXTPROBE, SELECT], '']);
  });

  it('[modules-r20] a workspace work shadows the extension work: stdout is the work line, the debug line, and the select line', async () => {
    const sb = stage('posix', 'rhythm-shadow');
    ws(sb, 'work', rhythm('work', 'the workspace work', [['GO', 'the workspace go']]));
    ext(sb, 'work', rhythm('work', 'the installed work', [['GO', 'the installed go']]).replace('activation: propose', 'activation: auto'));
    ext(sb, 'debug', rhythm('debug', 'a failure needs root-cause', [['FIX', 'the fix']]));
    const r = await rh(sb, 'list');
    expect([r.code, r.stdout, r.stderr]).toEqual([
      0,
      ['work | workspace, shadows the extension copy | use when: the workspace work | activation: propose', 'debug | extension | use when: a failure needs root-cause | activation: propose', SELECT, ''].join('\n'),
      '',
    ]);
  });

  it('V-d BG1 [modules-r20]: an absent workspace rhythms root answers rc 0 with the extension rhythm alone', async () => {
    const sb = rhythmStage('rhythm-bg1');
    renameSync(join(sb, '.contexture/rhythms'), join(sb, '.contexture/rhythms.bg1'));
    const r = await rh(sb, 'list');
    expect([r.code, lines(r.stdout), r.stderr]).toEqual([0, [EXTPROBE, SELECT], '']);
  });

  it('V-d BG1 [modules-r20]: both rhythm roots absent print the select line alone rc 0, no stderr', async () => {
    const r = await rh(stage('posix', 'rhythm-none'), 'list');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, `${SELECT}\n`, '']);
  });

  it('[modules-r20, modules-r-6l2ti] each planted grammar defect warns once on stderr naming the rhythm, its origin, and the defect, rc 0, every rhythm still listed by its file name; a missing activation reads propose with no warning; a shadowed copy is never checked; a file without an @rhythm line is skipped with its warning', async () => {
    const sb = stage('posix', 'rhythm-defects');
    ws(sb, 'nouse', '@rhythm nouse\n  activation: propose\n  1. GO: the gate\n');
    ws(sb, 'badact', '@rhythm badact\n  use when: u\n  activation: banana\n  1. GO: the gate\n');
    ws(sb, 'misname', '@rhythm other\n  use when: u\n  1. GO: the gate\n');
    ws(sb, 'gap', '@rhythm gap\n  use when: u\n  1. GO: the gate\n  3. END: the end\n');
    ws(sb, 'badgate', '@rhythm badgate\n  use when: u\n  1. GO: the gate\n  2. TRACE & ACCUMULATE: the trace\n  3. END: the end\n');
    ws(sb, 'nostep', '@rhythm nostep\n  use when: u\n');
    ws(sb, 'noact', '@rhythm noact\n  use when: u\n  1. GO: the gate\n');
    ws(sb, 'shady', '@rhythm shady\n  use when: u\n  1. GO: the gate\n');
    ext(sb, 'shady', '@rhythm elsewhere\n  1. GO: the gate\n');
    ws(sb, 'plain', '# notes\n  use when: never listed\n');
    const r = await rh(sb, 'list');
    expect(r.code).toBe(0);
    expect(lines(r.stdout)).toEqual([
      'badact | workspace | use when: u | activation: propose',
      'badgate | workspace | use when: u | activation: propose',
      'gap | workspace | use when: u | activation: propose',
      'misname | workspace | use when: u | activation: propose',
      'noact | workspace | use when: u | activation: propose',
      'nostep | workspace | use when: u | activation: propose',
      'nouse | workspace | use when: (missing) | activation: propose',
      'shady | workspace, shadows the extension copy | use when: u | activation: propose',
      SELECT,
    ]);
    expect(lines(r.stderr)).toEqual([
      "rhythm list: warning: badact (workspace): activation 'banana' is neither propose nor auto, read as propose",
      "rhythm list: warning: badgate (workspace): step 2 gate 'TRACE & ACCUMULATE' is outside the stamp grammar",
      'rhythm list: warning: gap (workspace): the steps break their 1 to N order at step 3',
      "rhythm list: warning: misname (workspace): its @rhythm line names 'other'",
      'rhythm list: warning: nostep (workspace): no step line',
      'rhythm list: warning: nouse (workspace): no use when line',
      'rhythm list: warning: plain (workspace): no @rhythm line',
    ]);
    const shown = await rh(sb, 'show', 'plain');
    expect([shown.code, shown.stderr]).toEqual([1, 'rhythm show: error: no such rhythm: plain (ctx rhythm list names them) (ERR_ENTITY_NOT_FOUND)\n']);
    await seedUnit(sb, 'plain-u');
    const stamped = await unit(sb, 'record', 'plain-u', '--what=no rhythm here', '--rhythm=plain 1 GO');
    expect([stamped.code, stamped.stdout, stamped.stderr]).toEqual([1, '', 'ERROR: no such rhythm: plain (ctx rhythm list names them)\n']);
  });

  it('[modules-r-6l2ti] a numbered prose line whose gate is malformed and whose number breaks the order warns once, as the gate defect, never also as a gap', async () => {
    const sb = stage('posix', 'rhythm-nested');
    ws(sb, 'nested', '@rhythm nested\n  use when: u\n  1. GO: g\n    1. a numbered prose line\n  2. END: e\n');
    const r = await rh(sb, 'list');
    expect([r.code, lines(r.stdout)]).toEqual([0, ['nested | workspace | use when: u | activation: propose', SELECT]]);
    expect(r.stderr).toBe("rhythm list: warning: nested (workspace): step 1 gate 'a numbered prose line' is outside the stamp grammar\n");
  });

  it('[modules-r20, modules-r-6l2ti] a file whose name is not a rhythm name warns that it never lists when it holds an @rhythm line, stays silent when it holds none, and a rhythm named like an answer tag still lists', async () => {
    const sb = stage('posix', 'rhythm-badname');
    ws(sb, 'dotted.flow', '@rhythm dotted.flow\n  use when: u\n  1. GO: the gate\n');
    ext(sb, 'my flow', '@rhythm my flow\n  use when: u\n  1. GO: the gate\n');
    ws(sb, 'notes.old', '# notes\n');
    ws(sb, 'skipped-flow', '@rhythm skipped-flow\n  use when: u\n  1. GO: the gate\n');
    ws(sb, 'badname-flow', '@rhythm badname-flow\n  use when: u\n  1. GO: the gate\n');
    const r = await rh(sb, 'list');
    expect([r.code, lines(r.stdout)]).toEqual([0, ['badname-flow | workspace | use when: u | activation: propose', 'skipped-flow | workspace | use when: u | activation: propose', SELECT]]);
    expect(lines(r.stderr)).toEqual([
      'rhythm list: warning: dotted.flow (workspace): the file name is not a rhythm name (a letter or digit, then letters, digits, underscore, or dash), so it never lists',
      'rhythm list: warning: my flow (extension): the file name is not a rhythm name (a letter or digit, then letters, digits, underscore, or dash), so it never lists',
    ]);
  });

  it('R-g [modules-r20]: list refuses an argument rc 1 with the usage', async () => {
    const r = await rh(stage('posix', 'rhythm-arg'), 'list', 'extra');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', 'Usage: ctx rhythm list\nhelp: ctx rhythm help\n']);
  });

  it('[the-engine-r4, the-engine-r7, modules-r-6l2ti] ctx rhythm help lists list, show, and current, never the private resolve, and each verb answers a sole --help with its table', async () => {
    const sb = stage('posix', 'rhythm-help');
    const help = await rh(sb, 'help');
    expect(help.code).toBe(0);
    expect([...help.stdout.matchAll(/^ {2}([a-z]+) {2,}/gm)].map((m) => m[1])).toEqual(['current', 'list', 'show']);
    expect(help.stdout).not.toContain('resolve');
    for (const verb of ['list', 'show', 'current']) {
      const table = await rh(sb, 'help', verb);
      expect(table.code).toBe(0);
      for (const flag of ['--help', '-h']) expect(await rh(sb, verb, flag)).toMatchObject({ code: 0, stdout: table.stdout, stderr: '' });
    }
    expect((await rh(sb, 'resolve', 'probe')).code).toBe(1);
  });
});

describe.concurrent('ctx rhythm show: one rhythm whole', () => {
  it('[modules-r-w86c2] show prints the effective copy byte for byte, the workspace copy for a shadowed name, then the stamp line, rc 0', async () => {
    const sb = rhythmStage('rhythm-show');
    const shadow = rhythm('extprobe', 'the suite needs a shadow copy', [['SHADOW', 'the workspace shadow gate']]);
    ws(sb, 'extprobe', shadow);
    const r = await rh(sb, 'show', 'extprobe');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, `${shadow}${STAMP('extprobe')}\n`, '']);
    const bare = await rh(sb, 'show', 'probe');
    expect(bare.stdout).toBe(`${readFileSync(join(sb, '.contexture/rhythms/probe.md'), 'utf8')}${STAMP('probe')}\n`);
    ws(sb, 'tail', '@rhythm tail\n  use when: u\n  1. GO: the gate');
    expect((await rh(sb, 'show', 'tail')).stdout).toBe(`@rhythm tail\n  use when: u\n  1. GO: the gate\n${STAMP('tail')}\n`);
  });

  it('[modules-r-w86c2] show refuses an unknown name rc 1 naming the list', async () => {
    const r = await rh(rhythmStage('rhythm-show-miss'), 'show', 'nosuch');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', 'rhythm show: error: no such rhythm: nosuch (ctx rhythm list names them) (ERR_ENTITY_NOT_FOUND)\n']);
  });

  it.for(['../x', '.hidden', 'a/b'])('[modules-r-w86c2] show refuses the malformed name %s rc 1 before any read, though a rhythm sits where the name would reach', async (name) => {
    const sb = rhythmStage('rhythm-show-bad');
    mkdirSync(join(sb, '.contexture/rhythms/a'), { recursive: true });
    for (const at of ['.contexture/x.md', '.contexture/rhythms/.hidden.md', '.contexture/rhythms/a/b.md']) writeFileSync(join(sb, at), rhythm('x', 'a plant', [['GO', 'the gate']]));
    const r = await rh(sb, 'show', name);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `rhythm show: error: malformed rhythm name '${name}' (ERR_INVALID_ARGUMENT)\n`]);
  });

  it.for([[[]], [['probe', 'extprobe']]] as const)('[modules-r-w86c2] show with %j refuses rc 1 with the usage', async ([args]) => {
    const r = await rh(rhythmStage('rhythm-show-argc'), 'show', ...args);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', 'Usage: ctx rhythm show <name>\nhelp: ctx rhythm help\n']);
  });
});

describe.concurrent('ctx rhythm current, the board line, and the stamped record', () => {
  let cur: string;
  let recs: string;
  beforeAll(async () => {
    cur = await seed(async (sb) => {
      plantRhythms(sb);
      ws(sb, 'probe', three());
      await seedUnit(sb, 'none-u');
      await seedUnit(sb, 'force-u');
      await must(unit(sb, 'record', 'force-u', '--what=opens the probe', '--rhythm=probe 1 OPEN', `--slug=${D}-force-1`));
      await must(unit(sb, 'record', 'force-u', '--what=closes it, rhythm: probe 9 X', '--rhythm=probe 2 CLOSE', `--slug=${D}-force-2`));
      await must(unit(sb, 'record', 'force-u', '--what=an unstamped entry after the stamp', `--slug=${D}-force-3`));
      await seedUnit(sb, 'done-u');
      for (const [n, g] of [['1', 'OPEN'], ['2', 'CLOSE'], ['3', 'LAND']]) await must(unit(sb, 'record', 'done-u', `--what=gate ${g}`, `--rhythm=probe ${n} ${g}`, `--slug=${D}-done-${n}`));
    }, 'posix', 'rhythm-current');
    recs = await seed(async (sb) => {
      plantRhythms(sb);
      ws(sb, 'b', rhythm('beta', 'the misnamed rhythm', [['X', 'the x gate']]));
      await seedUnit(sb, 'rec-u');
    }, 'posix', 'rhythm-record');
  });

  const IN_FORCE = `rhythm in force: probe at 2 CLOSE (entry ${D}-force-2); next gate: 3 LAND: the workspace probe land gate`;

  it('[modules-r-zv4ny] current reads none in force, in force with the next gate and its outcome past an unstamped entry and a WHAT holding rhythm:, and completed at the last gate, one stdout line each', async () => {
    const sb = fresh(cur);
    for (const [u, line] of [['none-u', NONE('none-u')], ['force-u', IN_FORCE], ['done-u', `rhythm completed: probe at its last gate 3 LAND (entry ${D}-done-3)`]]) {
      const r = await rh(sb, 'current', u!);
      expect([r.code, r.stdout, r.stderr], u).toEqual([0, `${line}\n`, '']);
    }
  });

  it('[modules-r-zv4ny] current reads stale for a step that no longer reads its gate, a rhythm that no longer resolves, and a legacy stamp of another shape', async () => {
    const changed = fresh(cur);
    ws(changed, 'probe', three().replace('2. CLOSE:', '2. SHUT:'));
    expect((await rh(changed, 'current', 'force-u')).stdout).toBe(`rhythm stale: probe 2 CLOSE (entry ${D}-force-2) matches no step of the effective rhythm; read it: ctx rhythm show probe\n`);
    const gone = fresh(cur);
    unlinkSync(join(gone, '.contexture/rhythms/probe.md'));
    expect((await rh(gone, 'current', 'force-u')).stdout).toBe(`rhythm stale: probe 2 CLOSE (entry ${D}-force-2) matches no step of the effective rhythm; read it: ctx rhythm show probe\n`);
    const legacy = fresh(cur);
    appendArtifact(legacy, 'none-u', 'journal', `\n@entry ${D}-legacy\n  ANCHOR: A1\n  WHAT: "a legacy stamp"\n  RHYTHM: oldwork\n  THREAD: none\n`);
    const r = await rh(legacy, 'current', 'none-u');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, `rhythm stale: oldwork (entry ${D}-legacy) matches no step of the effective rhythm; read it: ctx rhythm show oldwork\n`, '']);
  });

  it('[modules-r-zv4ny] current refuses a malformed unit before any read and relays the entry listing line for a missing unit, rc 1', async () => {
    const sb = fresh(cur);
    expect(await rh(sb, 'current', 'bad.unit')).toMatchObject({ code: 1, stdout: '', stderr: "rhythm current: error: malformed unit 'bad.unit' (ERR_INVALID_ARGUMENT)\n" });
    expect(await rh(sb, 'current', 'no-such-u')).toMatchObject({ code: 1, stdout: '', stderr: "entry.list: error: unit 'no-such-u' not found (ERR_ENTITY_NOT_FOUND)\n" });
    expect((await rh(sb, 'current')).code).toBe(1);
  });

  it('[modules-r-zv4ny, the-record-r-4gj4k, the-record-r-njns2] current and the board of a unit served from the deprecated root print their line and the warning once', async () => {
    const sb = fresh(cur);
    mkdirSync(join(sb, FALLBACK_ROOT), { recursive: true });
    renameSync(join(sb, RECORD_ROOT, 'force-u'), join(sb, FALLBACK_ROOT, 'force-u'));
    expect(await rh(sb, 'current', 'force-u')).toMatchObject({ code: 0, stdout: `${IN_FORCE}\n`, stderr: WARNING });
    const board = await unit(sb, 'board', 'force-u');
    expect([board.code, last(board.stdout), board.stderr]).toEqual([0, IN_FORCE, WARNING]);
  });

  it('[the-record-r-njns2, modules-r-zv4ny] the board ends with the line ctx rhythm current prints, for a unit in force, a completed one, and one with none; refresh carries it; the load page never does', async () => {
    const sb = fresh(cur);
    for (const u of ['force-u', 'done-u', 'none-u']) {
      const board = await unit(sb, 'board', u);
      const current = await rh(sb, 'current', u);
      expect([board.code, board.stderr], u).toEqual([0, '']);
      expect(last(board.stdout), u).toBe(current.stdout.replace(/\n$/, ''));
    }
    expect((await unit(sb, 'refresh', 'force-u')).stdout.split('\n')).toContain(IN_FORCE);
    expect(await loadPages(sb, 'force-u')).not.toMatch(/^rhythm (in force|completed|stale|none)/m);
    expect((await unit(sb, 'help', 'board')).stdout).toContain('the board ends with the rhythm in force line, as ctx rhythm current prints it');
  });

  it('[the-record-r-njns2] with the rhythm module absent the board prints its view alone, rc 0, empty stderr', async () => {
    const sb = fresh(cur);
    const before = await unit(sb, 'board', 'force-u');
    rmSync(join(sb, '.contexture/extensions/modules/rhythm'), { recursive: true });
    const r = await unit(sb, 'board', 'force-u');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(before.stdout.replace(`${IN_FORCE}\n`, ''));
    expect(r.stdout).not.toMatch(/^rhythm /m);
  });

  it('[the-record-r-ep8la] entry list --json carries each entry\'s rhythm after its group, null when unstamped', async () => {
    const r = await unit(fresh(cur), 'entry', 'list', 'force-u', '--json');
    expect(r.stdout).toContain(`"slug":"${D}-force-2","occurrence":1,"anchor":"A1","what":"closes it, rhythm: probe 9 X","group":null,"rhythm":"probe 2 CLOSE"}`);
    expect(r.stdout).toContain(`"slug":"${D}-force-3","occurrence":1,"anchor":"A1","what":"an unstamped entry after the stamp","group":null,"rhythm":null}`);
  });

  it('[the-record-r-ep8la] a stamped record prints the next gate after recorded entry, the last step its last gate; a record without --rhythm prints its one line', async () => {
    const sb = fresh(recs);
    expect(await unit(sb, 'record', 'rec-u', '--what=opens', '--rhythm=probe 1 OPEN', `--slug=${D}-rec-1`)).toMatchObject({
      code: 0,
      stdout: `recorded entry: ${D}-rec-1\nrhythm: probe at 1 OPEN; next gate: 2 CLOSE: the workspace probe close gate\n`,
      stderr: '',
    });
    expect((await unit(sb, 'record', 'rec-u', '--what=closes', '--rhythm=probe 2 CLOSE', `--slug=${D}-rec-2`)).stdout).toBe(`recorded entry: ${D}-rec-2\nrhythm: probe at 2 CLOSE, its last gate\n`);
    expect((await unit(sb, 'record', 'rec-u', '--what=plain', `--slug=${D}-rec-3`)).stdout).toBe(`recorded entry: ${D}-rec-3\n`);
  });

  it('[the-record-r-ep8la] record refuses a rhythm whose @rhythm line names another, a missing rhythm, and a missing step, each one line naming no folder, nothing written', async () => {
    const sb = fresh(recs);
    const before = (await unit(sb, 'entry', 'list', 'rec-u')).stdout;
    for (const [stamp, line] of [
      ['b 1 X', NAME_RULE],
      ['nosuch 1 OPEN', 'ERROR: no such rhythm: nosuch (ctx rhythm list names them)\n'],
      ['probe 7 OPEN', 'ERROR: RHYTHM step 7 not in probe\n'],
    ]) {
      const r = await unit(sb, 'record', 'rec-u', '--what=refused', `--rhythm=${stamp}`);
      expect([r.code, r.stdout, r.stderr], stamp).toEqual([1, '', line]);
    }
    expect((await unit(sb, 'entry', 'list', 'rec-u')).stdout).toBe(before);
    expect((await unit(sb, 'help', 'record')).stdout).toContain('--rhythm="..."       the process in force: <name> <N> <GATE>, a step and gate of the named rhythm (ctx rhythm list names them, ctx rhythm show <name> prints one); a stamped write prints the next gate');
  });

  it('[modules-r20, the-record-r-ep8la] no line of list, its warnings, the show stamp line, current, the board line, the record line and its refusals, ctx rhythm help, or ctx unit help record names a rhythm folder; the same check reads a planted folder line', async () => {
    const sb = fresh(recs);
    ws(sb, 'nouse', '@rhythm nouse\n  1. GO: the gate\n');
    const said: string[] = [];
    const take = (r: Run): void => void said.push(...lines(r.stdout), ...lines(r.stderr));
    take(await rh(sb, 'list'));
    said.push(last((await rh(sb, 'show', 'probe')).stdout));
    take(await rh(sb, 'current', 'rec-u'));
    said.push(last((await unit(sb, 'board', 'rec-u')).stdout));
    take(await unit(sb, 'record', 'rec-u', '--what=stamped', '--rhythm=probe 1 OPEN'));
    for (const stamp of ['b 1 X', 'nosuch 1 OPEN', 'probe 7 OPEN', 'probe 1 WRONG']) take(await unit(sb, 'record', 'rec-u', '--what=refused', `--rhythm=${stamp}`));
    take(await rh(sb, 'current', 'rec-u'));
    said.push(last((await unit(sb, 'board', 'rec-u')).stdout));
    take(await rh(sb, 'help'));
    for (const verb of ['list', 'show', 'current']) take(await rh(sb, 'help', verb));
    take(await unit(sb, 'help', 'record'));
    expect(said.length).toBeGreaterThan(30);
    expect(said.filter((l) => l.startsWith('rhythm in force: probe at 1 OPEN'))).toHaveLength(2);
    expect(said.filter((l) => FOLDER.test(l))).toEqual([]);
    expect([...said, 'a planted line naming .contexture/rhythms/probe.md'].filter((l) => FOLDER.test(l))).toHaveLength(1);
  });
});
