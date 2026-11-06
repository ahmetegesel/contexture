import { dirname } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { graphQuery, seededDb, sqliteFts5 } from '../support/graph';

const ranks = (out: string): string[] => out.split('\n').filter((l) => /^ {2}\[\d+\] /.test(l)).map((l) => l.trim().replace(/ \(.*\)$/, ''));

describe.skipIf(!sqliteFts5)('graph-query over the seeded database', { concurrent: true }, () => {
  let db: string;
  let cwd: string;
  beforeAll(() => {
    db = seededDb('query-cli');
    cwd = dirname(db);
  });
  const q = (...args: string[]) => graphQuery(cwd, db, ...args, '--no-sync');

  it('symbol shows the location, the callers and callees, the governing doc, rule, and pitfall', async () => {
    const r = await q('symbol', 'OrderCore.startOrder');
    expect([r.code, r.stderr]).toEqual([0, '']);
    for (const line of [
      '@symbol OrderCore.startOrder',
      '  LOCATION: backend/core/orderCore.ts:35-78',
      '  [1] OrderService.startOrder (backend/services/orderService.ts:55)',
      '  [2] runCheckout (simulation/checkoutRun.ts:36)',
      '  doc: doc:order-protocol (protocol, repo: demo-shop)',
      '  rule: rule:phase-tracking (doc: doc:order-protocol)',
      '  pitfall: pitfall:rounding-threshold [severity: high, type: gotcha] (doc: doc:order-protocol)',
    ]) expect(r.stdout.split('\n')).toContain(line);
  });

  it('TD5 callers walks up a call cycle once: three callers, then it stops', async () => {
    const r = await q('callers', 'getNextPhase', '--depth', '5');
    expect(r.code).toBe(0);
    expect(ranks(r.stdout)).toEqual(['[1] OrderCore.startOrder', '[2] OrderService.startOrder', '[3] runCheckout']);
  });

  it('TD6 callees walks down through the cycle once: three callees, then it stops', async () => {
    const r = await q('callees', 'runCheckout', '--depth', '5');
    expect(r.code).toBe(0);
    expect(ranks(r.stdout)).toEqual(['[1] OrderService.startOrder', '[2] OrderCore.startOrder', '[3] OrderCore.getNextPhase']);
  });

  it('callers honours --depth', async () => {
    expect(ranks((await q('callers', 'getNextPhase', '--depth', '1')).stdout)).toEqual(['[1] OrderCore.startOrder']);
  });

  it('search finds the doc and the linked symbol', async () => {
    const r = await q('search', 'cascade');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[doc] doc:order-protocol');
    expect(r.stdout).toContain('GOVERNED_BY: rule:phase-tracking, pitfall:rounding-threshold');
  });

  it('search ranks a rule match and names its linked symbol', async () => {
    const r = await q('search', 'phase count');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('[rule] rule:phase-tracking');
    expect(r.stdout).toContain('LINKED_SYMBOLS: OrderCore.startOrder');
  });

  it('search takes a hyphenated term as text, never an FTS operator', async () => {
    const r = await q('search', 'check-out');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toContain('[rule] rule:phase-tracking');
  });

  it('rules and pitfalls answer for a symbol and refuse without one', async () => {
    const rules = await q('rules', 'startOrder');
    expect(rules.code).toBe(0);
    expect(rules.stdout).toContain('rule:phase-tracking');
    const pitfalls = await q('pitfalls', 'startOrder');
    expect(pitfalls.code).toBe(0);
    expect(pitfalls.stdout).toContain('pitfall:rounding-threshold');
    const bare = await q('rules');
    expect(bare.code).toBe(1);
    expect(bare.stderr).toContain('rules requires a target symbol name or qname');
  });

  it('[ast-doc-graph-r14] an unknown subcommand refuses rc 1 naming the known ones, while help and no arguments print the usage rc 0', async () => {
    const r = await q('symbols', 'OrderCore.startOrder');
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toBe('Error: unknown subcommand: symbols (known: symbol, search, callers, callees, rules, pitfalls, stats, help)\n');
    for (const args of [['help'], ['--help'], []]) {
      const usage = await graphQuery(cwd, db, ...args);
      expect([usage.code, usage.stderr], args.join(' ')).toEqual([0, '']);
      expect(usage.stdout).toContain('Usage:');
    }
  });

  it('stats counts every table and edge kind', async () => {
    const r = await q('stats');
    expect(r.code).toBe(0);
    for (const line of ['  SYMBOLS: 4', '  EDGES: 7', '    CALLS: 4', '    COVERS: 1', '    GOVERNS: 1', '    WARNS: 1', '  DOCS: 1', '  RULES: 1', '  PITFALLS: 1']) expect(r.stdout.split('\n')).toContain(line);
  });
});
