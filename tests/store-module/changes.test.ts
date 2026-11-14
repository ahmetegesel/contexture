import { beforeAll, describe, expect, it } from 'vitest';
import { declare, EXISTS, INV, MISSING, refused, snapshot, store, storeState, SV } from './support';

let sandbox: () => string;
beforeAll(async () => {
  sandbox = await snapshot('store-changes', async (sb) => {
    await declare(sb, 'items', 'given', ['what: required line', 'status: optional line one-of OPEN|DONE default OPEN', 'colour: optional line']);
    await store(sb, ['put', 'items/a', '--what=a', '--colour=red']);
    await store(sb, ['put', 'items/b', '--what=b', '--status=DONE']);
  });
});

describe.concurrent('the store declaration changes: forward only', () => {
  it('[store-r7] an optional field lands at once and an older record reads its default at get and in the filter, never stored', async () => {
    const sb = sandbox();
    const r = await store(sb, ['set', 'containers/items', '--add-fields=size: optional line default small']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'items\n', '']);
    expect((await store(sb, ['get', 'items/a'])).stdout).toBe('what: "a"\nstatus: "OPEN"\ncolour: "red"\nsize: "small"\n');
    expect((await store(sb, ['list', 'items', '--size=small'])).stdout).toContain('a | ');
    expect(storeState(sb)).toContain('items/a=what: "a"\nstatus: "OPEN"\ncolour: "red"\n');
  });

  it('[store-r7] a new required field binds new writes and a record when next written, and check names the records it leaves behind', async () => {
    const sb = sandbox();
    await store(sb, ['set', 'containers/items', '--add-fields=owner: required line']);
    refused(await store(sb, ['put', 'items/c', '--what=c']), 'put', SV, "field 'owner' is required and absent");
    refused(await store(sb, ['set', 'items/a', '--colour=blue']), 'set', SV, "field 'owner' is required and absent");
    const check = await store(sb, ['check', 'items']);
    expect([check.code, check.stdout]).toEqual([1, 'items/a: owner: required and absent\nitems/b: owner: required and absent\n']);
    await store(sb, ['set', 'items/a', '--owner=me']);
    await store(sb, ['set', 'items/b', '--owner=you']);
    expect((await store(sb, ['check', 'items'])).code).toBe(0);
  });

  it('[store-r7] a tightened one-of set binds new writes, and check names a stored value outside it', async () => {
    const sb = sandbox();
    await store(sb, ['set', 'containers/items', '--remove-fields=status: optional line one-of OPEN|DONE default OPEN', '--add-fields=status: optional line one-of OPEN|CLOSED default OPEN']);
    refused(await store(sb, ['set', 'items/a', '--status=DONE']), 'set', SV, "field 'status': 'DONE' is not one of OPEN|CLOSED");
    expect((await store(sb, ['check', 'items'])).stdout).toBe("items/b: status: 'DONE' is not one of OPEN|CLOSED\n");
  });

  it('[store-r7] a removed field stays on its records as a leftover until --unset clears it, the one explicit way', async () => {
    const sb = sandbox();
    await store(sb, ['set', 'containers/items', '--remove-fields=colour: optional line']);
    expect((await store(sb, ['check', 'items'])).stdout).toBe('items/a: colour: not declared (a leftover field)\n');
    refused(await store(sb, ['set', 'items/a', '--colour=blue']), 'set', SV, "field 'colour' is not declared");
    const r = await store(sb, ['set', 'items/a', '--unset=colour']);
    expect(r.code).toBe(0);
    expect((await store(sb, ['get', 'items/a'])).stdout).toBe('what: "a"\nstatus: "OPEN"\n');
    expect((await store(sb, ['check', 'items'])).code).toBe(0);
  });

  it('[store-r7] the minting changes either way; an id already used stays valid and a retired one stays refused', async () => {
    const sb = sandbox();
    await store(sb, ['delete', 'items/b']);
    await store(sb, ['set', 'containers/items', '--minting=generated']);
    const minted = await store(sb, ['put', 'items', '--what=m']);
    expect(minted.code).toBe(0);
    expect((await store(sb, ['get', 'items/a'])).code).toBe(0);
    await store(sb, ['set', 'containers/items', '--minting=given']);
    refused(await store(sb, ['put', 'items/b', '--what=b']), 'put', EXISTS, "id 'b' is retired in container 'items' (a deleted id is never handed out again)");
  });

  it('[store-r7] a declaration change refuses a malformed field line, a store kept field, and a missing container, nothing written', async () => {
    const sb = sandbox();
    const before = storeState(sb);
    refused(await store(sb, ['set', 'containers/items', '--add-fields=x: optional  line']), 'set', INV, "field 'x': the line holds a doubled blank");
    refused(await store(sb, ['set', 'containers/items', '--add-retired=a']), 'set', SV, "field 'retired' is not declared (the store keeps it)");
    refused(await store(sb, ['set', 'containers/nope', '--description=x']), 'set', MISSING, "container 'nope' is not declared");
    expect(storeState(sb)).toBe(before);
  });
});

