import { cpSync, existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, launch } from '../support/exec';
import { shVerb, writeModule } from '../support/modules';
import { alive } from '../support/procs';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { run } from '../support/unit';
import { engineSandbox } from './fixture';

// the engine sandbox warns its broken fixture shapes on every dispatch; a row reads its own lines
const own = (stderr: string): string =>
  stderr
    .split('\n')
    .filter((l) => l && !/^ctx: (skipping|reserved name refused|help is engine-owned)/.test(l))
    .map((l) => `${l}\n`)
    .join('');

describe.concurrent('the engine-owned help', () => {
  let sb: string;
  beforeAll(() => {
    sb = engineSandbox('help');
    writeModule(sb, 'modules', 'awkmod', {
      manifest: '# summary: an awk verb fixture\n',
      files: {
        'scripts/show': ['#!/usr/bin/awk -f', '# summary: an awk verb', '# usage: ctx awkmod show', '# help: prints the awk verb table', 'BEGIN { print "RAN" }', ''].join('\n'),
      },
    });
  });

  it('CT-D2 [the-engine-r4]: bare ctx prints the summary rc 0; help with an extra argument refuses rc 1', async () => {
    const bare = await run(sb, []);
    expect(bare.code).toBe(0);
    expect(bare.stdout).toContain('ctx: the workspace command binder');
    const extra = await run(sb, ['help', 'extra']);
    expect(extra.code).toBe(1);
    expect(extra.stderr).toContain('help accepts only --all as an extra argument');
  });

  it('CT-D2 [the-engine-r4]: help --all renders every module block with its verb summaries', async () => {
    const r = await run(sb, ['help', '--all']);
    expect(r.code).toBe(0);
    for (const s of ['module good:', 'module unit:', 'say hi']) expect(r.stdout).toContain(s);
  });

  it('CT-A1 [the-engine-r4, modules-r2]: bare ctx <module> prints its verb table rc 0', async () => {
    const r = await run(sb, ['good']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('ctx good: a good fixture module');
    expect(r.stdout).toMatch(/^ {2}hi +say hi$/m);
  });

  it('CT-A1 [the-engine-r4, modules-r2]: ctx <module> help <verb> renders its summary, usage, and help lines', async () => {
    const r = await run(sb, ['good', 'help', 'hi']);
    expect(r.code).toBe(0);
    for (const s of ['say hi', 'ctx good hi [<name>]', 'prints hi, optionally to a name']) expect(r.stdout).toContain(s);
  });

  it('CT-A1 [the-engine-r4]: a scripts/help file is ignored with a warning; help of an unknown verb refuses rc 1', async () => {
    const r = await run(sb, ['good', 'help']);
    expect(r.stderr).toContain('help is engine-owned; ignoring scripts/help in good');
    expect(r.stdout).not.toContain('shadow-help');
    expect((await run(sb, ['good', 'help', 'nosuch'])).code).toBe(1);
  });

  it.for([
    ['awkmod', 'show', '--help', 'prints the awk verb table'],
    ['awkmod', 'show', '-h', 'prints the awk verb table'],
    ['good', 'hi', '--help', 'prints hi, optionally to a name'],
    ['good', 'hi', '-h', 'prints hi, optionally to a name'],
  ] as const)('N1 [the-engine-r7]: a sole %s %s %s prints the verb table the engine renders on stdout rc 0, and the verb never runs', async ([m, v, flag, line]) => {
    const table = await run(sb, [m, 'help', v]);
    const r = await run(sb, [m, v, flag]);
    expect([r.code, own(r.stderr)]).toEqual([0, '']);
    expect(r.stdout).toBe(table.stdout);
    expect(r.stdout).toContain(line);
    expect(r.stdout).not.toMatch(/RAN|^hi /m);
  });

  it.for(['--help', '-h'])('N1 [the-engine-r7]: %s followed by more refuses rc 1 with one stderr line naming the sole form, and the verb never runs', async (flag) => {
    const r = await run(sb, ['good', 'hi', flag, 'x']);
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(own(r.stderr)).toBe(`ctx: good hi: ${flag} takes no further argument; help is ctx good hi ${flag} alone\n`);
  });

  it('N1 [the-engine-r7]: null check: the awk verb runs without the flag, and a help flag after the first argument reaches the verb', async () => {
    expect((await run(sb, ['awkmod', 'show'])).stdout).toBe('RAN\n');
    expect((await run(sb, ['good', 'env', 'x', '--help'])).stdout).toContain('argv=x --help\n');
    expect((await run(sb, ['good', 'hi', 'help'])).stdout).toBe('hi help\n');
  });

  it('N1 [the-engine-r7]: a verb whose header carries only its summary prints that line alone, rc 0, nothing warned', async () => {
    writeModule(sb, 'modules', 'barehelp', { manifest: '# summary: a summary only fixture\n', files: { 'scripts/only': shVerb('a verb with only its summary', 'echo RAN') } });
    const r = await run(sb, ['barehelp', 'only', '-h']);
    expect([r.code, r.stdout, own(r.stderr)]).toEqual([0, 'ctx barehelp only: a verb with only its summary\n', '']);
  });
});

const HOOK = (summary: string, guard: string, body = 'printf "RAN %s\\n" "$*"'): string =>
  ['#!/bin/sh', `# summary: ${summary}`, '# usage: ctx hk <verb>', '# help: the fixed line', '# help-from: code', `if [ "\${CTX_HELP:-}" = 1 ]; then`, guard, 'fi', body, ''].join('\n');

describe.concurrent('the help hook: a verb declaring # help-from: code appends its help mode output below the header table', () => {
  let sb: string;
  const table = (verb: string, summary: string): string => `ctx hk ${verb}: ${summary}\n\nusage:\n  ctx hk <verb>\n\nhelp:\n  the fixed line\n`;
  const gone = (scratch: string): boolean => !existsSync(join(sb, '.contexture/tmp', scratch)) && !existsSync(join(sb, '.contexture/tmp', `${scratch}.io`));
  const traced = (verb: string): string[] => {
    const file = join(sb, `${verb}.trace`);
    return existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [];
  };
  beforeAll(() => {
    sb = stage('posix', 'help-hook');
    writeModule(sb, 'modules', 'hk', {
      manifest: '# summary: the help hook fixture\n',
      files: {
        'scripts/sh1': HOOK(
          'a shell hook',
          [
            '  if read -r l; then in=read; else in=empty; fi',
            '  printf "module=%s verb=%s sub=[%s] argc=%s stdin=%s\\n" "$CTX_HELP_MODULE" "$CTX_HELP_VERB" "$CTX_HELP_SUB" "$#" "$in"',
            '  printf "pwd=%s scratch=%s\\n" "$PWD" "${CTX_SCRATCH_ROOT##*/}"',
            '  printf "  indented\\n\\n  after a blank line\\n"',
            '  exit 0',
          ].join('\n'),
        ),
        'scripts/awk1': [
          '#!/usr/bin/awk -f',
          '# summary: an awk hook',
          '# usage: ctx hk <verb>',
          '# help: the fixed line',
          '# help-from: code',
          'BEGIN { if (ENVIRON["CTX_HELP"] == "1") { print "awk help for " ENVIRON["CTX_HELP_VERB"] " argc " ARGC - 1; help = 1; exit 0 } }',
          '{ print "BODY " $0 }',
          'END { if (help) exit 0; print "AWK RAN" }',
          '',
        ].join('\n'),
        'scripts/fail1': HOOK('a failing hook', '  printf "partial\\n"; printf "boom\\n" >&2; exit 3'),
        'scripts/err1': HOOK('a hook writing stderr', '  printf "out line\\n"; printf "noise\\n" >&2; exit 0'),
        'scripts/empty1': HOOK('an empty hook', '  exit 0'),
        'scripts/badval': ['#!/bin/sh', '# summary: an unknown value', '# usage: ctx hk <verb>', '# help: the fixed line', '# help-from: file', 'printf "RAN\\n"', ''].join('\n'),
        'scripts/slow1': HOOK('a hook past the bound', '  sleep 60 & printf "%s\\n%s\\n%s\\n" "$!" "$$" "${CTX_SCRATCH_ROOT##*/}" > "$CTX_ROOT/slow1.trace"; sleep 60; exit 0'),
        'scripts/term1': HOOK('a hook stopped by a signal', '  sleep 90 & printf "%s\\n%s\\n%s\\n" "$!" "$$" "${CTX_SCRATCH_ROOT##*/}" > "$CTX_ROOT/term1.trace"; sleep 90; exit 0'),
        'scripts/plant': HOOK(
          'a red plant writing through ctx store put',
          '  if "$CTX_BIN" store put containers/hookplant --description=planted --minting=given > /dev/null 2> "$CTX_SCRATCH_ROOT/e"; then echo wrote; else cat "$CTX_SCRATCH_ROOT/e"; fi\n  exit 0',
        ),
        'scripts/mark': HOOK('a hook leaving a mark', '  printf "x\\n" >> "$CTX_ROOT/mark.log"; exit 0'),
      },
    });
  });

  it('[the-engine-r7, the-engine-r4]: a shell hook runs once with no argument, empty stdin, the workspace root, its own scratch, and the four variables; its stdout follows the table and one empty line byte for byte', async () => {
    const r = await run(sb, ['hk', 'sh1', '-h'], { input: 'never read\n' });
    expect([r.code, r.stderr]).toEqual([0, '']);
    const scratch = /scratch=(\S+)/.exec(r.stdout)?.[1] ?? '';
    expect(scratch).toMatch(/^verb\.\d+\.help$/);
    expect(r.stdout).toBe(`${table('sh1', 'a shell hook')}\nmodule=hk verb=sh1 sub=[] argc=0 stdin=empty\npwd=${realpathSync(sb)} scratch=${scratch}\n  indented\n\n  after a blank line\n`);
    expect(gone(scratch)).toBe(true);
  });

  it('[the-engine-r7, modules-r2]: an awk hook guards in BEGIN and END, gets no argument, and its output is appended', async () => {
    const r = await run(sb, ['hk', 'awk1', '--help']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(`${table('awk1', 'an awk hook')}\nawk help for awk1 argc 0\n`);
    expect((await run(sb, ['hk', 'awk1'], { input: 'l1\n' })).stdout).toBe('BODY l1\nAWK RAN\n');
  });

  it.for(['sh1', 'awk1', 'fail1', 'err1', 'empty1', 'badval'])('[the-engine-r4]: ctx hk <verb> -h, ctx hk <verb> --help, and ctx hk help <verb> print the same bytes, rc 0: %s', async (v) => {
    const [a, b, c] = await Promise.all([run(sb, ['hk', v, '-h']), run(sb, ['hk', v, '--help']), run(sb, ['hk', 'help', v])]);
    expect([a.code, b.code, c.code]).toEqual([0, 0, 0]);
    const same = (s: string): string => s.replace(/verb\.\d+\.help/g, 'verb.N.help');
    expect(same(b.stdout)).toBe(same(a.stdout));
    expect(same(c.stdout)).toBe(same(a.stdout));
  });

  it('[the-engine-r7]: a failing hook keeps the table alone with one stderr warning, its partial output dropped, rc 0', async () => {
    const r = await run(sb, ['hk', 'fail1', '-h']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, table('fail1', 'a failing hook'), 'ctx: hk fail1: the help hook exited 3; the header table stands\n']);
  });

  it('[the-engine-r7]: a hook writing stderr and exiting 0 appends its stdout, its stderr discarded', async () => {
    const r = await run(sb, ['hk', 'err1', '-h']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, `${table('err1', 'a hook writing stderr')}\nout line\n`, '']);
  });

  it('[the-engine-r7]: a hook exiting 0 with empty stdout adds nothing and warns nothing', async () => {
    const r = await run(sb, ['hk', 'empty1', '-h']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, table('empty1', 'an empty hook'), '']);
  });

  it('[modules-r2]: any other help-from value is ignored with one stderr warning at help time, the verb never run, and nothing is warned at discovery', async () => {
    const r = await run(sb, ['hk', 'badval', '-h']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, table('badval', 'an unknown value'), "ctx: hk badval: help-from 'file' is not code; the header table stands\n"]);
    const listing = await run(sb, ['hk']);
    expect([listing.code, listing.stderr]).toEqual([0, '']);
    expect(listing.stdout).toMatch(/^ {2}badval +an unknown value$/m);
  });

  it('[the-engine-r7]: a hook past its 5 s bound is stopped with its descendants, the table stands with one warning, and no folder is left', async () => {
    const started = Date.now();
    const r = await exec('./.contexture/ctx', ['hk', 'slow1', '-h'], { cwd: sb, timeout: 60_000 });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(5000);
    expect(elapsed).toBeLessThan(30_000);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, table('slow1', 'a hook past the bound'), 'ctx: hk slow1: the help hook passed its 5 s bound; the header table stands\n']);
    const [bg, sh, scratch] = traced('slow1');
    expect([bg, sh].filter((p) => p && alive(Number(p)))).toEqual([]);
    expect(scratch).toMatch(/^verb\.\d+\.help$/);
    expect(gone(scratch!)).toBe(true);
  });

  it('[the-engine-r7]: a TERM to the engine mid hook stops the hook with its descendants and removes its folders, rc 143', async () => {
    const { result, signal } = launch('./.contexture/ctx', ['hk', 'term1', '-h'], { cwd: sb, timeout: 90_000 });
    const started = Date.now();
    while (traced('term1').length < 3 && Date.now() - started < 30_000) await new Promise((done) => setTimeout(done, 50));
    const [bg, sh, scratch] = traced('term1');
    expect(scratch).toMatch(/^verb\.\d+\.help$/);
    signal('SIGTERM');
    const r = await result;
    expect(r.code).toBe(143);
    expect([bg, sh].filter((p) => alive(Number(p)))).toEqual([]);
    expect(gone(scratch!)).toBe(true);
  });

  it('[the-engine-r-helpm]: a red plant hook writing through ctx store put is refused by the storage core in help mode, and nothing lands', async () => {
    const r = await run(sb, ['hk', 'plant', '-h']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toContain('driver-resolver: ERROR: store.put refused in help mode: help writes nothing (ERR_INVALID_ARGUMENT)');
    expect(r.stdout).not.toContain('wrote');
    const listing = await run(sb, ['store', 'list', 'containers']);
    expect(listing.code).toBe(0);
    expect(listing.stdout).not.toContain('hookplant');
  });

  it('[the-engine-r4]: the hook never runs for ctx help, ctx help --all, ctx <module>, or ctx <module> help; null check: ctx hk help mark runs it once', async () => {
    const mark = join(sb, 'mark.log');
    for (const args of [['help'], ['help', '--all'], ['hk'], ['hk', 'help']]) expect((await run(sb, args)).code).toBe(0);
    expect(existsSync(mark)).toBe(false);
    expect((await run(sb, ['hk', 'help', 'mark'])).code).toBe(0);
    expect(readFileSync(mark, 'utf8')).toBe('x\n');
  });
});

