import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { lockPath, unitLock } from '../support/drawer';
import type { Run } from '../support/exec';
import { holdLock, sleepShim } from '../support/locks';
import { ROOT_USER } from '../support/plants';
import { appendArtifact, DATE, mk, ok, readArtifact, rec } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { plantArtifact, unitChecksum } from '../support/unit';
import { answer, payload, refused, type Payload } from '../support/wire';

const S = 'xa';
const T = 'xb';
const E1 = `${DATE}-event-1790000101`;
const E2 = `${DATE}-event-1790000102`;
const E3 = `${DATE}-event-1790000103`;
const E4 = `${DATE}-event-1790000104`;
const E5 = `${DATE}-event-1790000105`;
const PTR = `${DATE}-event-1790000200`;
const RECIPE = ['@recipe l1 for unit#xa/task/t1', '  UNIT: xa', '  TASKS: unit#xa/task/t1, unit#xa/task/t10', '', 'REFS ::', '  unit#xa/task/t1 the first task', '  unit#xa/finding/F1', '', '# heading unit#xa/task/t1 stays', ''].join('\n');
const PLANTED_TASK = '\n@task t4\n  STATUS: BLOCKED\n  OBJECTIVE: "a legacy status task"\n';
const PLANTED_ENTRY = [
  '',
  `@entry ${E5} head words`,
  '  extra line text',
  '  NOTE: unit#xa/task/t1 stays in NOTE',
  '  ANCHOR: A1',
  '  STATUS: LEGACY',
  '  WHAT: "hand planted about unit#xa/task/t1"',
  '  GROUP: g3',
  '  THREAD: none',
  '  REF: "unit#xa/task/t1"',
  `  CLOSES: ${E3} unit#xa/task/t1 (done: closed twice)`,
  '',
].join('\n');

const move = (p: Payload = payload(), epoch = '1790000200'): string => p.kv('date', DATE).kv('epoch', epoch).toString();
const transfer = (sb: string, args: readonly string[], p: string): Promise<Run> => data(sb, 'unit.transfer', args, p);
const text = (sb: string, unit: string, artifact: string): string => readArtifact(sb, unit, artifact).toString('utf8');
const both = async (sb: string): Promise<string> => `${await unitChecksum(sb, S, ['l1'])}\n${await unitChecksum(sb, T)}`;

async function build(sb: string): Promise<void> {
  answer(await mk(sb, S, 'source objective naming unit#xa/task/t1 and unit#xa/task/t10'), 'session.create');
  answer(await mk(sb, T, 'the target unit'), 'session.create');
  await ok(sb, 'session.stamp', [T], payload().kv('date', DATE));
  await ok(sb, 'task.add', [S, 't1'], payload().kv('objective', 'the first task').kl('refs', `unit#xa/entry/${E1}`).kv('desc', 'about unit#xa/task/t2 and unit#xa/task/t10'));
  await ok(sb, 'task.add', [S, 't2'], payload().kv('objective', 'the second task'));
  await ok(sb, 'task.start', [S, 't2']);
  await ok(sb, 'task.add', [S, 't3'], payload().kv('objective', 'the third task').kv('desc', 'after unit#xa/task/t2.'));
  await ok(sb, 'task.complete', [S, 't3'], payload().kv('evidence', 'verified').kv('date', DATE));
  await ok(sb, 'task.add', [S, 't10'], payload().kv('objective', 'the longer slug task'));
  appendArtifact(sb, S, 'backlog', PLANTED_TASK);
  await ok(sb, 'finding.add', [S, 'F1'], payload().kv('summary', 'decided over unit#xa/task/t1.').kl('refs', 'unit#xa/task/t1'));
  await ok(sb, 'finding.add', [S, 'F_OLD'], payload().kv('summary', 'the old finding'));
  await ok(sb, 'finding.supersede', [S, 'F_OLD', 'F_NEW'], payload().kv('summary', 'the new finding'));
  answer(await rec(sb, S, 1790000101, 'first about unit#xa/task/t1, not unit#xa/task/t10', { with: payload().kv('group', 'g1').kl('refs', 'unit#xa/task/t1', 'unit#xa/finding/F1') }), 'entry.record');
  answer(await rec(sb, S, 1790000102, 'awaits the human', { thread: 'the human answer', with: payload().kv('group', 'g1') }), 'entry.record');
  answer(await rec(sb, S, 1790000103, 'a closed one', { with: payload().kv('group', 'g2') }), 'entry.record');
  answer(await rec(sb, S, 1790000104, 'closes the closed one', { with: payload().kv('group', 'g2').kl('refs', `unit#xa/entry/${E1}`).kv('closers.count', '1').kcl(1, 'CLOSES', 'done', 'closed', E3) }), 'entry.record');
  appendArtifact(sb, S, 'journal', PLANTED_ENTRY);
  answer(await data(sb, 'lane.create', [S, 'l1'], RECIPE), 'lane.create');
  answer(await data(sb, 'lane.record', [S, 'l1'], payload().kv('what', 'lane saw unit#xa/task/t1').kl('refs', 'unit#xa/task/t1').kv('date', DATE).kv('epoch', '1790000110').toString()), 'lane.record');
  answer(await data(sb, 'lane.write_report', [S, 'l1'], '@report l1\nVERDICT :: done\nNOTES ::\n  see unit#xa/task/t1\n'), 'lane.write_report');
}

