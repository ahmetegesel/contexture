import { existsSync, mkdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { dataFile, moduleDir } from '../support/data-file';
import { FALLBACK_ROOT, RECORD_ROOT } from '../support/drawer';
import { sandbox } from '../support/sandbox';
import { exec } from '../support/exec';
import { moduleCall, moduleScript, shFunction } from '../support/sh';
import { fresh, seed } from '../support/snapshot';
import { DRIVERS, type Driver, fts5Available } from '../support/stage';
import { batchPayload } from '../support/store';
import { answer, refused, refusedLike } from '../support/wire';

const LIBRARY = '.contexture/storage/scripts/library';
const LIBPROBE = 'root: libprobe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n';

const own = (sb: string, fn: string, args: string[] = [], input = '', env: Record<string, string> = {}, module = 'libprobe') =>
  moduleCall(sb, module, join(sb, LIBRARY), fn, args, { input, env: { CTX_STORE_ROOT: sb, ...env } });

const SHELLS = ['sh', ...(['/bin/dash', '/usr/bin/dash'].some((p) => existsSync(p)) ? ['dash'] : [])];

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'fts5' && !fts5Available())(`the library's store calls on ${driver}`, { concurrent: true }, () => {
    let snap: string;
    beforeAll(async () => {
      snap = await seed(async (sb) => void dataFile(sb, 'modules', 'libprobe', LIBPROBE), driver, 'library');
    });

    it('[the-engine-r19] answers the store five through the core resolver', async () => {
      const sb = fresh(snap);
      expect((await own(sb, 'store_put', ['x/y'], 'library-value\n')).stdout).toBe('{"namespace":"libprobe","key":"x/y","op":"write"}\n');
      expect((await own(sb, 'store_get', ['x/y'])).stdout).toBe('library-value\n');
      expect((await own(sb, 'store_list')).stdout).toBe('{"namespace":"libprobe","keys":["x/y"]}\n');
      expect((await own(sb, 'store_delete', ['x/y'])).stdout).toBe('{"namespace":"libprobe","key":"x/y","op":"remove"}\n');
    });

    it('[the-engine-r8] store_modes answers the registry, and with --own the modes the caller\'s namespace can answer: a ranked mode only under a declared search schema', async () => {
      const sb = fresh(snap);
      dataFile(sb, 'modules', 'schemaprobe', 'root: schemaprobe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\n');
      const names = (out: string) => out.split('\n').filter(Boolean).map((l) => l.split('\t')[0]);
      const registry = driver === 'posix' ? ['exact'] : ['exact', 'hybrid', 'trigram'];
      const all = await own(sb, 'store_modes');
      expect([all.code, all.stderr, names(all.stdout)]).toEqual([0, '', registry]);
      for (const line of all.stdout.split('\n').filter(Boolean)) expect(line).toMatch(/^[a-z]+\t\S.*$/);
      expect(names((await own(sb, 'store_modes', ['--own'], '', {}, 'schemaprobe')).stdout)).toEqual(registry);
      expect(names((await own(sb, 'store_modes', ['--own'])).stdout)).toEqual(['exact']);
      refusedLike(await own(sb, 'store_modes', ['--own'], '', {}, 'nosuchns'), 'store.modes', 1, 'ERR_ENTITY_NOT_FOUND');
      refused(await own(sb, 'store_modes', ['libprobe']), 'store.modes', 1, 'ERR_INVALID_ARGUMENT', 'store.modes takes no argument but --own');
    });

    it('[the-engine-r-b3r6t] store_promote reaches the driver\'s optional promotion through the core resolver', async () => {
      const r = await own(fresh(snap), 'store_promote', ['x/']);
      if (driver === 'posix') expect(answer(r, 'store.promote')).toEqual({ namespace: 'libprobe', prefix: 'x/', state: 'none' });
      else refused(r, 'store.promote', 2, 'ERR_CAPABILITY_UNSUPPORTED', "unknown function 'store.promote'");
    });

    it('[the-engine-r9, the-engine-r19] answers the batch and the scan, and an escaped search query', async () => {
      const sb = fresh(snap);
      expect((await own(sb, 'store_batch', [], batchPayload([{ action: 'put', key: 'x/y', head: 'none', value: 'library-value\n' }]))).stdout)
        .toBe('{"namespace":"libprobe","actions":1}\n');
      expect((await own(sb, 'store_scan')).stdout).toBe(`{"namespace":"libprobe","items":[{"key":"x/y","value_b64":"${Buffer.from('library-value\n').toString('base64')}"}]}\n`);
      const found = answer(await own(sb, 'store_search', ['library-value', 'exact', '5']), 'store.search');
      expect([found.query, found.total_matches]).toEqual(['library-value', 1]);
    });

    it('[the-engine-r21] keeps the driver\'s one refusal line, the batch\'s action context included', async () => {
      const sb = fresh(snap);
      refused(await own(sb, 'store_get', ['x/absent']), 'store.get', 1, 'ERR_ENTITY_NOT_FOUND', "key 'x/absent' not found in namespace 'libprobe'");
      refused(await own(sb, 'store_batch', [], 'action=delete\nkey=x/absent\nhead=none\n'), 'store.batch', 1, 'ERR_ENTITY_NOT_FOUND',
        "action 1 (delete 'x/absent'): key 'x/absent' not found in namespace 'libprobe'");
    });

    it('[the-engine-r15] asks the driver\'s capabilities through store_require and store_has', async () => {
      const sb = fresh(snap);
      expect((await own(sb, 'store_require', ['store'])).code).toBe(0);
      expect((await own(sb, 'store_has', ['store.changelog'])).code).toBe(driver === 'fts5' ? 0 : 1);
    });
  });
}

