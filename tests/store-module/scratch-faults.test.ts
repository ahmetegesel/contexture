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

const READS: readonly [what: string, argv: string[], file: string, start: string][] = [
  ['a record get whose record without its refs', ['get', 'items/held'], 'eff.core', 'what: "cu'],
  ['a record get whose ref lines', ['get', 'items/kept'], 'eff.refs', ''],
  ['a record get whose record with its defaults read in', ['get', 'items/held'], 'eff.filled', 'what: "cu'],
  ['a record get whose library call error file', ['get', 'items/held'], 'err', 'store.get: error: forged (ERR_ENTITY_NOT_FOUND)\n'],
  ['a list whose key list', ['list', 'items'], 'keys', 'items/held\n'],
  ['a list whose first value', ['list', 'items'], 'r.1', 'what: "cu'],
  ['a list whose second record with its defaults read in', ['list', 'items'], 'r.2.eff', 'what: "cu'],
  ['a list of the containers whose first value', ['list', 'containers'], 'r.1', 'description: "cu'],
  ['a search whose mode list', ['search', 'held'], 'modes', 'exact\n'],
  ['a search whose container key list', ['search', 'held'], 'ckeys', ''],
  ['a search whose storage layer answer', ['search', 'held'], 'search.json', '{"query":"held","rows":['],
  ['a search whose flattened answer', ['search', 'held'], 'search.flat', ''],
  ['a check whose key list', ['check', 'items'], 'keys', ''],
  ['a check whose record without its refs', ['check', 'items'], 'r.1.core', 'what: "cu'],
  ['a check whose verdict file', ['check', 'items'], 'r.1.check', ''],
  ['a check of nonconforming records whose second record without its refs', ['check', 'loose'], 'r.2.core', ''],
  ['a leftovers check whose probe answer', ['check', '--leftovers'], 'leftovers', ''],
  ['a leftovers check whose text', ['check', '--leftovers'], 'leftovers.text', ''],
  ['a leftovers sweep dry run whose report', ['check', '--leftovers', '--sweep', '--dry-run'], 'sweep', ''],
  ['a record get whose fetched record', ['get', 'items/held'], 'rec', 'what: "cu'],
  ['a record get whose fetched declaration', ['get', 'items/held'], 'd.rec', 'description: "cu'],
  ['a record get whose fetch error file', ['get', 'items/held'], 'fetch.err', ''],
  ['a list whose batched read answer', ['list', 'items'], 'all.targets.ans', ''],
  ['a list whose batched read error file', ['list', 'items'], 'all.targets.err', ''],
];

const REAL_AWK = spawnSync('sh', ['-c', 'command -v awk'], { encoding: 'utf8' }).stdout.trim();

// full: the nth awk run of one kind writes under a zero file size limit with SIGXFSZ ignored, so
// every byte it writes into a file that opened fails, its error file included, as a full disk
// fails it
const full = (kind: string, nth = 1): Record<string, string> =>
  pathPlant('awk', `m=0\n${kind}\nif [ "$m" = 1 ]; then\n  c="\${0%/*}/count"; n=$(cat "$c" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "$c"\n  if [ "$n" = ${nth} ]; then trap '' XFSZ; ulimit -f 0; exec '${REAL_AWK}' "$@"; fi\nfi\nexec '${REAL_AWK}' "$@"`);
const VALIDATOR = (mode: string) => `[ "\${SF_MODE:-}" = ${mode} ] && m=1`;
const FLATTENER = 'case " $* " in *json.awk*) m=1 ;; esac';

const FULL: readonly [what: string, argv: string[], kind: string, nth: number][] = [
  ['a check of nonconforming records whose first verdict', ['check', 'loose'], VALIDATOR('conforms'), 1],
  ['a record get whose record with its defaults read in', ['get', 'items/held'], VALIDATOR('effective'), 1],
  ['a list whose second record with its defaults read in', ['list', 'items'], VALIDATOR('effective'), 2],
  ['a list whose flattened key listing', ['list', 'items'], FLATTENER, 1],
  ['a search whose flattened answer', ['search', 'held'], FLATTENER, 2],
];

describe.concurrent('the store reads read the status of their own scratch writes: a failing or short write refuses rc 2, one line, no partial answer', () => {
  let reads: () => string;
  beforeAll(async () => {
    reads = await snapshot('store-scratch-reads', async (sb) => {
      await declare(sb, 'items', 'given', [...FIELDS, 'level: optional line default low']);
      await store(sb, ['put', 'items/held', '--what=held', '--stdin=note'], 'a note long enough to fill more than one od line\n');
      await store(sb, ['put', 'items/kept', '--what=kept', '--add-ref=file#./README.md']);
      await declare(sb, 'loose', 'given', ['what: optional line']);
      await store(sb, ['put', 'loose/a', '--what=a']);
      await store(sb, ['put', 'loose/b', '--what=b']);
      await store(sb, ['set', 'containers/loose', '--add-fields=need: required line']);
    });
  });

  it.skipIf(ROOT_USER).for(READS)('[store-r4, store-r6] %s cannot be written whole refuses with nothing on stdout', async ([, argv, file, start]) => {
    const sb = reads();
    const before = storeState(sb);
    const r = await run(sb, ['store', ...argv], { env: cut(file, start) });
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', `store ${argv[0]}: error: ${SCRATCH[1]} (${SCRATCH[0]})\n`]);
    expect(storeState(sb)).toBe(before);
  });

  it.for(FULL)('[store-r4, store-r6] %s written onto a full disk refuses with nothing on stdout, never a partial answer', async ([, argv, kind, nth]) => {
    const sb = reads();
    const before = storeState(sb);
    const r = await run(sb, ['store', ...argv], { env: full(kind, nth) });
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', `store ${argv[0]}: error: ${SCRATCH[1]} (${SCRATCH[0]})\n`]);
    expect(storeState(sb)).toBe(before);
  });

  it('[store-r4, store-r6] the same reads answer whole with nothing planted', async () => {
    const sb = reads();
    expect(await store(sb, ['get', 'items/kept'])).toMatchObject({ code: 0, stdout: 'what: "kept"\nlevel: "low"\nref: "file#./README.md"\n', stderr: '' });
    const list = await store(sb, ['list', 'items']);
    expect([list.code, list.stderr]).toEqual([0, '']);
    expect(list.stdout.split('\n').filter(Boolean).map((l) => l.split(' | ')[0])).toEqual(['held', 'kept']);
    expect((await store(sb, ['search', 'held'])).stdout).toContain('items/held');
    expect(await store(sb, ['check', 'items'])).toMatchObject({ code: 0, stdout: '', stderr: '' });
    expect(await store(sb, ['check', 'loose'])).toMatchObject({ code: 1, stdout: 'loose/a: need: required and absent\nloose/b: need: required and absent\n', stderr: '' });
    expect(await store(sb, ['check', '--leftovers'])).toMatchObject({ code: 0, stdout: '', stderr: '' });
  });
});
