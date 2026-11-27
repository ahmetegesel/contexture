import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { holdMove } from '../support/locks';
import { declare, EXISTS, INV, MISSING, refused, snapshot, store, storeState, SV } from './support';

const today = (): string => spawnSync('date', ['+%Y-%m-%d'], { encoding: 'utf8' }).stdout.trim();
const FIELDS = [
  'what: required block',
  'status: optional line one-of OPEN|PICKED|DROPPED default OPEN',
  'dumped: optional line default today',
  'tags: optional line list',
  'owner: optional line',
];

let sandbox: () => string;
beforeAll(async () => {
  sandbox = await snapshot('store-records', async (sb) => {
    await declare(sb, 'ideas', 'given', FIELDS);
    await declare(sb, 'memos', 'generated', ['body: optional line']);
  });
});

describe.concurrent('the store records: put, set, delete, get', () => {
  it('[store-r2] put fills the absent defaults at write, prints the id, and get prints the record canonical', async () => {
    const sb = sandbox();
    const put = await store(sb, ['put', 'ideas/rust-driver', '--stdin=what', '--add-tags=a', '--add-tags=b', '--add-ref=unit#u/task/t'], 'an idea\n\nwith a blank line\n');
    expect([put.code, put.stdout, put.stderr]).toEqual([0, 'rust-driver\n', '']);
    const get = await store(sb, ['get', 'ideas/rust-driver']);
    expect([get.code, get.stderr]).toEqual([0, '']);
    expect(get.stdout).toBe(['what ::', '  an idea', '  ', '  with a blank line', 'status: "OPEN"', `dumped: "${today()}"`, 'tags: "a"', 'tags: "b"', 'ref: "unit#u/task/t"', ''].join('\n'));
  });

  it('[store-r2] get --json answers the record whole, list fields and ref as lists', async () => {
    const sb = sandbox();
    await store(sb, ['put', 'ideas/one', '--stdin=what', '--add-tags=a', '--owner=me "quoted"'], 'one\n');
    const r = await store(sb, ['get', 'ideas/one', '--json']);
    expect(JSON.parse(r.stdout)).toEqual({ container: 'ideas', id: 'one', address: 'store#ideas/one', record: { what: 'one', status: 'OPEN', dumped: today(), tags: ['a'], owner: 'me "quoted"' } });
  });

  it('[store-r2] set changes the named fields only, keeps the rest, and never fills a default at update', async () => {
    const sb = sandbox();
    await store(sb, ['put', 'ideas/one', '--stdin=what', '--add-tags=a', '--add-ref=unit#u/task/t'], 'one\n');
    const set = await store(sb, ['set', 'ideas/one', '--status=PICKED', '--remove-tags=a', '--add-ref=store#ideas/two', '--owner=me']);
    expect([set.code, set.stdout, set.stderr]).toEqual([0, 'one\n', '']);
    expect((await store(sb, ['get', 'ideas/one'])).stdout).toBe(['what ::', '  one', 'status: "PICKED"', `dumped: "${today()}"`, 'owner: "me"', 'ref: "unit#u/task/t"', 'ref: "store#ideas/two"', ''].join('\n'));
    await store(sb, ['set', 'ideas/one', '--unset=status', '--remove-ref=unit#u/task/t']);
    expect((await store(sb, ['get', 'ideas/one'])).stdout).toBe(['what ::', '  one', 'status: "OPEN"', `dumped: "${today()}"`, 'owner: "me"', 'ref: "store#ideas/two"', ''].join('\n'));
  });

  it('[store-r2] delete removes the record, retires its id in the declaration, and prints the id', async () => {
    const sb = sandbox();
    await store(sb, ['put', 'ideas/gone', '--stdin=what'], 'x\n');
    const del = await store(sb, ['delete', 'ideas/gone']);
    expect([del.code, del.stdout, del.stderr]).toEqual([0, 'gone\n', '']);
    refused(await store(sb, ['get', 'ideas/gone']), 'get', MISSING, "record 'ideas/gone' is retired (a deleted id is never handed out again)");
    expect((await store(sb, ['get', 'containers/ideas'])).stdout).toContain('retired: "gone"\n');
    expect(storeState(sb)).not.toContain('ideas/gone=');
  });

  it('[store-r2] get of a missing record or an undeclared container reads not found', async () => {
    const sb = sandbox();
    refused(await store(sb, ['get', 'ideas/nope']), 'get', MISSING, "record 'ideas/nope' not found");
    refused(await store(sb, ['get', 'nope/x']), 'get', MISSING, "container 'nope' is not declared");
  });

  it('[store-r2] a write naming a field the declaration lacks refuses, and a leftover-free set without flags refuses', async () => {
    const sb = sandbox();
    await store(sb, ['put', 'ideas/one', '--stdin=what'], 'x\n');
    refused(await store(sb, ['set', 'ideas/one']), 'set', INV, 'set takes at least one field flag');
    refused(await store(sb, ['set', 'ideas/one', '--colour=red']), 'set', SV, "field 'colour' is not declared");
  });

  it('[store-r3] a generated id is the date and five lowercase letters or digits, printed, never twice', async () => {
    const sb = sandbox();
    const ids = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const r = await store(sb, ['put', 'memos', `--body=memo ${i}`]);
      expect(r.code).toBe(0);
      expect(r.stdout).toMatch(new RegExp(`^${today()}-[a-z0-9]{5}\\n$`));
      ids.add(r.stdout.trim());
    }
    expect(ids.size).toBe(4);
  });

  it('[store-r3] a given id is refused under generated minting and a missing one under given minting', async () => {
    const sb = sandbox();
    refused(await store(sb, ['put', 'memos/x', '--body=b']), 'put', INV, "container 'memos' mints its ids (generated): put memos takes no id");
    refused(await store(sb, ['put', 'ideas', '--stdin=what'], 'x\n'), 'put', INV, "container 'ideas' takes given ids: put ideas/<id>");
  });

  it('[store-r3] an id is unique whatever its case, and a retired id is never handed out again in any case, nothing written', async () => {
    const sb = sandbox();
    await store(sb, ['put', 'ideas/Alpha', '--stdin=what'], 'x\n');
    const held = storeState(sb);
    refused(await store(sb, ['put', 'ideas/Alpha', '--stdin=what'], 'x\n'), 'put', EXISTS, "record 'ideas/Alpha' already exists");
    refused(await store(sb, ['put', 'ideas/alpha', '--stdin=what'], 'y\n'), 'put', EXISTS, "record 'ideas/alpha' already exists as 'ideas/Alpha' (ids are unique whatever their case)");
    expect(storeState(sb)).toBe(held);
    await store(sb, ['delete', 'ideas/Alpha']);
    const retired = storeState(sb);
    refused(await store(sb, ['put', 'ideas/ALPHA', '--stdin=what'], 'x\n'), 'put', EXISTS, "id 'ALPHA' is retired in container 'ideas' (a deleted id is never handed out again)");
    expect(storeState(sb)).toBe(retired);
  });

  it('[store-r4, the-engine-r-mvf01] while storage is being moved, put and set refuse rc 2 under their own names with the freeze\'s message and code, and every view reads unchanged', async () => {
    const sb = sandbox();
    await store(sb, ['put', 'ideas/one', '--stdin=what'], 'one\n');
    const before = [storeState(sb), (await store(sb, ['get', 'ideas/one'])).stdout, (await store(sb, ['list', 'ideas'])).stdout];
    holdMove(sb, 'sqlite', 'live');
    for (const [verb, args] of [['put', ['put', 'ideas/two', '--stdin=what']], ['set', ['set', 'ideas/one', '--status=PICKED']]] as const) {
      const r = await store(sb, args, 'two\n');
      expect([r.code, r.stdout, r.stderr], verb).toEqual([2, '', `store ${verb}: error: storage is being moved to another driver; retry after the move ends (ERR_STORAGE_LOCKED)\n`]);
    }
    expect([storeState(sb), (await store(sb, ['get', 'ideas/one'])).stdout, (await store(sb, ['list', 'ideas'])).stdout]).toEqual(before);
  });
});
