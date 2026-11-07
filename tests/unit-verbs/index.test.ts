import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stage } from '../support/stage';
import { plantRhythms, unit } from '../support/unit';

const names = (out: string): string[] => out.split('\n').filter(Boolean).map((l) => l.split(/[ (]/)[0]!);

function rhythmStage(label: string): string {
  const sb = stage('posix', label);
  plantRhythms(sb);
  return sb;
}

describe.concurrent('ctx unit index: the rhythm index over both roots', () => {
  it('V-d [modules-r20]: index renders the workspace rhythm, then the extension rhythm', async () => {
    const out = (await unit(rhythmStage('index'), 'index')).stdout;
    expect(out).toMatch(/^probe \(.*probe\.md\) \| use when: the suite needs an index line \| activation: propose/m);
    expect(out).toMatch(/^extprobe \(.*extprobe\.md\) \| use when: the suite needs an extension index line \| activation: propose/m);
    expect(names(out)).toEqual(['probe', 'extprobe']);
  });

  it('V-d BG1 [modules-r20]: an absent workspace rhythms directory answers rc 0 with the extension rhythm alone', async () => {
    const sb = rhythmStage('index-bg1');
    renameSync(join(sb, '.contexture/rhythms'), join(sb, '.contexture/rhythms.bg1'));
    const r = await unit(sb, 'index');
    expect(r.code).toBe(0);
    expect(names(r.stdout + r.stderr)).toEqual(['extprobe']);
  });

  it('V-d BG1 [modules-r20]: both rhythms directories absent answer an empty index rc 0, no stderr', async () => {
    const sb = stage('posix', 'index-none');
    const r = await unit(sb, 'index');
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toBe('');
  });

  it('[modules-r20] a folder lists in name order, a missing use when reads (missing), a missing activation reads propose, and a file without an @rhythm line lists nothing', async () => {
    const sb = stage('posix', 'index-defaults');
    const dir = join(sb, '.contexture/rhythms');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'b.md'), '@rhythm beta\n  use when: the second one\n  activation: auto\n');
    writeFileSync(join(dir, 'a.md'), '@rhythm alpha\n');
    writeFileSync(join(dir, 'c.md'), '# notes\n  use when: never listed\n');
    const r = await unit(sb, 'index');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(
      'alpha (.contexture/rhythms/a.md) | use when: (missing) | activation: propose\nbeta (.contexture/rhythms/b.md) | use when: the second one | activation: auto\n',
    );
  });

  it('R-g [modules-r20]: index refuses an argument rc 1', async () => {
    expect((await unit(stage('posix', 'index-arg'), 'index', 'extra')).code).toBe(1);
  });
});