describe.concurrent('the help surface hides the hook runner', () => {
  let sb: string;
  beforeAll(() => {
    sb = stage('posix', 'help-hooks');
    cpSync(join(ROOT, 'tests/hooks/fixtures/modules'), join(sb, '.contexture/modules'), { recursive: true });
  });

  it('HK-S9 [modules-r5]: ctx help names no hooks verb and no _hooks; the unit table lists close and refresh', async () => {
    const top = (await run(sb, ['help'])).stdout;
    expect(top).not.toContain('_hooks');
    expect(top).not.toContain('hooks');
    const table = (await run(sb, ['unit', 'help'])).stdout;
    expect(table).toMatch(/^ {2}close /m);
    expect(table).toMatch(/^ {2}refresh /m);
  });

  it('HK-S9 [modules-r5]: help --all hides the runner and the hook declarations; no help surface names a boot point', async () => {
    const all = (await run(sb, ['help', '--all'])).stdout;
    expect(all).toContain('module unit:');
    expect(all).not.toContain('_hooks');
    expect(all).not.toContain('ctx-hook');
    const surfaces = [all, (await run(sb, ['help'])).stdout, (await run(sb, ['unit', 'help'])).stdout].join('\n');
    expect(surfaces.match(/(^|[^A-Za-z0-9_])boot([^A-Za-z0-9_]|$)/gm)).toBeNull();
  });

  it('HK-S9: null check: the fixture hook modules are staged, so the hidden words exist on disk', async () => {
    expect(readFileSync(join(sb, '.contexture/modules/az-hook-test/hooks/10-stamp-a.sh'), 'utf8')).toContain('# ctx-hook: stamp');
    expect((await run(sb, ['_hooks', 'stamp', 'CTX_UNIT', 'u'])).stdout).toContain('HOOK az-stamp-a point=stamp');
  });
});