describe.concurrent('the store drop and re-declare', () => {
  it('[store-r8] delete containers/<name> drops a container holding records: every record removed, the declaration kept dropped with every id retired', async () => {
    const sb = sandbox();
    const r = await store(sb, ['delete', 'containers/items']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'items\n', '']);
    expect(storeState(sb)).not.toMatch(/^items\/[^=\n]+=/m);
    const get = await store(sb, ['get', 'containers/items']);
    expect(get.stdout).toMatch(/retired: "a"\nretired: "b"\nstate: "dropped"\n$/);
    expect((await store(sb, ['list', 'containers'])).stdout).toBe('');
    expect((await store(sb, ['list', 'containers', '--dropped'])).stdout).toBe('items | description: the items container | minting: given\n');
  });

  it('[store-r8] a dropped container refuses writes and reads not found, and a second drop reads not found, nothing written', async () => {
    const sb = sandbox();
    await store(sb, ['delete', 'containers/items']);
    const before = storeState(sb);
    refused(await store(sb, ['put', 'items/c', '--what=c']), 'put', SV, "container 'items' is dropped (put containers/items declares it again)");
    refused(await store(sb, ['set', 'items/a', '--what=x']), 'set', SV, "container 'items' is dropped (put containers/items declares it again)");
    refused(await store(sb, ['delete', 'items/a']), 'delete', SV, "container 'items' is dropped (put containers/items declares it again)");
    refused(await store(sb, ['get', 'items/a']), 'get', MISSING, "container 'items' is dropped");
    refused(await store(sb, ['delete', 'containers/items']), 'delete', MISSING, "container 'items' is already dropped");
    refused(await store(sb, ['set', 'containers/items', '--description=x']), 'set', MISSING, "container 'items' is dropped (put containers/items declares it again)");
    expect(storeState(sb)).toBe(before);
  });

  it('[store-r8] declaring a dropped name again starts fresh, may choose the other minting, and inherits the retired ids', async () => {
    const sb = sandbox();
    await store(sb, ['delete', 'items/b']);
    await store(sb, ['delete', 'containers/items']);
    const put = await store(sb, ['put', 'containers/items', '--description=fresh', '--minting=generated', '--add-fields=body: optional line']);
    expect([put.code, put.stdout, put.stderr]).toEqual([0, 'items\n', '']);
    expect((await store(sb, ['get', 'containers/items'])).stdout).toBe('description: "fresh"\nminting: "generated"\nfields: "body: optional line"\nretired: "b"\nretired: "a"\n');
    const minted = await store(sb, ['put', 'items', '--body=x']);
    expect([minted.code, minted.stderr]).toEqual([0, '']);
    expect(minted.stdout).toMatch(/^\d{4}-\d{2}-\d{2}-[a-z0-9]{5}\n$/);
    await store(sb, ['set', 'containers/items', '--minting=given']);
    refused(await store(sb, ['put', 'items/a', '--body=x']), 'put', EXISTS, "id 'a' is retired in container 'items' (a deleted id is never handed out again)");
    expect((await store(sb, ['put', 'items/c', '--body=x'])).code).toBe(0);
    expect((await store(sb, ['list', 'containers', '--dropped'])).stdout).toBe('');
  });
});
