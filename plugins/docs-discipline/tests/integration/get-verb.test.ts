import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec } from '@support/exec';
import { fresh } from '@support/snapshot';
import { must, unit } from '@support/unit';
import { docs, SAMPLE, stageSeed } from '../support/corpus';

const ORDER_FLOW = readFileSync(join(SAMPLE, 'docs/demo-orders/order-flow.md'), 'utf8').split('\n');
const OPERATIONAL = readFileSync(join(SAMPLE, 'docs/demo-orders/operational.md'), 'utf8').split('\n');
const SYSTEM_MAP = readFileSync(join(SAMPLE, 'docs/workspace/system-map.md'), 'utf8').split('\n');
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
    ['an entry keyed by more than one token by its encoded key', 'demo-orders/operational/run/Install%20dependencies', `${OPERATIONAL.slice(7, 11).join('\n')}\n`],
    ['every line the header entity owns by the reserved key header: the header block, then the legacy keyless responsibilities and contract rules under their markers', 'demo-orders/order-flow/header', span('@doc capability order-flow', 17)],
    ['the keyless dependency rule beside the header block', 'workspace/system-map/header', `${SYSTEM_MAP.slice(0, 5).join('\n')}\n${SYSTEM_MAP.slice(SYSTEM_MAP.indexOf('@dependency_rules'), SYSTEM_MAP.indexOf('@dependency_rules') + 5).join('\n')}\n`],
  ])('[docs-module-r-98mvk] prints %s, its stored lines whole, rc 0 with an empty stderr', async (_, path, want) => {
    const r = await docs(fresh(staged), ['get', path]);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, want, '']);
  });

  it('[docs-module-r-98mvk, docs-module-r-yyfxd] a search row read line pasted unquoted into a POSIX shell prints the entry its argv form prints', async () => {
    const sb = fresh(staged);
    const rows = JSON.parse((await docs(sb, ['search', 'Install dependencies', '--json'])).stdout).rows as { id: string; read: string }[];
    expect(rows.map((r) => r.id)).toEqual(['run/Install%20dependencies']);
    const pasted = await exec('sh', ['-c', `./.contexture/${rows[0].read}`], { cwd: sb, env: { GIT_CEILING_DIRECTORIES: dirname(sb) } });
    const argv = await docs(sb, ['get', 'demo-orders/operational/run/Install%20dependencies']);
    expect([pasted.code, pasted.stdout, pasted.stderr]).toEqual([0, argv.stdout, '']);
  });

  it('[docs-module-r5, docs-module-r21, docs-module-r-98mvk] one key form across get, query --entry, and entry: the encoded key a row prints answers each verb as the natural key does', async () => {
    const sb = fresh(staged);
    const natural = await docs(sb, ['query', 'demo-orders', 'operational', '--entry', 'run/Install dependencies']);
    const encoded = await docs(sb, ['query', 'demo-orders', 'operational', '--entry', 'run/Install%20dependencies']);
    expect([encoded.code, encoded.stdout, encoded.stderr]).toEqual([0, natural.stdout, '']);
    expect(natural.stdout).toBe(`${OPERATIONAL.slice(7, 11).join('\n')}\n`);
    const w = await docs(sb, ['entry', 'demo-orders', 'operational', 'run', 'Install%20dependencies', '--evidence=package-lock.json']);
    expect([w.code, w.stderr]).toEqual([0, '']);
    const got = await docs(sb, ['get', 'demo-orders/operational/run/Install%20dependencies']);
    expect(got.stdout.split('\n').slice(0, 2)).toEqual(['  - step: "Install dependencies"', '    evidence: "package-lock.json"']);
  });

  it('[the-record-r-hxgfj, docs-module-r-98mvk] a REF naming an encoded docs address passes the write time check through ctx docs get, and one naming a missing encoded key refuses', async () => {
    const sb = fresh(staged);
    await must(unit(sb, 'bootstrap', 'keys-demo', 'the encoded docs refs'));
    const ok = await unit(sb, 'record', 'keys-demo', '--what=an encoded docs ref', '--ref=docs#demo-orders/operational/run/Install%20dependencies');
    expect([ok.code, ok.stderr]).toEqual([0, '']);
    const missing = await unit(sb, 'record', 'keys-demo', '--what=a missing encoded docs ref', '--ref=docs#demo-orders/operational/run/Install%20nothing');
    expect([missing.code, missing.stdout, missing.stderr]).toEqual([1, '', "record: error: ref 'docs#demo-orders/operational/run/Install%20nothing': target not found (ERR_ENTITY_NOT_FOUND)\n"]);
  });

  it('[docs-module-r-98mvk] prints a conventions rule by rule/<category>/<rule-slug>, the @rule block whole', async () => {
    const conventions = readFileSync(join(SAMPLE, 'docs/workspace/conventions.md'), 'utf8');
    const slug = /^@rule (\S+)$/m.exec(conventions)?.[1];
    expect(slug).toBeTruthy();
    const r = await docs(fresh(staged), ['get', `workspace/conventions/rule/${slug}`]);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.split('\n')[0]).toBe(`@rule ${slug}`);
    expect(r.stdout).toMatch(/^ {2}statement: /m);
    expect(r.stdout).not.toMatch(/\n@rule /);
  });

  it('[docs-module-r-98mvk] an entry keyed by more than one token answers only its encoded key: its natural spelling, never an address, refuses', async () => {
    const r = await docs(fresh(staged), ['get', 'demo-orders/operational/run/Install dependencies']);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', "ctx docs get: no entity 'run/Install dependencies' in demo-orders/operational (ERR_ENTITY_NOT_FOUND)\n"]);
  });

  it('[docs-module-r-98mvk] a one token key holding a shell byte answers its encoded key and its old spelling', async () => {
    const sb = fresh(staged);
    const encoded = await docs(sb, ['get', 'workspace/system-map/data_flow/demo-web%3Edemo-orders']);
    const old = await docs(sb, ['get', 'workspace/system-map/data_flow/demo-web>demo-orders']);
    expect([encoded.code, encoded.stdout.split('\n')[0], encoded.stderr]).toEqual([0, '  - from: "demo-web"', '']);
    expect([old.code, old.stdout]).toEqual([0, encoded.stdout]);
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
    expect(help.stdout).toContain('every ASCII byte outside letters, digits, and - _ . / : , + @ is written %XX in uppercase hex');
    expect(help.stdout).toContain('(workspace/system-map/components/store%20module)');
    const bare = await docs(sb, ['get']);
    expect([bare.code, bare.stderr]).toEqual([1, 'Usage: ctx docs get <repo>/<slug>/<key>\n']);
  });
});