const MAIN = payload().kl('tasks', 't1', 't2', 't4', 't1').kl('findings', 'F1').kl('entries', E5, E1).kl('groups', 'g1');

const COPY_E1 = [`@entry ${E1}`, '  ANCHOR: A2', '  WHAT: "first about unit#xb/task/t1, not unit#xa/task/t10"', '  GROUP: g1', '  THREAD: none', '  REF: "unit#xb/task/t1"', '  REF: "unit#xb/finding/F1"', `  REF: "unit#xa/entry/${E1}"`, ''].join('\n');
const COPY_E2 = [`@entry ${E2}`, '  ANCHOR: A2', '  WHAT: "awaits the human"', '  GROUP: g1', '  THREAD: the human answer', `  REF: "unit#xa/entry/${E2}"`, ''].join('\n');
const COPY_E5 = [`@entry ${E5} head words`, '  extra line text', '  NOTE: unit#xa/task/t1 stays in NOTE', '  ANCHOR: A2', '  STATUS: LEGACY', '  WHAT: "hand planted about unit#xb/task/t1"', '  GROUP: g3', '  THREAD: none', '  REF: "unit#xb/task/t1"', `  REF: "unit#xa/entry/${E5}"`, ''].join('\n');
const POINTER = [
  `@entry ${PTR}`,
  '  ANCHOR: A1',
  `  WHAT: "moved to unit xb: tasks t1, t2, t4; findings F1; entries ${E1}, ${E2}, ${E5}"`,
  '  THREAD: none',
  `  REF: "unit#xb/entry/${E1}"`,
  `  REF: "unit#xb/entry/${E2}"`,
  `  REF: "unit#xb/entry/${E5}"`,
  '  REF: "unit#xb/task/t1"',
  '  REF: "unit#xb/task/t2"',
  '  REF: "unit#xb/task/t4"',
  '  REF: "unit#xb/finding/F1"',
  `  CLOSES: ${E1} ${E2} ${E5} (superseded: moved to unit xb)`,
  '',
].join('\n');

