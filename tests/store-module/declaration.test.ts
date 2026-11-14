import { beforeAll, describe, expect, it } from 'vitest';
import { declare, declareFlags, EXISTS, IDEAS, INV, MISSING, refused, snapshot, store, stored, SV } from './support';

let sandbox: () => string;
beforeAll(async () => {
  sandbox = await snapshot('store-declaration');
});

const IDEAS_RECORD = [
  'description: "the ideas container"',
  'minting: "given"',
  ...IDEAS.map((f) => `fields: "${f}"`),
].join('\n');

describe.concurrent('the store declarations: the containers container', () => {
  it('[store-r1] put containers/<name> declares a container in one record, prints its name, and get reads it whole', async () => {
    const sb = sandbox();
    const put = await store(sb, ['put', 'containers/ideas', ...declareFlags('the ideas container', 'given', IDEAS)]);
    expect([put.code, put.stdout, put.stderr]).toEqual([0, 'ideas\n', '']);
    const get = await store(sb, ['get', 'containers/ideas']);
    expect([get.code, get.stdout, get.stderr]).toEqual([0, `${IDEAS_RECORD}\n`, '']);
  });

  it('[store-r1] get --json answers the declaration with its field lines as a list', async () => {
    const sb = sandbox();
    await declare(sb, 'ideas');
    const r = await store(sb, ['get', 'containers/ideas', '--json']);
    expect(r.code).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({
      container: 'containers',
      id: 'ideas',
      address: 'store#containers/ideas',
      record: { description: 'the ideas container', minting: 'given', fields: IDEAS },
    });
  });

  it('[store-r1] list containers prints one line per declared container: its name, description, and minting', async () => {
    const sb = sandbox();
    await declare(sb, 'memos', 'generated', ['body: required block']);
    await declare(sb, 'ideas');
    const r = await store(sb, ['list', 'containers']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'ideas | description: the ideas container | minting: given\nmemos | description: the memos container | minting: generated\n', '']);
    const json = JSON.parse((await store(sb, ['list', 'containers', '--json'])).stdout);
    expect(json.total).toBe(2);
    expect(json.records.map((x: { id: string }) => x.id)).toEqual(['ideas', 'memos']);
  });

  it('[store-r1] list containers on an empty store prints nothing rc 0', async () => {
    const r = await store(sandbox(), ['list', 'containers']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });

  it('[store-r1] a declaration takes no field lines at all', async () => {
    const sb = sandbox();
    await declare(sb, 'empty', 'generated', []);
    expect((await store(sb, ['get', 'containers/empty'])).stdout).toBe('description: "the empty container"\nminting: "generated"\n');
  });

  it.each([
    ['a reserved field name', ['json: optional line'], INV, "field 'json': the name is reserved (json, limit, type, mode, container, id, ref, unset, stdin, any name starting with add-, any name starting with remove-)"],
    ['a reserved prefix', ['add-x: optional line'], INV, "field 'add-x': the name is reserved (json, limit, type, mode, container, id, ref, unset, stdin, any name starting with add-, any name starting with remove-)"],
    ['a duplicate field name', ['x: optional line', 'x: required line'], INV, "field 'x': declared twice"],
    ['a malformed field line', ['x: optional text'], INV, "field 'x': the shape clause is line or block, not 'text'"],
    ['a trailing blank', ['x: optional line '], INV, "field 'x': the line ends with a blank"],
    ['a clause after one-of', ['x: optional line one-of A|B list'], INV, "field 'x': a clause after one-of ('list'): only a default may follow the one-of set"],
  ])('[store-r1, store-r4] refuses %s rc 1 naming the field and the clause, nothing written', async (_name, fields, code, message) => {
    const sb = sandbox();
    refused(await store(sb, ['put', 'containers/bad', ...declareFlags('bad', 'given', fields)]), 'put', code, message);
    expect(stored(sb)).toEqual([]);
  });

  it.each([
    ['a missing description', ['--minting=given'], SV, "field 'description' is required and absent"],
    ['a missing minting', ['--description=x'], SV, "field 'minting' is required and absent"],
    ['a minting outside its set', ['--description=x', '--minting=sometimes'], SV, "field 'minting': 'sometimes' is not one of given|generated"],
    ['an unknown declaration field', ['--description=x', '--minting=given', '--owner=me'], SV, "field 'owner' is not declared"],
    ['the store kept retired list', ['--description=x', '--minting=given', '--add-retired=a'], SV, "field 'retired' is not declared (the store keeps it)"],
    ['the store kept state', ['--description=x', '--minting=given', '--state=dropped'], SV, "field 'state' is not declared (the store keeps it)"],
    ['a newline in the description', ['--description=a\nb', '--minting=given'], INV, "field 'description': a line value holds a newline or a carriage return"],
  ])('[store-r1, store-r4] refuses %s rc 1, nothing written', async (_name, flags, code, message) => {
    const sb = sandbox();
    refused(await store(sb, ['put', 'containers/bad', ...flags]), 'put', code, message);
    expect(stored(sb)).toEqual([]);
  });

  it('[store-r1] a declared name refuses rc 1 ERR_ENTITY_EXISTS and keeps the first declaration', async () => {
    const sb = sandbox();
    await declare(sb, 'ideas');
    refused(await store(sb, ['put', 'containers/ideas', '--description=other', '--minting=generated']), 'put', EXISTS, "container 'ideas' is already declared (set containers/ideas changes it)");
    expect((await store(sb, ['get', 'containers/ideas'])).stdout).toBe(`${IDEAS_RECORD}\n`);
  });

  it.each([
    ['the reserved name containers', 'containers/containers', "'containers' is the store's reserved container name"],
    ['a malformed name', 'containers/-x', "malformed id '-x' (letters, digits, underscore, and dash, starting with a letter or digit)"],
    ['a nested path', 'containers/a/b', "malformed path 'containers/a/b' (a path is <container>/<id>)"],
  ])('[store-r1] refuses %s rc 1 ERR_INVALID_ARGUMENT', async (_name, path, message) => {
    const sb = sandbox();
    refused(await store(sb, ['put', path, '--description=x', '--minting=given']), 'put', INV, message);
    expect(stored(sb)).toEqual([]);
  });

  it('[store-r1] get of an undeclared container refuses rc 1 ERR_ENTITY_NOT_FOUND naming it', async () => {
    refused(await store(sandbox(), ['get', 'containers/nope']), 'get', MISSING, "container 'nope' is not declared");
  });

  it('[store-r1, the-engine-r7] a sole --help prints the verb table rc 0', async () => {
    const sb = sandbox();
    for (const verb of ['get', 'list', 'put']) {
      const r = await store(sb, [verb, '--help']);
      expect([r.code, r.stderr]).toEqual([0, '']);
      expect(r.stdout).toBe((await store(sb, ['help', verb])).stdout);
    }
  });
});
