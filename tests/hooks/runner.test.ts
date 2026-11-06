import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineSandbox } from '../engine/fixture';
import { exec } from '../support/exec';
import { hook, writeModule } from '../support/modules';
import { stage } from '../support/stage';
import { put } from '../support/tree';
import { run } from '../support/unit';
import { ctxLine, hookSandbox, marker } from './fixture';

const record = (label: string) => `echo "${label} point=$CTX_HOOK_POINT x=\${X:-none} pwd=$PWD" >> marker.log`;

describe.concurrent('the hook runner, called directly through ctx _hooks', () => {
  it('CT-XR3 [the-engine-r12]: the workspace module hooks run before the extension module hooks, whatever the names', async () => {
    const sb = engineSandbox('hooks-roots');
    const r = await run(sb, ['_hooks', 'load-pre']);
    expect(r.code).toBe(0);
    expect(marker(sb)).toEqual(['HOOK hookonly', 'HOOK ext']);
  });

  it('[the-engine-r12, modules-r5]: hooks run in module-name then file-name order with the point and the context exported, at the workspace root', async () => {
    const sb = stage('posix', 'hooks-order');
    writeModule(sb, 'modules', 'mb', { files: { 'hooks/10-c.sh': hook('pt', record('mb-c')) } });
    writeModule(sb, 'modules', 'ma', { files: { 'hooks/20-b.sh': hook('pt', record('ma-b')), 'hooks/10-a.sh': hook('pt', record('ma-a')), 'hooks/30-other.sh': hook('elsewhere', record('ma-other')) } });
    put(join(sb, '.contexture/modules/ma/hooks/40-plain.sh'), hook('pt', record('ma-plain')), 0o644);
    put(join(sb, '.contexture/modules/ma/hooks/.hidden.sh'), hook('pt', record('ma-hidden')), 0o755);
    put(join(sb, '.contexture/modules/ma/hooks/50-undeclared.sh'), `#!/bin/sh\n${record('ma-undeclared')}\n`, 0o755);
    const nested = join(sb, 'deep/er');
    mkdirSync(nested, { recursive: true });
    const r = await exec(join(sb, '.contexture/ctx'), ['_hooks', 'pt', 'X', 'val'], { cwd: nested });
    expect(r.code).toBe(0);
    const root = realpathSync(sb);
    expect(marker(sb)).toEqual(['ma-a', 'ma-b', 'ma-plain', 'mb-c'].map((l) => `${l} point=pt x=val pwd=${root}`));
  });

  it('[the-engine-r12]: a point no hook declares runs nothing, silent rc 0', async () => {
    const sb = hookSandbox('hooks-zero');
    const r = await run(sb, ['_hooks', 'no-such-point', 'CTX_UNIT', 'u']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
    expect(marker(sb)).toEqual([]);
  });

  it('HK-S2 [the-engine-r13]: a failing default-mode hook warns and the remaining hooks still run, the point rc 0', async () => {
    const sb = hookSandbox('hooks-warn');
    const r = await run(sb, ['_hooks', 'stamp', 'CTX_UNIT', 'zz-unit', 'CTX_ANCHOR', 'A9'], { env: { FORCE_FAIL: '1' } });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('hook failed at stamp: zc-warn-test: 10-stamp-fail.sh (rc=3); continuing');
    expect(marker(sb)).toEqual([
      ctxLine('az-stamp-a', 'stamp', { anchor: 'A9' }),
      ctxLine('az-stamp-b', 'stamp', { anchor: 'A9' }),
      'FAIL zc-warn-fail point=stamp',
      ctxLine('zc-after', 'stamp', { anchor: 'A9' }),
      ctxLine('zz-stamp', 'stamp', { anchor: 'A9' }),
    ]);
  });

  it('HK-S8 [the-engine-r13]: a failing block-mode hook stops the point rc 1, no later hook runs', async () => {
    const sb = hookSandbox('hooks-block');
    const r = await run(sb, ['_hooks', 'load-pre', 'CTX_UNIT', 'zz-unit'], { env: { FORCE_FAIL: '1' } });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('hook blocked the point at load-pre: zb-block-test: 10-fail.sh (rc=3)');
    expect(marker(sb)).toEqual(['FAIL zb-block-fail point=load-pre']);
  });

  it('HK-S8 [the-engine-r13]: null check: without FORCE_FAIL the block hook passes and every load-pre hook runs', async () => {
    const sb = hookSandbox('hooks-block-null');
    expect((await run(sb, ['_hooks', 'load-pre', 'CTX_UNIT', 'zz-unit'])).code).toBe(0);
    expect(marker(sb)).toHaveLength(4);
  });

  it.for([
    [[], '_hooks: missing point'],
    [['pt', 'NAME'], '_hooks: context name without value: NAME'],
    [['pt', '1BAD', 'v'], '_hooks: malformed context name: 1BAD'],
    [['pt', 'BAD-NAME', 'v'], '_hooks: malformed context name: BAD-NAME'],
    [['pt', 'GOOD', 'v', 'LAST'], '_hooks: context name without value: LAST'],
  ] as const)('N13 [the-engine-r12]: ctx _hooks %j refuses rc 1 naming the defect, before any hook runs', async ([args, message]) => {
    const sb = stage('posix', 'hooks-args');
    writeModule(sb, 'modules', 'ma', { files: { 'hooks/10-a.sh': hook('pt', record('ma-a')) } });
    const r = await run(sb, ['_hooks', ...args]);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe(`ctx: ${message}\n`);
    expect(marker(sb)).toEqual([]);
  });

  it('N13: null check: well-formed context names run the hook rc 0', async () => {
    const sb = stage('posix', 'hooks-args-ok');
    writeModule(sb, 'modules', 'ma', { files: { 'hooks/10-a.sh': hook('pt', record('ma-a')) } });
    expect((await run(sb, ['_hooks', 'pt', '_GOOD1', 'v', 'X', 'y'])).code).toBe(0);
    expect(marker(sb)).toEqual([`ma-a point=pt x=y pwd=${realpathSync(sb)}`]);
  });
});
