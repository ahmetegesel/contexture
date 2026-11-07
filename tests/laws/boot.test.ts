import { accessSync, appendFileSync, constants, existsSync, lstatSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compose, count, layer, layerBytes, layerPath } from '../support/laws';
import { chmodPlant, ROOT_USER } from '../support/plants';
import { stage } from '../support/stage';
import { firstByteDifference } from '../support/tree';

const LEGACY = '.contexture/laws/AGENTS.generated.md';
const REMOVED = 'compose: removed legacy .contexture/laws/AGENTS.generated.md';

const writable = (path: string): boolean => {
  try {
    accessSync(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

function plantLegacy(sb: string): string {
  const p = join(sb, LEGACY);
  writeFileSync(p, '# contexture v0.67.0: generated law layer; the legacy copy\n');
  return p;
}

describe.concurrent("the loader's step 1 at boot (sh .contexture/laws/compose from the workspace root)", () => {
  it('[modules-r19] reads an absent layer as stale for --check writing nothing, then composes it, and verifies it current silently', async () => {
    const sb = stage('posix', 'laws-boot-absent');
    expect(layerBytes(sb)).toBeUndefined();
    const check = await compose(sb, '--check');
    expect(check.code).toBe(1);
    expect(check.stderr).toContain('compose: stale: AGENTS.generated.md');
    expect(layerBytes(sb)).toBeUndefined();
    const first = await compose(sb);
    expect(first.code).toBe(0);
    expect(first.stderr).toContain('compose: composed AGENTS.generated.md');
    const g = layer(sb);
    expect(count(g, /^@boot$/)).toBe(1);
    expect(g).toMatch(/^# contexture v/);
    const again = await compose(sb);
    expect(again.code).toBe(0);
    expect(again.stderr).toBe('');
  });

  it('[modules-r19] reads a stale layer red for --check writing nothing, recomposes it with the late clause, and then verifies it current', async () => {
    const sb = stage('posix', 'laws-boot-stale');
    expect((await compose(sb)).code).toBe(0);
    const current = layerBytes(sb)!;
    appendFileSync(join(sb, '.contexture/modules/unit/laws'), '\n@append @record\n  boot-stale: a later clause\n');
    expect((await compose(sb, '--check')).code).toBe(1);
    expect(firstByteDifference(layerBytes(sb)!, current)).toBe(-1);
    expect((await compose(sb)).code).toBe(0);
    expect(count(layer(sb), /^ {2}boot-stale: a later clause$/)).toBe(1);
    expect((await compose(sb, '--check')).code).toBe(0);
  });
});

describe.concurrent('the legacy layer cleanup (the composer default mode, until the idea legacy-sunset retires it)', () => {
  it('[modules-r19] removes a legacy layer after writing the root layer, the composed line first, rc 0', async () => {
    const sb = stage('posix', 'laws-legacy-write');
    const legacy = plantLegacy(sb);
    const r = await compose(sb);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe(`compose: composed AGENTS.generated.md\n${REMOVED}\n`);
    expect(existsSync(legacy)).toBe(false);
    expect(count(layer(sb), /^@boot$/)).toBe(1);
  });

  it('[modules-r19] removes a legacy layer when the root layer is already current, printing only the removal and leaving the root bytes', async () => {
    const sb = stage('posix', 'laws-legacy-equal');
    expect((await compose(sb)).code).toBe(0);
    const current = layerBytes(sb)!;
    const legacy = plantLegacy(sb);
    const r = await compose(sb);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe(`${REMOVED}\n`);
    expect(existsSync(legacy)).toBe(false);
    expect(firstByteDifference(layerBytes(sb)!, current)).toBe(-1);
    const again = await compose(sb);
    expect(again.code).toBe(0);
    expect(again.stderr).toBe('');
  });

  it('[modules-r19] replaces a root layer that is a symlink into the legacy path before the cleanup, so the root layer survives it', async () => {
    const sb = stage('posix', 'laws-legacy-rootlink');
    expect((await compose(sb)).code).toBe(0);
    const current = layerBytes(sb)!;
    renameSync(layerPath(sb), join(sb, LEGACY));
    symlinkSync(LEGACY, layerPath(sb));
    const check = await compose(sb, '--check');
    expect(check.code).toBe(1);
    expect(check.stderr).toContain('compose: stale: AGENTS.generated.md');
    expect(lstatSync(layerPath(sb)).isSymbolicLink()).toBe(true);
    const r = await compose(sb);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe(`compose: composed AGENTS.generated.md\n${REMOVED}\n`);
    expect(lstatSync(layerPath(sb)).isSymbolicLink()).toBe(false);
    expect(firstByteDifference(layerBytes(sb)!, current)).toBe(-1);
    expect(existsSync(join(sb, LEGACY))).toBe(false);
    expect((await compose(sb, '--check')).code).toBe(0);
  });

  it('[modules-r19] leaves a legacy layer in place under --check, printing no removal', async () => {
    const sb = stage('posix', 'laws-legacy-check');
    expect((await compose(sb)).code).toBe(0);
    const legacy = plantLegacy(sb);
    const r = await compose(sb, '--check');
    expect(r.code).toBe(0);
    expect(r.stderr).not.toContain('removed legacy');
    expect(existsSync(legacy)).toBe(true);
  });

  it.skipIf(ROOT_USER)('[modules-r19] fails rc 2 when the legacy layer cannot be removed, the root layer already written', async ({ onTestFinished, skip }) => {
    const sb = stage('posix', 'laws-legacy-readonly');
    const legacy = plantLegacy(sb);
    const laws = join(sb, '.contexture/laws');
    chmodPlant(laws, 0o555, 0o755, onTestFinished);
    if (writable(laws)) skip('the chmod plant did not take');
    const r = await compose(sb);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('compose: composed AGENTS.generated.md');
    expect(r.stderr).toContain('compose: error: cannot remove the legacy .contexture/laws/AGENTS.generated.md, the root layer already written');
    expect(r.stderr).not.toContain('removed legacy');
    expect(existsSync(legacy)).toBe(true);
    expect(count(layer(sb), /^@boot$/)).toBe(1);
  });
});
