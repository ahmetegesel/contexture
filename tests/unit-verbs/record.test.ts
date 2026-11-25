import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { must, plantRhythms, rhythm, run, seedUnit, unit } from '../support/unit';

const D = '2026-09-27';
const FORM = 'takes <slug> (<verdict>: <reason>) with a verdict of done, superseded, dropped, folded, harvested, or discarded and a non-empty reason';
const closesLine = async (sb: string, slug: string): Promise<string | undefined> => (await unit(sb, 'entry', 'show', 'cl-unit', slug)).stdout.split('\n').find((l) => l.startsWith('  CLOSES: '));
const LANDED = 'unit#kv-unit/finding/KV_LANDED';
const flagRefusal = (slug: string, verdict: string): string =>
  `entry.record: error: closer target ${slug} carries KNOWLEDGE: true; close it harvested (with a --ref to the finding it landed) or discarded, not ${verdict} (ERR_INVALID_ARGUMENT)\n`;
const HARVEST_REFUSAL = 'entry.record: error: a harvested closer needs a --ref naming the finding it landed, unit#<unit>/finding/<NAME> (ERR_INVALID_ARGUMENT)\n';
const closeReason = async (sb: string, slug: string): Promise<string | null> => JSON.parse((await unit(sb, 'entry', 'show', 'kv-unit', slug, '--json')).stdout).entry.close_reason;

