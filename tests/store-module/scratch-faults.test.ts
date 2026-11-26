import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { ROOT_USER, mktempPlant, pathPlant } from '../support/plants';
import { sandbox as tmp } from '../support/sandbox';
import { run } from '../support/unit';
import { declare, snapshot, store, storeState } from './support';

const FIELDS = ['what: required line', 'note: optional block'];
const BLOCK = 'a block long enough to fill more than one od line\n';
const SCRATCH = ['ERR_STORAGE_WRITE', 'cannot write the verb scratch'] as const;
const STDIN = ['ERR_STORAGE_READ', 'cannot read the block on stdin'] as const;

let sandbox: () => string;
beforeAll(async () => {
  sandbox = await snapshot('store-scratch-faults', async (sb) => {
    await declare(sb, 'items', 'given', FIELDS);
    await store(sb, ['put', 'items/held', '--what=held', '--stdin=note'], 'a note long enough to fill more than one od line\n');
    await store(sb, ['put', 'items/kept', '--what=kept', '--add-ref=file#./README.md']);
  });
});

// a scratch file of the store verb planted read only before the verb writes it, holding the
// start of what the write would hold, the way a full disk leaves a short file
const cut = (name: string, start: string): Record<string, string> =>
  mktempPlant(`case "$p" in */store.*) if [ -d "$p" ]; then printf '%s' '${start}' > "$p/${name}"; chmod 400 "$p/${name}"; fi ;; esac`);

const REAL_CAT = spawnSync('sh', ['-c', 'command -v cat'], { encoding: 'utf8' }).stdout.trim();

const WRITES: readonly [what: string, argv: string[], input: string, file: string, start: string, refusal: readonly [string, string]][] = [
  ['a record delete whose rewritten declaration', ['delete', 'items/held'], '', 'd.new', 'description: "it', SCRATCH],
  ['a container drop whose rewritten declaration', ['delete', 'containers/items'], '', 'd.new', 'description: "it', SCRATCH],
  ['a record delete whose batch', ['delete', 'items/held'], '', 'batch', 'action=delete\nkey=items/held\n', SCRATCH],
  ['a container drop whose batch', ['delete', 'containers/items'], '', 'batch', 'action=delete\nkey=items/held\n', SCRATCH],
  ['a container drop whose key list', ['delete', 'containers/items'], '', 'drop.keys', 'items/held\n', SCRATCH],
  ['a block set whose copy of stdin', ['set', 'items/kept', '--stdin=note'], BLOCK, 'block', 'a blo', STDIN],
  ['a block put whose copy of stdin', ['put', 'items/new', '--what=new', '--stdin=note'], BLOCK, 'block', 'a blo', STDIN],
  ['a record put whose staged record', ['put', 'items/new', '--what=new'], '', 'new.rec', 'what: "cu', SCRATCH],
  ['a record set whose staged record', ['set', 'items/kept', '--what=changed'], '', 'new.rec', 'what: "cu', SCRATCH],
  ['a record set whose ref lines', ['set', 'items/kept', '--add-ref=file#./AGENTS.md'], '', 'new.refs', '', SCRATCH],
  ['a declaration put whose staged declaration', ['put', 'containers/other', '--description=other', '--minting=given', '--add-fields=what: required line'], '', 'new.rec', 'what: "cu', SCRATCH],
  ['a declaration set whose staged declaration', ['set', 'containers/items', '--description=changed'], '', 'new.rec', 'description: "cu', SCRATCH],
  ['a put of a stored id whose twin key list', ['put', 'items/held', '--what=overwritten'], '', 'twin.keys', '', SCRATCH],
  ['a put of a live declaration whose read answer', ['put', 'containers/items', '--description=fresh', '--minting=given'], '', 'fetch.out', '', SCRATCH],
  ['a record put whose actions file', ['put', 'items/new', '--what=new'], '', 'acts', 'set\twhat\tforged\n', SCRATCH],
];

