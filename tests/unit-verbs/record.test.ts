import { unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { must, plantRhythms, rhythm, run, seedUnit, unit } from '../support/unit';

const D = '2026-09-27';
const FORM = 'takes <slug> (<verdict>: <reason>) with a verdict of done, superseded, dropped, or folded and a non-empty reason';
const closesLine = async (sb: string, slug: string): Promise<string | undefined> => (await unit(sb, 'entry', 'show', 'cl-unit', slug)).stdout.split('\n').find((l) => l.startsWith('  CLOSES: '));

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
    expect(missing.stderr).toContain('no such rhythm: nosuch (looked under .contexture/rhythms/ and .contexture/extensions/rhythms/)');
  });

  it('S1-d: a repeated record slug is refused', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'record', 'cl-unit', '--what=first', `--slug=${D}-twice`)).code).toBe(0);
    expect((await unit(sb, 'record', 'cl-unit', '--what=second', `--slug=${D}-twice`)).code).toBe(1);
  });

  it('C: one closer names two targets with a caller verdict kept verbatim; board drops both, entry show reads the second closed', async () => {
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

  it('C E3-5: a bare --closes or --supersedes and a reason holding a parenthesis refuse naming the explicit form, nothing written', async () => {
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

  it.for([`${D}-cl-c (a reason without a verdict)`, `${D}-cl-c (finished: an unknown verdict)`, `${D}-cl-c (done: )`, `${D}-cl-c (done: open`])('C E3-5: --closes=%s refuses naming the explicit form', async (closer) => {
    const r = await unit(fresh(sb0), 'record', 'cl-unit', '--what=bad closer', `--closes=${closer}`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(FORM);
  });

  it('C E3-5: the explicit form lands and the closer carries its own reason, never the WHAT', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'record', 'cl-unit', '--what=closes one (a WHAT with parentheses)', `--slug=${D}-cl-e`, `--closes=${D}-cl-c (done: the resolution)`)).code).toBe(0);
    expect(await closesLine(sb, `${D}-cl-e`)).toBe(`  CLOSES: ${D}-cl-c (done: the resolution)`);
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

  it('E-10: a raw @entry block on stdin is retired, refused rc 1; the same entry lands through the typed flags', async () => {
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

  it('X-i: record --slug of an existing entry refuses; the first stays the only one', async () => {
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

  it('RF2: entry show --json carries the refs list after thread (empty when none); the text view prints the REF line', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'record', 'x-unit', '--what=entry with a ref', `--slug=${D}-f-e1`, '--ref=knowledge#F_NOREF'));
    const withRef = (await unit(sb, 'entry', 'show', 'x-unit', `${D}-f-e1`, '--json')).stdout;
    expect(withRef).toContain('"thread":"none","legacy_status":null,"refs":["knowledge#F_NOREF"]');
    expect((await unit(sb, 'entry', 'show', 'x-unit', `${D}-x-e1`, '--json')).stdout).toContain('"refs":[]');
    const text = (await unit(sb, 'entry', 'show', 'x-unit', `${D}-f-e1`)).stdout.split('\n');
    expect([text[0], text[2], text[3]]).toEqual([`@entry ${D}-f-e1`, '  WHAT: "entry with a ref"', '  THREAD: none']);
    expect(text).toContain('  REF: "knowledge#F_NOREF"');
  });

  it('N-a: entry closure prints the verdict and the closer, for a closed, an open, and an absent entry, and as --json', async () => {
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

  it.for(['', 'true', 'false'])('[the-record-r7] ctx unit record --thread="%s" refuses rc 1 before any write', async (thread) => {
    const sb = fresh(sb0);
    const before = (await unit(sb, 'entry', 'list', 'x-unit', '--json')).stdout;
    const r = await unit(sb, 'record', 'x-unit', '--what=bad thread', `--thread=${thread}`);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(`THREAD malformed: [${thread}]`);
    expect((await unit(sb, 'entry', 'list', 'x-unit', '--json')).stdout).toBe(before);
  });
});

