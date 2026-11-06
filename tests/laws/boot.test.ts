import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compose, count, layer, layerBytes } from '../support/laws';
import { stage } from '../support/stage';
import { firstByteDifference } from '../support/tree';

describe.concurrent("the loader's step 1 at boot (sh .contexture/laws/compose from the workspace root)", () => {
  it('reads an absent layer as stale for --check writing nothing, then composes it, and verifies it current silently', async () => {
    const sb = stage('posix', 'laws-boot-absent');
    expect(layerBytes(sb)).toBeUndefined();
    expect((await compose(sb, '--check')).code).toBe(1);
    expect(layerBytes(sb)).toBeUndefined();
    const first = await compose(sb);
    expect(first.code).toBe(0);
    expect(first.stderr).toContain('compose: composed .contexture/laws/AGENTS.generated.md');
    const g = layer(sb);
    expect(count(g, /^@boot$/)).toBe(1);
    expect(g).toMatch(/^# contexture v/);
    const again = await compose(sb);
    expect(again.code).toBe(0);
    expect(again.stderr).toBe('');
  });

  it('reads a stale layer red for --check writing nothing, recomposes it with the late clause, and then verifies it current', async () => {
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
