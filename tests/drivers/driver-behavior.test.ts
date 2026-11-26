import { cpSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { dataFile } from '../support/data-file';
import { SQLITE_DB } from '../support/drawer';
import { exec, launch } from '../support/exec';
import { ROOT_USER, chmodPlant } from '../support/plants';
import { alive } from '../support/procs';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { sqliteAvailable, stage } from '../support/stage';
import { treeState } from '../support/tree';
import { waitFor } from '../support/unit';

const SCRIPT = '.contexture/storage/scripts/driver-behavior';
const RESOLVER = '.contexture/storage/scripts/driver-resolver';
const POSIX_PART = join(ROOT, 'base/.contexture/storage/drivers/posix');
const SQLITE_PART = join(ROOT, 'plugins/storage-sqlite/.contexture/extensions/storage/drivers/sqlite');
const STEPS = 100;
const BOUND_MS = 60_000;
const RUN_MS = 180_000;
const CARD = '{"driver":"plant","version":"4.0.0","contract":"4","store":["list","get","put","delete","batch","scan"],"search_modes":[{"name":"exact","description":"a planted driver"}],"optional":["store"]}';
const CARD_LINE = `case "$1" in capability) printf '%s\\n' '${CARD}'; exit 0 ;; esac`;
const REFUSER = ['#!/bin/sh', CARD_LINE, "printf '%s: error: a planted refusal (ERR_STORAGE_READ)\\n' \"$1\" >&2", 'exit 2', ''].join('\n');

const same = (name: string): string => `driver behavior: same: ${name} answers the ${STEPS} steps as posix does\n`;
const scratch = (sb: string): string => join(sb, '.contexture', 'tmp');
const pause = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const behavior = (sb: string, args: readonly string[], env: Record<string, string> = {}) =>
  exec(join(sb, SCRIPT), args, { cwd: sb, env, timeout: RUN_MS });

// a driver part as a package ships it, copied under its own name into a sandbox
function part(name: string, from = POSIX_PART): string {
  const dir = join(sandbox(`part-${name}`), name);
  cpSync(from, dir, { recursive: true });
  return dir;
}

// a copy of the posix part whose driver runs a planted shell line before the real driver
function wrapped(name: string, line: string): string {
  const dir = part(name);
  renameSync(join(dir, 'driver'), join(dir, 'driver.real'));
  writeFileSync(join(dir, 'driver'), `#!/bin/sh\n${line}\nexec "$0.real" "$@"\n`, { mode: 0o755 });
  return dir;
}

function planted(name: string, text: string): string {
  const dir = join(sandbox(`part-${name}`), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'driver'), text, { mode: 0o755 });
  return dir;
}

async function groupCalls(pgid: number, sb: string): Promise<number> {
  const ps = await exec('ps', ['-A', '-o', 'pgid=', '-o', 'args='], { cwd: sb });
  return ps.stdout.split('\n').filter((l) => l.trim().split(/\s+/)[0] === String(pgid) && l.includes(RESOLVER)).length;
}

describe('the driver behavior test: a candidate the same as posix', () => {
  it('[the-engine-r-bhv01] a copy of the posix part under another name reads same within 60 s and leaves the drawer\'s scratch folder as found', async () => {
    const sb = stage('posix', 'behavior-posix');
    const before = treeState(scratch(sb));
    const t0 = Date.now();
    const r = await behavior(sb, [part('posix-copy')]);
    const took = Date.now() - t0;
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe(same('posix-copy'));
    expect(r.code).toBe(0);
    expect(took, `the run took ${took} ms`).toBeLessThan(BOUND_MS);
    expect(treeState(scratch(sb))).toBe(before);
  });

  it.skipIf(!sqliteAvailable())('[the-engine-r-bhv01] the sqlite part reads same within 60 s', async () => {
    const sb = stage('posix', 'behavior-sqlite');
    const before = treeState(scratch(sb));
    const t0 = Date.now();
    const r = await behavior(sb, [SQLITE_PART, '--all']);
    const took = Date.now() - t0;
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe(same('sqlite'));
    expect(r.code).toBe(0);
    expect(took, `the run took ${took} ms`).toBeLessThan(BOUND_MS);
    expect(treeState(scratch(sb))).toBe(before);
  });
});

