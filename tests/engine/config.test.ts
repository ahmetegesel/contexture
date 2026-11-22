import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { leaks } from '../support/drawer';
import { exec, type Run } from '../support/exec';
import { holdLock, sleepShim } from '../support/locks';
import { shVerb, writeModule } from '../support/modules';
import { addModule, newPkg, writeManifest } from '../support/packages';
import { stage } from '../support/stage';
import { put, treeState } from '../support/tree';
import { run } from '../support/unit';

const conf = (sb: string): string => join(sb, '.contexture/config');
const confText = (sb: string): string => (existsSync(conf(sb)) ? readFileSync(conf(sb), 'utf8') : '');

function plantPkg(sb: string, name: string, module = name.replace(/^pkg-/, '')): string {
  const p = newPkg(sb, name);
  addModule(p, module);
  writeManifest(p);
  return p;
}

describe.concurrent('the ctx config builtin', () => {
  it('runs pre-discovery even when an extension module is broken, printing no discovery warnings', async () => {
    const sb = stage('posix', 'config-prediscovery');
    writeModule(sb, 'extensions', 'broken', { manifest: '# requires: base>=1.0.0\n' });
    writeModule(sb, 'modules', 'alpha', {
      manifest: '# summary: alpha module\n',
      files: { config: 'mode: optional string default fast\n  Operation mode.\n' },
    });

    const r = await run(sb, ['config', 'load']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe('search.timeout: 10 (default)\nstorage.driver: posix (default)\nalpha.mode: fast (default)\n');
  });

  it('serves bare ctx config, --help, -h, help [<sub-verb>], and <sub-verb> --help/-h with rc 0, empty stderr, and zero leaks', async () => {
    const sb = stage('posix', 'config-help');
    const forms: string[][] = [
      ['config'],
      ['config', '--help'],
      ['config', '-h'],
      ['config', 'help'],
      ['config', 'help', 'load'],
      ['config', 'help', 'get'],
      ['config', 'help', 'schema'],
      ['config', 'help', 'help'],
      ['config', 'load', '--help'],
      ['config', 'load', '-h'],
      ['config', 'get', '--help'],
      ['config', 'get', '-h'],
      ['config', 'schema', '--help'],
      ['config', 'schema', '-h'],
      ['config', 'help', '--help'],
      ['config', 'help', '-h'],
    ];

    for (const args of forms) {
      const r = await run(sb, args);
      expect([r.code, r.stderr], `args=${args.join(' ')}`).toEqual([0, '']);
      expect(r.stdout.trim().length, `args=${args.join(' ')}`).toBeGreaterThan(0);
      for (const line of r.stdout.split('\n')) expect(leaks(line)).toBe(false);
      expect(r.stdout).not.toMatch(/\.contexture\/config|\.contexture\/modules/);
    }

    const top = await run(sb, ['help']);
    expect(top.code).toBe(0);
    expect(top.stdout).toContain('ctx config load');
    expect(top.stdout).toContain('ctx config get');
    expect(top.stdout).toContain('ctx config schema');
  });

  it('[the-engine-r-08d1g] load omits unset keys without defaults, excludes package.* silently, filters by --module, and warns on undeclared and legacy config without failing', async () => {
    const sb = stage('posix', 'config-load');
    writeModule(sb, 'modules', 'demo', {
      manifest: '# summary: demo module\n',
      files: {
        config: [
          'enabled: optional boolean default false',
          '  Enable demo behavior.',
          'token: optional string',
          '  Optional token with no default.',
          '',
        ].join('\n'),
      },
    });
    writeFileSync(
      conf(sb),
      [
        'package.my-pkg: ./catalog/my-pkg --as=x=y',
        'search.timeout: 25',
        'demo.enabled: true',
        'session.storage.driver: posix',
        'uninstalled.setting: value',
        '',
      ].join('\n'),
    );
    writeFileSync(join(sb, '.contexture/storage.conf'), 'storage.driver: posix\n');

    const r = await run(sb, ['config', 'load']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('search.timeout: 25\nstorage.driver: posix (default)\ndemo.enabled: true\n');
    expect(r.stdout).not.toContain('demo.token');
    expect(r.stdout).not.toContain('package.');
    expect(r.stderr).toContain('legacy storage configuration is deprecated');
    expect(r.stderr).toContain("legacy key 'session.storage.driver' is deprecated");
    expect(r.stderr).toContain("undeclared configuration key 'uninstalled.setting'");
    expect(r.stderr).not.toContain('package.my-pkg');

    const json = await run(sb, ['config', 'load', '--json']);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual({
      entries: [
        { namespace: 'search', key: 'timeout', full_key: 'search.timeout', value: '25', type: 'integer', source: 'config' },
        { namespace: 'storage', key: 'driver', full_key: 'storage.driver', value: 'posix', type: 'string', source: 'default' },
        { namespace: 'demo', key: 'enabled', full_key: 'demo.enabled', value: 'true', type: 'boolean', source: 'config' },
      ],
    });

    // Scoped --module=search should not emit false undeclared warnings for declared storage/demo keys
    const modOnly = await run(sb, ['config', 'load', '--module=search', '--json']);
    expect([modOnly.code, modOnly.stderr]).toEqual([0, '']);
    expect(JSON.parse(modOnly.stdout)).toEqual({
      entries: [{ namespace: 'search', key: 'timeout', full_key: 'search.timeout', value: '25', type: 'integer', source: 'config' }],
    });

    const badMod = await run(sb, ['config', 'load', '--module=nosuch']);
    expect(badMod.code).toBe(1);
    expect(badMod.stderr).toContain('ERR_ENTITY_NOT_FOUND');

    const emptyMod = await run(sb, ['config', 'load', '--module=']);
    expect(emptyMod.code).toBe(1);
    expect(emptyMod.stderr).toContain('--module=');
  });

  it('[the-engine-r-08d1g] get reads set values and defaults, refuses package.<name> pointing to ctx package list, and refuses unset/unknown keys rc 1', async () => {
    const sb = stage('posix', 'config-get');
    writeModule(sb, 'modules', 'demo', {
      manifest: '# summary: demo module\n',
      files: {
        config: 'port: optional integer min 1 default 8080\n  Port number.\nsecret: optional string\n  Optional secret.\n',
      },
    });
    writeFileSync(conf(sb), 'package.my-pkg: my-pkg\nsearch.timeout: 30\n');

    expect((await run(sb, ['config', 'get', 'search.timeout'])).stdout).toBe('30\n');
    expect((await run(sb, ['config', 'get', 'storage.driver'])).stdout).toBe('posix\n');
    expect((await run(sb, ['config', 'get', 'demo.port'])).stdout).toBe('8080\n');

    const pkg = await run(sb, ['config', 'get', 'package.my-pkg']);
    expect([pkg.code, pkg.stdout]).toEqual([1, '']);
    expect(pkg.stderr).toContain('ctx package list');

    const unset = await run(sb, ['config', 'get', 'demo.secret']);
    expect([unset.code, unset.stdout]).toEqual([1, '']);
    expect(unset.stderr).toContain('ERR_ENTITY_NOT_FOUND');

    const unkKey = await run(sb, ['config', 'get', 'demo.missing']);
    expect([unkKey.code, unkKey.stdout]).toEqual([1, '']);
    expect(unkKey.stderr).toContain('ERR_SCHEMA_VIOLATION');

    const unkNs = await run(sb, ['config', 'get', 'missing.key']);
    expect([unkNs.code, unkNs.stdout]).toEqual([1, '']);
    expect(unkNs.stderr).toContain('ERR_ENTITY_NOT_FOUND');

    const badArg = await run(sb, ['config', 'get', 'nodot']);
    expect([badArg.code, badArg.stdout]).toEqual([1, '']);
    expect(badArg.stderr).toContain('ERR_INVALID_ARGUMENT');
  });

  it('schema lists core and module schemas (including aliased modules) in text and JSON and filters by namespace', async () => {
    const sb = stage('posix', 'config-schema');
    const pkg = plantPkg(sb, 'pkg-memo', 'memo');
    put(join(pkg, '.contexture/extensions/modules/memo/config'), 'limit: optional integer min 1 default 20\n  Max memos.\n');
    writeManifest(pkg);
    expect((await exec('./.contexture/ctx', ['package', 'install', '--as=memo=memo2', 'catalog/pkg-memo'], { cwd: sb })).code).toBe(0);

    const text = await run(sb, ['config', 'schema']);
    expect([text.code, text.stderr]).toEqual([0, '']);
    expect(text.stdout).toContain('search:\n');
    expect(text.stdout).toContain('storage:\n');
    expect(text.stdout).toContain('memo2 (alias of memo from package pkg-memo):\n');

    const json = await run(sb, ['config', 'schema', 'memo2', '--json']);
    expect([json.code, json.stderr]).toEqual([0, '']);
    expect(JSON.parse(json.stdout)).toEqual({
      schemas: [
        {
          namespace: 'memo2',
          alias_of: 'memo',
          package: 'pkg-memo',
          keys: [{ key: 'limit', full_key: 'memo2.limit', presence: 'optional', type: 'integer', min: 1, default: '20', description: 'Max memos.' }],
        },
      ],
    });

    const miss = await run(sb, ['config', 'schema', 'nope']);
    expect([miss.code, miss.stdout]).toEqual([1, '']);
    expect(miss.stderr).toContain('ERR_ENTITY_NOT_FOUND');
  });

  it('[the-engine-r-08d1g] set and unset refuse rc 1 pointing to owning domain verbs and write nothing', async () => {
    const sb = stage('posix', 'config-refuse-mutate');
    writeFileSync(conf(sb), 'storage.driver: posix\n');
    const before = treeState(sb);

    for (const args of [
      ['config', 'set', 'storage.driver', 'fts5'],
      ['config', 'unset', 'storage.driver'],
      ['config', 'set'],
      ['config', 'unset'],
    ]) {
      const r = await run(sb, args);
      expect([r.code, r.stdout]).toEqual([1, '']);
      expect(r.stderr).toContain('ctx store config');
      expect(r.stderr).toContain('ctx search config');
      expect(r.stderr).toContain('ctx package');
      expect(r.stderr).toContain('ctx <module> config');
    }
    expect(treeState(sb)).toBe(before);
  });

  it('[the-engine-r-08d1g] supports load/get on --as aliases, --module=storage legacy warnings, --module without config, malformed schemas rc 1, malformed keys, and missing config-lib rc 2', async () => {
    const sb = stage('posix', 'config-edges');
    const pkg = plantPkg(sb, 'pkg-memo', 'memo');
    put(join(pkg, '.contexture/extensions/modules/memo/config'), 'limit: optional integer min 1 default 20\n  Max memos.\n');
    writeManifest(pkg);
    expect((await exec('./.contexture/ctx', ['package', 'install', '--as=memo=memo2', 'catalog/pkg-memo'], { cwd: sb })).code).toBe(0);

    writeFileSync(conf(sb), 'session.storage.driver: posix\nmemo2.limit: 42\n');
    writeFileSync(join(sb, '.contexture/storage.conf'), 'storage.driver: posix\n');

    const loadAlias = await run(sb, ['config', 'load', '--module=memo2', '--json']);
    expect([loadAlias.code, loadAlias.stderr]).toEqual([0, '']);
    expect(JSON.parse(loadAlias.stdout).entries).toEqual([
      { namespace: 'memo2', key: 'limit', full_key: 'memo2.limit', alias_of: 'memo', value: '42', type: 'integer', source: 'config' },
    ]);
    expect((await run(sb, ['config', 'get', 'memo2.limit'])).stdout).toBe('42\n');

    const loadStorage = await run(sb, ['config', 'load', '--module=storage']);
    expect(loadStorage.code).toBe(0);
    expect(loadStorage.stderr).toContain('legacy storage configuration is deprecated');
    expect(loadStorage.stderr).toContain("legacy key 'session.storage.driver' is deprecated");

    const loadUnit = await run(sb, ['config', 'load', '--module=unit', '--json']);
    expect([loadUnit.code, loadUnit.stderr]).toEqual([0, '']);
    expect(JSON.parse(loadUnit.stdout)).toEqual({ entries: [] });

    for (const badKey of ['.key', 'ns.', 'ns.BadKey']) {
      const r = await run(sb, ['config', 'get', badKey]);
      expect([r.code, r.stdout]).toEqual([1, '']);
      expect(r.stderr).toContain('ERR_INVALID_ARGUMENT');
    }

    // Malformed module schema exits rc 1 (not rc 2) and help documents exit 1
    const helpLoad = await run(sb, ['config', 'help', 'load']);
    expect(helpLoad.stdout).toContain('1 bad flag, unknown namespace, or malformed schema; 2 unreadable configuration or schema');
    const helpSchema = await run(sb, ['config', 'help', 'schema']);
    expect(helpSchema.stdout).toContain('1 bad flag, unknown namespace, or malformed schema; 2 unreadable schema');

    writeModule(sb, 'modules', 'broken', {
      manifest: '# summary: broken schema\n',
      files: { config: 'broken line without colon\n' },
    });
    expect((await run(sb, ['config', 'load'])).code).toBe(1);
    expect((await run(sb, ['config', 'schema'])).code).toBe(1);

    // Missing config-lib refuses cleanly rc 2
    rmSync(join(sb, '.contexture/config-lib'));
    const noLib = await run(sb, ['config', 'load']);
    expect([noLib.code, noLib.stdout]).toEqual([2, '']);
    expect(noLib.stderr).toContain('missing internal config library');
  });
});

describe.concurrent('ctx package and config-lib locked writer integration', () => {
  it('install/uninstall preserves comments and unrelated keys byte-exact, and waits cleanly on config.lock', async () => {
    const sb = stage('posix', 'config-pkg-lock');
    const preset = '# header comment\nstorage.driver: posix\nsearch.timeout: 15\n\n# trailing comment\n';
    writeFileSync(conf(sb), preset);
    plantPkg(sb, 'pkg-one', 'one');
    plantPkg(sb, 'pkg-two', 'two');

    // Held live lock causes package install write to refuse rc 2 cleanly with shim
    const release = holdLock(sb, 'config.lock', 'live');
    const locked = await exec('./.contexture/ctx', ['package', 'install', 'catalog/pkg-one'], { cwd: sb, env: sleepShim() });
    release();
    expect(locked.code).toBe(2);
    expect(locked.stderr).toContain('ERR_STORAGE_LOCKED');

    // Dead lock is broken immediately and install succeeds
    holdLock(sb, 'config.lock', 'dead');
    const inst1 = await run(sb, ['package', 'install', 'catalog/pkg-one']);
    expect(inst1.code).toBe(0);
    expect(confText(sb)).toBe(`${preset}package.pkg-one: ./catalog/pkg-one\n`);

    // Concurrent config mutations (search config + package install) serialize under config.lock without lost lines
    const [sRes, pRes] = await Promise.all([
      run(sb, ['search', 'config', 'set', 'timeout', '22']),
      run(sb, ['package', 'install', 'catalog/pkg-two']),
    ]);
    expect([sRes.code, pRes.code]).toEqual([0, 0]);
    const finalConf = confText(sb);
    expect(finalConf).toContain('# header comment\n');
    expect(finalConf).toContain('storage.driver: posix\n');
    expect(finalConf).toContain('search.timeout: 22\n');
    expect(finalConf).toContain('package.pkg-one: ./catalog/pkg-one\n');
    expect(finalConf).toContain('package.pkg-two: ./catalog/pkg-two\n');
    expect(finalConf).toContain('# trailing comment\n');

    // Uninstall removes only its package line and keeps everything else intact
    const un1 = await run(sb, ['package', 'uninstall', 'pkg-one']);
    expect(un1.code).toBe(0);
    expect(confText(sb)).not.toContain('package.pkg-one');
    expect(confText(sb)).toContain('package.pkg-two: ./catalog/pkg-two\n');
    expect(confText(sb)).toContain('search.timeout: 22\n');
  });

  it('rejects a bogus module named config at discovery even with config builtin present', async () => {
    const sb = stage('posix', 'config-shadow-check');
    writeModule(sb, 'modules', 'config', {
      manifest: '# summary: shadowing config\n',
      files: { 'scripts/hi': shVerb('hi', 'echo hi') },
    });
    const help = await run(sb, ['help']);
    expect(help.code).toBe(0);
    expect(help.stderr).toContain('reserved name refused (shadow): config');
    expect(help.stdout).not.toContain('shadowing config');
  });
});
