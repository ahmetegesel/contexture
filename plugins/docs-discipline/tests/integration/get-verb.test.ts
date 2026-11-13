import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh } from '@support/snapshot';
import { docs, PLUGIN, SAMPLE, stageSeed } from '../support/corpus';

const ORDER_FLOW = readFileSync(join(SAMPLE, 'docs/demo-orders/order-flow.md'), 'utf8').split('\n');
const span = (from: string, count: number): string => {
  const at = ORDER_FLOW.indexOf(from);
  return `${ORDER_FLOW.slice(at, at + count).join('\n')}\n`;
};

let staged: string;
beforeAll(async () => {
  staged = await stageSeed('posix', 'get-verb');
});

describe('ctx docs get', { concurrent: true }, () => {
  it.each([
    ['an id keyed pitfall by its id', 'demo-orders/order-flow/order-flow-p2', span('  - id: order-flow-p2', 8)],
    ['a see_also entry by <block>/<ref>', 'demo-orders/order-flow/see_also/operational', span('  - ref: operational', 2)],
    ['an edge by <block>/<direction>:<key>', 'demo-orders/order-flow/edges/consumes:orders.accepted', span('  - direction: consumes', 4)],
    ['the header block by the reserved key header', 'demo-orders/order-flow/header', span('@doc capability order-flow', 5)],
  ])('[docs-module-r-98mvk] prints %s, its stored lines whole, rc 0 with an empty stderr', async (_, path, want) => {
    const r = await docs(fresh(staged), ['get', path]);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, want, '']);
  });

  it('[docs-module-r-98mvk] prints a conventions rule by rule/<category>/<rule-slug>, the @rule block whole', async () => {
    const seeded = readFileSync(join(PLUGIN, 'docs/workspace/conventions.md'), 'utf8');
    const slug = /^@rule (\S+)$/m.exec(seeded)?.[1];
    expect(slug).toBeTruthy();
    const r = await docs(fresh(staged), ['get', `workspace/conventions/rule/${slug}`]);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.split('\n')[0]).toBe(`@rule ${slug}`);
    expect(r.stdout).toMatch(/^ {2}statement: /m);
    expect(r.stdout).not.toMatch(/\n@rule /);
  });

  it('[docs-module-r-98mvk] an entry keyed by more than one token belongs to the header entity: no get answers its key', async () => {
    const r = await docs(fresh(staged), ['get', 'demo-orders/operational/run/Install dependencies']);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', "ctx docs get: no entity 'run/Install dependencies' in demo-orders/operational (ERR_ENTITY_NOT_FOUND)\n"]);
  });

  it.each([
    ['an absent entity', 'demo-orders/order-flow/order-flow-p9', "ctx docs get: no entity 'order-flow-p9' in demo-orders/order-flow (ERR_ENTITY_NOT_FOUND)\n"],
    ['an absent doc', 'demo-orders/nodoc/header', 'ctx docs get: no such doc: demo-orders/nodoc (ERR_ENTITY_NOT_FOUND)\n'],
    ['a path without a key', 'demo-orders/order-flow', "ctx docs get: malformed path 'demo-orders/order-flow' (<repo>/<slug>/<key>) (ERR_INVALID_ARGUMENT)\n"],
    ['a malformed repo', 'demo orders/order-flow/header', 'ctx docs get: malformed repo: demo orders (ERR_INVALID_ARGUMENT)\n'],
    ['a flag', '--json', "ctx docs get: unknown option '--json' (ctx docs get <repo>/<slug>/<key>) (ERR_INVALID_ARGUMENT)\n"],
  ])('[docs-module-r-98mvk] refuses %s rc 1 with one line, nothing on stdout', async (_, path, line) => {
    const r = await docs(fresh(staged), ['get', path]);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', line]);
  });

  it('[docs-module-r4] a sole --help points to ctx docs help get rc 1, and the help table names the path forms', async () => {
    const sb = fresh(staged);
    const r = await docs(sb, ['get', '--help']);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', 'help: ctx docs help get\n']);
    const help = await docs(sb, ['help', 'get']);
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('ctx docs get <repo>/<slug>/<key>');
    const bare = await docs(sb, ['get']);
    expect([bare.code, bare.stderr]).toEqual([1, 'Usage: ctx docs get <repo>/<slug>/<key>\n']);
  });
});
