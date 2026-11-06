import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { must, seedUnit, unit } from '../support/unit';

function hook(sb: string, mod: string, name: string, body: string): void {
  mkdirSync(join(sb, '.contexture/modules', mod, 'hooks'), { recursive: true });
  writeFileSync(join(sb, '.contexture/modules', mod, 'module'), `# summary: ${mod} hooks\n`);
  writeFileSync(join(sb, '.contexture/modules', mod, 'hooks', name), `#!/bin/sh\n# ctx-hook: refresh\n${body}`, { mode: 0o755 });
}

const refresh = async (sb: string): Promise<number> => (await unit(sb, 'refresh', 'refresh-unit')).code;

describe.concurrent('ctx unit refresh: the audit rc wins over the hook rc', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed((sb) => seedUnit(sb, 'refresh-unit', 'refresh semantics unit'), 'posix', 'refresh');
  });

  it('H: a clean refresh answers rc 0; a warn hook warns on stderr and keeps rc 0; a block hook fails it rc 1', async () => {
    const sb = fresh(sb0);
    expect(await refresh(sb)).toBe(0);
    hook(sb, 'warnmod', 'w', 'exit 3\n');
    const warned = await unit(sb, 'refresh', 'refresh-unit');
    expect(warned.code).toBe(0);
    expect(warned.stderr).toContain('hook failed at refresh: warnmod: w (rc=3); continuing');
    hook(sb, 'blockmod', 'b', '# ctx-hook-mode: block\nexit 4\n');
    expect(await refresh(sb)).toBe(1);
  });

  it('H: a dirty audit keeps refresh rc 1 with or without the block hook; the repair brings both back to rc 0', async () => {
    const sb = fresh(sb0);
    hook(sb, 'blockmod', 'b', '# ctx-hook-mode: block\nexit 4\n');
    await must(unit(sb, 'record', 'refresh-unit', '--what=sandbox unharvested entry', '--knowledge', '--slug=2026-09-22-broken'));
    expect((await unit(sb, 'audit', 'refresh-unit')).code).toBe(1);
    expect(await refresh(sb)).toBe(1);
    rmSync(join(sb, '.contexture/modules/blockmod'), { recursive: true });
    expect(await refresh(sb)).toBe(1);
    await must(unit(sb, 'record', 'refresh-unit', '--what=sandbox harvest', '--closes=2026-09-22-broken (done: harvested)'));
    expect((await unit(sb, 'audit', 'refresh-unit')).code).toBe(0);
    expect(await refresh(sb)).toBe(0);
  });
});
