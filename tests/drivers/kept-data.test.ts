import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { exec, type Run } from '../support/exec';
import { holdMove } from '../support/locks';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { DRIVERS, sqliteAvailable, stage } from '../support/stage';
import { type Action, batchPayload, listAnswer } from '../support/store';
import { put } from '../support/tree';
import { answer, refused } from '../support/wire';

const STORE_DATA = join(ROOT, 'base/.contexture/storage/scripts/store-data');

// kept: a kept data declaration as the uninstaller writes it: the data file's bytes beside its
// origin (the package, version, and module <installed name> <original name> lines)
function kept(sb: string, ns: string, data: string, pkg = 'pkg-a', original = ns): string {
  const dir = join(sb, '.contexture/extensions/.state/retained', ns);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'data'), data);
  writeFileSync(join(dir, 'origin'), `package ${pkg}\nversion 1.0.0\nmodule ${ns} ${original}\n`);
  return join(dir, 'data');
}

function workspace(): string {
  const sb = sandbox('kept-data');
  mkdirSync(join(sb, '.contexture/modules'), { recursive: true });
  return sb;
}

const storeData = (sb: string, ...args: string[]): Promise<Run> => exec(STORE_DATA, args, { cwd: sb, env: { CTX_STORE_WORKSPACE: sb } });
const ROOTED = 'root: shared\nfallback_root: old-shared\nkey: <a>/<b>\n';
const SHADOW = (ns: string) => `store-data: the kept data of namespace '${ns}' is shadowed by a module of that name, so it is left out\n`;

describe.concurrent('store-data: the kept data tier', () => {
  it('[the-engine-r-cj0ey, modules-r10] answers a kept namespace after the two module roots, its declared root kept under its own name and its data file the kept copy', async () => {
    const sb = workspace();
    const file = kept(sb, 'memos', ROOTED);
    const r = await storeData(sb, 'memos', '--with-fallback');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.split('\n').slice(0, 11)).toEqual(['memos', 'shared', '', '<a>/<b>', file, '', '', '', 'key', 'line', 'old-shared']);
  });

  it('[the-engine-r-cj0ey, modules-r15] an aliased kept namespace keeps its namespace as its root and no fallback root, read through its origin\'s module line', async () => {
    const sb = workspace();
    kept(sb, 'notebook', ROOTED, 'pkg-a', 'memos');
    const r = await storeData(sb, 'notebook', '--with-fallback');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.split('\n').slice(0, 2)).toEqual(['notebook', 'notebook']);
    expect(r.stdout.split('\n')[10]).toBe('');
  });

  it('[the-engine-r-cj0ey] a module root of the name serves it ahead of the kept data, and an origin that cannot be read refuses rc 2 naming no path', async () => {
    const sb = workspace();
    kept(sb, 'memos', 'key: <a>\n');
    dataFile(sb, 'extensions', 'memos', 'root: live\nkey: <a>/<b>\n');
    expect((await storeData(sb, 'memos')).stdout.split('\n')[1]).toBe('live');
    const lone = workspace();
    kept(lone, 'solo', 'key: <a>\n');
    chmodSync(join(lone, '.contexture/extensions/.state/retained/solo/origin'), 0o000);
    try {
      expect(await storeData(lone, 'solo')).toMatchObject({ code: 2, stdout: '', stderr: "store-data: the origin of the kept data of namespace 'solo' cannot be read, so its storage root is unknown\n" });
    } finally {
      chmodSync(join(lone, '.contexture/extensions/.state/retained/solo/origin'), 0o644);
    }
  });

  it('[the-engine-r-cj0ey] --list answers kept namespaces in the usual row shape, sorted with the module roots; a kept one a module root shadows is left out with one line, exiting 1', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'alpha', 'key: <a>\n');
    kept(sb, 'beta', ROOTED);
    kept(sb, 'gamma', ROOTED, 'pkg-b', 'memos');
    const r = await storeData(sb, '--list');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'alpha\talpha\nbeta\tshared\told-shared\ngamma\tgamma\n', '']);
    dataFile(sb, 'extensions', 'beta', 'key: <a>\n');
    const shadowed = await storeData(sb, '--list');
    expect([shadowed.code, shadowed.stdout, shadowed.stderr]).toEqual([1, 'alpha\talpha\nbeta\tbeta\ngamma\tgamma\n', SHADOW('beta')]);
  });

  it('[the-engine-r-cj0ey] --retained answers namespace, package, and original module name per kept declaration; a shadowed one and an unreadable origin are left out with one line each, exiting 1', async () => {
    const sb = workspace();
    expect(await storeData(sb, '--retained')).toMatchObject({ code: 0, stdout: '', stderr: '' });
    kept(sb, 'notebook', 'key: <a>\n', 'pkg-a', 'memos');
    kept(sb, 'docs', 'key: <a>\n', 'docs-discipline');
    const r = await storeData(sb, '--retained');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, 'docs\tdocs-discipline\tdocs\nnotebook\tpkg-a\tmemos\n', '']);
    dataFile(sb, 'modules', 'docs', 'key: <a>\n');
    writeFileSync(join(sb, '.contexture/extensions/.state/retained/notebook/origin'), 'version 1.0.0\n');
    const left = await storeData(sb, '--retained');
    expect([left.code, left.stdout]).toEqual([1, '']);
    expect(left.stderr).toBe(`${SHADOW('docs')}store-data: the origin of the kept data of namespace 'notebook' cannot be read\n`);
    expect(await storeData(sb, '--retained', 'x')).toMatchObject({ code: 1, stdout: '', stderr: "store-data: unexpected argument 'x' (store-data --retained takes no argument)\n" });
  });

  it('[the-engine-r-cj0ey] an install record area that cannot be read leaves an undeclared namespace unknown rc 2, and the listing partial with one line', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'alpha', 'key: <a>\n');
    kept(sb, 'beta', 'key: <a>\n');
    const state = join(sb, '.contexture/extensions/.state');
    chmodSync(state, 0o000);
    try {
      expect(await storeData(sb, 'beta')).toMatchObject({ code: 2, stdout: '', stderr: "store-data: the install record area cannot be read, so whether namespace 'beta' is kept data is unknown\n" });
      expect(await storeData(sb, '--list')).toMatchObject({ code: 1, stdout: 'alpha\talpha\n', stderr: 'store-data: the install record area cannot be read, so the kept data declarations are unknown\n' });
    } finally {
      chmodSync(state, 0o755);
    }
  });
});

