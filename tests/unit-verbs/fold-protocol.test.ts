import { describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { fresh } from '../support/snapshot';
import { lane, must, unit } from '../support/unit';
import { D, foldChain, foldRecord, type Plan, readPlan } from './fold-fixture';

const at = foldChain('fold-protocol');
const fold = (sb: string, ...a: string[]) => unit(sb, 'fold', 'fc-unit', ...a);
const plan = (sb: string): Plan => readPlan(sb);

describe.concurrent('ctx unit fold: the consolidation protocol, one step per test', () => {
  it('FC2: the plan partitions the live scope into chunks and lanes, opens the fold start, and prints the first lane manual', async () => {
    const sb = fresh(await at('fixture'));
    const r = await fold(sb);
    expect(r.code).toBe(0);
    const p = r.stdout + r.stderr;
    expect(p).toMatch(/^FOLD START v4 fc-unit/m);
    expect(p).toMatch(/^fold start: \d{4}-\d{2}-\d{2}-event-/m);
    for (const line of ['scope: 8 live entries', 'batch rule: the plan chunks are atomic', 'carried open threads: 1', `${D}-fc-02 [A1]: the human's answer`, 'position: chunk 1 of 6; next lane ', '# Consolidation fold lane: ', 'Your chunks in this plan:', `chunk 1 [A1] ANCHOR: ${D}-fc-01 to ${D}-fc-03 (3 entries)`]) expect(p).toContain(line);
    expect(p).toMatch(/^partition: scope=8 chunks=6 covered=8 uncovered=0$/m);
    expect(p).toMatch(new RegExp(`1 {2}\\[A1\\] ANCHOR.*from ${D}-fc-01 to ${D}-fc-03 \\(3 entries\\)`));
    for (const [n, kind, slug] of [[2, 'A2] TASK_DONE', '04'], [3, 'A2] TAIL', '05'], [4, 'A3] RELEASE', '06'], [5, 'A3] DECIDE', '07'], [6, 'A3] TAIL', '09']] as const) {
      expect(p).toMatch(new RegExp(`${n} {2}\\[${kind.replace(']', '\\]')}.*from ${D}-fc-${slug} to ${D}-fc-${slug}`));
    }
    expect(p).not.toContain(`${D}-fc-08`);
    expect(p).not.toContain('CHAPTER FOLD');
    const lanes = readPlan(sb, p);
    expect(lanes.l1).toMatch(/^fold-\d+-1$/);
    expect(lanes.l3).toMatch(/^fold-\d+-3$/);
    expect(lanes.chunkLanes[2]).toBe(lanes.l2);
    expect(lanes.chunkLanes[3]).toBe(lanes.l2);
    expect(p).toContain(`ctx run .contexture/ctx lane create fc-unit ${lanes.l1}`);
    expect(p).toContain(`ctx run .contexture/ctx unit fold fc-unit --lane=${lanes.l1}`);
    expect(p).toContain('ctx run .contexture/ctx unit record fc-unit');
  });

  it('FC2b [the-record-r15]: the plan and the progress print the one line ctx lane create command; run through sh, it creates the lane with the boundary rule and a fetch step in its recipe', async () => {
    const sb = fresh(await at('fixture'));
    const p = (await must(fold(sb))).stdout;
    const { l1 } = readPlan(sb, p);
    const command = p.split('\n').map((l) => l.trim()).find((l) => l.startsWith(`.contexture/ctx run .contexture/ctx lane create fc-unit ${l1} `)) ?? '';
    expect(command).not.toMatch(/[$`]/);
    expect((command.match(/"/g) ?? []).length).toBe(2 * (command.match(/ --[a-z]+="/g) ?? []).length);
    const progress = (await must(fold(sb))).stdout;
    expect(progress).toContain(`NEXT: create lane ${l1} with this command, then fetch it:\n  ${command}\n`);
    expect((await exec('sh', ['-c', command], { cwd: sb })).code).toBe(0);
    const recipe = (await must(lane(sb, 'show', 'fc-unit', l1, 'recipe'))).stdout;
    expect(recipe).toContain('never use /tmp or any path outside the workspace');
    expect(recipe).toContain('a harness permission prompt for a path outside the workspace is the signal to stop and report, never an ask to reach');
    expect(recipe).toMatch(new RegExp(`^ {2}\\d+\\. .*ctx unit fold fc-unit --lane=${l1}`, 'm'));
    expect(recipe).toContain('\n  BATCHES :: each consolidated entry slug, the chunks it covers, and its constituent count\n  OPEN :: any refusal or defect met, with its command and output\n');
    expect(recipe).toContain("\n  4. write scope: no file edit and no commit; record writes: one consolidated entry per batch through ctx unit record fc-unit, and a superseding entry when the check names a defect; the consolidated and superseding entries are granted to this lane over the general rule that a subagent never writes the unit's record\n");
    expect((await must(fold(sb))).stdout).toContain(`NEXT: fetch lane ${l1}:\n`);
  });

  it('FC3: a lane fetch hands the next chunk alone with its hint and never advances; a lane the plan does not name refuses', async () => {
    const sb = fresh(await at('planned'));
    const { l1 } = plan(sb);
    const before = (await unit(sb, 'board', 'fc-unit')).stdout;
    const r = await fold(sb, `--lane=${l1}`);
    expect(r.code).toBe(0);
    const f = r.stdout + r.stderr;
    for (const line of [`position: chunk 1 of 6; lane ${l1}`, 'NEXT BATCH: chunk 1 of the plan', 'CHUNK 1/6 [A1] ANCHOR', 'Initial kickoff event', 'Open thread', 'Just a note', `YOUR CHUNKS IN THIS PLAN (lane ${l1})`, 'The fetch hands one chunk at a time', 'ctx run .contexture/ctx unit record fc-unit', `ref="journal#${D}-fc-01"`, `closes="${D}-fc-01 (folded: consolidated)"`]) expect(f).toContain(line);
    expect(f).toMatch(/chunk 1 \[A1\] ANCHOR: .* \[next\]/);
    expect(f).not.toContain('REMAINING ENTRIES');
    expect((await unit(sb, 'board', 'fc-unit')).stdout).toBe(before);
    const wrong = await fold(sb, '--lane=fold-nope');
    expect(wrong.code).toBe(1);
    expect(wrong.stderr).toContain('not assigned');
  });

  it('FC4: the batch is one ordinary receipt entry with a ref per constituent and a folded closer per non-thread one; the boundary hands the next lane', async () => {
    const sb = fresh(await at('planned'));
    const { l1, l2 } = plan(sb);
    const slug = await foldRecord(sb, 'batch1');
    expect(slug).toMatch(/^\d{4}-\d{2}-\d{2}-event-/);
    const show = (await unit(sb, 'entry', 'show', 'fc-unit', slug)).stdout;
    expect(show).toContain('WHAT: "Batch one');
    expect(show).toMatch(/^ {2}GROUP: fc$/m);
    expect(show).toMatch(/^ {2}THREAD: none$/m);
    expect(show.split('\n').filter((l) => l.startsWith('  REF:'))).toHaveLength(4);
    expect(show.split('\n').filter((l) => l.startsWith('  CLOSES:'))).toHaveLength(2);
    expect(show).toContain(`CLOSES: ${D}-fc-01 (folded: consolidated)`);
    expect(show).not.toContain(`CLOSES: ${D}-fc-02`);
    const b = await fold(sb, `--lane=${l1}`);
    expect(b.code).toBe(0);
    for (const line of [`LANE BOUNDARY: lane ${l1} is done; the next lane is ${l2}`, `# Consolidation fold lane: ${l2}`, `ctx run .contexture/ctx lane create fc-unit ${l2}`, `ctx run .contexture/ctx unit fold fc-unit --lane=${l2}`]) expect(b.stdout).toContain(line);
    expect(b.stdout).not.toContain('CHUNK 2/6');
  });

  it('FC5: the second lane fetches chunk 2, merges in chunk 3 only by --merge, then reaches its boundary', async () => {
    const sb = fresh(await at('batch1'));
    const { l2, l3 } = plan(sb);
    const f = (await must(fold(sb, `--lane=${l2}`))).stdout;
    for (const line of ['NEXT BATCH: chunk 2', 'CHUNK 2/6 [A2] TASK_DONE', `${D}-fc-04`]) expect(f).toContain(line);
    expect(f).toMatch(/chunk 3 \[A2\] TAIL: .* \[open\]/);
    expect(f).not.toContain('CHUNK 3/6');
    const m = (await must(fold(sb, `--lane=${l2}`, '--merge'))).stdout;
    for (const line of ['CHUNK 3/6 [A2] TAIL', `${D}-fc-05`, 'MERGE: the only merge partner is the immediately following chunk 3']) expect(m).toContain(line);
    await foldRecord(sb, 'batch2');
    const next = (await must(fold(sb, `--lane=${l2}`))).stdout;
    expect(next).toContain('NEXT BATCH: chunk 3');
    expect(next).not.toContain('LANE BOUNDARY');
    await foldRecord(sb, 'batch3');
    const b = (await must(fold(sb, `--lane=${l2}`))).stdout;
    expect(b).toContain(`LANE BOUNDARY: lane ${l2} is done; the next lane is ${l3}`);
    expect(b).toContain(`# Consolidation fold lane: ${l3}`);
  });

  it('FC6: the third lane merges chunks 4 and 5 in one batch, then chunk 6 ends the plan naming the check and the finish', async () => {
    const sb = fresh(await at('batch3'));
    const { l3 } = plan(sb);
    const f = (await must(fold(sb, `--lane=${l3}`))).stdout;
    expect(f).toContain('NEXT BATCH: chunk 4');
    expect(f).toMatch(/chunk 5 \[A3\] DECIDE: .* \[open\]/);
    expect(f).not.toContain('CHUNK 5/6');
    const m = (await must(fold(sb, `--lane=${l3}`, '--merge'))).stdout;
    expect(m).toContain('CHUNK 5/6 [A3] DECIDE');
    expect(m).not.toContain('CHUNK 6/6');
    await foldRecord(sb, 'batch45');
    const after = (await must(fold(sb, `--lane=${l3}`))).stdout;
    expect(after).toContain('NEXT BATCH: chunk 6');
    expect(after).toMatch(/chunk 4 \[A3\] RELEASE: .* \[done\]/);
    expect(after).toMatch(/chunk 5 \[A3\] DECIDE: .* \[done\]/);
    await foldRecord(sb, 'batch6');
    const end = (await must(fold(sb, `--lane=${l3}`))).stdout;
    for (const line of [`LANE BOUNDARY: lane ${l3} is done; all 6 chunks are consolidated`, 'ctx run .contexture/ctx unit fold fc-unit --check', 'ctx run .contexture/ctx unit fold fc-unit --finish']) expect(end).toContain(line);
  });

  it('FC7: the check proves the batches partition the scope with the carried thread live and the audit clean; the progress derives it', async () => {
    const sb = fresh(await at('batch6'));
    const c = await fold(sb, '--check');
    expect(c.code).toBe(0);
    for (const line of ['batches: 5 (5 valid)', 'chunks 1-1', 'chunks 2-2', 'chunks 3-3', 'chunks 4-5 (2 entries)', 'chunks 6-6', 'external refs:', 'lanes/fc-unit/report', 'covered: 7 closed receipts', 'carried open threads: 1', `${D}-fc-02: the human's answer`, 'OPEN THREADS (awaiting resolution):', `${D}-fc-02 (the human's answer)`, 'coverage: 0 uncovered', 'audit: clean', 'fold check: clean']) expect(c.stdout).toContain(line);
    const p = await fold(sb);
    expect(p.code).toBe(0);
    for (const line of ['position: all 6 chunks are consolidated', 'batches: 5', 'carried: 1 open threads']) expect(p.stdout).toContain(line);
  });

  it('FC8: the finish writes one receipt closing the fold start done, the constituents leave the board, the carried thread stays; a second finish writes nothing', async () => {
    const sb = fresh(await at('batch6'));
    const { start } = plan(sb);
    const r = await fold(sb, '--finish');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(new RegExp(`^FOLD FINISH v4 ${start} batches=5 covered=7 carried=1 open threads :: coverage zero; audit clean`, 'm'));
    for (const line of [`fold start: ${start} closed (done: the v4 consolidation fold complete)`, 'coverage: 0 uncovered', 'carried: 1 open threads stay live', 'OPEN THREADS (awaiting resolution):', 'audit: clean']) expect(r.stdout).toContain(line);
    const receipt = /^receipt: (\S+)/m.exec(r.stdout)?.[1] ?? '';
    expect(receipt).toMatch(/^\d{4}-\d{2}-\d{2}-event-/);
    const closure = await unit(sb, 'entry', 'closure', 'fc-unit', start);
    expect(closure.code).toBe(0);
    expect(closure.stdout).toContain('closed (done)');
    const board = (await unit(sb, 'board', 'fc-unit')).stdout;
    expect(board).toContain(`@entry ${receipt}`);
    for (const s of ['01', '03', '04', '05', '06', '07', '09']) expect(board).not.toContain(`@entry ${D}-fc-${s}`);
    expect(board).toContain(`@entry ${D}-fc-02`);
    expect(board).toContain("THREAD: the human's answer");
    expect(board).not.toMatch(new RegExp(`^@entry ${start}$`, 'm'));
    expect(board).not.toContain('CHAPTER FOLD');
    const audit = await unit(sb, 'audit', 'fc-unit');
    expect(audit.code).toBe(0);
    expect(audit.stdout).toContain('OPEN THREADS (awaiting resolution):');
    expect(audit.stdout).toContain(`${D}-fc-02 (the human's answer)`);
    const entries = board.split('\n').filter((l) => l.startsWith('@entry')).length;
    const again = await fold(sb, '--finish');
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('already complete; no second receipt');
    expect((await unit(sb, 'board', 'fc-unit')).stdout.split('\n').filter((l) => l.startsWith('@entry')).length).toBe(entries);
  });
});
