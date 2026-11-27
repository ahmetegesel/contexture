import { spawnSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { pathPlant } from '../support/plants';
import { run } from '../support/unit';
import { declare, snapshot, store, storeState } from './support';

const FIELDS = ['what: required line', 'note: optional block'];
const READ = 'ERR_STORAGE_READ';

let sandbox: () => string;
beforeAll(async () => {
  sandbox = await snapshot('store-encoder-faults', async (sb) => {
    await declare(sb, 'items', 'given', FIELDS);
    await store(sb, ['put', 'items/held', '--what=held', '--stdin=note'], 'a note long enough to fill more than one od line\n');
    await store(sb, ['put', 'items/kept', '--what=kept']);
  });
});

const REAL_OD = spawnSync('sh', ['-c', 'command -v od'], { encoding: 'utf8' }).stdout.trim();

const FAULTS: readonly [string, string][] = [
  ['fails after its first line', `'${REAL_OD}' "$@" | head -n 1\nexit 1`],
  ['succeeds after its first line', `'${REAL_OD}' "$@" | head -n 1`],
  ['reads one byte more than the file holds', `'${REAL_OD}' "$@"\nprintf ' 0\\n'`],
];

const WRITES: readonly [string, string[], string, string, string][] = [
  ['a record delete', ['delete', 'items/held'], '', 'delete', "cannot encode the declaration of container 'items'"],
  ['a container drop', ['delete', 'containers/items'], '', 'delete', "cannot encode the declaration of container 'items'"],
  ['a block write', ['set', 'items/kept', '--stdin=note'], 'a block long enough to fill more than one od line\n', 'set', 'cannot read the block on stdin'],
];

describe.concurrent('the store writes that encode a value refuse a failed or short encoder read: rc 2, one line, nothing written', () => {
  it.for(FAULTS.flatMap(([how, od]) => WRITES.map(([what, argv, input, verb, message]) => [what, how, od, argv, input, verb, message] as const)))('[store-r3, store-r4, store-r8] %s whose encoder\'s od %s refuses rc 2 with the declaration and the records unchanged', async ([, , od, argv, input, verb, message]) => {
    const sb = sandbox();
    const before = storeState(sb);
    const r = await run(sb, ['store', ...argv], { input, env: pathPlant('od', od) });
    expect(storeState(sb), `rc ${r.code} [${r.stderr}]`).toBe(before);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', `store ${verb}: error: ${message} (${READ})\n`]);
  });

  it('[store-r3, store-r8] the same writes land under the real od', async () => {
    const sb = sandbox();
    expect((await store(sb, ['delete', 'items/held'])).code).toBe(0);
    expect((await store(sb, ['set', 'items/kept', '--stdin=note'], 'a block\n')).code).toBe(0);
    expect((await store(sb, ['get', 'items/kept'])).stdout).toContain('note ::\n  a block\n');
    expect((await store(sb, ['delete', 'containers/items'])).code).toBe(0);
    expect((await store(sb, ['get', 'containers/items'])).stdout).toContain('retired: "held"');
  });
});
