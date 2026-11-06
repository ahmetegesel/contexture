import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { must, run, seedUnit, unit } from '../support/unit';

const NOFIELD = 'finding update: error: no field to update (give --summary or --ref) (ERR_INVALID_ARGUMENT)\n';
const show = async (sb: string, u: string, name: string, ...flags: string[]): Promise<string> => (await unit(sb, 'finding', 'show', u, name, ...flags)).stdout;

describe.concurrent('ctx unit finding', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'sem-unit', 'semantic interface test');
      await seedUnit(sb, 'arch-unit', 'finding lifecycle unit');
      await must(unit(sb, 'finding', 'add', 'arch-unit', 'ARCH_DECISION', '--summary=Architecture decision 1', '--ref=journal.md#event'));
      await seedUnit(sb, 'f-unit', 'shared ref fixes');
      await must(unit(sb, 'finding', 'add', 'f-unit', 'F_NOREF', '--summary=first summary'));
      await must(unit(sb, 'finding', 'add', 'f-unit', 'F_REF', '--summary=ref summary', '--ref=journal#f-old'));
      await must(unit(sb, 'finding', 'add', 'f-unit', 'F_LAST', '--summary=last summary'));
    }, 'posix', 'finding');
  });

  it('E-11a: finding add, show, and list; a summary carrying quotes and a backslash reads back verbatim', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'finding', 'add', 'sem-unit', 'ARCH_DECISION', '--summary=Architecture decision 1', '--ref=journal.md#event')).code).toBe(0);
    expect(await show(sb, 'sem-unit', 'ARCH_DECISION')).toContain('SUMMARY ::');
    expect(await show(sb, 'sem-unit', 'ARCH_DECISION', '--json')).toContain('"name":"ARCH_DECISION"');
    expect((await unit(sb, 'finding', 'add', 'sem-unit', 'QUOTED_SUMMARY', '--summary=the index ends with "index complete: N entries" and a path like C:\\tmp', '--ref=journal.md#event')).code).toBe(0);
    const list = (await unit(sb, 'finding', 'list', 'sem-unit')).stdout;
    expect(list).toMatch(/^ {2}ARCH_DECISION: /m);
    expect(list).toMatch(/^ {2}QUOTED_SUMMARY: /m);
    expect(list).toContain('ends with "index complete: N entries"');
    expect(list.split('\n').filter((l) => /^ {2}[A-Za-z0-9_-]*: /.test(l))).toHaveLength(2);
  });

  it('E-11c: finding update persists; an update with no field refuses with the one fixed line and changes nothing', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'finding', 'update', 'arch-unit', 'ARCH_DECISION', '--summary=Updated architecture decision')).code).toBe(0);
    expect(await show(sb, 'arch-unit', 'ARCH_DECISION')).toContain('Updated architecture decision');
    const raw = await run(sb, ['unit', 'finding', 'update', 'arch-unit', 'ARCH_DECISION'], { input: '@finding ARCH_DECISION\n  SUMMARY ::\n    Raw finding update.\n' });
    expect([raw.code, raw.stdout + raw.stderr]).toEqual([1, NOFIELD]);
    const empty = await unit(sb, 'finding', 'update', 'arch-unit', 'ARCH_DECISION', '--summary=');
    expect([empty.code, empty.stdout + empty.stderr]).toEqual([1, NOFIELD]);
    expect(await show(sb, 'arch-unit', 'ARCH_DECISION')).toContain('Updated architecture decision');
    const help = await unit(sb, 'finding', 'update', '--help');
    expect(help.stdout + help.stderr).toContain('no field refuses');
  });

  it('E-11c: finding supersede lists the successor; finding drop removes the finding', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'finding', 'supersede', 'arch-unit', 'ARCH_DECISION', 'ARCH_V2', '--summary=Architecture decision version 2')).code).toBe(0);
    expect((await unit(sb, 'finding', 'list', 'arch-unit')).stdout).toContain('ARCH_V2');
    expect((await unit(sb, 'finding', 'drop', 'arch-unit', 'ARCH_DECISION')).code).toBe(0);
    expect((await unit(sb, 'finding', 'show', 'arch-unit', 'ARCH_DECISION')).code).toBe(1);
  });

  it('X-c: a repeated finding NAME refuses ERR_ENTITY_EXISTS and the first stays intact', async () => {
    const sb = fresh(sb0);
    const r = await unit(sb, 'finding', 'add', 'f-unit', 'F_LAST', '--summary=Repeated');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ERR_ENTITY_EXISTS');
    expect(await show(sb, 'f-unit', 'F_LAST', '--json')).toContain('"summary":"last summary"');
  });

  it('X-j: a raw @finding block on stdin is retired, never evaluated by the shell; the typed flags land it', async () => {
    const sb = fresh(sb0);
    const raw = await run(sb, ['unit', 'finding', 'add', 'f-unit'], { input: '@finding X_RAW\n  REF: "journal#2026-09-27-x-e1"\n  SUMMARY ::\n    Raw block finding.\n' });
    expect(raw.code).toBe(1);
    expect(raw.stdout + raw.stderr).not.toContain('command not found');
    expect((await unit(sb, 'finding', 'add', 'f-unit', 'X_RAW', '--summary=Raw block finding.', '--ref=journal#2026-09-27-x-e1')).code).toBe(0);
    expect(await show(sb, 'f-unit', 'X_RAW', '--json')).toContain('"summary":"Raw block finding."');
  });

  it('X-k S8: supersede of a missing predecessor refuses and lands no successor', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'finding', 'supersede', 'f-unit', 'X_MISSING', 'X_SUCC', '--summary=Successor')).code).toBe(1);
    expect((await unit(sb, 'finding', 'show', 'f-unit', 'X_SUCC')).code).toBe(1);
  });

  it('RF1: finding update --ref adds the first REF canonical (before SUMMARY), replaces an existing one, and keeps every finding', async () => {
    const sb = fresh(sb0);
    expect((await unit(sb, 'finding', 'update', 'f-unit', 'F_NOREF', '--summary=updated summary', '--ref=journal#f-target')).code).toBe(0);
    const json = await show(sb, 'f-unit', 'F_NOREF', '--json');
    expect(json).toContain('"refs":["journal#f-target"]');
    expect(json).toContain('"summary":"updated summary"');
    expect(json).toMatch(/"next":"finding"\}\}\n?$/);
    const block = (await show(sb, 'f-unit', 'F_NOREF')).split('\n');
    expect(block.filter((l) => l.startsWith('  REF: '))).toEqual(['  REF: "journal#f-target"']);
    expect(block[1]).toBe('  REF: "journal#f-target"');
    expect((await unit(sb, 'finding', 'update', 'f-unit', 'F_LAST', '--ref=journal#f-last')).code).toBe(0);
    const last = await show(sb, 'f-unit', 'F_LAST', '--json');
    expect(last).toContain('"refs":["journal#f-last"]');
    expect(last).toContain('"summary":"last summary"');
    await must(unit(sb, 'finding', 'update', 'f-unit', 'F_REF', '--ref=journal#f-new'));
    expect(await show(sb, 'f-unit', 'F_REF', '--json')).toContain('"refs":["journal#f-new"]');
    let refLines = 0;
    for (const n of ['F_NOREF', 'F_REF', 'F_LAST']) refLines += (await show(sb, 'f-unit', n)).split('\n').filter((l) => l.startsWith('  REF: ')).length;
    expect(refLines).toBe(3);
    expect((await unit(sb, 'finding', 'list', 'f-unit')).stdout.split('\n').filter((l) => l.startsWith('  F_'))).toHaveLength(3);
  });
});
