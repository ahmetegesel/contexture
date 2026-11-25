import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { beforeAll, describe, expect, it } from 'vitest';
import { libraryLock, lockPath } from '@support/drawer';
import { launch } from '@support/exec';
import { holdLock, sleepShim } from '@support/locks';
import { pathPlant } from '@support/plants';
import { sandbox } from '@support/sandbox';
import { fresh } from '@support/snapshot';
import { store } from '@support/store';
import { docs, putDocs, stageSeed } from '../support/corpus';
import { fixture } from '../support/edit';

const MKTEMP = spawnSync('sh', ['-c', 'command -v mktemp'], { encoding: 'utf8' }).stdout.trim();

// the barrier plant: the mktemp stub, which the storage core's dispatch gate runs as it
// stages the doc's bytes for the put (docs_store calls store_put after docs_lock returned,
// LIB_LOCK set), marks the barrier folder with its pid and waits there until a second writer
// marks it too (up to 4 s), or, given a release file, until the test writes that file (up to
// 60 s)
const barrier = (dir = sandbox('write-race-barrier'), release = ''): Record<string, string> => {
  const wait = release
    ? `    while [ ! -e "${release}" ] && [ "$n" -lt 600 ]; do sleep 0.1; n=$((n + 1)); done`
    : `    while [ "$(ls "${dir}" | wc -l)" -lt 2 ] && [ "$n" -lt 40 ]; do sleep 0.1; n=$((n + 1)); done`;
  return {
    ...pathPlant('mktemp', [
      'case " $* " in',
      '  *store-gate.*)',
      `    : > "${dir}/$$"`,
      '    n=0',
      wait,
      '    ;;',
      'esac',
      `exec "${MKTEMP}" "$@"`,
    ].join('\n')),
  };
};

let wtest: string;
beforeAll(async () => {
  wtest = await stageSeed('posix', 'wrace', (sb) => putDocs(sb, 'posix', { 'wtest/unit': readFileSync(fixture('unit.md'), 'utf8') }));
});

const stored = async (sb: string, slug: string): Promise<string> => (await store(sb, 'posix').get('docs', `wtest/${slug}`)).stdout;

