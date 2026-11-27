import { existsSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leaks } from '../support/drawer';
import { exec } from '../support/exec';
import { holdMove } from '../support/locks';
import { stage } from '../support/stage';
import { put, treeState } from '../support/tree';
import { run } from '../support/unit';

function writeFakeDriver(sb: string, name: string, valid = true, schema = ''): void {
  const dir = join(sb, '.contexture/extensions/storage/drivers', name);
  const body = valid
    ? [
        '#!/bin/sh',
        'case "$1" in',
        '  capability)',
        '    printf \'%s\\n\' \'{"version":"4.0.0","contract":"4","store":["list","get","put","delete","batch","scan"],"search_modes":[{"name":"exact","description":"exact match"}]}\'',
        '    exit 0 ;;',
        '  store.list) printf \'{"namespace":"unit","keys":[]}\\n\'; exit 0 ;;',
        '  *) exit 0 ;;',
        'esac',
      ].join('\n')
    : '#!/bin/sh\necho "broken handshake" >&2\nexit 1\n';
  put(join(dir, 'driver'), `${body}\n`, 0o755);
  if (schema) put(join(dir, 'config'), schema);
}

describe.concurrent('ctx store config', () => {
  it('[store-r-0s40c] answers bare, --help, -h, and <subcommand> --help/-h with rc 0, empty stderr, and zero leaks; help is no subcommand', async () => {
    const sb = stage('posix', 'store-config-help');
    const forms: string[][] = [
      ['store', 'config'],
      ['store', 'config', '--help'],
      ['store', 'config', '-h'],
      ['store', 'config', 'load', '--help'],
      ['store', 'config', 'get', '--help'],
      ['store', 'config', 'set', '--help'],
      ['store', 'config', 'unset', '--help'],
      ['store', 'config', 'schema', '--help'],
      ['store', 'help', 'config'],
      ['store', 'help', 'config', 'set'],
    ];
    for (const args of forms) {
      const r = await run(sb, args);
      expect([r.code, r.stderr], `args=${args.join(' ')}`).toEqual([0, '']);
      expect(r.stdout.trim().length, `args=${args.join(' ')}`).toBeGreaterThan(0);
      for (const line of r.stdout.split('\n')) expect(leaks(line)).toBe(false);
      expect(r.stdout).not.toMatch(/\.contexture\/config|\.contexture\/modules/);
    }
    expect((await run(sb, ['store', 'config', '--help'])).stdout).toBe((await run(sb, ['store', 'help', 'config'])).stdout);
    const table = (await run(sb, ['store', 'help', 'config'])).stdout;
    expect(table.split(/^subcommands:$/m)[1]?.split('\n\n')[0]?.trim().split('\n').map((l) => l.trim().split(/ +/)[0])).toEqual(['load', 'get', 'set', 'unset', 'schema']);
    for (const s of ['load', 'get', 'set', 'unset', 'schema']) {
      const section = (await run(sb, ['store', 'help', 'config', s])).stdout;
      expect(section).toMatch(new RegExp(`^ctx store config ${s}: `));
      expect(section).toMatch(new RegExp(`^ {2}ctx store config ${s}( |$)`, 'm'));
      for (const flag of ['--help', '-h']) expect((await run(sb, ['store', 'config', s, flag])).stdout).toBe(section);
    }
    expect((await run(sb, ['store', 'help', 'config', 'set'])).stdout).toContain('validates storage driver selection');
    expect((await run(sb, ['store', 'config'])).stdout).not.toMatch(/^ {2}help /m);
    for (const args of [['store', 'config', 'help'], ['store', 'config', 'help', '--help'], ['store', 'help', 'config', 'help']]) {
      const r = await run(sb, args);
      expect([r.code, r.stdout], args.join(' ')).toEqual([1, '']);
      expect(r.stderr.split('\n')[0]).toBe('ctx: store config: unknown subcommand: help');
      expect(r.stderr).toContain(table);
    }
  });

  it('[store-r-0s40c] supports load, get, set, unset, and schema across core driver and installed driver schema keys', async () => {
    const sb = stage('posix', 'store-config-crud');
    writeFakeDriver(
      sb,
      'alt',
      true,
      [
        'mode: optional string one-of fast|strict default fast',
        '  Storage mode for alt driver.',
        'cache_mb: optional integer min 4 max 512 default 64',
        '  Cache budget in megabytes.',
        '',
      ].join('\n'),
    );

    const schema = await run(sb, ['store', 'config', 'schema', '--json']);
    expect([schema.code, schema.stderr]).toEqual([0, '']);
    const parsedSchema = JSON.parse(schema.stdout);
    expect(parsedSchema.schemas).toHaveLength(1);
    expect(parsedSchema.schemas[0].namespace).toBe('storage');
    expect(parsedSchema.schemas[0].keys.map((k: { key: string }) => k.key)).toEqual(['driver', 'mode', 'cache_mb']);

    expect((await run(sb, ['store', 'config', 'get', 'driver'])).stdout).toBe('posix\n');
    expect((await run(sb, ['store', 'config', 'get', 'mode'])).stdout).toBe('fast\n');

    // Rejects namespace-prefixed key
    const prefixed = await run(sb, ['store', 'config', 'get', 'storage.driver']);
    expect(prefixed.code).toBe(1);
    expect(prefixed.stderr).toContain('ERR_INVALID_ARGUMENT');

    // Rejects invalid schema bounds/enum
    const badMode = await run(sb, ['store', 'config', 'set', 'mode', 'turbo']);
    expect(badMode.code).toBe(1);
    expect(badMode.stderr).toContain('ERR_SCHEMA_VIOLATION');

    const badCache = await run(sb, ['store', 'config', 'set', 'cache_mb', '2']);
    expect(badCache.code).toBe(1);
    expect(badCache.stderr).toContain('ERR_SCHEMA_VIOLATION');

    const okCache = await run(sb, ['store', 'config', 'set', 'cache_mb', '128']);
    expect([okCache.code, okCache.stdout, okCache.stderr]).toEqual([0, '', '']);
    expect((await run(sb, ['store', 'config', 'get', 'cache_mb'])).stdout).toBe('128\n');

    const loadJson = await run(sb, ['store', 'config', 'load', '--json']);
    expect([loadJson.code, loadJson.stderr]).toEqual([0, '']);
    expect(JSON.parse(loadJson.stdout).entries).toEqual([
      { namespace: 'storage', key: 'driver', full_key: 'storage.driver', value: 'posix', type: 'string', source: 'default' },
      { namespace: 'storage', key: 'mode', full_key: 'storage.mode', value: 'fast', type: 'string', source: 'default' },
      { namespace: 'storage', key: 'cache_mb', full_key: 'storage.cache_mb', value: '128', type: 'integer', source: 'config' },
    ]);

    const unsetCache = await run(sb, ['store', 'config', 'unset', 'cache_mb']);
    expect([unsetCache.code, unsetCache.stdout, unsetCache.stderr]).toEqual([0, '', '']);
    expect((await run(sb, ['store', 'config', 'get', 'cache_mb'])).stdout).toBe('64\n');
  });

  it('[store-r-0s40c] refuses set and unset of driver rc 1 before any write, naming the driver package lifecycle, while get, load, and schema still answer driver', async () => {
    const sb = stage('posix', 'store-config-driver');
    writeFakeDriver(sb, 'alt', true);
    const refusal = 'ctx store config: error: storage.driver belongs to the driver package lifecycle: install a driver package (ctx package install <package>) or uninstall it (ctx package uninstall <package>) to change it (ERR_INVALID_ARGUMENT)\n';
    const fingerprint = () => treeState(sb).split('\n').filter((l) => !l.startsWith('.contexture/tmp/')).join('\n');

    for (const conf of [undefined, 'storage.driver: alt\n', 'storage.driver: posix\n']) {
      if (conf !== undefined) writeFileSync(join(sb, '.contexture/config'), conf);
      const before = fingerprint();
      for (const args of [['set', 'driver', 'posix'], ['set', 'driver', 'alt'], ['set', 'driver', 'nosuch'], ['set', 'driver', '-bad'], ['unset', 'driver']]) {
        const r = await run(sb, ['store', 'config', ...args]);
        expect([r.code, r.stdout, r.stderr], `${conf ?? 'no configuration'}: ${args.join(' ')}`).toEqual([1, '', refusal]);
      }
      expect(fingerprint(), 'the configuration is unchanged').toBe(before);
    }

    expect((await run(sb, ['store', 'config', 'get', 'driver'])).stdout).toBe('posix\n');
    expect((await run(sb, ['store', 'config', 'load'])).stdout).toContain('driver');
    expect((await run(sb, ['store', 'config', 'schema'])).stdout).toContain('driver');
  });

  it('[store-r-0s40c] lands the unset of a driver that resolves nothing, saying the record reads from posix again', async () => {
    const sb = stage('posix', 'store-config-dangling');
    writeFileSync(join(sb, '.contexture/config'), 'storage.driver: gone\nsearch.timeout: 25\n');
    const r = await run(sb, ['store', 'config', 'unset', 'driver']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', "notice: storage.driver named 'gone', which resolves nothing, so it is unset and the record reads from posix again\n"]);
    expect(readFileSync(join(sb, '.contexture/config'), 'utf8')).toBe('search.timeout: 25\n');
    expect((await run(sb, ['store', 'config', 'get', 'driver'])).stdout).toBe('posix\n');
  });

  it('[store-r-0s40c] refuses a change of an installed driver package\'s setting while its driver holds data, rc 2 while the storage is being moved or a listing fails; the value in force, an absent key, and a driver holding nothing land', async () => {
    const sb = stage('posix', 'store-config-held');
    const dir = join(sb, '.contexture/extensions/storage/drivers/held');
    const card = '{"version":"4.0.0","contract":"4","store":["list","get","put","delete","batch","scan"],"search_modes":[{"name":"exact","description":"exact match"}]}';
    const flag = join(sb, 'held-keys');
    const failing = join(sb, 'held-fails');
    put(join(dir, 'driver'), [
      '#!/bin/sh',
      'case "$1" in',
      `  capability) printf '%s\\n' '${card}'; exit 0 ;;`,
      `  store.list) [ -f '${failing}' ] && exit 2; if [ "$2" = unit ] && [ -f '${flag}' ] && [ -z "\${CTX_STORAGE_HELD_ELSEWHERE:-}" ]; then printf '{"namespace":"unit","keys":["u1/state"]}\\n'; else printf '{"namespace":"%s","keys":[]}\\n' "$2"; fi; exit 0 ;;`,
      '  *) exit 0 ;;',
      'esac',
      '',
    ].join('\n'), 0o755);
    put(join(dir, 'config'), 'location: optional string default here\n  Where the held driver keeps its store.\n');
    const cfg = (...args: string[]) => run(sb, ['store', 'config', ...args]);
    const conf = join(sb, '.contexture/config');
    const text = () => (existsSync(conf) ? readFileSync(conf, 'utf8') : '');

    const free = await cfg('set', 'location', 'there');
    expect([free.code, free.stdout, free.stderr]).toEqual([0, '', '']);
    expect(text()).toBe('storage.location: there\n');

    writeFileSync(flag, '');
    const holds = "ctx store config: error: storage.location belongs to the driver 'held', which holds data; to change it, uninstall its package (ctx package uninstall <package>), then install it again with the new setting (ctx package install <package> --driver-config=location=<value>) (ERR_INVALID_ARGUMENT)\n";
    for (const args of [['set', 'location', 'elsewhere'], ['unset', 'location']]) {
      const r = await cfg(...args);
      expect([r.code, r.stdout, r.stderr], args.join(' ')).toEqual([1, '', holds]);
    }
    const elsewhere = await run(sb, ['store', 'config', 'set', 'location', 'elsewhere'], { env: { CTX_STORAGE_HELD_ELSEWHERE: 'empty' } });
    expect([elsewhere.code, elsewhere.stdout, elsewhere.stderr], 'a storage variable in the environment points no listing away from the configured place').toEqual([1, '', holds]);
    expect(text()).toBe('storage.location: there\n');
    const same = await cfg('set', 'location', 'there');
    expect([same.code, same.stdout, same.stderr]).toEqual([0, '', '']);
    expect(text()).toBe('storage.location: there\n');

    put(join(sb, '.contexture/extensions/.state/storage-held.files'), 'package storage-held\nversion 1.0.0\nkind driver\ndriver held\n');
    const named = await cfg('set', 'location', 'elsewhere');
    expect([named.code, named.stdout, named.stderr]).toEqual([1, '', holds.replaceAll('<package>', 'storage-held')]);

    writeFileSync(failing, '');
    const blind = await cfg('set', 'location', 'elsewhere');
    expect([blind.code, blind.stdout]).toEqual([2, '']);
    expect(blind.stderr).toMatch(/^ctx store config: error: listing the namespace '[a-z]+' through the driver 'held' failed, so whether it holds data cannot be read \(ERR_STORAGE_READ\)\n$/);
    rmSync(failing);

    holdMove(sb, 'held', 'live', 'posix');
    const moving = await cfg('set', 'location', 'elsewhere');
    expect([moving.code, moving.stdout, moving.stderr]).toEqual([2, '', 'ctx store config: error: storage is being moved to another driver; retry after the move ends (ERR_STORAGE_LOCKED)\n']);
    expect(text()).toBe('storage.location: there\n');

    writeFileSync(conf, '');
    const absent = await cfg('unset', 'location');
    expect([absent.code, absent.stdout, absent.stderr]).toEqual([0, '', '']);
    const byDefault = await cfg('set', 'location', 'here');
    expect([byDefault.code, byDefault.stdout, byDefault.stderr]).toEqual([0, '', '']);
  });

  it('[store-r-0s40c] changes a posix driver setting while posix holds data, whatever an extension folder named posix declares, since the resolver never runs that folder', async () => {
    const sb = stage('posix', 'store-config-posix-key');
    put(join(sb, '.contexture/storage/drivers/posix/config'), 'sync: optional string default safe\n  The posix sync policy.\n');
    put(join(sb, '.contexture/extensions/storage/drivers/posix/config'), 'sync: optional string default safe\n  Never read.\n');
    const seeded = await run(sb, ['store', 'put', 'containers/notes', '--description=probe notes', '--minting=given']);
    expect([seeded.code, seeded.stderr]).toEqual([0, '']);
    const r = await run(sb, ['store', 'config', 'set', 'sync', 'fast']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
    expect(readFileSync(join(sb, '.contexture/config'), 'utf8')).toBe('storage.sync: fast\n');
  });

  it('[store-r-0s40c] refuses unsetting a required driver key and, for a driver holding nothing, a setting change updates config mtime so resolver verdict cache invalidates', async () => {
    const sb = stage('posix', 'store-config-verdict');
    writeFakeDriver(sb, 'alt', true);
    writeFakeDriver(sb, 'reqdrv', true, 'endpoint: required string\n  Required endpoint.\n');

    writeFileSync(join(sb, '.contexture/config'), 'storage.driver: alt\n');
    const baseSec = Math.floor(Date.now() / 1000) * 1000;
    const oldTime = new Date(baseSec - 20_000);
    utimesSync(join(sb, '.contexture/config'), oldTime, oldTime);

    // Populate dispatch and require verdict caches for alt
    const execBefore = await exec('.contexture/storage/scripts/driver-resolver', ['exec', 'store.list', 'unit'], { cwd: sb });
    expect(execBefore.code, execBefore.stderr).toBe(0);
    const reqBefore = await exec('.contexture/storage/scripts/driver-resolver', ['require', 'store'], { cwd: sb });
    expect(reqBefore.code, reqBefore.stderr).toBe(0);

    const verdictsDir = join(sb, '.contexture/tmp/driver-verdicts');
    const altFiles = readdirSync(verdictsDir).filter((n) => n.includes('alt'));
    expect(altFiles.length).toBeGreaterThanOrEqual(2);

    // Cannot unset required driver key
    const reqUnset = await run(sb, ['store', 'config', 'unset', 'endpoint']);
    expect([reqUnset.code, reqUnset.stdout]).toEqual([1, '']);
    expect(reqUnset.stderr).toContain('ERR_SCHEMA_VIOLATION');

    writeFileSync(join(sb, '.contexture/config'), 'storage.driver: reqdrv\n');

    // Populate verdict caches for reqdrv, backdate verdicts to MID, and prove cache hit while config is older
    const execReq = await exec('.contexture/storage/scripts/driver-resolver', ['exec', 'store.list', 'unit'], { cwd: sb });
    expect(execReq.code, execReq.stderr).toBe(0);
    const reqReq = await exec('.contexture/storage/scripts/driver-resolver', ['require', 'store'], { cwd: sb });
    expect(reqReq.code, reqReq.stderr).toBe(0);
    const reqFiles = readdirSync(verdictsDir).filter((n) => n.includes('reqdrv'));
    expect(reqFiles.length).toBeGreaterThanOrEqual(2);

    const midTime = new Date(baseSec - 10_000);
    utimesSync(join(sb, '.contexture/extensions/storage/drivers/reqdrv/driver'), oldTime, oldTime);
    utimesSync(join(sb, '.contexture/storage/scripts/driver-resolver'), oldTime, oldTime);
    utimesSync(join(sb, '.contexture/config'), oldTime, oldTime);
    for (const f of reqFiles) utimesSync(join(verdictsDir, f), midTime, midTime);

    expect((await exec('.contexture/storage/scripts/driver-resolver', ['exec', 'store.list', 'unit'], { cwd: sb })).code).toBe(0);
    for (const f of reqFiles) expect(statSync(join(verdictsDir, f)).mtimeMs).toBe(midTime.getTime());

    // Mutating a driver setting via ctx store config set advances config mtime and invalidates cached verdicts
    const setOpt = await run(sb, ['store', 'config', 'set', 'endpoint', 'https://local']);
    expect([setOpt.code, setOpt.stderr]).toEqual([0, '']);
    expect((await exec('.contexture/storage/scripts/driver-resolver', ['exec', 'store.list', 'unit'], { cwd: sb })).code).toBe(0);
    expect((await exec('.contexture/storage/scripts/driver-resolver', ['require', 'store'], { cwd: sb })).code).toBe(0);
    for (const f of reqFiles) expect(statSync(join(verdictsDir, f)).mtimeMs).toBeGreaterThan(midTime.getTime());
  });

  it('[store-r-0s40c] refuses missing CTX_ROOT, invalid subcommand flags, and a set of driver over a legacy storage.conf or session.storage.driver line', async () => {
    const sb = stage('posix', 'store-config-edges');
    writeFakeDriver(sb, 'alt', true);

    const emptyRoot = await exec(join(sb, '.contexture/modules/store/scripts/config'), ['load'], { cwd: sb, env: { CTX_ROOT: '' } });
    expect(emptyRoot.code).toBe(2);
    expect(emptyRoot.stderr).toContain('ERR_INVALID_ARGUMENT');

    const noRoot = await exec(join(sb, '.contexture/modules/store/scripts/config'), ['load'], { cwd: sb, env: { CTX_ROOT: join(sb, 'missing-root') } });
    expect(noRoot.code).toBe(2);
    expect(noRoot.stderr).toContain('ERR_DRIVER_NOT_FOUND');

    for (const args of [
      ['store', 'config', 'load', '--bad'],
      ['store', 'config', 'schema', '--bad'],
    ]) {
      const r = await run(sb, args);
      expect([r.code, r.stdout], args.join(' ')).toEqual([1, '']);
      expect(r.stderr).toContain('ERR_INVALID_ARGUMENT');
    }
    const helpWord = await run(sb, ['store', 'config', 'help', 'load', 'extra']);
    expect([helpWord.code, helpWord.stdout, helpWord.stderr.split('\n')[0]]).toEqual([1, '', 'ctx: store config: unknown subcommand: help']);

    writeFileSync(join(sb, '.contexture/storage.conf'), 'storage.driver: alt\n');
    const fromConf = await run(sb, ['store', 'config', 'set', 'driver', 'posix']);
    expect([fromConf.code, fromConf.stdout]).toEqual([1, '']);
    expect(fromConf.stderr).toContain('belongs to the driver package lifecycle');

    writeFileSync(join(sb, '.contexture/config'), 'session.storage.driver: alt\n');
    const fromLegacy = await run(sb, ['store', 'config', 'set', 'driver', 'posix']);
    expect([fromLegacy.code, fromLegacy.stdout]).toEqual([1, '']);
    expect(fromLegacy.stderr).toContain('belongs to the driver package lifecycle');
    expect(readFileSync(join(sb, '.contexture/config'), 'utf8')).toBe('session.storage.driver: alt\n');
  });
});