describe('the driver behavior test: what it catches, what it refuses, and what it leaves', { concurrent: true }, () => {
  it('[the-engine-r-bhv01] a blind candidate, a card and nothing written, differs at the first health step', async () => {
    const sb = stage('posix', 'behavior-blind');
    const r = await behavior(sb, [planted('blind', `#!/bin/sh\n${CARD_LINE}\nexit 0\n`)]);
    expect(r.stdout).toMatch(/^driver behavior: differs at step h01 \(health of the empty store\): health degraded, store absent on posix, health none, store none on blind\n$/);
    expect(r.code).toBe(1);
    expect(r.stdout).not.toContain(sb);
  });

  it.each([
    ['an extra line after the health answer', 'extraline', 'case "$1" in storage.health) "$0.real" "$@"; rc=$?; printf \'extra\\n\'; exit $rc ;; esac'],
    ['a bare health and store pair', 'barepair', 'case "$1" in storage.health) out=$("$0.real" "$@"); rc=$?; printf \'%s\\n\' "$out" | sed \'s/"driver":"[^"]*",//; s/,"detail":"[^"]*"//\'; exit $rc ;; esac'],
  ] as const)('[the-engine-r-bhv01] a health answer outside its shape, %s with the health and store fields kept, differs at the first health step', async (_, name, line) => {
    const sb = stage('posix', `behavior-${name}`);
    const r = await behavior(sb, [wrapped(name, line)]);
    expect(r.stdout).toBe(`driver behavior: differs at step h01 (health of the empty store): health degraded, store absent on posix, an answer outside the health shape on ${name}\n`);
    expect(r.code).toBe(1);
  });

  it('[the-engine-r-bhv01] one byte added to every list answer differs at the first list step', async () => {
    const sb = stage('posix', 'behavior-list');
    const r = await behavior(sb, [wrapped('listplant', 'case "$1" in store.list) out=$("$0.real" "$@"); rc=$?; printf \'%sX\\n\' "$out"; exit $rc ;; esac')]);
    expect(r.stdout).toBe('driver behavior: differs at step l01 (list of the empty store): stdout differs, 31 bytes on posix, 32 on listplant\n');
    expect(r.code).toBe(1);
  });

  it('[the-engine-r-bhv01] a one byte flip in one get differs at that step alone, and --all prints its line before the answer', async () => {
    const sb = stage('posix', 'behavior-flip');
    const flip = wrapped('flip', 'if [ "$1" = store.get ] && [ $# -eq 3 ] && [ "$3" = a/bad ]; then "$0.real" "$@" | tr \'\\377\' \'\\376\'; exit 0; fi');
    const r = await behavior(sb, [flip, '--all']);
    const line = 'driver behavior: differs at step g05 (get the value of invalid UTF-8): stdout differs, 9 bytes on posix, 9 on flip';
    expect(r.stdout).toBe(`${line}\n${line}\n`);
    expect(r.code).toBe(1);
  });

  it('[the-engine-r-bhv01] a reference that refuses every step answers cannot run, never same, though the candidate refuses alike', async () => {
    const sb = stage('posix', 'behavior-refuser');
    writeFileSync(join(sb, '.contexture/storage/drivers/posix/driver'), REFUSER, { mode: 0o755 });
    const r = await behavior(sb, [planted('refuser', REFUSER)]);
    expect(r.stdout).toBe('driver behavior: cannot run: posix refused step h01 (health of the empty store), which it must hold; nothing is proven\n');
    expect(r.code).toBe(2);
  });

  it.each([
    ['no driver part', () => []],
    ['the option alone', () => ['--all']],
    ['an unknown option', () => ['--nosuch', part('pa')]],
    ['two driver parts', () => [part('pb'), part('pc')]],
    ['the reference driver\'s name', () => [POSIX_PART]],
    ['a folder holding no driver', () => { const d = join(sandbox('part-empty'), 'empty'); mkdirSync(d); return [d]; }],
    ['a file that is not executable', () => { const d = join(sandbox('part-file'), 'plain'); writeFileSync(d, '#!/bin/sh\n', { mode: 0o644 }); return [d]; }],
    ['a name outside the driver name rule', () => [part('bad name')]],
  ] as const)('[the-engine-r-bhv01] %s refuses rc 1 with one line, nothing staged', async (_, args) => {
    const sb = stage('posix', 'behavior-args');
    const before = treeState(scratch(sb));
    const r = await behavior(sb, args());
    expect(r.stderr).toMatch(/^driver-behavior: error: [^\n]* \(ERR_INVALID_ARGUMENT\)\n$/);
    expect(r.stdout).toBe('');
    expect(r.code).toBe(1);
    expect(treeState(scratch(sb))).toBe(before);
  });

  it.skipIf(ROOT_USER)('[the-engine-r-bhv01] a drawer whose scratch folder cannot hold the work root answers cannot run, never the system temp', async () => {
    const sb = stage('posix', 'behavior-hold');
    chmodPlant(scratch(sb), 0o555, 0o755, onTestFinished);
    const r = await behavior(sb, [part('held')]);
    expect(r.stdout).toBe('driver behavior: cannot run: the drawer\'s scratch folder cannot hold the work root\n');
    expect(r.code).toBe(2);
  });

  it('[the-engine-r-bhv01] a candidate a core driver of its name shadows answers cannot run, never posix against posix', async () => {
    const sb = stage('posix', 'behavior-shadow');
    cpSync(POSIX_PART, join(sb, '.contexture/storage/drivers/shadow'), { recursive: true });
    const r = await behavior(sb, [part('shadow')]);
    expect(r.stdout).toBe('driver behavior: cannot run: the candidate does not resolve as its scratch workspace\'s configured driver\n');
    expect(r.code).toBe(2);
  });

  it.skipIf(!sqliteAvailable())('[the-engine-r-bhv01] from a live workspace whose storage variables all name it, a run leaves that workspace byte identical and its scratch folder as found, while a naive call lands in it', async () => {
    const live = stage('sqlite', 'behavior-live');
    dataFile(live, 'modules', 'live', 'key: <a>/<b>\n');
    const seed = await exec(join(live, RESOLVER), ['store.put', 'live', 'live/one'], { cwd: live, input: 'live value\n', env: { CTX_ROOT: live } });
    expect(seed.code).toBe(0);
    const env = {
      CTX_ROOT: live,
      CTX_DIR: join(live, '.contexture'),
      CTX_STORAGE_DRIVER: 'sqlite',
      CTX_STORAGE_SQLITE_PATH: join(live, SQLITE_DB),
      CTX_SCRATCH_ROOT: join(scratch(live), 'verb.1'),
    };
    const outside = () => treeState(live).split('\n').filter((l) => !l.startsWith('.contexture/tmp/')).join('\n');
    const fingerprint = outside();
    const found = treeState(scratch(live));
    expect(fingerprint).toContain(`${SQLITE_DB} `);
    const r = await behavior(live, [join(live, '.contexture/extensions/storage/drivers/sqlite')], env);
    expect(r.stdout).toBe(same('sqlite'));
    expect(r.code).toBe(0);
    expect(outside()).toBe(fingerprint);
    expect(treeState(scratch(live))).toBe(found);
    const naive = stage('posix', 'behavior-naive');
    dataFile(naive, 'modules', 'live', 'key: <a>/<b>\n');
    const leak = await exec(join(naive, RESOLVER), ['store.put', 'live', 'leak/x'], { cwd: naive, input: 'leak\n', env });
    expect(leak.code).toBe(0);
    expect(outside()).not.toBe(fingerprint);
  });

  it.each([['SIGHUP', 129], ['SIGINT', 130], ['SIGTERM', 143]] as const)('[the-engine-r-bhv01] a %s to the run alone mid run, its stdin held open, stops both sides and every call, removes the work root, and exits %d', async (sig, rc) => {
    const sb = stage('posix', 'behavior-signal');
    const before = treeState(scratch(sb));
    const run = launch(join(sb, SCRIPT), [part('sigcopy')], { cwd: sb, input: null, timeout: RUN_MS });
    const pgid = run.child.pid as number;
    let calls = 0;
    for (let i = 0; i < 600 && calls === 0; i++) {
      calls = await groupCalls(pgid, sb);
      if (calls === 0) await pause(50);
    }
    expect(calls, 'a call in flight before the signal').toBeGreaterThan(0);
    run.signal(sig);
    const done = await run.result;
    expect(done.code).toBe(rc);
    expect(done.stdout).toBe('');
    expect(done.stderr).toBe('');
    expect(await waitFor(() => !alive(-pgid), 5_000), 'the run\'s process group emptied').toBe(true);
    expect(treeState(scratch(sb))).toBe(before);
  });
});
