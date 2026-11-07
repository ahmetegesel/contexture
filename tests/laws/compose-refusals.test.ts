import { accessSync, appendFileSync, constants, copyFileSync, cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { compose, DOCS_MOD, layer, layerBytes, synth, SYNTH } from '../support/laws';
import { chmodPlant, ROOT_USER } from '../support/plants';
import { fresh } from '../support/snapshot';
import { stage } from '../support/stage';

const readable = (path: string): boolean => {
  try {
    accessSync(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

describe.concurrent('the compose refusals', () => {
  let composed: string;
  beforeAll(async () => {
    composed = synth();
    expect((await compose(composed)).code).toBe(0);
  });

  const refusal = async (sb: string, rc: number, ...names: string[]) => {
    const before = layerBytes(sb);
    const r = await compose(sb);
    expect(r.code).toBe(rc);
    for (const n of names) expect(r.stderr).toContain(n);
    expect(layerBytes(sb)).toEqual(before);
  };

  it('[modules-r19] reads the workspace overlay only for its slugs: a unique overlay law passes and stays out of the layer', async () => {
    const sb = synth('overlay-clean.md');
    expect((await compose(sb)).code).toBe(0);
    expect(layer(sb)).not.toContain('workspace-law');
  });

  it('[modules-r19] refuses rc1 a slug duplicated across the layer and the workspace overlay, naming both, writing nothing', async () => {
    const sb = fresh(composed);
    copyFileSync(join(SYNTH, 'overlay-duplicate.md'), join(sb, 'AGENTS.workspace.md'));
    await refusal(sb, 1, "duplicate law slug 'alpha-law'", 'AGENTS.workspace.md');
  });

  it.skipIf(ROOT_USER)('[modules-r19] refuses rc2 an unreadable workspace overlay, writing nothing', async ({ onTestFinished, skip }) => {
    const sb = fresh(composed);
    const overlay = join(sb, 'AGENTS.workspace.md');
    writeFileSync(overlay, '@append @laws\n  workspace-law: a workspace overlay law\n');
    chmodPlant(overlay, 0o000, 0o644, onTestFinished);
    if (readable(overlay)) skip('the chmod plant did not take');
    await refusal(sb, 2, 'unreadable overlay');
  });

  it('[modules-r19] refuses rc1 a @replace fragment, writing nothing', async () => {
    const sb = fresh(composed);
    writeFileSync(join(sb, '.contexture/modules/beta/laws'), '@replace @laws\n  x-law: x\n');
    await refusal(sb, 1, '@replace');
  });

  it('[modules-r11, modules-r19] refuses rc1 a module manifest carrying a requires line, naming the module and the rule, writing nothing', async () => {
    const sb = fresh(composed);
    appendFileSync(join(sb, '.contexture/modules/beta/module'), '# requires: x\n');
    await refusal(sb, 1, "module 'beta'", 'requires is reserved');
  });

  it('[modules-r19] refuses rc2 a recorded standalone law fragment that is missing, writing nothing', async () => {
    const sb = fresh(composed);
    rmSync(join(sb, '.contexture/extensions/laws/alpha-extra'));
    await refusal(sb, 2, 'missing or unreadable standalone law fragment');
  });

  it.skipIf(ROOT_USER)('[modules-r19] refuses rc2 an unreadable install record, writing nothing', async ({ onTestFinished, skip }) => {
    const sb = fresh(composed);
    const record = join(sb, '.contexture/extensions/.state/alpha.files');
    chmodPlant(record, 0o000, 0o644, onTestFinished);
    if (readable(record)) skip('the chmod plant did not take');
    await refusal(sb, 2, 'unreadable install record');
  });

  it.skipIf(ROOT_USER)('[modules-r19] refuses rc2 an unreadable module laws fragment, writing nothing', async ({ onTestFinished, skip }) => {
    const sb = fresh(composed);
    const laws = join(sb, '.contexture/modules/beta/laws');
    chmodPlant(laws, 0o000, 0o644, onTestFinished);
    if (readable(laws)) skip('the chmod plant did not take');
    await refusal(sb, 2, 'unreadable laws fragment');
  });

  it('[modules-r19] refuses rc1 an edited core whose block skeleton changed, writing nothing', async () => {
    const sb = fresh(composed);
    const core = join(sb, '.contexture/laws/core.md');
    let dropping = false;
    const edited = readFileSync(core, 'utf8')
      .split('\n')
      .filter((l) => {
        if (l === '@record') dropping = true;
        else if (dropping && l.startsWith('@')) dropping = false;
        return !dropping;
      })
      .join('\n');
    writeFileSync(core, edited);
    await refusal(sb, 1, 'core law source', 'block skeleton');
  });

  it('[modules-r19] refuses rc2 a missing core source, writing nothing', async () => {
    const sb = fresh(composed);
    rmSync(join(sb, '.contexture/laws/core.md'));
    await refusal(sb, 2, 'missing core law source');
  });

  it('[modules-r19] keeps the direct composer call working, and refuses it rc2 without the engine, writing nothing', async () => {
    const sb = fresh(composed);
    const before = layerBytes(sb);
    const direct = () => exec('sh', ['.contexture/laws/compose'], { cwd: sb });
    const ok = await direct();
    expect(ok.code).toBe(0);
    expect(ok.stderr).toBe('');
    rmSync(join(sb, '.contexture/ctx'));
    const r = await direct();
    expect(r.code).toBe(2);
    expect(r.stderr).toBe('compose: error: missing engine: .contexture/ctx\n');
    expect(layerBytes(sb)).toEqual(before);
  });

  it('refuses rc1 an unknown argument', async () => {
    expect((await compose(fresh(composed), '--bogus')).code).toBe(1);
  });

  it("[modules-r19] refuses rc1 an old overlay's docs-first beside the composed docs module, writing no layer", async () => {
    const sb = stage('posix', 'laws-docs-overlay');
    cpSync(DOCS_MOD, join(sb, '.contexture/extensions/modules/docs'), { recursive: true });
    writeFileSync(join(sb, 'AGENTS.workspace.md'), '@append @laws\n  docs-first: the overlay twin\n');
    const r = await compose(sb);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("duplicate law slug 'docs-first'");
    expect(r.stderr).toContain('AGENTS.workspace.md');
    expect(layerBytes(sb)).toBeUndefined();
  });
});
