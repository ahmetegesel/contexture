import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { configLock, leaks, lockPath } from '../support/drawer';
import { exec, type Run } from '../support/exec';
import { holdLock, sleepShim } from '../support/locks';
import { chmodPlant, pathPlant, ROOT_USER } from '../support/plants';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { stage } from '../support/stage';
import { put } from '../support/tree';

const CONFIG_LIB = join(ROOT, 'base/.contexture/config-lib');
const STORAGE_CONFIG = join(ROOT, 'base/.contexture/storage/config');
const WAIT_S = 60;
const SHIMMED_MS = (WAIT_S * 1000 * 3) / 4;

function runLib(
  cwd: string,
  fn: string,
  args: readonly string[] = [],
  { env = {}, shell = 'sh', input }: { env?: Record<string, string>; shell?: string; input?: string | Buffer } = {},
): Promise<Run> {
  return exec(shell, ['-c', 'f=$1; shift; . "$f" && "$@"', 'sh', CONFIG_LIB, fn, ...args], { cwd, env, input });
}

function runScript(
  cwd: string,
  script: string,
  { env = {}, shell = 'sh', input }: { env?: Record<string, string>; shell?: string; input?: string | Buffer } = {},
): Promise<Run> {
  return exec(shell, ['-c', `. "$1"; shift; ${script}`, 'sh', CONFIG_LIB], { cwd, env, input });
}

async function until(test: () => boolean, ms = 30_000): Promise<void> {
  const t0 = performance.now();
  while (!test()) {
    if (performance.now() - t0 > ms) throw new Error('the condition never held');
    await new Promise((r) => setTimeout(r, 20));
  }
}

function fakeDriver(sb: string, relDir: string, name: string, valid = true): string {
  const path = join(sb, '.contexture', relDir, name, 'driver');
  const card = valid
    ? `{"driver":"${name}","version":"4.0.0","contract":"4","store":["list","get","put","delete","batch","scan"],"search_modes":[{"name":"exact","description":"exact match"}],"optional":["store"]}`
    : '{"driver":"broken","version":"2.0.0","contract":"2","store":[]}';
  put(
    path,
    [
      '#!/bin/sh',
      'case "${1:-}" in',
      `  capability) printf '%s\\n' '${card}'; exit 0 ;;`,
      '  *) exit 0 ;;',
      'esac',
      '',
    ].join('\n'),
    0o755,
  );
  return path;
}