describe.concurrent('ctx unit transfer through the data function unit.transfer', () => {
  let sb0: string;
  let moved: string;
  let reply: any;
  const before: Record<string, string> = {};

  beforeAll(async () => {
    sb0 = await seed(build, 'posix', 'transfer');
    for (const a of ['state', 'backlog', 'knowledge', 'journal', 'lane/l1/recipe', 'lane/l1/journal', 'lane/l1/report']) before[`${S}/${a}`] = text(sb0, S, a);
    before[`${T}/journal`] = text(sb0, T, 'journal');
    moved = fresh(sb0);
    reply = answer(await transfer(moved, [S, T], move(MAIN)), 'unit.transfer');
  });

  it('[the-record-r-xfer1] the fixture audits clean in both units before the move', async () => {
    expect((await ok(sb0, 'session.audit', [S])).clean).toBe(true);
    expect((await ok(sb0, 'session.audit', [T])).clean).toBe(true);
  });

  it('[the-record-r-xfer1] the answer names the selection once each, in source order, the pointer, the forward count, and no outside row', () => {
    expect(reply).toEqual({ source: S, target: T, dry_run: false, tasks: ['t1', 't2', 't4'], findings: ['F1'], entries: [E1, E2, E5], pointer: PTR, forwarded: 21, outside: [] });
  });

  it('[the-record-r-xfer1] each open entry lands in the target journal in source order as its canonical render: the target anchor, a provenance REF after its own, no closer line', () => {
    expect(text(moved, T, 'journal')).toBe(`${before[`${T}/journal`]}\n${COPY_E1}\n${COPY_E2}\n${COPY_E5}`);
  });

  it('[the-record-r-xfer1] the originals stay in the source journal, changed only by the forward, and one pointer entry lands last closing them as superseded', () => {
    const forwarded = before[`${S}/journal`]!
      .replace('first about unit#xa/task/t1, not', 'first about unit#xb/task/t1, not')
      .replaceAll('  REF: "unit#xa/task/t1"\n', '  REF: "unit#xb/task/t1"\n')
      .replace('  REF: "unit#xa/finding/F1"\n', '  REF: "unit#xb/finding/F1"\n')
      .replace('hand planted about unit#xa/task/t1"', 'hand planted about unit#xb/task/t1"');
    expect(text(moved, S, 'journal')).toBe(`${forwarded}\n${POINTER}`);
  });

  it('[the-record-r-xfer1] an open thread stays open only on the copy: the source board closes it, the target board carries it', async () => {
    const src = await ok(moved, 'session.board', [S]);
    expect(src.open_threads).toEqual([]);
    expect(src.live.map((e: { slug: string }) => e.slug)).not.toContain(E2);
    const tgt = await ok(moved, 'session.board', [T]);
    expect(tgt.open_threads).toEqual([{ slug: E2, anchor: 'A2', thread: 'the human answer' }]);
  });

  it('[the-record-r-xfer1] open tasks of any status but DONE move with every field and status kept, removed from the source with no receipt beyond the pointer', () => {
    expect(text(moved, T, 'backlog')).toBe(
      [
        '@task t1',
        '  STATUS: TODO',
        '  OBJECTIVE: "the first task"',
        `  REFS: [unit#xa/entry/${E1}]`,
        '  DESCRIPTION ::',
        '    about unit#xb/task/t2 and unit#xa/task/t10',
        '',
        '@task t2',
        '  STATUS: IN_PROGRESS',
        '  OBJECTIVE: "the second task"',
        '',
        '@task t4',
        '  STATUS: BLOCKED',
        '  OBJECTIVE: "a legacy status task"',
        '',
      ].join('\n'),
    );
    expect(text(moved, S, 'backlog')).toBe(['@task t3', '  STATUS: DONE', '  OBJECTIVE: "the third task"', '  DESCRIPTION ::', '    after unit#xb/task/t2.', '', '@task t10', '  STATUS: TODO', '  OBJECTIVE: "the longer slug task"', ''].join('\n'));
    const added = text(moved, S, 'journal').slice(before[`${S}/journal`]!.length).match(/^@entry /gm) ?? [];
    expect(added).toHaveLength(1);
  });

  it('[the-record-r-xfer1] a finding lands in the target knowledge whole and leaves the source knowledge', () => {
    expect(text(moved, T, 'knowledge')).toBe(['@finding F1', '  REF: "unit#xb/task/t1"', '  SUMMARY ::', '    decided over unit#xb/task/t1.', ''].join('\n'));
    expect(text(moved, S, 'knowledge')).toBe(before[`${S}/knowledge`]!.replace(/^@finding F1\n[\s\S]*?\n\n(?=@finding F_OLD)/m, ''));
  });

  it('[the-record-r-xfer1] the forward rewrites the exact moved addresses in place in the state, the lane recipe, journal, and report, keeping heads, headings, NOTE, CLOSES, a longer slug, and refs to moved entries', () => {
    expect(text(moved, S, 'state')).toBe(before[`${S}/state`]!.replace('naming unit#xa/task/t1 and', 'naming unit#xb/task/t1 and'));
    expect(text(moved, S, 'lane/l1/recipe')).toBe(
      ['@recipe l1 for unit#xa/task/t1', '  UNIT: xa', '  TASKS: unit#xb/task/t1, unit#xa/task/t10', '', 'REFS ::', '  unit#xb/task/t1 the first task', '  unit#xb/finding/F1', '', '# heading unit#xa/task/t1 stays', ''].join('\n'),
    );
    expect(text(moved, S, 'lane/l1/journal')).toBe(before[`${S}/lane/l1/journal`]!.replaceAll('unit#xa/task/t1', 'unit#xb/task/t1'));
    expect(text(moved, S, 'lane/l1/report')).toBe('@report l1\nVERDICT :: done\nNOTES ::\n  see unit#xb/task/t1\n');
    const journal = text(moved, S, 'journal');
    expect(journal).toContain('  NOTE: unit#xa/task/t1 stays in NOTE\n');
    expect(journal).toContain(`  CLOSES: ${E3} unit#xa/task/t1 (done: closed twice)\n`);
    expect(journal).toContain(`  REF: "unit#xa/entry/${E1}"\n`);
    expect(journal).toContain('not unit#xa/task/t10"');
  });

  it('[the-record-r-xfer1] after a move between two clean units both audits stay clean', async () => {
    expect((await ok(moved, 'session.audit', [S])).clean).toBe(true);
    expect((await ok(moved, 'session.audit', [T])).clean).toBe(true);
  });

  it('[the-record-r-xfer1] a held pointer slug takes a suffix as ctx unit record does, and a move with no entry carries no closer line', async () => {
    const sb = fresh(sb0);
    answer(await rec(sb, S, 1790000200, 'holds the pointer slug'), 'entry.record');
    const r = answer(await transfer(sb, [S, T], move(payload().kl('tasks', 't10'))), 'unit.transfer');
    expect([r.pointer, r.entries, r.tasks]).toEqual([`${PTR}-1`, [], ['t10']]);
    expect(text(sb, S, 'journal').endsWith([`@entry ${PTR}-1`, '  ANCHOR: A1', '  WHAT: "moved to unit xb: tasks t10"', '  THREAD: none', '  REF: "unit#xb/task/t10"', ''].join('\n'))).toBe(true);
  });

  it('[the-record-r-xfer1] --dry-run takes no lock, writes nothing, and answers the same plan', async () => {
    const sb = fresh(sb0);
    const was = await both(sb);
    const release = holdLock(sb, unitLock(S), 'live');
    const r = answer(await transfer(sb, ['--dry-run', S, T], move(MAIN)), 'unit.transfer');
    release();
    expect(r).toEqual({ ...reply, dry_run: true });
    expect(await both(sb)).toBe(was);
  });

  const REFUSALS: readonly [string, string[], string, number, string, string][] = [
    ['no selector', [S, T], move(), 1, 'ERR_INVALID_ARGUMENT', 'unit.transfer takes at least one selector: a task, a finding, an entry, or a group'],
    ['the same unit twice', [S, S], move(payload().kl('tasks', 't1')), 1, 'ERR_INVALID_ARGUMENT', "the source and the target are the same unit 'xa'"],
    ['a missing source', ['nope', T], move(payload().kl('tasks', 't1')), 1, 'ERR_ENTITY_NOT_FOUND', "unit 'nope' not found"],
    ['a missing target', [S, 'nope'], move(payload().kl('tasks', 't1')), 1, 'ERR_ENTITY_NOT_FOUND', "unit 'nope' not found"],
    ['a malformed task slug', [S, T], move(payload().kl('tasks', 'bad slug')), 1, 'ERR_INVALID_ARGUMENT', "malformed task slug 'bad slug'"],
    ['a missing task', [S, T], move(payload().kl('tasks', 'nope')), 1, 'ERR_ENTITY_NOT_FOUND', "task 'nope' not found in unit 'xa'"],
    ['a missing finding', [S, T], move(payload().kl('findings', 'NOPE')), 1, 'ERR_ENTITY_NOT_FOUND', "finding 'NOPE' not found in unit 'xa'"],
    ['a missing entry', [S, T], move(payload().kl('entries', `${DATE}-nope`)), 1, 'ERR_ENTITY_NOT_FOUND', `entry '${DATE}-nope' not found in unit 'xa'`],
    ['a group with no open entry', [S, T], move(payload().kl('groups', 'nosuch')), 1, 'ERR_ENTITY_NOT_FOUND', "group 'nosuch' selects no open entry in unit 'xa'"],
    ['a closed entry', [S, T], move(payload().kl('entries', E3)), 1, 'ERR_INVALID_TRANSITION', `entry '${E3}' is closed in unit 'xa'; unit.transfer moves only open entries`],
    ['a DONE task', [S, T], move(payload().kl('tasks', 't3')), 1, 'ERR_INVALID_TRANSITION', "task 't3' is DONE; unit.transfer moves only from an open status, every status but DONE"],
    ['a superseded finding', [S, T], move(payload().kl('findings', 'F_OLD')), 1, 'ERR_INVALID_TRANSITION', "finding 'F_OLD' is in a supersession chain in unit 'xa'; unit.transfer moves only a finding that neither supersedes nor is superseded"],
    ['a superseding finding', [S, T], move(payload().kl('findings', 'F_NEW')), 1, 'ERR_INVALID_TRANSITION', "finding 'F_NEW' is in a supersession chain in unit 'xa'; unit.transfer moves only a finding that neither supersedes nor is superseded"],
  ];

  it.for(REFUSALS)('[the-record-r-xfer1] %s refuses with one line and writes nothing', async ([, args, p, rc, code, message]) => {
    const sb = fresh(sb0);
    const was = await both(sb);
    refused(await transfer(sb, args, p), 'unit.transfer', rc, code, message);
    expect(await both(sb)).toBe(was);
  });

  it('[the-record-r-xfer1] a CLOSED source or target refuses naming that unit, nothing written', async () => {
    for (const closed of [S, T]) {
      const sb = fresh(sb0);
      await ok(sb, 'session.close', [closed]);
      const was = await both(sb);
      refused(await transfer(sb, [S, T], move(payload().kl('tasks', 't10'))), 'unit.transfer', 1, 'ERR_UNIT_CLOSED', `unit '${closed}' is CLOSED; a closed unit takes no writes`);
      expect(await both(sb)).toBe(was);
    }
  });

  it('[the-record-r-xfer1] an entry slug, task slug, or finding NAME the target holds refuses naming the target, nothing written', async () => {
    const cases: [(sb: string) => Promise<unknown>, Payload, string][] = [
      [(sb) => rec(sb, T, 1790000101, 'the target holds this slug'), payload().kl('entries', E1), `entry '${E1}' already exists in unit 'xb'`],
      [(sb) => ok(sb, 'task.add', [T, 't1'], payload().kv('objective', 'the target task')), payload().kl('tasks', 't1'), "task 't1' already exists in unit 'xb'"],
      [(sb) => ok(sb, 'finding.add', [T, 'F1'], payload().kv('summary', 'the target finding')), payload().kl('findings', 'F1'), "finding 'F1' already exists in unit 'xb'"],
    ];
    for (const [plant, p, message] of cases) {
      const sb = fresh(sb0);
      await plant(sb);
      const was = await both(sb);
      refused(await transfer(sb, [S, T], move(p)), 'unit.transfer', 1, 'ERR_ENTITY_EXISTS', message);
      expect(await both(sb)).toBe(was);
    }
  });

  it('[the-record-r-xfer1] a target whose current_anchor is not A<N> refuses rc 2, nothing written', async () => {
    const sb = fresh(sb0);
    plantArtifact(sb, T, 'state', 'status: ACTIVE\ncurrent_anchor: B7\nobjective: "the target unit"\nrepos: []\n');
    const was = await both(sb);
    refused(await transfer(sb, [S, T], move(payload().kl('tasks', 't10'))), 'unit.transfer', 2, 'ERR_STORAGE_CORRUPT', "unit 'xb': the state's current_anchor 'B7' is not A<N>");
    expect(await both(sb)).toBe(was);
  });

  it('[the-record-r-xfer1] a unit lock held past the wait refuses rc 2 naming it, the lock already taken freed, nothing written', async () => {
    const sb = fresh(sb0);
    const was = await both(sb);
    const release = holdLock(sb, unitLock(T), 'live');
    const r = await data(sb, 'unit.transfer', [S, T], move(payload().kl('tasks', 't10')), sleepShim());
    const firstLeft = existsSync(lockPath(sb, unitLock(S)));
    release();
    refused(r, 'unit.transfer', 2, 'ERR_STORAGE_LOCKED', "the unit lock of 'xb' is held (60 s timeout)");
    expect(firstLeft).toBe(false);
    expect(await both(sb)).toBe(was);
  });

  it.skipIf(ROOT_USER)('[the-record-r-xfer1] the move is one store batch over both units: a batch that loses a line after its first action leaves both units byte equal', async () => {
    const sb = fresh(sb0);
    const was = await both(sb);
    const b64 = join(sb, '.contexture/modules/unit/lib/b64');
    copyFileSync(b64, `${b64}.real`);
    writeFileSync(b64, `#!/bin/sh\nfor b in .contexture/tmp/unit.*/batch; do\n  [ -s "$b" ] && chmod 400 "$b"\ndone\nexec "${b64}.real" "$@"\n`, { mode: 0o755 });
    const r = await transfer(sb, [S, T], move(MAIN));
    copyFileSync(`${b64}.real`, b64);
    expect([r.code, r.stdout], r.stderr).toEqual([2, '']);
    expect(r.stderr).toMatch(/^unit\.transfer: error: [^\n]+ \(ERR_STORAGE_WRITE\)\n$/);
    expect(await both(sb)).toBe(was);
  });

  it('[the-record-r-xfer1] two crossing moves at once, a to b and b to a, both land rc 0 with no lock timeout', async () => {
    const sb = fresh(sb0);
    await ok(sb, 'task.add', [T, 'tb'], payload().kv('objective', 'the target side task'));
    const started = Date.now();
    const [ab, ba] = await Promise.all([transfer(sb, [S, T], move(payload().kl('tasks', 't10'))), transfer(sb, [T, S], move(payload().kl('tasks', 'tb'), '1790000201'))]);
    expect([ab.code, ab.stderr, ba.code, ba.stderr]).toEqual([0, '', 0, '']);
    expect(Date.now() - started).toBeLessThan(30_000);
    expect((await ok(sb, 'task.get', [T, 't10'])).task.status).toBe('TODO');
    expect((await ok(sb, 'task.get', [S, 'tb'])).task.status).toBe('TODO');
  });
});
