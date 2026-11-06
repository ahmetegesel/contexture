import { cpSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { writeModule } from '../support/modules';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { run } from '../support/unit';
import { engineSandbox } from './fixture';

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

  it.for(['--help', '-h'])('N1 [the-engine-r7]: %s after an awk verb prints the verb table the engine renders, and the verb never runs', async (flag) => {
    const table = await run(sb, ['awkmod', 'help', 'show']);
    const r = await run(sb, ['awkmod', 'show', flag]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(table.stdout);
    expect(r.stdout).toContain('prints the awk verb table');
    expect(r.stdout).not.toContain('RAN');
  });

  it('N1 [the-engine-r7]: null check: the awk verb runs without the flag, and a shell verb answers --help itself', async () => {
    expect((await run(sb, ['awkmod', 'show'])).stdout).toBe('RAN\n');
    expect((await run(sb, ['good', 'hi', '--help'])).stdout).toBe('hi --help\n');
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

