import { appendFileSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Run } from '../support/exec';
import { compose, CORE_SRC, count, GOLDEN, layer, layerBytes, layerPath, lineOf, moduleBlock, synth, SYNTH, versionOf } from '../support/laws';
import { fresh, seed } from '../support/snapshot';
import { firstByteDifference } from '../support/tree';

const HEADER = /^# contexture v\d+\.\d+\.\d+: generated law layer; core cksum \d+-\d+; sources \d+-\d+; never edit$/;

describe.concurrent('the base-only composition (unit, lane, and rhythm, no docs)', () => {
  let base: string;
  let first: Run;
  beforeAll(async () => {
    base = await seed(async (sb) => {
      first = await compose(sb);
    }, 'posix', 'laws-base');
  });

  it('[modules-r19] composes rc0 and writes a layer byte-equal to the golden', () => {
    expect(first.code).toBe(0);
    const bytes = layerBytes(base);
    expect(bytes).toBeDefined();
    expect(firstByteDifference(bytes!, readFileSync(GOLDEN))).toBe(-1);
  });

  it('[modules-r19] heads the layer with the core version and both checksums, and the golden carries the current core version', () => {
    expect(layer(base).split('\n')[0]).toMatch(HEADER);
    expect(versionOf(readFileSync(GOLDEN, 'utf8'))).toBe(versionOf(readFileSync(CORE_SRC, 'utf8')));
  });

  it('[modules-r19] composes the unit, lane, and rhythm preambles alone, with no docs law', () => {
    const g = layer(base);
    expect(g).not.toContain('docs-first');
    expect(count(g, /^@module docs$/)).toBe(0);
    expect(count(g, /^@module /)).toBe(3);
    expect(count(g, /^@module unit$/)).toBe(1);
    expect(count(g, /^ {2}help: ctx unit help$/)).toBe(1);
    expect(count(g, /^@module lane$/)).toBe(1);
    expect(moduleBlock(g, 'lane')).toContain('The lane module is the subagent dispatch surface');
    expect(count(g, /^@module rhythm$/)).toBe(1);
    expect(moduleBlock(g, 'rhythm')).toContain('The rhythm module is the process surface');
    expect(moduleBlock(g, 'rhythm')).toContain('help: ctx rhythm help');
  });

  it('[modules-r12, modules-r19] composes the unit record clause and the lane subagent, boundary-warning, and git clauses', () => {
    const g = layer(base);
    expect(count(g, /^ {2}unit of work = the unit/)).toBe(1);
    expect(count(g, /^ {2}branch\/worktree: the recipe names/)).toBe(1);
    expect(count(g, /^ {2}boundary-warning: every lane recipe/)).toBe(1);
    expect(count(g, /^ {2}branch\/worktree on demand/)).toBe(1);
  });

  it("[modules-r19] composes the search delegation bullet: raw exploration runs in a lane, the docs map is the dispatcher's own read, and no corpus search sits among the delegated lookups", () => {
    const bullets = layer(base).split('\n').filter((l) => l.startsWith('  - search delegation: '));
    expect(bullets).toHaveLength(1);
    expect(bullets[0]).toContain('the dispatcher never runs raw exploration: a lookup with unbounded output whose target it does not already hold (grep, find, a read to locate, a record sweep through ctx unit search, a census, an earlier recipe read to learn a brief) runs in a lane');
    expect(bullets[0]).toContain("the docs map (the index, an owning doc, a ranked ctx docs query) is the dispatcher's own read, never delegated");
    expect(bullets[0]).not.toContain('corpus search');
  });

  it('[modules-r19] opens no custom section and seats the preambles between @layout and @record', () => {
    const g = layer(base);
    expect(count(g, /^@custom$/)).toBe(0);
    const mod = lineOf(g, /^@module unit$/);
    expect(lineOf(g, /^@layout$/)).toBeLessThan(mod);
    expect(mod).toBeLessThan(lineOf(g, /^@record$/));
  });

  it('[modules-r19] composes byte-identically a second time from scratch, and --check verifies the current layer rc0', async () => {
    const sb = fresh(base);
    rmSync(layerPath(sb));
    expect((await compose(sb)).code).toBe(0);
    expect(firstByteDifference(layerBytes(sb)!, layerBytes(base)!)).toBe(-1);
    expect((await compose(sb, '--check')).code).toBe(0);
  });

  it('[modules-r12, modules-r19] reads a changed unit law as stale: --check refuses rc1 writing nothing, and the compose recomposes with the clause', async () => {
    const sb = fresh(base);
    const before = layerBytes(sb)!;
    appendFileSync(join(sb, '.contexture/modules/unit/laws'), '\n@append @record\n  unit-extra: a later unit clause\n');
    expect((await compose(sb, '--check')).code).toBe(1);
    expect(firstByteDifference(layerBytes(sb)!, before)).toBe(-1);
    expect((await compose(sb)).code).toBe(0);
    expect(count(layer(sb), /^ {2}unit-extra: a later unit clause$/)).toBe(1);
    expect(firstByteDifference(layerBytes(sb)!, before)).not.toBe(-1);
  });
});

describe.concurrent('the sources hash and the determinism comparator (synthetic tree)', () => {
  let composed: string;
  beforeAll(async () => {
    composed = synth();
    expect((await compose(composed)).code).toBe(0);
  });

  it('[modules-r19] moves the sources hash with a package version change: --check refuses rc1, the compose rewrites the header', async () => {
    const sb = fresh(composed);
    const before = layer(sb);
    const record = readFileSync(join(SYNTH, 'extensions/.state/alpha.files'), 'utf8').replace(/^version 1\.0\.0$/m, 'version 1.0.1');
    writeFileSync(join(sb, '.contexture/extensions/.state/alpha.files'), record);
    expect((await compose(sb, '--check')).code).toBe(1);
    expect((await compose(sb)).code).toBe(0);
    expect(layer(sb)).not.toBe(before);
    expect(layer(sb).split('\n')[0]).not.toBe(before.split('\n')[0]);
  });

  it('reads DIFF for a changing input, so the byte comparator discriminates', async () => {
    const sb = fresh(composed);
    const law = join(sb, '.contexture/extensions/laws/clock-extra');
    writeFileSync(law, '@append @record\n  clock-law: 1\n');
    expect((await compose(sb)).code).toBe(0);
    const one = layerBytes(sb)!;
    writeFileSync(law, '@append @record\n  clock-law: 2\n');
    expect((await compose(sb)).code).toBe(0);
    expect(firstByteDifference(layerBytes(sb)!, one)).not.toBe(-1);
  });
});