describe.concurrent('config-lib: core storage schema and unified config reader', () => {
  it('parses base/.contexture/storage/config cleanly', async () => {
    const sb = sandbox('cfg-storage-schema');
    const r = await runLib(sb, 'cfg_schema_parse', [STORAGE_CONFIG, 'storage']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe('driver\toptional\tstring\t\t\t\t1\tposix\tActive storage backend driver name.\n');
  });

  it('reads colon and equals separators, exact key matches, trimmed horizontal whitespace, quotes, comments, CRLF, and first non-empty wins', async () => {
    const sb = sandbox('cfg-reader');
    const conf = join(sb, 'config');
    writeFileSync(
      conf,
      [
        '# leading comment',
        '  storage.driver.extra: wrong',
        'storage.driver: "" # empty quoted skipped',
        'storage.driver:   # empty unquoted skipped',
        '  storage.driver  =  "sqlite"  # inline comment\r',
        'storage.driver: posix # later value loses',
        "hash.single: 'keep # hash' # trailing comment",
        'hash.double: "keep \\"quotes\\" and \\\\slash # hash" # note',
        'url.val = https://example.com:8443/path=1 # keeps colon and equals',
        'padded.val:   plain value   # comment',
        '',
      ].join('\n'),
    );

    expect((await runLib(sb, 'cfg_get_file', [conf, 'storage.driver'])).stdout).toBe('sqlite\n');
    expect((await runLib(sb, 'cfg_get_file', [conf, 'storage.driver.extra'])).stdout).toBe('wrong\n');
    expect((await runLib(sb, 'cfg_get_file', [conf, 'hash.single'])).stdout).toBe('keep # hash\n');
    expect((await runLib(sb, 'cfg_get_file', [conf, 'hash.double'])).stdout).toBe('keep "quotes" and \\slash # hash\n');
    expect((await runLib(sb, 'cfg_get_file', [conf, 'url.val'])).stdout).toBe('https://example.com:8443/path=1\n');
    expect((await runLib(sb, 'cfg_get_file', [conf, 'padded.val'])).stdout).toBe('plain value\n');

    const miss = await runLib(sb, 'cfg_get_file', [conf, 'missing.key']);
    expect([miss.code, miss.stdout, miss.stderr]).toEqual([1, '', '']);

    const list = await runLib(sb, 'cfg_list_file', [conf]);
    expect([list.code, list.stderr]).toEqual([0, '']);
    expect(list.stdout).toBe(
      [
        'storage.driver.extra\twrong',
        'storage.driver\tsqlite',
        'hash.single\tkeep # hash',
        'hash.double\tkeep "quotes" and \\slash # hash',
        'url.val\thttps://example.com:8443/path=1',
        'padded.val\tplain value',
        '',
      ].join('\n'),
    );
  });

  it('refuses unreadable, NUL-containing, invalid UTF-8, or malformed quoted config files, and warns on malformed lines in list', async () => {
    const sb = sandbox('cfg-reader-refuse');
    const conf = join(sb, 'config');
    writeFileSync(conf, Buffer.from('storage.driver: posix\0\n'));
    const nul = await runLib(sb, 'cfg_get_file', [conf, 'storage.driver']);
    expect(nul.code).toBe(2);
    expect(nul.stderr).toContain('ERR_STORAGE_READ');

    writeFileSync(conf, Buffer.concat([Buffer.from('storage.driver: '), Buffer.from([0xff, 0x0a])]));
    const badUtfGet = await runLib(sb, 'cfg_get_file', [conf, 'storage.driver']);
    expect(badUtfGet.code).toBe(2);
    expect(badUtfGet.stderr).toContain('ERR_STORAGE_READ');
    const badUtfList = await runLib(sb, 'cfg_list_file', [conf]);
    expect(badUtfList.code).toBe(2);
    expect(badUtfList.stderr).toContain('ERR_STORAGE_READ');

    writeFileSync(conf, 'storage.driver: "unclosed\n');
    const bad = await runLib(sb, 'cfg_get_file', [conf, 'storage.driver']);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain('ERR_INVALID_ARGUMENT');

    writeFileSync(conf, 'badline\n: emptykey\nbad.q: "unclosed\nstorage.driver: posix\n');
    const listWarn = await runLib(sb, 'cfg_list_file', [conf]);
    expect(listWarn.code).toBe(0);
    expect(listWarn.stdout).toBe('storage.driver\tposix\n');
    expect(listWarn.stderr).toContain('ignoring malformed line 1');
    expect(listWarn.stderr).toContain('ignoring empty key at line 2');
    expect(listWarn.stderr).toContain("ignoring malformed quoted value for 'bad.q' at line 3");
  });
});

describe.concurrent('config-lib: locked atomic writer and preservation', () => {
  it('writes canonical lines, quotes special values to round-trip, deduplicates keys in place, and supports raw writes', async () => {
    const sb = stage('posix', 'cfg-writer');
    const ctxDir = join(sb, '.contexture');
    const conf = join(ctxDir, 'config');

    expect((await runLib(sb, 'cfg_set', ['storage.driver', 'posix', ctxDir])).code).toBe(0);
    expect(readFileSync(conf, 'utf8')).toBe('storage.driver: posix\n');

    // Quote preservation round-trip
    for (const val of ['hello # hash', ' lead', 'tail ', 'say "hi"', "it's ok", 'a\\b']) {
      expect((await runLib(sb, 'cfg_set', ['mod.msg', val, ctxDir])).code).toBe(0);
      const got = await runLib(sb, 'cfg_get', ['mod.msg', ctxDir]);
      expect([got.code, got.stdout]).toEqual([0, `${val}\n`]);
    }

    // Raw unquoted mode for pkg_decl_write
    expect((await runLib(sb, 'cfg_set_raw', ['package.pkg-a', './catalog/pkg-a --as=a=b', ctxDir])).code).toBe(0);
    expect(readFileSync(conf, 'utf8')).toContain('package.pkg-a: ./catalog/pkg-a --as=a=b\n');

    // Deduplicate repeated keys in place
    writeFileSync(conf, '# top\nfoo.k = one\n# mid\nfoo.k: two\nother.k: keep\n');
    expect((await runLib(sb, 'cfg_set', ['foo.k', 'three', ctxDir])).code).toBe(0);
    expect(readFileSync(conf, 'utf8')).toBe('# top\nfoo.k: three\n# mid\nother.k: keep\n');
  });

  it('preserves unrelated lines, comments, blank lines, CRLF, no-trailing-newline, and 0-byte files byte for byte, and keeps unset a true no-op', async () => {
    const sb = stage('posix', 'cfg-preserve');
    const ctxDir = join(sb, '.contexture');
    const conf = join(ctxDir, 'config');

    // Unset when absent creates nothing (not even lock dir)
    expect((await runLib(sb, 'cfg_unset', ['storage.driver', ctxDir])).code).toBe(0);
    expect(existsSync(conf)).toBe(false);
    expect(existsSync(dirname(lockPath(sb, configLock())))).toBe(false);

    // 0-byte file untouched by unset, mtime unchanged
    writeFileSync(conf, '');
    const t0 = new Date(1_700_000_000_000);
    utimesSync(conf, t0, t0);
    expect((await runLib(sb, 'cfg_unset', ['storage.driver', ctxDir])).code).toBe(0);
    expect(readFileSync(conf, 'utf8')).toBe('');
    expect(statSync(conf).mtimeMs).toBe(t0.getTime());

    // No-trailing-newline file untouched by missing unset, preserved when trailing line unmodified
    writeFileSync(conf, 'alpha.x: 1\nbeta.y: 2');
    utimesSync(conf, t0, t0);
    expect((await runLib(sb, 'cfg_unset', ['missing.k', ctxDir])).code).toBe(0);
    expect(readFileSync(conf, 'utf8')).toBe('alpha.x: 1\nbeta.y: 2');
    expect(statSync(conf).mtimeMs).toBe(t0.getTime());

    expect((await runLib(sb, 'cfg_unset', ['alpha.x', ctxDir])).code).toBe(0);
    expect(readFileSync(conf, 'utf8')).toBe('beta.y: 2');

    // CRLF and blank lines preserved on unrelated lines
    const preset = '# header\r\n\r\nkeep.crlf: yes\r\nmod.key: old\n# footer\r\n';
    writeFileSync(conf, preset);
    expect((await runLib(sb, 'cfg_set', ['mod.key', 'new', ctxDir])).code).toBe(0);
    expect(readFileSync(conf, 'utf8')).toBe('# header\r\n\r\nkeep.crlf: yes\r\nmod.key: new\n# footer\r\n');

    // Removing the sole key leaves a 0-byte file rather than deleting
    writeFileSync(conf, 'only.key: 1\n');
    expect((await runLib(sb, 'cfg_unset', ['only.key', ctxDir])).code).toBe(0);
    expect(existsSync(conf)).toBe(true);
    expect(readFileSync(conf, 'utf8')).toBe('');
  });

  it('refuses CR, LF, empty values, malformed keys, and invalid UTF-8 without modifying config', async () => {
    const sb = stage('posix', 'cfg-write-refuse');
    const ctxDir = join(sb, '.contexture');
    const conf = join(ctxDir, 'config');
    writeFileSync(conf, 'storage.driver: posix\n');

    for (const [fn, args] of [
      ['cfg_set', ['storage.driver', 'bad\rval', ctxDir]],
      ['cfg_set', ['storage.driver', 'bad\nval', ctxDir]],
      ['cfg_set', ['storage.driver', '', ctxDir]],
      ['cfg_set', ['bad:key', 'x', ctxDir]],
      ['cfg_set', ['bad=key', 'x', ctxDir]],
      ['cfg_set', ['', 'x', ctxDir]],
      ['cfg_unset', ['bad:key', ctxDir]],
    ] as const) {
      const r = await runLib(sb, fn, [...args]);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('ERR_INVALID_ARGUMENT');
    }

    // Invalid UTF-8 byte 0xff passed via printf inside sh
    const badUtf8 = await runScript(sb, `val=$(printf '\\377'); cfg_set mod.k "$val" "${ctxDir}"`);
    expect(badUtf8.code).toBe(1);
    expect(badUtf8.stderr).toContain('ERR_INVALID_ARGUMENT');

    // Invalid UTF-8 byte 0xff in existing config refuses cfg_set rc 2 without modifying config
    const badConfSb = stage('posix', 'cfg-write-bad-utf8');
    const badConfDir = join(badConfSb, '.contexture');
    const badConf = join(badConfDir, 'config');
    const badBytes = Buffer.concat([Buffer.from('storage.driver: '), Buffer.from([0xff, 0x0a])]);
    writeFileSync(badConf, badBytes);
    const badConfWrite = await runLib(badConfSb, 'cfg_set', ['search.timeout', '15', badConfDir]);
    expect(badConfWrite.code).toBe(2);
    expect(badConfWrite.stderr).toContain('ERR_STORAGE_READ');
    expect(readFileSync(badConf).equals(badBytes)).toBe(true);

    expect(readFileSync(conf, 'utf8')).toBe('storage.driver: posix\n');
  });
});

describe.concurrent('config-lib: locking concurrency, stale recovery, and subshell trap isolation', () => {
  it.for(['sh', 'dash'])('preserves caller EXIT/INT/TERM traps under %s and cleans lock and temp files on INT/TERM', async (shell, { skip }) => {
    if (shell === 'dash' && !existsSync('/bin/dash')) skip();
    const sb = join(sandbox(`cfg-traps-${shell}`), 'ws');
    mkdirSync(join(sb, '.contexture'), { recursive: true });
    const ctxDir = join(sb, '.contexture');
    const r = await runScript(
      sb,
      `trap 'echo CALLER_EXIT' EXIT; trap 'echo CALLER_INT; exit 130' INT; trap 'echo CALLER_TERM; exit 143' TERM; cfg_set storage.driver posix "${ctxDir}"; echo AFTER_SET; trap`,
      { shell },
    );
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toContain('AFTER_SET\n');
    expect(r.stdout).toContain('CALLER_INT');
    expect(r.stdout).toContain('CALLER_TERM');
    expect(r.stdout.trimEnd().endsWith('CALLER_EXIT')).toBe(true);
    expect(existsSync(lockPath(sb, configLock()))).toBe(false);
    expect(existsSync(join(ctxDir, 'config'))).toBe(true);

    // Subshell signal delivery mid-write cleans config.lock and config.tmp.* without altering config
    const realAwk = ['/usr/bin/awk', '/bin/awk'].find((p) => existsSync(p));
    if (!realAwk) throw new Error('no awk binary');
    for (const [sig, code] of [['INT', 130], ['TERM', 143]] as const) {
      const sigSb = join(sandbox(`cfg-sig-${sig}-${shell}`), 'ws');
      const sigCtx = join(sigSb, '.contexture');
      mkdirSync(sigCtx, { recursive: true });
      writeFileSync(join(sigCtx, 'config'), 'storage.driver: posix\n');
      const awkEnv = pathPlant(
        'awk',
        `for f in "${sigCtx}"/config.tmp.*; do if [ -e "$f" ]; then kill -${sig} "$PPID"; exit 1; fi; done\nexec "${realAwk}" "$@"`,
      );
      const sigRes = await runLib(sigSb, 'cfg_set', ['search.timeout', '25', sigCtx], { shell, env: awkEnv });
      expect(sigRes.code).toBe(code);
      expect(existsSync(lockPath(sigSb, configLock()))).toBe(false);
      expect(readdirSync(sigCtx).filter((n) => n.startsWith('config.tmp.'))).toEqual([]);
      expect(readFileSync(join(sigCtx, 'config'), 'utf8')).toBe('storage.driver: posix\n');
    }
  });

  it('serializes concurrent writers (including backgrounded subshells from one parent) without losing keys', async () => {
    const sb = stage('posix', 'cfg-lock-concurrent');
    const ctxDir = join(sb, '.contexture');
    const keys = Array.from({ length: 8 }, (_, i) => `mod.k${i}`);
    const runs = await Promise.all(keys.map((k, i) => runLib(sb, 'cfg_set', [k, `v${i}`, ctxDir])));
    for (const r of runs) expect([r.code, r.stderr]).toEqual([0, '']);
    for (const [i, k] of keys.entries()) {
      const got = await runLib(sb, 'cfg_get', [k, ctxDir]);
      expect([got.code, got.stdout]).toEqual([0, `v${i}\n`]);
    }
    expect(existsSync(lockPath(sb, configLock()))).toBe(false);

    // Concurrent backgrounded calls in the same shell get distinct subshell PIDs
    const bg = await runScript(
      sb,
      `cfg_set bg.a 1 "${ctxDir}" & cfg_set bg.b 2 "${ctxDir}" & wait`,
    );
    expect([bg.code, bg.stderr]).toEqual([0, '']);
    expect((await runLib(sb, 'cfg_get', ['bg.a', ctxDir])).stdout).toBe('1\n');
    expect((await runLib(sb, 'cfg_get', ['bg.b', ctxDir])).stdout).toBe('2\n');
    expect(existsSync(lockPath(sb, configLock()))).toBe(false);
  });

  it('second writer waits until first lock holder releases', async ({ onTestFinished }) => {
    const sb = stage('posix', 'cfg-lock-wait');
    const ctxDir = join(sb, '.contexture');
    const lockDir = lockPath(sb, configLock());
    const go = join(sb, 'go');
    const waiting = join(sb, 'waiting');
    onTestFinished(() => writeFileSync(go, ''));

    // Hold config.lock from a separate process
    const holder = exec('sh', ['-c', `mkdir -p "${lockDir}" && echo $$ > "${lockDir}/pid"; while [ ! -e "${go}" ]; do sleep 0.1 2>/dev/null || sleep 1; done; rm -rf "${lockDir}"`], { cwd: sb });
    await until(() => existsSync(join(lockDir, 'pid')));
    const writer = runLib(sb, 'cfg_set', ['storage.driver', 'posix', ctxDir], {
      env: pathPlant('sleep', `: > "${waiting}"\nexec /bin/sleep "$@"`),
    });
    await until(() => existsSync(waiting));
    writeFileSync(go, '');
    const [hRes, wRes] = await Promise.all([holder, writer]);
    expect([hRes.code, wRes.code, wRes.stderr]).toEqual([0, 0, '']);
    expect(readFileSync(join(ctxDir, 'config'), 'utf8')).toBe('storage.driver: posix\n');
  });

  it(`live holder times out after ${WAIT_S} s under sleep shim with rc 2 ERR_STORAGE_LOCKED`, async () => {
    const sb = stage('posix', 'cfg-lock-timeout');
    const ctxDir = join(sb, '.contexture');
    const release = holdLock(sb, configLock(), 'live');
    const t0 = performance.now();
    const r = await runLib(sb, 'cfg_set', ['storage.driver', 'posix', ctxDir], { env: sleepShim() });
    expect(performance.now() - t0).toBeLessThan(SHIMMED_MS);
    expect([r.code, r.stdout, r.stderr]).toEqual([
      2,
      '',
      `config.lock: error: the configuration lock is held (${WAIT_S} s timeout) (ERR_STORAGE_LOCKED)\n`,
    ]);
    expect(existsSync(lockPath(sb, configLock()))).toBe(true);
    release();
  });

  it('breaks dead-pid lock immediately and pidless lock after grace', async () => {
    const sb = stage('posix', 'cfg-lock-stale');
    const ctxDir = join(sb, '.contexture');
    holdLock(sb, configLock(), 'dead');
    const r1 = await runLib(sb, 'cfg_set', ['storage.driver', 'posix', ctxDir]);
    expect([r1.code, r1.stderr]).toEqual([0, '']);
    expect(existsSync(lockPath(sb, configLock()))).toBe(false);

    holdLock(sb, configLock(), 'pidless');
    const r2 = await runLib(sb, 'cfg_set', ['search.timeout', '20', ctxDir], { env: sleepShim() });
    expect([r2.code, r2.stderr]).toEqual([0, '']);
    expect(existsSync(lockPath(sb, configLock()))).toBe(false);
    expect(readFileSync(join(ctxDir, 'config'), 'utf8')).toBe('storage.driver: posix\nsearch.timeout: 20\n');
  });

  it('refuses unwritable lock folder with rc 2 ERR_STORAGE_WRITE', async () => {
    const sb = stage('posix', 'cfg-lock-unwritable');
    const ctxDir = join(sb, '.contexture');
    mkdirSync(join(ctxDir, 'tmp'), { recursive: true });
    writeFileSync(dirname(lockPath(sb, configLock())), 'not a directory\n');
    const r = await runLib(sb, 'cfg_set', ['storage.driver', 'posix', ctxDir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('ERR_STORAGE_WRITE');
  });

  it.skipIf(ROOT_USER)('does not spin infinitely when stale lock removal fails, timing out cleanly rc 2 ERR_STORAGE_LOCKED', async ({ onTestFinished }) => {
    const sb = stage('posix', 'cfg-lock-rm-fail');
    const ctxDir = join(sb, '.contexture');
    holdLock(sb, configLock(), 'dead');
    chmodPlant(dirname(lockPath(sb, configLock())), 0o555, 0o755, onTestFinished);
    const t0 = performance.now();
    const r = await runLib(sb, 'cfg_set', ['storage.driver', 'posix', ctxDir], { env: sleepShim() });
    expect(performance.now() - t0).toBeLessThan(SHIMMED_MS);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('ERR_STORAGE_LOCKED');
  });
});

describe.concurrent('config-lib: schema parsing and value validation', () => {
  it('[modules-r-cwijk] parses all four types, optional/required, modifiers, defaults (with comments, quotes, and tabs), and 2-space descriptions', async () => {
    const sb = sandbox('cfg-schema-ok');
    const schema = join(sb, 'config');
    writeFileSync(
      schema,
      [
        '# module config',
        'mode: optional string one-of fast|balanced|thorough default balanced # comment',
        '  Selects execution mode.',
        'tab_mode: optional string one-of a|b\tdefault a',
        '  Tab before default.',
        'retries: optional integer min -1 max 10 default 3 # retry count',
        '  Retry budget.',
        'enabled: required boolean',
        '  Whether module is active.',
        'db_path: optional path default .data/local.db',
        '  Storage file location.',
        'note: optional string default "hello # world" # quoted default',
        '  Quoted default with hash.',
        '',
      ].join('\n'),
    );
    const r = await runLib(sb, 'cfg_schema_parse', [schema, 'testmod']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(
      [
        'mode\toptional\tstring\tfast|balanced|thorough\t\t\t1\tbalanced\tSelects execution mode.',
        'tab_mode\toptional\tstring\ta|b\t\t\t1\ta\tTab before default.',
        'retries\toptional\tinteger\t\t-1\t10\t1\t3\tRetry budget.',
        'enabled\trequired\tboolean\t\t\t\t0\t\tWhether module is active.',
        'db_path\toptional\tpath\t\t\t\t1\t.data/local.db\tStorage file location.',
        'note\toptional\tstring\t\t\t\t1\thello # world\tQuoted default with hash.',
        '',
      ].join('\n'),
    );
  });

  it.each([
    ['namespace: mymod\n', 'namespace'],
    ['UpperKey: optional string\n', 'invalid key'],
    ['1digit: optional string\n', 'invalid key'],
    ['a.b: optional string\n', 'invalid key'],
    ['dup: optional string\ndup: optional integer\n', 'declared twice'],
    ['k: required string default abc\n', 'required key cannot declare a default'],
    ['k: optional string one-of a|b default c\n', 'invalid default'],
    ['k: optional string one-of a||b\n', 'empty value'],
    ['k: optional string one-of a\tb|c\n', 'control character'],
    ['k: optional string one-of a|b bogus\n', 'unexpected clause'],
    ['k: optional string default foo one-of bar|baz\n', 'final clause'],
    ['k: optional string default "foo" one-of bar|baz\n', 'malformed quoted default'],
    ['k: optional integer default 10 min 1\n', 'final clause'],
    ['k: optional string default # only comment\n', 'requires a value'],
    ['k: optional integer min 10 max 5\n', 'exceeds max'],
    ['k: optional integer min abc\n', 'integer'],
    ['k: optional integer min 007\n', 'integer'],
    ['k: optional integer max 05\n', 'integer'],
    ['k: optional integer default 05\n', 'invalid default'],
    ['k: optional integer min 5 default 2\n', 'invalid default'],
    ['k: optional integer max 5 default 9\n', 'invalid default'],
    ['k: optional boolean default yes\n', 'invalid default'],
    ['k: optional string min 1\n', 'unsupported clause'],
    ['k: optional integer one-of 1|2\n', 'unsupported clause'],
    ['  orphaned description\nk: optional string\n', 'orphaned description'],
    ['k: optional string\n\n  orphaned after blank\n', 'orphaned description'],
    [' badindent: optional string\n', 'unexpected indentation'],
  ])('[modules-r-cwijk] refuses invalid schema (%s)', async (body, expected) => {
    const sb = sandbox('cfg-schema-bad');
    const schema = join(sb, 'config');
    writeFileSync(schema, body);
    const r = await runLib(sb, 'cfg_schema_parse', [schema, 'bad']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ERR_INVALID_ARGUMENT');
    expect(r.stderr).toContain(expected);
  });

  it('validates runtime values against type and constraints including leading-zero rejection', async () => {
    const sb = sandbox('cfg-val-check');
    expect((await runLib(sb, 'cfg_schema_validate_value', ['string', 'a|b', '', '', 'a'])).code).toBe(0);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['string', 'a|b', '', '', 'c'])).code).toBe(1);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['integer', '', '1', '10', '1'])).code).toBe(0);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['integer', '', '0', '10', '0'])).code).toBe(0);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['integer', '', '-5', '10', '-1'])).code).toBe(0);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['integer', '', '1', '10', '05'])).code).toBe(1);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['integer', '', '-10', '10', '-05'])).code).toBe(1);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['integer', '', '1', '10', '0'])).code).toBe(1);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['integer', '', '1', '10', '11'])).code).toBe(1);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['integer', '', '1', '10', 'ten'])).code).toBe(1);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['boolean', '', '', '', 'true'])).code).toBe(0);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['boolean', '', '', '', 'false'])).code).toBe(0);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['boolean', '', '', '', '1'])).code).toBe(1);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['path', '', '', '', 'data/file.db'])).code).toBe(0);
    expect((await runLib(sb, 'cfg_schema_validate_value', ['path', '', '', '', ''])).code).toBe(1);
  });
});