describe('the library\'s caller lookup', { concurrent: true }, () => {
  let snap: string;
  beforeAll(async () => {
    snap = await seed(async (sb) => {
      dataFile(sb, 'modules', 'libprobe', LIBPROBE);
      dataFile(sb, 'modules', 'other', 'root: other-root\nsuffix: .txt\nkey: <a>/<b>\n');
    }, 'posix', 'caller');
  });

  const call = (sb: string, script: string, args: string[], shell = 'sh', cwd = sb) =>
    exec(shell, [script, join(sb, LIBRARY), ...args], { cwd, env: { CTX_STORE_ROOT: sb } });
  const CALLER = 'f=$1; shift; . "$f" && "$@"\n';

  it('[the-engine-r26] a module\'s script reaches its own namespace alone: two modules write and list their own keys, and no call names a namespace', async () => {
    const sb = fresh(snap);
    expect(answer(await own(sb, 'store_put', ['a/b'], 'one\n'), 'store.put')).toEqual({ namespace: 'libprobe', key: 'a/b', op: 'write' });
    expect(answer(await own(sb, 'store_list', [], '', {}, 'other'), 'store.list')).toEqual({ namespace: 'other', keys: [] });
    expect(answer(await own(sb, 'store_list'), 'store.list')).toEqual({ namespace: 'libprobe', keys: ['a/b'] });
  });

  for (const shell of SHELLS) {
    it(`[the-engine-r26] under ${shell}: the absolute path, a folded dot-dot path, a cd after sourcing, a source inside a function, and a symlinked folder by the link's name`, async () => {
      const sb = fresh(snap);
      const plain = moduleScript(sb, 'libprobe', 'plain', CALLER);
      expect((await call(sb, plain, ['store_namespace'], shell)).stdout).toBe('libprobe\n');
      const dir = moduleDir(sb, 'modules', 'libprobe');
      mkdirSync(join(dir, 'lib'), { recursive: true });
      expect((await call(sb, join(dir, 'lib/../scripts/plain'), ['store_namespace'], shell)).stdout).toBe('libprobe\n');
      const moved = moduleScript(sb, 'libprobe', 'moved', 'f=$1; shift; . "$f"; cd / && "$@"\n');
      expect(answer(await call(sb, moved, ['store_list'], shell), 'store.list')).toEqual({ namespace: 'libprobe', keys: [] });
      const inner = moduleScript(sb, 'libprobe', 'inner', 'g() { . "$1"; shift; "$@"; }\ng "$@"\n');
      expect((await call(sb, inner, ['store_namespace'], shell)).stdout).toBe('libprobe\n');
      symlinkSync(dir, moduleDir(sb, 'modules', 'linked'));
      const viaLink = await call(sb, join(moduleDir(sb, 'modules', 'linked'), 'scripts/plain'), ['store_namespace'], shell);
      expect([viaLink.code, viaLink.stdout, viaLink.stderr]).toEqual([0, 'linked\n', '']);
    });

    it(`[the-engine-r26] under ${shell}: a helper sourced from another module's folder serves the running script's module until it runs that module's own script by path, which serves its own`, async () => {
      const sb = fresh(snap);
      const helperDir = moduleDir(sb, 'modules', 'other');
      mkdirSync(join(helperDir, 'lib'), { recursive: true });
      writeFileSync(join(helperDir, 'lib/helper.sh'), '. "$LIB"\n');
      moduleScript(sb, 'other', 'data', CALLER);
      const lane = moduleScript(sb, 'libprobe', 'lane-verb', `LIB=$1; shift; . "${join(helperDir, 'lib/helper.sh')}"\nstore_namespace\n"${join(helperDir, 'scripts/data')}" "$LIB" store_namespace\nstore_namespace\n`);
      const r = await call(sb, lane, [], shell);
      expect([r.code, r.stdout, r.stderr]).toEqual([0, 'libprobe\nother\nlibprobe\n', '']);
    });

    it(`[the-engine-r26, the-engine-r21] under ${shell}: a relative script path and a script in no module folder refuse rc 1 with one line, the store untouched`, async () => {
      const sb = fresh(snap);
      moduleScript(sb, 'libprobe', 'plain', CALLER);
      const relative = await call(sb, './scripts/plain', ['store_put', 'a/b'], shell, moduleDir(sb, 'modules', 'libprobe'));
      refused(relative, 'store.put', 1, 'ERR_INVALID_ARGUMENT', 'the calling script runs by a relative path, so its module cannot be found (run it by its absolute path, as ctx dispatch does)');
      mkdirSync(join(sb, 'tools'), { recursive: true });
      writeFileSync(join(sb, 'tools/caller'), CALLER);
      const loose = await call(sb, join(sb, 'tools/caller'), ['store_list'], shell);
      refused(loose, 'store.list', 1, 'ERR_INVALID_ARGUMENT', 'the calling script sits in no module folder (no folder above it holds a module manifest), so it has no namespace');
      expect(answer(await own(sb, 'store_list'), 'store.list')).toEqual({ namespace: 'libprobe', keys: [] });
    });
  }

  it('[the-engine-r26] the retired ref interface is gone: no data_get, data_emit, data_lib_ref_ok, or data_lib_module after the library is sourced', async () => {
    const r = await own(fresh(snap), 'eval', ['for f in data_get data_emit data_lib_ref_ok data_lib_module; do command -v "$f" > /dev/null && printf "%s " "$f"; done; command -v store_namespace > /dev/null && printf ok']);
    expect([r.code, r.stdout]).toEqual([0, 'ok']);
  });

  it('[the-engine-r26] finds the resolver through CTX_STORE_RESOLVER, then the drawer, then the base mirror', async () => {
    const sb = fresh(snap);
    dataFile(sb, 'modules', 'libprobe', LIBPROBE);
    const resolver = join(sb, '.contexture/storage/scripts/driver-resolver');
    expect((await own(sb, 'store_list', [], '', { CTX_STORE_RESOLVER: resolver })).stdout).toBe('{"namespace":"libprobe","keys":[]}\n');
    mkdirSync(join(sb, 'base/.contexture'), { recursive: true });
    renameSync(join(sb, '.contexture/storage'), join(sb, 'base/.contexture/storage'));
    mkdirSync(join(sb, '.contexture/storage/scripts'), { recursive: true });
    renameSync(join(sb, 'base/.contexture/storage/scripts/library'), join(sb, LIBRARY));
    const viaMirror = await own(sb, 'store_list');
    expect(viaMirror.stderr).toBe('');
    expect(viaMirror.stdout).toBe('{"namespace":"libprobe","keys":[]}\n');
  });

  it('[the-engine-r26, the-engine-r-cj0ey] store_roots lists every declared root, namespace TAB root, the unit\'s fallback root on its own line, through the storage core\'s data reader, never the driver', async () => {
    const sb = fresh(snap);
    const r = await shFunction(sb, join(sb, LIBRARY), 'store_roots', [], { env: { CTX_STORE_ROOT: sb } });
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(`libprobe\tlibprobe-root\nother\tother-root\nstore\t.contexture/store\nunit\t${RECORD_ROOT}\nunit\t${FALLBACK_ROOT}\n`);
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
    dataFile(sb, 'modules', 'legacy', 'root: new-root\nfallback_root: old-root\nkey: <u>\n');
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
    const r = await moduleCall(sb, 'docs', join(staged, LIBRARY), 'store_list', [], { env: { CTX_STORE_ROOT: sb } });
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toMatch(/^store\.list: error: .*\(ERR_DRIVER_NOT_FOUND\)\n$/);
  });
});
