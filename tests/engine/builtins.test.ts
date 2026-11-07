import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { stage } from '../support/stage';
import { treeState } from '../support/tree';
import { run } from '../support/unit';

const MISSING = 'ctx: compose: missing composer: .contexture/laws/compose\n';
const USAGE = 'compose: error: usage: compose [--check]\n';

describe.concurrent('the compose builtin', () => {
  it('[the-engine-r-n791r] passes the composer through: stdout, stderr, and rc equal a direct composer call, stale, composed, and current', async () => {
    const viaCtx = stage('posix', 'builtin-compose-twin');
    const direct = stage('posix', 'builtin-compose-direct');
    for (const args of [['--check'], [], [], ['--check']]) {
      const a = await run(viaCtx, ['compose', ...args]);
      const b = await exec('sh', ['.contexture/laws/compose', ...args], { cwd: direct });
      expect({ code: a.code, stdout: a.stdout, stderr: a.stderr }).toEqual({ code: b.code, stdout: b.stdout, stderr: b.stderr });
    }
    expect(treeState(viaCtx)).toBe(treeState(direct));
  });

  it('[the-engine-r-n791r] refuses rc 2 with one stderr line when the composer is missing, before any exec, writing nothing', async () => {
    const sb = stage('posix', 'builtin-compose-missing');
    rmSync(join(sb, '.contexture/laws/compose'));
    const before = treeState(sb);
    for (const args of [[], ['--check']]) {
      const r = await run(sb, ['compose', ...args]);
      expect(r.code).toBe(2);
      expect(r.stdout).toBe('');
      expect(r.stderr).toBe(MISSING);
    }
    expect(treeState(sb)).toBe(before);
  });

  it.for([['--bogus'], ['help'], ['--check', '--check'], ['--help', '--check']])('[the-engine-r-n791r] hands %j to the composer, whose usage refusal answers rc 1', async (args) => {
    const sb = stage('posix', 'builtin-compose-usage');
    const r = await run(sb, ['compose', ...args]);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('');
    expect(r.stderr).toBe(USAGE);
  });

  it.for(['--help', '-h'])('[the-engine-r-n791r] answers a sole %s itself: the usage, the purpose, and the exit codes on stdout rc 0, naming no generated file', async (flag) => {
    const sb = stage('posix', 'builtin-compose-help');
    rmSync(join(sb, '.contexture/laws/compose'));
    const r = await run(sb, ['compose', flag]);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    const lines = r.stdout.trimEnd().split('\n');
    expect(lines[0]).toBe('usage: ctx compose [--check]');
    expect(lines[1]).toMatch(/^composes the generated law layer .*--check writes nothing/);
    expect(lines[2]).toBe('exit codes: 0 current or composed; 1 stale under --check, or a content refusal; 2 an I/O refusal or a missing composer');
    expect(lines).toHaveLength(3);
    expect(r.stdout).not.toMatch(/AGENTS|\.md\b|laws\//);
  });

  it('[the-engine-r-n791r] ctx help prints one compose usage line', async () => {
    const r = await run(stage('posix', 'builtin-compose-tophelp'), ['help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^ {2}ctx compose \[--check\] +\S/m);
    expect(r.stdout.match(/^ {2}ctx compose /gm)).toHaveLength(1);
  });
});
