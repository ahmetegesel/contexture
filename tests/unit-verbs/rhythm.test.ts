import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { stage } from '../support/stage';
import { plantRhythms } from '../support/unit';

const SELECT = "select: match the request against each use when; a propose match is proposed and waits for the human's confirm, an auto match applies and says so; no match runs the design loop (@rhythms default); read a rhythm with ctx rhythm show <name>";
const PROBE = 'probe | workspace | use when: the suite needs an index line | activation: propose';
const EXTPROBE = 'extprobe | extension | use when: the suite needs an extension index line | activation: propose';
const lines = (out: string): string[] => out.replace(/\n$/, '').split('\n');

function rhythmStage(label: string): string {
  const sb = stage('posix', label);
  plantRhythms(sb);
  return sb;
}

describe.concurrent('ctx rhythm list: the rhythms over both roots', () => {
  it('V-d [modules-r20]: list prints the workspace rhythm, then the extension rhythm, then the select line', async () => {
    const r = await ctx(rhythmStage('rhythm-list'), 'rhythm', 'list');
    expect([r.code, lines(r.stdout), r.stderr]).toEqual([0, [PROBE, EXTPROBE, SELECT], '']);
  });

  it('V-d BG1 [modules-r20]: an absent workspace rhythms root answers rc 0 with the extension rhythm alone', async () => {
    const sb = rhythmStage('rhythm-bg1');
    renameSync(join(sb, '.contexture/rhythms'), join(sb, '.contexture/rhythms.bg1'));
    const r = await ctx(sb, 'rhythm', 'list');
    expect([r.code, lines(r.stdout), r.stderr]).toEqual([0, [EXTPROBE, SELECT], '']);
  });

  it('V-d BG1 [modules-r20]: both rhythm roots absent print the select line alone rc 0, no stderr', async () => {
    const r = await ctx(stage('posix', 'rhythm-none'), 'rhythm', 'list');
    expect([r.code, r.stdout, r.stderr]).toEqual([0, `${SELECT}\n`, '']);
  });

  it('[modules-r20] a root lists in name order, a missing use when reads (missing) and warns, a missing activation reads propose with no warning, and a file without an @rhythm line is skipped with its warning', async () => {
    const sb = stage('posix', 'rhythm-defaults');
    const dir = join(sb, '.contexture/rhythms');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'b.md'), '@rhythm b\n  use when: the second one\n  activation: auto\n  1. GO: the one gate\n');
    writeFileSync(join(dir, 'a.md'), '@rhythm a\n  1. GO: the one gate\n');
    writeFileSync(join(dir, 'c.md'), '# notes\n  use when: never listed\n');
    const r = await ctx(sb, 'rhythm', 'list');
    expect(r.code).toBe(0);
    expect(lines(r.stdout)).toEqual(['a | workspace | use when: (missing) | activation: propose', 'b | workspace | use when: the second one | activation: auto', SELECT]);
    expect(lines(r.stderr).sort()).toEqual(['rhythm list: warning: a (workspace): no use when line', 'rhythm list: warning: c (workspace): no @rhythm line']);
  });

  it('R-g [modules-r20]: list refuses an argument rc 1 with the usage', async () => {
    const r = await ctx(stage('posix', 'rhythm-arg'), 'rhythm', 'list', 'extra');
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', 'Usage: ctx rhythm list\nhelp: ctx rhythm help\n']);
  });
});