describe.concurrent('the store writes read the status of their own scratch writes: a failing or short write refuses rc 2, one line, nothing written', () => {
  it.skipIf(ROOT_USER).for(WRITES)('[store-r3, store-r4, store-r8] %s cannot be written whole refuses with the declaration and every record unchanged', async ([, argv, input, file, start, [code, message]]) => {
    const sb = sandbox();
    const before = storeState(sb);
    const r = await run(sb, ['store', ...argv], { input, env: cut(file, start) });
    expect(storeState(sb), `rc ${r.code} [${r.stdout}] [${r.stderr}]`).toBe(before);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', `store ${argv[0]}: error: ${message} (${code})\n`]);
  });

  it.skipIf(ROOT_USER)('[store-r4, store-r8] a container drop whose dropped state line cannot be appended refuses with every record and the declaration unchanged', async () => {
    const sb = sandbox();
    const before = storeState(sb);
    const env = pathPlant('cat', `case "\${4:-}" in */ri.state) '${REAL_CAT}' "$@" || exit; chmod 400 "\${4%/*}/d.new"; exit 0 ;; esac\nexec '${REAL_CAT}' "$@"`);
    const r = await run(sb, ['store', 'delete', 'containers/items'], { env });
    expect(storeState(sb), `rc ${r.code} [${r.stdout}] [${r.stderr}]`).toBe(before);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', `store delete: error: ${SCRATCH[1]} (${SCRATCH[0]})\n`]);
  });

  // a resolver wrapping the sandbox's own, answering the listing of items/ with the given shell step
  const listing = (sb: string, step: string): Record<string, string> => {
    const wrapper = join(tmp('listing-resolver'), 'resolver');
    writeFileSync(wrapper, `#!/bin/sh\ncase " $* " in *' store.list '*items/*) ${step} ;; esac\nexec '${join(sb, '.contexture/storage/scripts/driver-resolver')}' "$@"\n`, { mode: 0o755 });
    return { CTX_STORE_RESOLVER: wrapper };
  };

  it('[store-r3, store-r4] a put whose id check listing refuses ends with that refusal and never writes over the stored record', async () => {
    const sb = sandbox();
    const before = storeState(sb);
    const r = await run(sb, ['store', 'put', 'items/held', '--what=overwritten'], { env: listing(sb, `printf 'store.list: error: planted listing failure (ERR_STORAGE_READ)\\n' >&2; exit 2`) });
    expect(storeState(sb), `rc ${r.code} [${r.stdout}] [${r.stderr}]`).toBe(before);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', 'store put: error: planted listing failure (ERR_STORAGE_READ)\n']);
  });

  it('[store-r4, store-r8] a container drop whose key listing arrives cut refuses rc 2 ERR_STORAGE_READ and never drops part of the container', async () => {
    const sb = sandbox();
    const before = storeState(sb);
    const r = await run(sb, ['store', 'delete', 'containers/items'], { env: listing(sb, `printf '{"namespace":"store","keys":["items/held",'; exit 0`) });
    expect(storeState(sb), `rc ${r.code} [${r.stdout}] [${r.stderr}]`).toBe(before);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', 'store delete: error: cannot read the key listing whole (ERR_STORAGE_READ)\n']);
  });

  it('[store-r3, store-r8] the same writes land with nothing planted', async () => {
    const sb = sandbox();
    expect((await store(sb, ['set', 'items/kept', '--stdin=note', '--add-ref=file#./AGENTS.md'], 'a block\n')).code).toBe(0);
    expect((await store(sb, ['get', 'items/kept'])).stdout).toContain('note ::\n  a block\nref: "file#./README.md"\nref: "file#./AGENTS.md"\n');
    expect((await store(sb, ['delete', 'items/held'])).code).toBe(0);
    expect((await store(sb, ['put', 'items/held', '--what=again'])).code).toBe(1);
    expect((await store(sb, ['delete', 'containers/items'])).code).toBe(0);
    expect((await store(sb, ['get', 'containers/items'])).stdout).toMatch(/retired: "held"\nretired: "kept"\nstate: "dropped"\n$/);
  });
});
