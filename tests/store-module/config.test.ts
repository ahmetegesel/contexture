import { existsSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leaks } from '../support/drawer';
import { exec } from '../support/exec';
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
        '    printf \'%s\\n\' \'{"version":"3.0.0","contract":"3","store":["list","get","put","delete","changes","batch","scan"],"search_modes":[{"name":"exact","description":"exact match"}]}\'',
        '    exit 0 ;;',
        '  store.list) exit 0 ;;',
        '  *) exit 0 ;;',
        'esac',
      ].join('\n')
    : '#!/bin/sh\necho "broken handshake" >&2\nexit 1\n';
  put(join(dir, 'driver'), `${body}\n`, 0o755);
  if (schema) put(join(dir, 'config'), schema);
}

describe.concurrent('ctx store config', () => {
  it('answers bare, help, --help, -h, and <subcommand> --help/-h with rc 0, empty stderr, and zero leaks', async () => {
    const sb = stage('posix', 'store-config-help');
    const forms: string[][] = [
      ['store', 'config'],
      ['store', 'config', 'help'],
      ['store', 'config', '--help'],
      ['store', 'config', '-h'],
      ['store', 'config', 'load', '--help'],
      ['store', 'config', 'get', '--help'],
      ['store', 'config', 'set', '--help'],
      ['store', 'config', 'unset', '--help'],
      ['store', 'config', 'schema', '--help'],
      ['store', 'config', 'help', '--help'],
      ['store', 'help', 'config'],
    ];
    for (const args of forms) {
      const r = await run(sb, args);
      expect([r.code, r.stderr], `args=${args.join(' ')}`).toEqual([0, '']);
      expect(r.stdout.trim().length, `args=${args.join(' ')}`).toBeGreaterThan(0);
      for (const line of r.stdout.split('\n')) expect(leaks(line)).toBe(false);
      expect(r.stdout).not.toMatch(/\.contexture\/config|\.contexture\/modules/);
    }
  });

  it('supports load, get, set, unset, and schema across core driver and installed driver schema keys', async () => {
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

  it('validates driver via Contract 3 handshake before writing, discards resolver stdout, and emits migration notice only when effective driver changes', async () => {
    const sb = stage('posix', 'store-config-driver');
    writeFakeDriver(sb, 'alt', true);
    writeFakeDriver(sb, 'broken', false);
    put(join(sb, '.contexture/extensions/storage/drivers/badproto/driver'), '#!/bin/sh\necho \'{"version":"1.0.0","contract":1}\'\n', 0o755);

    // Malformed driver name shape refuses rc 1 without writing
    const badShape = await run(sb, ['store', 'config', 'set', 'driver', '-bad']);
    expect([badShape.code, badShape.stdout]).toEqual([1, '']);
    expect(badShape.stderr).toContain('ERR_INVALID_ARGUMENT');
    expect(existsSync(join(sb, '.contexture/config'))).toBe(false);

    // Missing driver refuses rc 2 without writing
    const missing = await run(sb, ['store', 'config', 'set', 'driver', 'nosuch']);
    expect([missing.code, missing.stdout]).toEqual([2, '']);
    expect(missing.stderr).toContain('ERR_DRIVER_NOT_FOUND');
    expect(existsSync(join(sb, '.contexture/config'))).toBe(false);

    // Broken Contract 3 driver refuses rc 2 without writing
    const broken = await run(sb, ['store', 'config', 'set', 'driver', 'broken']);
    expect([broken.code, broken.stdout]).toEqual([2, '']);
    expect(broken.stderr).toContain("capability handshake failed for driver 'broken'");
    expect(existsSync(join(sb, '.contexture/config'))).toBe(false);

    // Driver declaring wrong contract refuses rc 2 with ERR_DRIVER_PROTOCOL without writing
    const badProto = await run(sb, ['store', 'config', 'set', 'driver', 'badproto']);
    expect([badProto.code, badProto.stdout]).toEqual([2, '']);
    expect(badProto.stderr).toContain('ERR_DRIVER_PROTOCOL');
    expect(existsSync(join(sb, '.contexture/config'))).toBe(false);

    // Setting posix when already effectively posix writes config without migration notice
    const samePosix = await run(sb, ['store', 'config', 'set', 'driver', 'posix']);
    expect([samePosix.code, samePosix.stdout, samePosix.stderr]).toEqual([0, '', '']);
    expect(readFileSync(join(sb, '.contexture/config'), 'utf8')).toBe('storage.driver: posix\n');

    // Switching posix -> alt emits migration notice on stderr and keeps stdout empty (no resolver OK leak)
    const toAlt = await run(sb, ['store', 'config', 'set', 'driver', 'alt']);
    expect([toAlt.code, toAlt.stdout]).toEqual([0, '']);
    expect(toAlt.stderr).toContain("changed from 'posix' to 'alt'");
    expect(toAlt.stderr).toContain('not migrated automatically');
    for (const line of toAlt.stderr.split('\n')) expect(leaks(line)).toBe(false);

    // Setting alt -> alt emits no migration notice
    const sameAlt = await run(sb, ['store', 'config', 'set', 'driver', 'alt']);
    expect([sameAlt.code, sameAlt.stdout, sameAlt.stderr]).toEqual([0, '', '']);

    // Unsetting driver reverts alt -> posix and emits migration notice
    const backPosix = await run(sb, ['store', 'config', 'unset', 'driver']);
    expect([backPosix.code, backPosix.stdout]).toEqual([0, '']);
    expect(backPosix.stderr).toContain("changed from 'alt' to 'posix'");

    // Second unset (already effectively posix) emits no notice
    const backAgain = await run(sb, ['store', 'config', 'unset', 'driver']);
    expect([backAgain.code, backAgain.stdout, backAgain.stderr]).toEqual([0, '', '']);
  });

  it('refuses unsetting a required driver key and updates config mtime so resolver verdict cache invalidates', async () => {
    const sb = stage('posix', 'store-config-verdict');
    writeFakeDriver(sb, 'reqdrv', true, 'endpoint: required string\n  Required endpoint.\n');

    // Seed an older config and a verdict cache stamped slightly in the future? No, verify config write advances mtime cleanly
    writeFileSync(join(sb, '.contexture/config'), 'storage.driver: posix\n');
    const oldTime = new Date(Date.now() - 10_000);
    utimesSync(join(sb, '.contexture/config'), oldTime, oldTime);

    const resolveBefore = await exec('.contexture/storage/scripts/driver-resolver', ['resolve'], { cwd: sb });
    expect(resolveBefore.code).toBe(0);
    expect(resolveBefore.stdout.trim()).toMatch(/\/posix\/driver$/);

    // Cannot unset required driver key
    const reqUnset = await run(sb, ['store', 'config', 'unset', 'endpoint']);
    expect([reqUnset.code, reqUnset.stdout]).toEqual([1, '']);
    expect(reqUnset.stderr).toContain('ERR_SCHEMA_VIOLATION');

    const beforeTree = treeState(sb);
    const sw = await run(sb, ['store', 'config', 'set', 'driver', 'reqdrv']);
    expect(sw.code, sw.stderr).toBe(0);
    expect(treeState(sb)).not.toBe(beforeTree);

    const resolveAfter = await exec('.contexture/storage/scripts/driver-resolver', ['resolve'], { cwd: sb });
    expect(resolveAfter.code).toBe(0);
    expect(resolveAfter.stdout.trim()).toMatch(/\/reqdrv\/driver$/);
  });
});