describe.concurrent('ctx unit record and the entry reads', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      plantRhythms(sb);
      await seedUnit(sb, 'rh-unit', 'rhythm resolution unit');
      await seedUnit(sb, 'cl-unit', 'closer unit');
      for (const t of ['a', 'b', 'c']) await must(unit(sb, 'record', 'cl-unit', `--what=closer target ${t}`, `--slug=${D}-cl-${t}`));
      await seedUnit(sb, 'x-unit', 'defect regression unit');
      await must(unit(sb, 'record', 'x-unit', '--what=Resolvable entry', `--slug=${D}-x-e1`));
      await seedUnit(sb, 'n-unit', 'new verbs unit');
      await must(unit(sb, 'record', 'n-unit', '--what=closure target', `--slug=${D}-n-t`));
      await must(unit(sb, 'record', 'n-unit', '--what=open entry', `--slug=${D}-n-o`));
      await must(unit(sb, 'record', 'n-unit', '--what=closes the target', `--slug=${D}-n-c`, `--closes=${D}-n-t (folded: into the closer)`));
      await seedUnit(sb, 'kv-unit', 'knowledge verdict unit');
      for (const t of ['f1', 'f2']) await must(unit(sb, 'record', 'kv-unit', `--what=flagged ${t}`, '--knowledge', `--slug=${D}-kv-${t}`));
      await must(unit(sb, 'record', 'kv-unit', '--what=plain entry', `--slug=${D}-kv-p`));
      await must(unit(sb, 'finding', 'add', 'kv-unit', 'KV_LANDED', '--summary=the landed harvest'));
    }, 'posix', 'record');
  });

  it('RH: an extension-root rhythm records and stamps; a wrong gate refuses naming the gate the rhythm reads', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'record', 'rh-unit', '--what=the extension rhythm resolves', '--rhythm=extprobe 1 OPEN')).code).toBe(0);
    expect((await unit(sb, 'board', 'rh-unit')).stdout).toContain('RHYTHM: extprobe 1 OPEN');
    const wrong = await unit(sb, 'record', 'rh-unit', '--what=the wrong gate refuses', '--rhythm=probe 1 WRONG');
    expect(wrong.code).toBe(1);
    expect(wrong.stderr).toContain('RHYTHM step 1 of probe reads OPEN, not WRONG');
  });

  it('RH: the workspace copy of a rhythm shadows the extension root; a missing rhythm refuses naming both roots', async () => {
    const sb = fresh(sb0);
    const shadow = join(sb, '.contexture/rhythms/extprobe.md');
    writeFileSync(shadow, rhythm('extprobe', 'the suite needs a shadow copy', [['SHADOW', 'the workspace shadow gate'], ['CLOSE', 'the workspace shadow close gate']]));
    expect((await unit(sb, 'record', 'rh-unit', '--what=the workspace copy shadows', '--rhythm=extprobe 1 SHADOW')).code).toBe(0);
    const shadowed = await unit(sb, 'record', 'rh-unit', '--what=the shadow refuses the extension gate', '--rhythm=extprobe 1 OPEN');
    expect(shadowed.code).toBe(1);
    expect(shadowed.stderr).toContain('RHYTHM step 1 of extprobe reads SHADOW, not OPEN');
    unlinkSync(shadow);
    const missing = await unit(sb, 'record', 'rh-unit', '--what=a missing rhythm refuses', '--rhythm=nosuch 1 OPEN');
    expect(missing.code).toBe(1);
    expect(missing.stderr).toContain('ERROR: no such rhythm: nosuch (ctx rhythm list names them)');
  });

  it('S1-d [the-record-r6, the-record-r11]: a repeated record slug is refused', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'record', 'cl-unit', '--what=first', `--slug=${D}-twice`)).code).toBe(0);
    expect((await unit(sb, 'record', 'cl-unit', '--what=second', `--slug=${D}-twice`)).code).toBe(1);
  });

  it('C [the-record-r3, the-record-r4, the-record-r5]: one closer names two targets with a caller verdict kept verbatim; board drops both, entry show reads the second closed', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'record', 'cl-unit', '--what=closes two', `--slug=${D}-cl-d`, `--closes=${D}-cl-a ${D}-cl-b (folded: two at once)`)).code).toBe(0);
    expect(await closesLine(sb, `${D}-cl-d`)).toBe(`  CLOSES: ${D}-cl-a ${D}-cl-b (folded: two at once)`);
    expect((await unit(sb, 'record', 'cl-unit', '--what=bad', `--closes=${D}-cl-d ${D}-cl-nosuch (done: x)`)).code).toBe(1);
    const board = (await unit(sb, 'board', 'cl-unit')).stdout;
    expect(board).not.toContain(`@entry ${D}-cl-b`);
    expect(board).toContain(`@entry ${D}-cl-d`);
    const shown = (await unit(sb, 'entry', 'show', 'cl-unit', `${D}-cl-b`, '--json')).stdout;
    expect(shown).toContain('"closed":true');
    expect(shown).toContain(`"closed_by":"${D}-cl-d"`);
    expect(shown).toContain('"close_reason":"folded: two at once"');
  });

  it('C E3-5 [the-record-r5]: a bare --closes or --supersedes and a reason holding a parenthesis refuse naming the explicit form, nothing written', async () => {
    const sb = fresh(sb0);
    const bare = await unit(sb, 'record', 'cl-unit', '--what=closes one', `--slug=${D}-cl-e`, `--closes=${D}-cl-c`);
    expect(bare.code).toBe(1);
    expect(bare.stderr).toMatch(/^record: error: --closes takes <slug> \(<verdict>: <reason>\)/m);
    expect(bare.stderr).toMatch(/\(ERR_INVALID_ARGUMENT\)$/m);
    expect((await unit(sb, 'entry', 'show', 'cl-unit', `${D}-cl-e`)).code).toBe(1);
    const sup = await unit(sb, 'record', 'cl-unit', '--what=supersedes one', `--supersedes=${D}-cl-c`);
    expect(sup.code).toBe(1);
    expect(sup.stderr).toMatch(/^record: error: --supersedes takes <slug> \(<verdict>: <reason>\)/m);
    const nested = await unit(sb, 'record', 'cl-unit', '--what=nested', `--closes=${D}-cl-c (done: a (nested) reason)`);
    expect(nested.code).toBe(1);
    expect(nested.stderr).toContain('a closer reason holds no parenthesis');
  });

  it.for([`${D}-cl-c (a reason without a verdict)`, `${D}-cl-c (finished: an unknown verdict)`, `${D}-cl-c (done: )`, `${D}-cl-c (done: open`])('C E3-5 [the-record-r5]: --closes=%s refuses naming the explicit form', async (closer) => {
    const r = await unit(fresh(sb0), 'record', 'cl-unit', '--what=bad closer', `--closes=${closer}`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(FORM);
  });

  it('C E3-5 [the-record-r4, the-record-r5]: the explicit form lands and the closer carries its own reason, never the WHAT', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'record', 'cl-unit', '--what=closes one (a WHAT with parentheses)', `--slug=${D}-cl-e`, `--closes=${D}-cl-c (done: the resolution)`)).code).toBe(0);
    expect(await closesLine(sb, `${D}-cl-e`)).toBe(`  CLOSES: ${D}-cl-c (done: the resolution)`);
  });

  it('C E3-5 [the-record-r4, the-record-r5]: harvested and discarded land on --closes and --supersedes and read back as close_reason <verdict>: <reason>; an empty reason refuses naming the explicit form', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'record', 'kv-unit', '--what=discards a flag', `--closes=${D}-kv-f1 (discarded: fails the bar)`));
    await must(unit(sb, 'record', 'kv-unit', '--what=harvests a flag', `--ref=${LANDED}`, `--supersedes=${D}-kv-f2 (harvested: landed as KV_LANDED)`));
    expect(await closeReason(sb, `${D}-kv-f1`)).toBe('discarded: fails the bar');
    expect(await closeReason(sb, `${D}-kv-f2`)).toBe('harvested: landed as KV_LANDED');
    for (const flag of [`--closes=${D}-kv-p (harvested: )`, `--supersedes=${D}-kv-p (discarded: )`]) {
      const r = await unit(sb, 'record', 'kv-unit', '--what=an empty reason', `--ref=${LANDED}`, flag);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain(FORM);
    }
  });

  it.for([
    { kind: 'closes', closer: `${D}-kv-f1 (done: resolved)`, target: `${D}-kv-f1`, verdict: 'done' },
    { kind: 'supersedes', closer: `${D}-kv-f1 (superseded: replaced)`, target: `${D}-kv-f1`, verdict: 'superseded' },
    { kind: 'closes', closer: `${D}-kv-p ${D}-kv-f2 (dropped: both at once)`, target: `${D}-kv-f2`, verdict: 'dropped' },
    { kind: 'supersedes', closer: `${D}-kv-f2 ${D}-kv-p (folded: both at once)`, target: `${D}-kv-f2`, verdict: 'folded' },
  ])('C E3-5 [the-record-r-9rk9q]: --$kind=$closer on a live KNOWLEDGE-flagged target refuses rc 1 in the entry.record form naming the target and the verdict, stdout empty, nothing written', async ({ kind, closer, target, verdict }) => {
    const sb = fresh(sb0);
    const before = (await unit(sb, 'entry', 'list', 'kv-unit', '--json')).stdout;
    const r = await unit(sb, 'record', 'kv-unit', '--what=closes a flag', `--${kind}=${closer}`);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', flagRefusal(target, verdict)]);
    expect((await unit(sb, 'entry', 'list', 'kv-unit', '--json')).stdout).toBe(before);
  });

  it('C E3-5 [the-record-r-9rk9q]: a later closer line naming a live flagged target refuses the whole entry, the earlier line unwritten', async () => {
    const sb = fresh(sb0);
    const before = (await unit(sb, 'entry', 'list', 'kv-unit', '--json')).stdout;
    const r = await unit(sb, 'record', 'kv-unit', '--what=two closer lines', `--closes=${D}-kv-p (done: fine)`, `--supersedes=${D}-kv-f1 (done: gone)`);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', flagRefusal(`${D}-kv-f1`, 'done')]);
    expect((await unit(sb, 'entry', 'list', 'kv-unit', '--json')).stdout).toBe(before);
    expect(await closeReason(sb, `${D}-kv-p`)).toBeNull();
  });

  it('C E3-5 [the-record-r-9rk9q]: a flagged occurrence already closed harvested or discarded takes any later verdict', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'record', 'kv-unit', '--what=harvests a flag', `--ref=${LANDED}`, `--closes=${D}-kv-f1 (harvested: landed as KV_LANDED)`));
    await must(unit(sb, 'record', 'kv-unit', '--what=supersedes it later', `--supersedes=${D}-kv-f1 (done: a later word)`));
    await must(unit(sb, 'record', 'kv-unit', '--what=discards a flag', `--closes=${D}-kv-f2 (discarded: fails the bar)`));
    await must(unit(sb, 'record', 'kv-unit', '--what=drops it later', `--closes=${D}-kv-f2 (dropped: a later word)`));
    expect(await closeReason(sb, `${D}-kv-f1`)).toBe('harvested: landed as KV_LANDED');
  });

  it.for([
    { label: 'no REF', closer: `${D}-kv-f1 (harvested: landed)`, refs: [] as string[] },
    { label: 'no REF on an unflagged target', closer: `${D}-kv-p (harvested: landed)`, refs: [] as string[] },
    { label: 'an entry REF alone', closer: `${D}-kv-f1 (harvested: landed)`, refs: [`--ref=unit#kv-unit/entry/${D}-kv-p`] },
  ])('C E3-5 [the-record-r-9rk9q]: a harvested closer with $label refuses rc 1 in the entry.record form naming the finding REF need, nothing written', async ({ closer, refs }) => {
    const sb = fresh(sb0);
    const before = (await unit(sb, 'entry', 'list', 'kv-unit', '--json')).stdout;
    const r = await unit(sb, 'record', 'kv-unit', '--what=harvests', ...refs, `--closes=${closer}`);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', HARVEST_REFUSAL]);
    expect((await unit(sb, 'entry', 'list', 'kv-unit', '--json')).stdout).toBe(before);
  });

  it.for(['done', 'superseded', 'dropped', 'folded', 'harvested', 'discarded'])('C E3-5 [the-record-r5]: an unflagged target takes the verdict %s', async (verdict) => {
    const sb = fresh(sb0);
    await must(unit(sb, 'record', 'kv-unit', '--what=closes the plain entry', `--ref=${LANDED}`, `--closes=${D}-kv-p (${verdict}: a ${verdict} word)`));
    expect(await closeReason(sb, `${D}-kv-p`)).toBe(`${verdict}: a ${verdict} word`);
  });

  it('C E3-5 [the-record-r5, the-record-r-9rk9q]: the record help lists the six verdicts and states the flagged rule and the finding REF rule', async () => {
    const help = (await unit(fresh(sb0), 'record', '--help')).stdout;
    expect(help).toContain('the verdict done, superseded, dropped, folded, harvested, or discarded');
    expect(help).toContain('a closer naming a target whose live (unclosed) occurrence carries KNOWLEDGE: true takes only the verdict harvested or discarded');
    expect(help).toContain('a harvested closer needs a --ref naming the finding it landed, unit#<unit>/finding/<NAME>');
  });

  it('E-9: record takes the typed flags and injects the date prefix and the active anchor', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'record', 'x-unit', '--what=event recorded via flags', '--group=dev', '--thread=review')).code).toBe(0);
    const board = (await unit(sb, 'board', 'x-unit')).stdout;
    expect(board).toContain('WHAT: "event recorded via flags"');
    expect(board).toContain('GROUP: dev');
    expect(board).toContain('THREAD: review');
    expect(board).toContain('ANCHOR: A1');
    const lines = board.split('\n');
    const at = lines.findIndex((l) => l.includes('WHAT: "event recorded via flags"'));
    expect(lines.slice(0, at).reverse().find((l) => l.startsWith('@entry '))).toMatch(/^@entry \d{4}-\d{2}-\d{2}-event-/);
  });

  it('E-10 [the-engine-r16]: a raw @entry block on stdin is retired, refused rc 1; the same entry lands through the typed flags', async () => {
    const sb = fresh(sb0);
    const raw = await run(sb, ['unit', 'record', 'x-unit'], { input: `@entry ${D}-piped-event\n  WHAT: "piped event content"\n  THREAD: none\n` });
    expect(raw.code).toBe(1);
    expect((await unit(sb, 'entry', 'show', 'x-unit', `${D}-piped-event`)).code).toBe(1);
    expect((await unit(sb, 'record', 'x-unit', '--what=piped event content', `--slug=${D}-piped-event`)).code).toBe(0);
    expect((await unit(sb, 'entry', 'show', 'x-unit', `${D}-piped-event`)).stdout).toContain('piped event content');
  });

  it('E-13 and R-f: entry list and entry show read the entries; a missing slug refuses rc 1', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'entry', 'list', 'x-unit')).stdout).toContain('Resolvable entry');
    expect((await unit(sb, 'entry', 'show', 'x-unit', `${D}-x-e1`)).stdout).toContain(`@entry ${D}-x-e1`);
    expect((await unit(sb, 'entry', 'show', 'x-unit', '2026-01-01-no-such-slug')).code).toBe(1);
  });

  it('X-i [the-record-r6, the-record-r11]: record --slug of an existing entry refuses; the first stays the only one', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'record', 'x-unit', '--what=Repeated slug', `--slug=${D}-x-e1`)).code).toBe(1);
    expect((await unit(sb, 'entry', 'show', 'x-unit', `${D}-x-e1`, '--json')).stdout).toContain('"what":"Resolvable entry"');
  });

  it('X-n: entry list --group and --anchor filter, in the text and --json views', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'record', 'x-unit', '--what=Grouped entry', '--group=x-grp', `--slug=${D}-x-g1`));
    const grouped = (await unit(sb, 'entry', 'list', 'x-unit', '--group=x-grp')).stdout;
    expect(grouped).toContain(`${D}-x-g1: Grouped entry`);
    expect(grouped).not.toContain(`${D}-x-e1`);
    expect((await unit(sb, 'entry', 'list', 'x-unit', '--group=x-grp', '--json')).stdout).not.toContain(`${D}-x-e1`);
    await must(unit(sb, 'stamp', 'x-unit'));
    await must(unit(sb, 'record', 'x-unit', '--what=After the stamp', `--slug=${D}-x-a2`));
    const anchored = (await unit(sb, 'entry', 'list', 'x-unit', '--anchor=A2')).stdout;
    expect(anchored).toContain(`${D}-x-a2: After the stamp`);
    expect(anchored).not.toContain(`${D}-x-g1`);
  });

  it('RF2 [the-record-r14]: entry show --json carries the refs list after thread (empty when none); the text view prints the REF line', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'record', 'x-unit', '--what=entry with a ref', `--slug=${D}-f-e1`, '--ref=file#.contexture/ctx'));
    const withRef = (await unit(sb, 'entry', 'show', 'x-unit', `${D}-f-e1`, '--json')).stdout;
    expect(withRef).toContain('"thread":"none","legacy_status":null,"refs":["file#.contexture/ctx"]');
    expect((await unit(sb, 'entry', 'show', 'x-unit', `${D}-x-e1`, '--json')).stdout).toContain('"refs":[]');
    const text = (await unit(sb, 'entry', 'show', 'x-unit', `${D}-f-e1`)).stdout.split('\n');
    expect([text[0], text[2], text[3]]).toEqual([`@entry ${D}-f-e1`, '  WHAT: "entry with a ref"', '  THREAD: none']);
    expect(text).toContain('  REF: "file#.contexture/ctx"');
  });

  it('N-a [the-record-r4]: entry closure prints the verdict and the closer, for a closed, an open, and an absent entry, and as --json', async () => {
    const sb = fresh(sb0);
    const closed = await unit(sb, 'entry', 'closure', 'n-unit', `${D}-n-t`);
    expect(closed.code).toBe(0);
    const lines = closed.stdout.split('\n');
    expect(lines[0]).toBe(`closure n-unit ${D}-n-t: closed (folded)`);
    expect([lines[2], lines[3]]).toEqual([`closer ${D}-n-c (A1)`, `  CLOSES: ${D}-n-t (folded: into the closer)`]);
    const open = await unit(sb, 'entry', 'closure', 'n-unit', `${D}-n-o`);
    expect(open.stdout + open.stderr).toBe(`closure n-unit ${D}-n-o: open\n`);
    expect((await unit(sb, 'entry', 'closure', 'n-unit', `${D}-n-missing`)).code).toBe(1);
    expect((await unit(sb, 'entry', 'closure', 'n-unit', `${D}-n-t`, '--json')).stdout).toContain(`"closed":true,"closers":[{"by":"${D}-n-c","by_anchor":"A1","closer":{"kind":"CLOSES"`);
  });

  it('N-a [the-record-r4]: entry closure prints closed (harvested) and closed (discarded) with the closer line', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'record', 'kv-unit', '--what=harvests a flag', `--slug=${D}-kv-h`, `--ref=${LANDED}`, `--closes=${D}-kv-f1 (harvested: landed as KV_LANDED)`));
    const lines = (await unit(sb, 'entry', 'closure', 'kv-unit', `${D}-kv-f1`)).stdout.split('\n');
    expect([lines[0], lines[2], lines[3]]).toEqual([`closure kv-unit ${D}-kv-f1: closed (harvested)`, `closer ${D}-kv-h (A1)`, `  CLOSES: ${D}-kv-f1 (harvested: landed as KV_LANDED)`]);
    await must(unit(sb, 'record', 'kv-unit', '--what=discards a flag', `--supersedes=${D}-kv-f2 (discarded: fails the bar)`));
    expect((await unit(sb, 'entry', 'closure', 'kv-unit', `${D}-kv-f2`)).stdout.split('\n')[0]).toBe(`closure kv-unit ${D}-kv-f2: closed (discarded)`);
  });

  it.for(['', 'true', 'false'])('[the-record-r7] ctx unit record --thread="%s" refuses rc 1 before any write', async (thread) => {
    const sb = fresh(sb0);
    const before = (await unit(sb, 'entry', 'list', 'x-unit', '--json')).stdout;
    const r = await unit(sb, 'record', 'x-unit', '--what=bad thread', `--thread=${thread}`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`THREAD malformed: [${thread}]`);
    expect((await unit(sb, 'entry', 'list', 'x-unit', '--json')).stdout).toBe(before);
  });
});

