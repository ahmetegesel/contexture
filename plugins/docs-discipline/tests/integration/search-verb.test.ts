import { beforeAll, describe, expect, it } from 'vitest';
import { fresh } from '@support/snapshot';
import { docs, stageSeed } from '../support/corpus';

let staged: string;
beforeAll(async () => {
  staged = await stageSeed('posix', 'search-verb');
});

const refusal = (message: string, code = 'ERR_INVALID_ARGUMENT'): string => `ctx docs search: ${message} (${code})\n`;

describe('ctx docs search', { concurrent: true }, () => {
  it('[docs-module-r-yyfxd] answers rows whose read prints the entity, the address being docs# and the read path', async () => {
    const sb = fresh(staged);
    const r = await docs(sb, ['search', 'retried checkout', '--json']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    const a = JSON.parse(r.stdout);
    expect([a.query, a.mode, a.total]).toEqual(['retried checkout', 'exact', 1]);
    expect(a.rows).toEqual([{ module: 'docs', container: 'demo-orders/order-flow', type: 'pitfall', id: 'order-flow-p1', address: 'docs#demo-orders/order-flow/order-flow-p1', snippet: 'summary: "A retried checkout can persist the same cart twice"', read: 'ctx docs get demo-orders/order-flow/order-flow-p1' }]);
    const got = await docs(sb, a.rows[0].read.split(' ').slice(2));
    expect([got.code, got.stdout.split('\n')[0]]).toEqual([0, '  - id: order-flow-p1']);
  });

  it('[docs-module-r-yyfxd] an entry keyed by more than one token is its own row of type entry under its encoded key, its read printing the entry whole; a keyless entry stays on the header row, whose read prints its line', async () => {
    const sb = fresh(staged);
    const r = await docs(sb, ['search', 'Cart assembly', '--json']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    const a = JSON.parse(r.stdout);
    expect(a.rows).toEqual([{ module: 'docs', container: 'workspace/system-map', type: 'entry', id: 'stages/Cart%20assembly', address: 'docs#workspace/system-map/stages/Cart%20assembly', snippet: '- stage: "Cart assembly"', read: 'ctx docs get workspace/system-map/stages/Cart%20assembly' }]);
    const got = await docs(sb, a.rows[0].read.split(' ').slice(2));
    expect([got.code, got.stdout]).toEqual([0, '  - stage: "Cart assembly"\n    order: 1\n    description: "The customer edits a cart in the storefront"\n    evidence: "cartStore"\n']);
    const rule = JSON.parse((await docs(sb, ['search', 'never writes order state', '--json'])).stdout);
    expect(rule.rows.map((x: { type: string; id: string }) => [x.type, x.id])).toEqual([['doc', 'header']]);
    const header = await docs(sb, rule.rows[0].read.split(' ').slice(2));
    expect(header.stdout).toContain(`\n${rule.rows[0].snippet.replace(/^/, '  ')}\n`);
  });

  it('[docs-module-r-yyfxd] zero hits is an answer, rc 0, in the text and --json forms', async () => {
    const sb = fresh(staged);
    const text = await docs(sb, ['search', 'zz_no_such_term']);
    expect([text.code, text.stdout, text.stderr]).toEqual([0, 'docs search "zz_no_such_term": 0 matches\n', '']);
    const json = await docs(sb, ['search', 'zz_no_such_term', '--json']);
    expect([json.code, json.stdout]).toEqual([0, '{"query":"zz_no_such_term","mode":"exact","total":0,"rows":[]}\n']);
  });

  it('[docs-module-r-yyfxd] --limit caps the rows once and total counts every match; --repo and --type narrow', async () => {
    const sb = fresh(staged);
    const all = JSON.parse((await docs(sb, ['search', 'checkout', '--limit=100', '--json'])).stdout);
    const one = JSON.parse((await docs(sb, ['search', 'checkout', '--limit=1', '--json'])).stdout);
    expect([one.total, one.rows]).toEqual([all.total, all.rows.slice(0, 1)]);
    const web = JSON.parse((await docs(sb, ['search', 'checkout', '--repo=demo-web', '--limit=100', '--json'])).stdout);
    expect(web.rows.length).toBeGreaterThan(0);
    expect(web.rows.every((r: { container: string }) => r.container.startsWith('demo-web/'))).toBe(true);
    const pit = JSON.parse((await docs(sb, ['search', 'checkout', '--type=pitfall', '--limit=100', '--json'])).stdout);
    expect(pit.rows.length).toBeGreaterThan(0);
    expect(pit.rows.every((r: { type: string }) => r.type === 'pitfall')).toBe(true);
  });

  it.each([
    ['a bare value form', ['checkout', '--limit', '5'], refusal("unknown option '--limit' (the --flag=value forms: --repo=, --type=, --mode=, --limit=, and --json)")],
    ['an unknown flag', ['checkout', '--entity=task'], refusal("unknown option '--entity=task' (the --flag=value forms: --repo=, --type=, --mode=, --limit=, and --json)")],
    ['a second query', ['checkout', 'cart'], refusal("unexpected argument 'cart' (one query)")],
    ['a blank query', ['   '], refusal('empty query')],
    ['a carriage return', ['check\rout'], refusal('a carriage return in the query')],
    ['a zero limit', ['checkout', '--limit=0'], refusal("--limit takes a positive whole number: '0'")],
    ['a non numeric limit', ['checkout', '--limit=ten'], refusal("--limit takes a positive whole number: 'ten'")],
    ['an unknown type', ['checkout', '--type=task'], refusal("unknown type 'task' (rule, responsibility, contract, pitfall, caveat, entry, doc)")],
    ['a ranked mode', ['checkout', '--mode=hybrid'], "ctx docs search: mode 'hybrid' cannot be answered by the docs search; answerable modes: exact (ERR_CAPABILITY_UNSUPPORTED)\n"],
    ['a repo the corpus lacks', ['checkout', '--repo=nosuch'], refusal('no such repo: nosuch', 'ERR_ENTITY_NOT_FOUND')],
  ])('[docs-module-r-yyfxd] refuses %s rc 1 with one stderr line, nothing on stdout', async (_, args, line) => {
    const r = await docs(fresh(staged), ['search', ...args]);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', line]);
  });

  it('[docs-module-r-yyfxd] under the fan-out marker a ranked mode falls back to exact and an unknown type answers zero hits', async () => {
    const sb = fresh(staged);
    const env = { CTX_SEARCH_FANOUT: '1' };
    const mode = await docs(sb, ['search', 'retried checkout', '--mode=hybrid', '--json'], { env });
    expect([mode.code, JSON.parse(mode.stdout).mode, JSON.parse(mode.stdout).total]).toEqual([0, 'exact', 1]);
    const type = await docs(sb, ['search', 'checkout', '--type=task', '--json'], { env });
    expect([type.code, type.stdout]).toEqual([0, '{"query":"checkout","mode":"exact","total":0,"rows":[]}\n']);
  });

  it('[docs-module-r4] a sole --help points to ctx docs help search rc 1; a bare search refuses with its usage', async () => {
    const sb = fresh(staged);
    const r = await docs(sb, ['search', '--help']);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', 'help: ctx docs help search\n']);
    const bare = await docs(sb, ['search']);
    expect([bare.code, bare.stderr]).toEqual([1, 'Usage: ctx docs search "<term>" [--repo=<repo>] [--type=<type>] [--mode=exact] [--limit=N] [--json]\n']);
  });

  it('[docs-module-r4, docs-module-r-yyfxd] the word help with arguments after it is the query, as ctx search hands it, while --help with arguments still refuses', async () => {
    const sb = fresh(staged);
    const sole = await docs(sb, ['search', 'help']);
    expect([sole.code, sole.stdout, sole.stderr]).toEqual([1, '', 'help: ctx docs help search\n']);
    const r = await docs(sb, ['search', 'help', '--limit=100', '--json']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    const a = JSON.parse(r.stdout);
    expect(a.query).toBe('help');
    expect(a.rows.every((x: { snippet: string }) => /help/i.test(x.snippet))).toBe(true);
    const flag = await docs(sb, ['search', '--help', '--json']);
    expect([flag.code, flag.stdout, flag.stderr]).toEqual([1, '', 'ctx docs search: help takes no further arguments\n']);
  });
});
