import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { declare, INV, MISSING, refused, snapshot, store } from './support';

const FIELDS = ['what: required block', 'status: optional line one-of OPEN|PICKED|DROPPED default OPEN', 'tags: optional line list', 'owner: optional line'];

let sandbox: () => string;
beforeAll(async () => {
  sandbox = await snapshot('store-list', async (sb) => {
    await declare(sb, 'ideas', 'given', FIELDS);
    await store(sb, ['put', 'ideas/one', '--stdin=what', '--add-tags=x', '--add-ref=unit#u/task/t'], 'one\n');
    await store(sb, ['put', 'ideas/two', '--stdin=what', '--status=PICKED', '--add-tags=x', '--add-tags=y', '--owner=me'], 'two\n');
    await store(sb, ['put', 'ideas/three', '--stdin=what'], 'three\n');
  });
});

const plantRecord = (sb: string, key: string, body: string): void => {
  const path = join(sb, '.contexture/store', key);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, body);
};

describe.concurrent('the store list: the exact field filter', () => {
  it('[store-r5] list prints one line per record in key order: the id, then its line fields, block fields left out', async () => {
    const r = await store(sandbox(), ['list', 'ideas']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'one | status: OPEN | tags: x | ref: unit#u/task/t\nthree | status: OPEN\ntwo | status: PICKED | tags: x, y | owner: me\n', '']);
  });

  it('[store-r5] a filter is exact equality; an absent field matches its current default', async () => {
    const sb = sandbox();
    expect((await store(sb, ['list', 'ideas', '--status=OPEN'])).stdout).toBe('one | status: OPEN | tags: x | ref: unit#u/task/t\nthree | status: OPEN\n');
    expect((await store(sb, ['list', 'ideas', '--owner=m'])).stdout).toBe('');
  });

  it('[store-r5] a list field matches when any item equals the value, ref included, and filters combine with AND', async () => {
    const sb = sandbox();
    expect((await store(sb, ['list', 'ideas', '--tags=y'])).stdout).toBe('two | status: PICKED | tags: x, y | owner: me\n');
    expect((await store(sb, ['list', 'ideas', '--tags=x', '--status=OPEN'])).stdout).toBe('one | status: OPEN | tags: x | ref: unit#u/task/t\n');
    expect((await store(sb, ['list', 'ideas', '--ref=unit#u/task/t'])).stdout).toBe('one | status: OPEN | tags: x | ref: unit#u/task/t\n');
  });

  it('[store-r5] --json answers every matching record whole with the total, uncapped', async () => {
    const r = await store(sandbox(), ['list', 'ideas', '--tags=x', '--json']);
    const a = JSON.parse(r.stdout);
    expect(a.container).toBe('ideas');
    expect(a.total).toBe(2);
    expect(a.records[1]).toEqual({ id: 'two', address: 'store#ideas/two', record: { what: 'two', status: 'PICKED', tags: ['x', 'y'], owner: 'me' } });
  });

  it('[store-r5] a record stored before its default existed matches that default', async () => {
    const sb = sandbox();
    plantRecord(sb, 'ideas/old', 'what ::\n  old\n');
    expect((await store(sb, ['list', 'ideas', '--status=OPEN'])).stdout).toContain('old | status: OPEN\n');
  });

  it.each([
    ['a value outside the one-of set', ['--status=MAYBE'], "field 'status': 'MAYBE' is not one of OPEN|PICKED|DROPPED"],
    ['an undeclared field', ['--colour=red'], "field 'colour' is not declared in container 'ideas'"],
    ['a block field', ['--what=one'], "field 'what' is a block field: a filter takes line fields (search finds block text)"],
    ['an empty value', ['--owner='], "field 'owner': an empty filter value"],
    ['a bare flag', ['--json', '-x'], "unknown flag '-x' (a filter is --<field>=<value>)"],
    ['a value holding a newline, on one line', ['--status=OP\nEN'], "field 'status': 'OP\\nEN' is not one of OPEN|PICKED|DROPPED"],
    ['a field name holding a tab, named whole', ['--co\tlour=x'], "field 'co\\tlour' is not declared in container 'ideas'"],
  ])('[store-r5] refuses %s rc 1 naming it, never an empty answer', async (_name, flags, message) => {
    refused(await store(sandbox(), ['list', 'ideas', ...flags]), 'list', INV, message);
  });

  it('[store-r5] an undeclared container reads not found', async () => {
    refused(await store(sandbox(), ['list', 'nope']), 'list', MISSING, "container 'nope' is not declared");
  });
});

describe.concurrent('the store check: records against the current declaration', () => {
  it('[store-r6] check prints nothing rc 0 when every record conforms', async () => {
    const r = await store(sandbox(), ['check', 'ideas']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });

  it('[store-r6] check names each nonconforming record and field, one line each, rc 1', async () => {
    const sb = sandbox();
    plantRecord(sb, 'ideas/bad', 'status: "MAYBE"\ncolour: "red"\nref: "unit#u/task/t"\n');
    const r = await store(sb, ['check', 'ideas']);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, "ideas/bad: what: required and absent\nideas/bad: status: 'MAYBE' is not one of OPEN|PICKED|DROPPED\nideas/bad: colour: not declared (a leftover field)\n", '']);
  });

  it('[store-r6] check of an undeclared container reads not found', async () => {
    refused(await store(sandbox(), ['check', 'nope']), 'check', MISSING, "container 'nope' is not declared");
  });
});
