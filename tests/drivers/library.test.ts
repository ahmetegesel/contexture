import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataFile, moduleDir } from '../support/data-file';
import { RECORD_ROOT } from '../support/drawer';
import { sandbox } from '../support/sandbox';
import { shFunction } from '../support/sh';
import { fresh, seed } from '../support/snapshot';
import { DRIVERS, type Driver, fts5Available } from '../support/stage';
import { batchPayload } from '../support/store';
import { answer, refused } from '../support/wire';

const LIBRARY = '.contexture/storage/scripts/library';
const LIBPROBE = 'namespace: libprobe\nroot: libprobe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n';

const lib = (sb: string, fn: string, args: string[] = [], input = '', env: Record<string, string> = {}) =>
  shFunction(sb, join(sb, LIBRARY), fn, args, { input, env: { CTX_STORE_ROOT: sb, ...env } });

function refScript(sb: string, dir: string, module: string, body: string): void {
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  writeFileSync(join(dir, 'data'), `namespace: ${module}\nroot: ${module}-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n`);
  writeFileSync(join(dir, 'scripts/data'), `. "\${CTX_STORE_ROOT:-$PWD}/${LIBRARY}"\ncase "\${1:-}" in\n  data_get)\n    case "\${2:-}" in\n${body}\n      *) printf 'data_get: error: item '\\''%s'\\'' not found (ERR_ENTITY_NOT_FOUND)\\n' "\${2#${module}#}" >&2; exit 1 ;;\n    esac ;;\n  *) exit 1 ;;\nesac\n`, { mode: 0o755 });
}

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'fts5' && !fts5Available())(`the library's store calls on ${driver}`, { concurrent: true }, () => {
    let snap: string;
    beforeAll(async () => {
      snap = await seed(async (sb) => void dataFile(sb, 'modules', 'libprobe', LIBPROBE), driver, 'library');
    });

    it('[the-engine-r19] answers the store five through the core resolver', async () => {
      const sb = fresh(snap);
      expect((await lib(sb, 'store_put', ['libprobe', 'x/y'], 'library-value\n')).stdout).toBe('{"namespace":"libprobe","key":"x/y","op":"write"}\n');
      expect((await lib(sb, 'store_get', ['libprobe', 'x/y'])).stdout).toBe('library-value\n');
      expect((await lib(sb, 'store_list', ['libprobe'])).stdout).toBe('{"namespace":"libprobe","keys":["x/y"]}\n');
      expect((await lib(sb, 'store_delete', ['libprobe', 'x/y'])).stdout).toBe('{"namespace":"libprobe","key":"x/y","op":"remove"}\n');
    });

    it('[the-engine-r-b3r6t] store_promote reaches the driver\'s optional promotion through the core resolver', async () => {
      const r = await lib(fresh(snap), 'store_promote', ['libprobe', 'x/']);
      if (driver === 'posix') expect(answer(r, 'store.promote')).toEqual({ namespace: 'libprobe', prefix: 'x/', state: 'none' });
      else refused(r, 'store.promote', 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'store.promote'");
    });

    it('[the-engine-r9, the-engine-r19] answers the batch and the scan, and an escaped search query', async () => {
      const sb = fresh(snap);
      expect((await lib(sb, 'store_batch', ['libprobe'], batchPayload([{ action: 'put', key: 'x/y', head: 'none', value: 'library-value\n' }]))).stdout)
        .toBe('{"namespace":"libprobe","actions":1}\n');
      expect((await lib(sb, 'store_scan', ['libprobe'])).stdout).toBe(`{"namespace":"libprobe","items":[{"key":"x/y","value_b64":"${Buffer.from('library-value\n').toString('base64')}"}]}\n`);
      const found = answer(await lib(sb, 'store_search', ['libprobe', 'library-value', 'exact', '5']), 'store.search');
      expect([found.query, found.total_matches]).toEqual(['library-value', 1]);
    });

    it('[the-engine-r21] keeps the driver\'s one refusal line, the batch\'s action context included', async () => {
      const sb = fresh(snap);
      refused(await lib(sb, 'store_get', ['libprobe', 'x/absent']), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'x/absent' not found in namespace 'libprobe'");
      refused(await lib(sb, 'store_batch', ['libprobe'], 'action=delete\nkey=x/absent\nhead=none\n'), 'store.batch', 1, 'ERR_ENTITY_NOT_FOUND',
        "action 1 (delete 'x/absent'): key 'x/absent' not found in namespace 'libprobe'");
    });

    it('[the-engine-r15] asks the driver\'s capabilities through store_require and store_has', async () => {
      const sb = fresh(snap);
      expect((await lib(sb, 'store_require', ['store'])).code).toBe(0);
      expect((await lib(sb, 'store_has', ['store.changelog'])).code).toBe(driver === 'fts5' ? 0 : 1);
    });
  });
}

describe('the library\'s ref interface and resolver lookup', { concurrent: true }, () => {
  let snap: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      refScript(sb, moduleDir(sb, 'modules', 'fixture'), 'fixture', [
        '      fixture#item) data_emit "$2" \'{"name":"item","value":"one"}\' ;;',
        '      fixture#depth:[1-8]) n=${2##*:}; if [ "$n" -lt 8 ]; then data_get "fixture#depth:$((n + 1))" || exit $?; else data_emit "$2" \'{"name":"depth","value":"8"}\'; fi ;;',
        '      fixture#deep:[0-9]*) n=${2##*:}; data_get "fixture#deep:$((n + 1))" || exit $? ;;',
        '      fixture#cycle:*) data_get "$2" || exit $? ;;',
      ].join('\n'));
      refScript(sb, moduleDir(sb, 'extensions', 'extprobe'), 'extprobe', '      extprobe#item) data_emit "$2" \'{"name":"extension","value":"one"}\' ;;');
      refScript(sb, join(sb, 'base/.contexture/extensions/modules/baseprobe'), 'baseprobe', '      baseprobe#item) data_emit "$2" \'{"name":"base","value":"one"}\' ;;');
    }, 'posix', 'refs');
  });

  const get = async (ref: string) => lib(fresh(snap), 'data_get', [ref]);

  it('[the-engine-r19] data_emit prints the one-line envelope', async () => {
    expect((await lib(fresh(snap), 'data_emit', ['fixture#item', '{"x":1}'])).stdout).toBe('{"ref":"fixture#item","data":{"x":1}}\n');
  });

  it.each([
    ['fixture#item', '{"ref":"fixture#item","data":{"name":"item","value":"one"}}'],
    ['fixture#depth:1', '{"ref":"fixture#depth:8","data":{"name":"depth","value":"8"}}'],
    ['extprobe#item', '{"ref":"extprobe#item","data":{"name":"extension","value":"one"}}'],
    ['baseprobe#item', '{"ref":"baseprobe#item","data":{"name":"base","value":"one"}}'],
  ])('[the-engine-r19] data_get resolves %s (the workspace module, the eighth hop, the extension root, the base mirror)', async (ref, line) => {
    const r = await get(ref);
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe(`${line}\n`);
  });

  it.each([
    ['fixture#deep:1', /^data_get: error: .*ref depth over the limit 8 \(ERR_INVALID_ARGUMENT\)\n$/],
    ['fixture#cycle:a', /^data_get: error: .*ref cycle \(ERR_INVALID_ARGUMENT\)\n$/],
  ])('[the-engine-r21] data_get refuses %s with one line and no answer', async (ref, line) => {
    const r = await get(ref);
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toMatch(line);
  });

  it.each([
    ['fixture#absent', 'ERR_ENTITY_NOT_FOUND', "ref 'fixture#absent': item 'absent' not found"],
    ['ghost#x', 'ERR_ENTITY_NOT_FOUND', "ref 'ghost#x': module 'ghost' not found"],
    ['nohash', 'ERR_INVALID_ARGUMENT', "ref 'nohash': a reference is <module>#<symbol>"],
  ])('[the-engine-r21] data_get re-frames %s as its fixed line', async (ref, code, message) => {
    refused(await get(ref), 'data_get', 1, code, message);
  });

  it('[the-engine-r26] finds the resolver through CTX_STORE_RESOLVER, then the drawer, then the base mirror', async () => {
    const sb = fresh(snap);
    dataFile(sb, 'modules', 'libprobe', LIBPROBE);
    const resolver = join(sb, '.contexture/storage/scripts/driver-resolver');
    expect((await lib(sb, 'store_list', ['libprobe'], '', { CTX_STORE_RESOLVER: resolver })).stdout).toBe('{"namespace":"libprobe","keys":[]}\n');
    mkdirSync(join(sb, 'base/.contexture'), { recursive: true });
    renameSync(join(sb, '.contexture/storage'), join(sb, 'base/.contexture/storage'));
    mkdirSync(join(sb, '.contexture/storage/scripts'), { recursive: true });
    renameSync(join(sb, 'base/.contexture/storage/scripts/library'), join(sb, LIBRARY));
    const viaMirror = await lib(sb, 'store_list', ['libprobe']);
    expect(viaMirror.stderr).toBe('');
    expect(viaMirror.stdout).toBe('{"namespace":"libprobe","keys":[]}\n');
  });

  it('[the-engine-r26] store_roots lists every declared root, namespace TAB root, through the storage core\'s data reader, never the driver', async () => {
    const sb = fresh(snap);
    const r = await lib(sb, 'store_roots');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(`extprobe\textprobe-root\nfixture\tfixture-root\nunit\t${RECORD_ROOT}\n`);
  });

  it('[the-engine-r26] store_roots finds the data reader beside the resolver the library calls, reading the workspace root\'s declarations', async () => {
    const staged = fresh(snap);
    const sb = sandbox('roots-beside');
    dataFile(sb, 'modules', 'libprobe', LIBPROBE);
    const r = await shFunction(sb, join(staged, LIBRARY), 'store_roots', [], {
      env: { CTX_STORE_ROOT: sb, CTX_STORE_RESOLVER: join(staged, '.contexture/storage/scripts/driver-resolver') },
    });
    expect([r.code, r.stderr, r.stdout]).toEqual([0, '', 'libprobe\tlibprobe-root\n']);
  });

  it('[the-engine-r26, the-engine-r-cj0ey] store_roots answers a declared fallback root on its own line after its root, reading the listing\'s third column', async () => {
    const staged = fresh(snap);
    const sb = sandbox('roots-fallback');
    dataFile(sb, 'modules', 'libprobe', LIBPROBE);
    dataFile(sb, 'modules', 'legacy', 'namespace: legacy\nroot: new-root\nfallback_root: old-root\nkey: <u>\n');
    const r = await shFunction(sb, join(staged, LIBRARY), 'store_roots', [], {
      env: { CTX_STORE_ROOT: sb, CTX_STORE_RESOLVER: join(staged, '.contexture/storage/scripts/driver-resolver') },
    });
    expect([r.code, r.stderr, r.stdout]).toEqual([0, '', 'legacy\tnew-root\nlegacy\told-root\nlibprobe\tlibprobe-root\n']);
  });

  it('[the-engine-r21, the-engine-r26] store_roots refuses rc 2 with one line when no data reader is found', async () => {
    const sb = sandbox('no-reader');
    mkdirSync(join(sb, '.contexture/modules'), { recursive: true });
    const r = await shFunction(sb, join(fresh(snap), LIBRARY), 'store_roots', [], { env: { CTX_STORE_ROOT: sb } });
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', 'store.roots: error: the storage core data reader is not installed (ERR_DRIVER_NOT_FOUND)\n']);
  });

  it('[the-engine-r21, the-engine-r26] refuses with the driver-not-found line when no resolver is found', async () => {
    const sb = sandbox('no-resolver');
    mkdirSync(join(sb, '.contexture/storage/scripts'), { recursive: true });
    writeFileSync(join(sb, LIBRARY), '');
    const staged = fresh(snap);
    const r = await shFunction(sb, join(staged, LIBRARY), 'store_list', ['docs'], { env: { CTX_STORE_ROOT: sb } });
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toMatch(/^store\.list: error: .*\(ERR_DRIVER_NOT_FOUND\)\n$/);
  });
});
