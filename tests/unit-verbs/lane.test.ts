import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { launch } from '../support/exec';
import { artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { lane, must, run, seedUnit, unit } from '../support/unit';

const D = '2026-09-27';
const RECIPE = '# recipe grammar\nblocks at column 0; fields indent 2;\nMISSION\n  GOAL: "lane test subagent"\n';
const FIDELITY = '# fidelity\n\nA1 :: printf \'@task x\\n  STATUS: TODO\\n\' | ctx x\ncols\tsplit by a tab\n"a", "b" quote-comma\nends in a backslash \\\nlast line\n';
const written = (u: string, l: string, body: string): string => `lane report written: ${l} in ${u} (${Buffer.byteLength(body)} bytes)\n`;
const report = (sb: string, u: string, l: string, input: string) => run(sb, ['lane', 'report', u, l], { input });

describe.concurrent('ctx lane: create, record, report, show', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'sem-unit', 'semantic interface test');
      await must(run(sb, ['lane', 'create', 'sem-unit', 'sub-lane'], { input: RECIPE }));
      await seedUnit(sb, 'x-unit', 'defect regression unit');
      await must(run(sb, ['lane', 'create', 'x-unit', 'x-lane'], { input: '# recipe grammar\nMISSION\n  GOAL: "x lane"\n' }));
      await must(lane(sb, 'record', 'x-unit', 'x-lane', '--what=First lane event', `--slug=${D}-x-l1`));
    }, 'posix', 'lane');
  });

  it('E-14: lane create takes the recipe on stdin; an existing lane or an empty recipe refuses rc 1', async () => {
    const sb = fresh(sb0);
    expect((await run(sb, ['lane', 'create', 'sem-unit', 'new-lane'], { input: RECIPE })).code).toBe(0);
    const again = await run(sb, ['lane', 'create', 'sem-unit', 'sub-lane'], { input: 'again\n' });
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('ERR_ENTITY_EXISTS');
    expect((await lane(sb, 'create', 'sem-unit', 'empty-lane')).code).toBe(1);
    expect((await lane(sb, 'show', 'sem-unit', 'sub-lane', 'recipe')).stdout).toContain('lane test subagent');
  });

  it('E-14: lane record lands in the lane journal and never in the unit journal', async () => {
    const sb = fresh(sb0);
    expect((await lane(sb, 'record', 'sem-unit', 'sub-lane', '--what=lane event 1')).code).toBe(0);
    expect((await lane(sb, 'show', 'sem-unit', 'sub-lane', 'journal')).stdout).toContain('lane event 1');
    expect((await unit(sb, 'entry', 'list', 'sem-unit')).stdout).not.toContain('lane event 1');
  });

  it('E-14: a --body report reads back; a stdin report reads back byte for byte through report and show, the write printing one line with its size', async () => {
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

  it('X-d: a repeated lane entry slug refuses ERR_ENTITY_EXISTS; the journal reads back as stored with headers and THREAD lines', async () => {
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

  it.for(['', 'true', 'false'])('X-d E5-T: lane record --thread="%s" refuses naming the THREAD shape and nothing lands', async (thread) => {
    const sb = fresh(sb0);
    const r = await lane(sb, 'record', 'x-unit', 'x-lane', '--what=E5-T bad thread', `--thread=${thread}`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`THREAD malformed: [${thread}]`);
    expect((await lane(sb, 'show', 'x-unit', 'x-lane', 'journal')).stdout).not.toContain('E5-T bad thread');
  });

  it('X-d F6: a --body report reads back through the empty stdin read; the stdin write echo carries no JSON tail', async () => {
    const sb = fresh(sb0);
    await must(lane(sb, 'report', 'x-unit', 'x-lane', '--body=report by the body flag'));
    const read = await report(sb, 'x-unit', 'x-lane', '');
    expect(read.stdout + read.stderr).toBe('report by the body flag\n');
    const echo = await report(sb, 'x-unit', 'x-lane', '# x report\n\n@claim x1\n  VERDICT: "from stdin"\n');
    expect(echo.stdout + echo.stderr).not.toContain('"}');
  });

  it('X-p: a 2 MB lane report lands through the verb and reads back byte for byte', async () => {
    const sb = fresh(sb0);
    const big = Array.from({ length: 26000 }, (_, i) => `line ${String(i + 1).padStart(6, '0')} of the big report, eighty bytes wide, padded to width ....\n`).join('');
    expect((await report(sb, 'x-unit', 'x-lane', big)).code).toBe(0);
    expect((await report(sb, 'x-unit', 'x-lane', '')).bytes.equals(Buffer.from(big))).toBe(true);
  });

  it('UP-c: a recipe line ending in a carriage return keeps the byte in lane show and in the posix file', async () => {
    const sb = fresh(sb0);
    await must(run(sb, ['lane', 'create', 'sem-unit', 'up-cr'], { input: '# recipe grammar\r\nMISSION\n  GOAL: "a CRLF recipe"\n' }));
    expect((await lane(sb, 'show', 'sem-unit', 'up-cr', 'recipe')).stdout.split('\n').filter((l) => l.endsWith('\r'))).toHaveLength(1);
    expect(readFileSync(artifactPath(sb, 'sem-unit', 'lane/up-cr/recipe'), 'utf8').split('\n').filter((l) => l.endsWith('\r'))).toHaveLength(1);
  });

  it('the-record-r17: lane show exits under a stdin held open, while lane report without --body waits on it', async () => {
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