for (const driver of DRIVERS) {
  describe.skipIf(driver === 'sqlite' && !sqliteAvailable())(`kept data through the resolver and store-clear on ${driver}`, { concurrent: true }, () => {
    const rsv = (sb: string, args: readonly string[], input = '', env: Record<string, string> = {}): Promise<Run> =>
      exec(join(sb, '.contexture/storage/scripts/driver-resolver'), args, { cwd: sb, input, env: { CTX_ROOT: sb, ...env } });
    const clear = (sb: string, args: readonly string[], env: Record<string, string> = {}): Promise<Run> =>
      exec(join(sb, '.contexture/storage/scripts/store-clear'), args, { cwd: sb, env: { CTX_ROOT: sb, ...env } });

    async function seeded(n: number): Promise<string> {
      const sb = stage(driver, 'kept-clear');
      kept(sb, 'notebook', 'key: <a>/<b>\n', 'pkg-a', 'memos');
      const puts = Array.from({ length: n }, (_, i): Action => ({ action: 'put', key: `k${i}/x`, value: `v${i}\n` }));
      answer(await rsv(sb, ['store.batch', 'notebook'], batchPayload(puts)), 'store.batch');
      return sb;
    }

    it('[the-engine-r-cj0ey, the-engine-r26] a resolver call naming a kept namespace is served: put, list, get, health, and delete', async () => {
      const sb = await seeded(2);
      expect((await rsv(sb, ['store.list', 'notebook'])).stdout).toBe(listAnswer('notebook', ['k0/x', 'k1/x']));
      expect((await rsv(sb, ['store.get', 'notebook', 'k1/x'])).stdout).toBe('v1\n');
      expect(answer(await rsv(sb, ['storage.health', 'notebook']), 'storage.health').store).toBe('present');
      answer(await rsv(sb, ['store.delete', 'notebook', 'k0/x']), 'store.delete');
      expect((await rsv(sb, ['store.list', 'notebook'])).stdout).toBe(listAnswer('notebook', ['k1/x']));
    });

    it('[the-engine-r-cj0ey] store-clear counts a namespace, deletes the listed keys a file names, then every key, each run idempotent, in batches of 200', async () => {
      const sb = await seeded(203);
      expect(await clear(sb, ['count', 'notebook'])).toMatchObject({ code: 0, stdout: '203\n', stderr: '' });
      const file = put(join(sandbox('kept-keys'), 'keys'), 'k1/x\nk2/x\nnot/here\nk1/x\n');
      expect(await clear(sb, ['keys', 'notebook', file])).toMatchObject({ code: 0, stdout: '2\n', stderr: '' });
      expect(await clear(sb, ['keys', 'notebook', file])).toMatchObject({ code: 0, stdout: '0\n', stderr: '' });
      expect(await clear(sb, ['namespace', '--driver=' + driver, 'notebook'])).toMatchObject({ code: 0, stdout: '201\n', stderr: '' });
      expect(await clear(sb, ['namespace', 'notebook'])).toMatchObject({ code: 0, stdout: '0\n', stderr: '' });
      expect((await rsv(sb, ['store.list', 'notebook'])).stdout).toBe(listAnswer('notebook', []));
      expect(readFileSync(join(sb, '.contexture/extensions/.state/retained/notebook/data'), 'utf8')).toBe('key: <a>/<b>\n');
    });

    it('[the-engine-r-cj0ey, the-engine-r-mvf01] a refused batch stops store-clear with its rc and code, naming the namespace and the keys deleted before it, and the caller\'s token passes through', async () => {
      const sb = await seeded(2);
      const release = holdMove(sb, driver, 'live', driver);
      try {
        refused(await clear(sb, ['namespace', 'notebook']), 'store-clear namespace', 2, 'ERR_STORAGE_LOCKED',
          "deleting the keys of namespace 'notebook' stopped after 0 of 2 keys: storage is being moved to another driver; retry after the move ends");
        expect(await clear(sb, ['count', 'notebook'])).toMatchObject({ code: 0, stdout: '2\n' });
        expect(await clear(sb, ['namespace', 'notebook'], { CTX_STORAGE_MOVE: String(process.pid) })).toMatchObject({ code: 0, stdout: '2\n', stderr: '' });
      } finally {
        release();
      }
    });

    it('[the-engine-r-cj0ey] store-clear refuses a bad argument rc 1 and an undeclared namespace with the listing\'s line', async () => {
      const sb = stage(driver, 'kept-clear-bad');
      refused(await clear(sb, []), 'store-clear', 1, 'ERR_INVALID_ARGUMENT', 'takes a command: count, namespace, or keys');
      refused(await clear(sb, ['wipe', 'x']), 'store-clear', 1, 'ERR_INVALID_ARGUMENT', "unknown command 'wipe' (count, namespace, or keys)");
      refused(await clear(sb, ['count']), 'store-clear count', 1, 'ERR_INVALID_ARGUMENT', 'takes [--driver=<name>] <namespace>');
      refused(await clear(sb, ['count', 'a', 'b']), 'store-clear count', 1, 'ERR_INVALID_ARGUMENT', 'takes [--driver=<name>] <namespace>');
      refused(await clear(sb, ['keys', 'a']), 'store-clear keys', 1, 'ERR_INVALID_ARGUMENT', 'takes [--driver=<name>] <namespace> <key file>');
      refused(await clear(sb, ['count', 'Bad']), 'store-clear count', 1, 'ERR_INVALID_ARGUMENT', "malformed namespace 'Bad'");
      refused(await clear(sb, ['count', '--x', 'a']), 'store-clear count', 1, 'ERR_INVALID_ARGUMENT', "unknown option '--x'");
      refused(await clear(sb, ['count', 'nosuch']), 'store-clear count', 1, 'ERR_ENTITY_NOT_FOUND',
        "the keys of namespace 'nosuch' cannot be listed: namespace 'nosuch' is declared by no module data file");
    });
  });
}

describe('kept data and the module library', () => {
  it('[the-engine-r26] the caller lookup never answers a kept namespace: a script inside the kept folder sits in no module folder', async () => {
    const sb = stage('posix', 'kept-lib');
    kept(sb, 'notebook', 'key: <a>/<b>\n', 'pkg-a', 'memos');
    const script = put(join(sb, '.contexture/extensions/.state/retained/notebook/probe'), '. "$CTX_ROOT/.contexture/storage/scripts/library"\nstore_namespace\n');
    const r = await exec('sh', [script], { cwd: sb, env: { CTX_ROOT: sb } });
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toBe('store.namespace: error: the calling script sits in no module folder (no folder above it holds a module manifest), so it has no namespace (ERR_INVALID_ARGUMENT)\n');
  });
});