describe.concurrent('config-lib: schema discovery, driver collisions, and --as aliases', () => {
  it('discovers core search, core storage, installed driver configs, workspace/extension/manifestless modules, and --as aliases while skipping reserved names and shadowing cleanly', async () => {
    const sb = stage('posix', 'cfg-discover');
    const ctxDir = join(sb, '.contexture');

    // Driver configs in extensions/storage/drivers and storage/drivers
    put(join(ctxDir, 'extensions/storage/drivers/sqlite/config'), 'database: optional path\n  SQLite database path.\n');
    put(join(ctxDir, 'storage/drivers/posix/config'), 'sync_mode: optional string one-of fast|safe default safe\n  Sync policy.\n');

    // Manifestless hook/filter workspace module with config
    put(join(ctxDir, 'modules/lint-hook/config'), 'strict: optional boolean default true\n  Enforce strict checks.\n');

    // Workspace shadowing extension module
    put(join(ctxDir, 'modules/shadowed/config'), 'ws_only: optional string default yes\n');
    put(join(ctxDir, 'extensions/modules/shadowed/config'), 'ext_only: optional string default no\n');

    // Reserved/invalid module dirs skipped, except builtins in workspace modules/
    put(join(ctxDir, 'modules/search/config'), 'bad: optional string\n');
    put(join(ctxDir, 'modules/Upper/config'), 'bad: optional string\n');
    put(join(ctxDir, 'extensions/modules/store/config'), 'bad: optional string\n');

    // Aliased extension module with install record
    put(join(ctxDir, 'extensions/modules/memo2/config'), 'retention: optional integer min 1 default 30\n  Days to retain.\n');
    put(join(ctxDir, 'extensions/.state/pkg-memo.files'), 'package pkg-memo\nmodule memo2 memo\n');

    const r = await runLib(sb, 'cfg_discover_schemas', [ctxDir]);
    expect([r.code, r.stderr]).toEqual([0, '']);
    const lines = r.stdout.trim().split('\n');
    const keys = lines.map((l) => `${l.split('\t')[0]}.${l.split('\t')[1]}`);
    expect(keys).toEqual([
      'search.timeout',
      'storage.driver',
      'storage.sync_mode',
      'storage.database',
      'lint-hook.strict',
      'memo2.retention',
      'shadowed.ws_only',
    ]);
    const memoLine = lines.find((l) => l.startsWith('memo2\tretention\t'));
    expect(memoLine?.split('\t').slice(10)).toEqual(['memo', 'pkg-memo']);

    // Unreadable extensions/.state stays silent
    chmodSync(join(ctxDir, 'extensions/.state'), 0o000);
    try {
      const blind = await runLib(sb, 'cfg_discover_schemas', [ctxDir, 'memo2']);
      expect([blind.code, blind.stderr]).toEqual([0, '']);
      expect(blind.stdout.replace(/\n$/, '').split('\t')[10]).toBe('');
    } finally {
      chmodSync(join(ctxDir, 'extensions/.state'), 0o755);
    }
  });

  it('refuses driver schema key colliding with core storage.driver or another driver, and reads no driver config outside the two places the resolver finds a driver', async () => {
    const sb = stage('posix', 'cfg-driver-collision');
    const ctxDir = join(sb, '.contexture');
    put(join(ctxDir, 'extensions/storage/drivers/bad/config'), 'driver: optional string\n');
    const r = await runLib(sb, 'cfg_discover_schemas', [ctxDir, 'storage']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('collides with an existing storage key');

    // Two distinct drivers declaring the same key refuse collision
    const sb2 = stage('posix', 'cfg-driver-dup');
    const ctx2 = join(sb2, '.contexture');
    put(join(ctx2, 'extensions/storage/drivers/drv1/config'), 'shared: optional string\n');
    put(join(ctx2, 'extensions/storage/drivers/drv2/config'), 'shared: optional string\n');
    const dup = await runLib(sb2, 'cfg_discover_schemas', [ctx2, 'storage']);
    expect(dup.code).toBe(1);
    expect(dup.stderr).toContain('collides with an existing storage key');

    // A storage core driver other than posix, a workspace driver, and an extension folder named posix are no driver the resolver finds, so their configs are never read
    const sb3 = stage('posix', 'cfg-driver-retired');
    const ctx3 = join(sb3, '.contexture');
    put(join(ctx3, 'storage/drivers/alt/config'), 'core_opt: optional string default one\n');
    put(join(ctx3, 'drivers/wsd/config'), 'ws_opt: optional string default two\n');
    put(join(ctx3, 'extensions/storage/drivers/alt/config'), 'ext_opt: optional string default three\n');
    put(join(ctx3, 'extensions/storage/drivers/posix/config'), 'ext_posix_opt: optional string default four\n');
    const shd = await runLib(sb3, 'cfg_discover_schemas', [ctx3, 'storage']);
    expect([shd.code, shd.stderr]).toEqual([0, '']);
    expect(shd.stdout).toContain('storage\text_opt\t');
    expect(shd.stdout).not.toContain('core_opt');
    expect(shd.stdout).not.toContain('ws_opt');
    expect(shd.stdout).not.toContain('ext_posix_opt');
  });

  it('treats help as reserved, handles spaces in workspace paths, and preserves --as aliases under modified IFS', async () => {
    const ws = join(sandbox('cfg-spaces'), 'ws with spaces');
    const ctxDir = join(ws, '.contexture');
    put(join(ctxDir, 'modules/unit/scripts/list'), '#!/bin/sh\n# summary: list units\n');
    put(join(ctxDir, 'modules/with/config'), 'opt: optional string default ok\n');
    put(join(ctxDir, 'extensions/modules/memo2/config'), 'retention: optional integer default 30\n');
    put(join(ctxDir, 'extensions/.state/pkg-memo.files'), 'package pkg-memo\nmodule memo2 memo\n');

    expect((await runLib(ws, 'cfg_is_reserved', [ctxDir, 'help'])).code).toBe(0);
    // 'with' from 'ws with spaces' must not become reserved due to unquoted grep -l splitting
    expect((await runLib(ws, 'cfg_is_reserved', [ctxDir, 'with'])).code).toBe(1);

    const ifsRes = await runScript(ws, `IFS=:; cfg_discover_schemas "${ctxDir}" memo2`);
    expect([ifsRes.code, ifsRes.stderr]).toEqual([0, '']);
    expect(ifsRes.stdout.trim().split('\t').slice(10)).toEqual(['memo', 'pkg-memo']);
  });
});

describe.concurrent('config-lib: assembly, owner config-verb helper, and storage driver validator', () => {
  it('assembles workspace config (load, get, schema), excludes package.*, and warns on undeclared and legacy keys', async () => {
    const sb = stage('posix', 'cfg-assembly');
    const ctxDir = join(sb, '.contexture');
    put(join(ctxDir, 'modules/demo/config'), 'flag: optional boolean default false\n  Demo flag.\nsecret: optional string\n  Optional secret.\n');
    writeFileSync(
      join(ctxDir, 'config'),
      [
        'package.my-pkg: ./plugins/my-pkg --as=x=y',
        'search.timeout: 25',
        'demo.flag: true',
        'session.storage.driver: posix',
        'uninstalled.opt: hello',
        '',
      ].join('\n'),
    );
    writeFileSync(join(ctxDir, 'storage.conf'), 'storage.driver: posix\n');

    const loaded = await runLib(sb, 'cfg_assembly_load', ['ctx config', ctxDir]);
    expect(loaded.code).toBe(0);
    expect(loaded.stdout).toBe('search.timeout: 25\nstorage.driver: posix (default)\ndemo.flag: true\n');
    expect(loaded.stderr).toContain('legacy storage configuration is deprecated');
    expect(loaded.stderr).toContain("legacy key 'session.storage.driver' is deprecated");
    expect(loaded.stderr).toContain("undeclared configuration key 'uninstalled.opt'");
    expect(loaded.stderr).not.toContain('package.my-pkg');

    const json = await runLib(sb, 'cfg_assembly_load', ['ctx config', ctxDir, '--module=search', '--json']);
    expect(json.code).toBe(0);
    expect(JSON.parse(json.stdout)).toEqual({
      entries: [{ namespace: 'search', key: 'timeout', full_key: 'search.timeout', value: '25', type: 'integer', source: 'config' }],
    });

    const getTimeout = await runLib(sb, 'cfg_assembly_get', ['ctx config', ctxDir, 'search.timeout']);
    expect([getTimeout.code, getTimeout.stdout]).toEqual([0, '25\n']);

    const getDefault = await runLib(sb, 'cfg_assembly_get', ['ctx config', ctxDir, 'storage.driver']);
    expect([getDefault.code, getDefault.stdout]).toEqual([0, 'posix\n']);

    const getUnset = await runLib(sb, 'cfg_assembly_get', ['ctx config', ctxDir, 'demo.secret']);
    expect(getUnset.code).toBe(1);

    const getPkg = await runLib(sb, 'cfg_assembly_get', ['ctx config', ctxDir, 'package.my-pkg']);
    expect(getPkg.code).toBe(1);
    expect(getPkg.stderr).toContain('ctx package list');

    const schemaJson = await runLib(sb, 'cfg_assembly_schema', ['ctx config', ctxDir, 'demo', '--json']);
    expect([schemaJson.code, schemaJson.stderr]).toEqual([0, '']);
    expect(JSON.parse(schemaJson.stdout)).toEqual({
      schemas: [
        {
          namespace: 'demo',
          keys: [
            { key: 'flag', full_key: 'demo.flag', presence: 'optional', type: 'boolean', default: 'false', description: 'Demo flag.' },
            { key: 'secret', full_key: 'demo.secret', presence: 'optional', type: 'string', description: 'Optional secret.' },
          ],
        },
      ],
    });
  });

  it('implements owner config_owner_verb lifecycle, pre-write validator hook, and zero drawer-path leaks', async () => {
    const sb = stage('posix', 'cfg-owner-verb');
    const ctxDir = join(sb, '.contexture');
    put(
      join(ctxDir, 'modules/sample/config'),
      'count: optional integer min 1 max 5 default 2\n  Item count.\nreq: required string\n  Required setting.\n',
    );
    const env = { CTX_DIR: ctxDir };

    // Help forms exit 0 with empty stderr and zero leaks
    for (const args of [[], ['--help'], ['-h'], ['load', '--help'], ['get', '--help'], ['set', '--help'], ['unset', '--help'], ['schema', '--help']]) {
      const h = await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', ...args], { env });
      expect([h.code, h.stderr]).toEqual([0, '']);
      expect(h.stdout.length).toBeGreaterThan(0);
      for (const line of h.stdout.split('\n')) expect(leaks(line)).toBe(false);
    }
    // help is never a subcommand: the word refuses as an unknown one and the table names no help row
    const helpWord = await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', 'help'], { env });
    expect([helpWord.code, helpWord.stdout]).toEqual([1, '']);
    expect(helpWord.stderr).toContain("unknown subcommand 'help'");
    expect((await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', ''], { env })).stdout).not.toMatch(/^ {2}help /m);

    // Set, get, load, schema, unset, and refusals
    expect((await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', 'set', 'count', '4'], { env })).code).toBe(0);
    expect((await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', 'get', 'count'], { env })).stdout).toBe('4\n');
    expect((await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', 'set', 'count', '9'], { env })).code).toBe(1);
    expect((await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', 'get', 'sample.count'], { env })).code).toBe(1);

    // Cannot unset required key
    expect((await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', 'set', 'req', 'ok'], { env })).code).toBe(0);
    const reqUnset = await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', 'unset', 'req'], { env });
    expect(reqUnset.code).toBe(1);
    expect(reqUnset.stderr).toContain('ERR_SCHEMA_VIOLATION');

    // Pre-write validator hook refusal aborts before writing
    const hookRefuse = await runScript(
      sb,
      'deny() { echo "blocked $2=$3" >&2; return 1; }; config_owner_verb sample "ctx sample config" deny set count 3',
      { env },
    );
    expect(hookRefuse.code).toBe(1);
    expect(hookRefuse.stderr).toContain('blocked count=3');
    expect((await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', 'get', 'count'], { env })).stdout).toBe('4\n');

    expect((await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', 'unset', 'count'], { env })).code).toBe(0);
    expect((await runLib(sb, 'config_owner_verb', ['sample', 'ctx sample config', '', 'get', 'count'], { env })).stdout).toBe('2\n');
  });

  it('[store-r-0s40c] refuses a hand switch of the driver on set and unset before any write while the installer\'s locked writer writes pass, and lands the unset of a driver that resolves nothing', async () => {
    const sb = stage('posix', 'cfg-storage-driver');
    const ctxDir = join(sb, '.contexture');
    const env = { CTX_DIR: ctxDir, CTX_ROOT: sb };
    const conf = join(ctxDir, 'config');
    const shape = (r: Run) => [r.code, r.stdout, r.stderr];
    const verb = (...args: string[]) => runLib(sb, 'config_owner_verb', ['storage', 'ctx store config', 'cfg_validate_storage_driver', ...args], { env });
    const refusal = 'ctx store config: error: storage.driver belongs to the driver package lifecycle: install a driver package (ctx package install <package>) or uninstall it (ctx package uninstall <package>) to change it (ERR_INVALID_ARGUMENT)\n';
    fakeDriver(sb, 'extensions/storage/drivers', 'alt', true);

    for (const value of ['posix', 'alt', 'nosuch', '-bad']) expect(shape(await verb('set', 'driver', value)), value).toEqual([1, '', refusal]);
    expect(shape(await verb('unset', 'driver'))).toEqual([1, '', refusal]);
    expect(existsSync(conf)).toBe(false);

    // the installer's locked writer runs no hook, so its writes pass while the verb refuses
    expect((await runLib(sb, 'cfg_set', ['storage.driver', 'alt', ctxDir], { env })).code).toBe(0);
    expect(readFileSync(conf, 'utf8')).toBe('storage.driver: alt\n');
    for (const args of [['set', 'driver', 'posix'], ['unset', 'driver']]) expect(shape(await verb(...args)), args.join(' ')).toEqual([1, '', refusal]);
    expect(readFileSync(conf, 'utf8')).toBe('storage.driver: alt\n');
    expect((await runLib(sb, 'cfg_unset', ['storage.driver', ctxDir], { env })).code).toBe(0);
    expect(readFileSync(conf, 'utf8')).not.toContain('storage.driver');

    // a legacy line is no way around it
    writeFileSync(join(ctxDir, 'storage.conf'), 'storage.driver: alt\n');
    expect(shape(await verb('set', 'driver', 'posix'))).toEqual([1, '', refusal]);
    rmSync(join(ctxDir, 'storage.conf'));

    // a configured driver that resolves nothing holds nothing reachable, so its unset lands
    for (const gone of ['gone', '../gone']) {
      writeFileSync(conf, `storage.driver: ${gone}\n`);
      const r = await verb('unset', 'driver');
      expect([r.code, r.stdout, r.stderr], gone).toEqual([0, '', `notice: storage.driver named '${gone}', which resolves nothing, so it is unset and the record reads from posix again\n`]);
      expect(readFileSync(conf, 'utf8')).not.toContain('storage.driver');
    }
  });

  it('rejects empty --module=, avoids dotted-module false warnings, formats text schemas with quoted defaults, covers owner load --json/schema/help, and passes set -u', async () => {
    const sb = stage('posix', 'cfg-edge-cases');
    const ctxDir = join(sb, '.contexture');
    put(join(ctxDir, 'modules/foo/config'), 'opt: optional string default "hello # world"\n  Line 1.\n  Line 2.\n');
    put(join(ctxDir, 'modules/foo.bar/config'), 'opt: optional string default yes\n  Dotted module.\n');
    put(join(ctxDir, 'extensions/modules/memo2/config'), 'retention: optional integer min 0 default 7\n  Days.\n');
    put(join(ctxDir, 'extensions/.state/pkg-memo.files'), 'package pkg-memo\nmodule memo2 memo\n');
    writeFileSync(join(ctxDir, 'config'), 'foo.bar.opt: custom\n');

    const emptyMod = await runLib(sb, 'cfg_assembly_load', ['ctx config', ctxDir, '--module=']);
    expect(emptyMod.code).toBe(1);
    expect(emptyMod.stderr).toContain('--module=');

    const dotted = await runLib(sb, 'cfg_assembly_load', ['ctx config', ctxDir, '--module=foo']);
    expect([dotted.code, dotted.stderr]).toEqual([0, '']);
    expect(dotted.stdout).toBe('foo.opt: hello # world (default)\n');

    const textSchema = await runLib(sb, 'cfg_assembly_schema', ['ctx config', ctxDir]);
    expect([textSchema.code, textSchema.stderr]).toEqual([0, '']);
    expect(textSchema.stdout).toContain('default "hello # world"');
    expect(textSchema.stdout).toContain('    Line 1.\n    Line 2.\n');
    expect(textSchema.stdout).toContain('memo2 (alias of memo from package pkg-memo):\n');

    const env = { CTX_DIR: ctxDir, CTX_ROOT: sb };
    const ownLoad = await runLib(sb, 'config_owner_verb', ['foo', 'ctx foo config', '', 'load', '--json'], { env });
    expect([ownLoad.code, ownLoad.stderr]).toEqual([0, '']);
    expect(JSON.parse(ownLoad.stdout).entries).toHaveLength(1);
    const ownSchema = await runLib(sb, 'config_owner_verb', ['foo', 'ctx foo config', '', 'schema'], { env });
    expect([ownSchema.code, ownSchema.stderr]).toEqual([0, '']);
    expect(ownSchema.stdout).toContain('foo:\n');
    const ownHelp = await runLib(sb, 'config_owner_verb', ['foo', 'ctx foo config', '', 'set', '--help'], { env });
    expect([ownHelp.code, ownHelp.stderr]).toEqual([0, '']);
    expect(ownHelp.stdout).toContain('usage: ctx foo config set <key> <value>');

    for (const shell of ['sh', 'dash']) {
      if (shell === 'dash' && !existsSync('/bin/dash')) continue;
      const u = await exec(
        shell,
        ['-uc', '. "$1"; CTX_DIR=$2; CTX_ROOT=$3; cfg_discover_schemas "$2" >/dev/null && cfg_assembly_load test "$2" >/dev/null && cfg_is_reserved "$2" help', 'sh', CONFIG_LIB, ctxDir, sb],
        { cwd: sb },
      );
      expect([u.code, u.stderr], `set -u under ${shell}`).toEqual([0, '']);
    }
  });
});