describe('the docs write pipeline holds the library lock across its read, edit, and put', { concurrent: true }, () => {
  it('[modules-r9, docs-module-r18] two concurrent writers of one doc both land: neither edit is lost', async () => {
    const sb = fresh(wtest);
    const env = { ...barrier(), GIT_CEILING_DIRECTORIES: dirname(sb) };
    const one = launch('./.contexture/ctx', ['docs', 'header', 'wtest', 'unit', '--add-keyword=race-alpha'], { cwd: sb, env }).result;
    const two = launch('./.contexture/ctx', ['docs', 'header', 'wtest', 'unit', '--add-keyword=race-beta'], { cwd: sb, env }).result;
    const [a, b] = await Promise.all([one, two]);
    expect([a.code, a.stderr, b.code, b.stderr]).toEqual([0, '', 0, '']);
    const doc = await stored(sb, 'unit');
    expect(doc).toContain('race-alpha');
    expect(doc).toContain('race-beta');
    expect(existsSync(lockPath(sb, libraryLock('docs')))).toBe(false);
  });

  it('[docs-module-r18, docs-module-r23] two concurrent creators of one slug: exactly one lands, the other refuses ERR_ENTITY_EXISTS', async () => {
    const sb = fresh(wtest);
    const env = { ...barrier(), GIT_CEILING_DIRECTORIES: dirname(sb) };
    const create = (who: string) =>
      launch('./.contexture/ctx', ['docs', 'new', 'wtest', 'racer', '--kind=structural', `--description=written by ${who}`, '--sources=src/racer/**', '--keywords=racer'], { cwd: sb, env }).result;
    const runs = await Promise.all([create('one'), create('two')]);
    const landed = runs.filter((r) => r.code === 0);
    const refused = runs.filter((r) => r.code !== 0);
    expect([landed.length, refused.length]).toEqual([1, 1]);
    expect([refused[0]?.code, refused[0]?.stdout]).toEqual([1, '']);
    expect(refused[0]?.stderr).toBe('ctx docs new: wtest/racer already exists (ERR_ENTITY_EXISTS)\n');
    const winner = await stored(sb, 'racer');
    expect(winner).toMatch(/description: "written by (one|two)"/);
  });

  it('[modules-r9, docs-module-r18] a writer stopped by a signal while it holds the lock releases it, and the next write lands at once', async ({ onTestFinished }) => {
    const sb = fresh(wtest);
    const marks = sandbox('write-race-barrier');
    const release = join(sandbox('write-race-release'), 'go');
    onTestFinished(() => writeFileSync(release, ''));
    const env = { ...barrier(marks, release), GIT_CEILING_DIRECTORIES: dirname(sb) };
    const held = launch('./.contexture/ctx', ['docs', 'header', 'wtest', 'unit', '--add-keyword=race-stopped'], { cwd: sb, env });
    // the signal waits for the barrier's mark, never the lock folder: lib_lock makes the folder
    // before it writes the pid and sets LIB_LOCK, and a stop in that window leaves the folder
    // behind; the mark lands only once the writer holds the lock with LIB_LOCK set, and the
    // writer waits at the barrier until the release, so the signal finds it holding the lock
    const t0 = performance.now();
    while (readdirSync(marks).length === 0) {
      if (performance.now() - t0 > 60_000) throw new Error('the writer never took the lock');
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(existsSync(lockPath(sb, libraryLock('docs'))), 'the writer at the barrier holds the lock').toBe(true);
    held.signal('SIGTERM');
    writeFileSync(release, '');
    const stopped = await held.result;
    expect(stopped.code).toBe(143);
    expect(existsSync(lockPath(sb, libraryLock('docs')))).toBe(false);
    expect(readdirSync(dirname(lockPath(sb, libraryLock('docs'))))).toEqual([]);
    const next = await docs(sb, ['header', 'wtest', 'unit', '--add-keyword=race-next']);
    expect([next.code, next.stderr]).toEqual([0, '']);
    expect(await stored(sb, 'unit')).toContain('race-next');
  });
});

const LIBRARY = '.contexture/storage/scripts/library';
const LOCKED = (verb: string) => `ctx docs ${verb}: the library lock of 'docs' is held (60 s timeout) (ERR_STORAGE_LOCKED)\n`;
const WRITES: readonly [verb: string, args: string[]][] = [
  ['new', ['new', 'wtest', 'held', '--kind=structural', '--description=held back', '--sources=src/held/**', '--keywords=held']],
  ['header', ['header', 'wtest', 'unit', '--add-keyword=held']],
  ['remove', ['remove', 'wtest', 'unit']],
  ['replace', ['replace', 'wtest', 'unit', '--old=Delegate the rest', '--new=Delegate the others', '--count=1']],
  ['ids', ['ids', 'wtest']],
];

// the wait under a live holder is 600 polls, each still spawning a cat and a sleep (the shim's
// true), so host load stretches it past the default exec ceiling: the call takes a raised
// ceiling, and the case a timeout above it, so a hang still fails naming the ceiling
const HELD_CEILING = 300_000;

describe('every docs write pipeline takes the library lock before its first read', { concurrent: true }, () => {
  it.for(WRITES)('[modules-r9, docs-module-r18] ctx docs %s under a live holder refuses rc 2 ERR_STORAGE_LOCKED under its own name after the wait, nothing written', { timeout: HELD_CEILING + 60_000 }, async ([verb, args]) => {
    const sb = fresh(wtest);
    const before = await stored(sb, 'unit');
    const release = holdLock(sb, libraryLock('docs'), 'live');
    const r = await docs(sb, args, { env: sleepShim(), timeout: HELD_CEILING });
    release();
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', LOCKED(verb)]);
    expect(await stored(sb, 'unit')).toBe(before);
    expect((await store(sb, 'posix').get('docs', 'wtest/held')).code).not.toBe(0);
  });

  it('[modules-r9] a storage core whose library has no lock refuses rc 2 before any read, nothing written', async () => {
    const sb = fresh(wtest);
    const before = await stored(sb, 'unit');
    writeFileSync(join(sb, LIBRARY), `${readFileSync(join(sb, LIBRARY), 'utf8')}\nunset -f lib_lock\n`);
    const r = await docs(sb, ['header', 'wtest', 'unit', '--add-keyword=unlocked']);
    expect([r.code, r.stdout, r.stderr]).toEqual([2, '', 'ctx docs header: the storage core library has no lock (need: the storage core of this release) (ERR_DRIVER_NOT_FOUND)\n']);
    expect(await stored(sb, 'unit')).toBe(before);
  });
});
