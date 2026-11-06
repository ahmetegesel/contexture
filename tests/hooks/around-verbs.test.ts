import { beforeAll, describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { fresh } from '../support/snapshot';
import { unit } from '../support/unit';
import { clearMarker, ctxLine, hookSandbox, marker } from './fixture';

const FAIL = { env: { FORCE_FAIL: '1' } };

async function seeded(label: string, build: (sb: string) => Promise<void> = async () => undefined): Promise<{ snap: string; bootstrap: number }> {
  const snap = hookSandbox(label);
  const r = await unit(snap, 'bootstrap', 'zz-unit', 'hooks fixture unit');
  await build(snap);
  return { snap, bootstrap: r.code };
}

describe.concurrent('the hook points around the unit verbs', () => {
  let plain: { snap: string; bootstrap: number };
  let tasked: string;
  beforeAll(async () => {
    plain = await seeded('hooks-seed');
    tasked = (
      await seeded('hooks-seed-task', async (sb) => {
        await unit(sb, 'task', 'add', 'zz-unit', 'fix-1', '--objective=fixture task', '--desc=fixture body', '--criteria=fixture criterion', '--details=fixture detail');
      })
    ).snap;
  });
  const copy = (snap = plain.snap): string => {
    const sb = fresh(snap);
    clearMarker(sb);
    return sb;
  };

  it('HK-S0: the seed unit bootstraps rc 0', () => {
    expect(plain.bootstrap).toBe(0);
  });

  it('HK-S1 [the-engine-r12]: stamp runs its five hooks in module then file order with CTX_ANCHOR the new anchor, the hook stdout before the transition line', async () => {
    const sb = copy();
    const r = await unit(sb, 'stamp', 'zz-unit');
    expect(r.code).toBe(0);
    expect(marker(sb)).toEqual([
      ctxLine('az-stamp-a', 'stamp', { anchor: 'A2' }),
      ctxLine('az-stamp-b', 'stamp', { anchor: 'A2' }),
      'zc-warn-fail point=stamp',
      ctxLine('zc-after', 'stamp', { anchor: 'A2' }),
      ctxLine('zz-stamp', 'stamp', { anchor: 'A2' }),
    ]);
    const out = r.stdout.trimEnd().split('\n');
    expect(out[0]).toBe(`HOOK ${ctxLine('az-stamp-a', 'stamp', { anchor: 'A2' })}`);
    expect(out.at(-1)).toBe('transition: A1 -> A2');
  });

  it('HK-S2 [the-engine-r13]: at stamp a failing hook warns and the rest still run, the verb rc 0', async () => {
    const sb = copy();
    const r = await exec('./.contexture/ctx', ['unit', 'stamp', 'zz-unit'], { cwd: sb, ...FAIL });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('hook failed at stamp: zc-warn-test: 10-stamp-fail.sh (rc=3); continuing');
    const lines = marker(sb);
    expect(lines).toHaveLength(5);
    expect(lines[2]).toBe('FAIL zc-warn-fail point=stamp');
    expect(lines[3]).toBe(ctxLine('zc-after', 'stamp', { anchor: 'A2' }));
    expect(lines[4]).toBe(ctxLine('zz-stamp', 'stamp', { anchor: 'A2' }));
  });

  it('HK-S2b [the-engine-p3]: a verb script run standalone, CTX_BIN unset or not executable, fires no hook and answers rc 0', async () => {
    const sb = copy();
    const script = '.contexture/modules/unit/scripts/stamp';
    expect((await exec('sh', [script, 'zz-unit'], { cwd: sb })).code).toBe(0);
    expect((await exec('sh', [script, 'zz-unit'], { cwd: sb, env: { CTX_BIN: '/nonexistent-ctx' } })).code).toBe(0);
    expect(marker(sb)).toEqual([]);
  });

  it('HK-S3 [modules-r5]: load fires load-pre before the LOAD banner and load-post after it, with the main form and page 1', async () => {
    const sb = copy();
    const r = await unit(sb, 'load', 'zz-unit');
    expect(r.code).toBe(0);
    const out = r.stdout.split('\n');
    expect(out[0]).toBe(`HOOK ${ctxLine('zb-second', 'load-pre', { form: 'main', page: '1' })}`);
    const banner = out.findIndex((l) => /^LOAD (COMPLETE|INCOMPLETE)/.test(l));
    const pre = out.findIndex((l) => l.startsWith('HOOK zz-load-pre'));
    const post = out.findIndex((l) => l.startsWith('HOOK az-load-post'));
    expect(pre).toBeGreaterThanOrEqual(0);
    expect(pre).toBeLessThan(banner);
    expect(banner).toBeLessThan(post);
    expect(marker(sb).filter((l) => l.includes('point=load-pre'))).toHaveLength(4);
    const posts = marker(sb).filter((l) => l.includes('point=load-post'));
    expect(posts).toEqual([ctxLine('az-load-post', 'load-post', { form: 'main', page: '1' }), ctxLine('zz-load-post', 'load-post', { form: 'main', page: '1' })]);
  });

  it('HK-S4 [modules-r5]: load refs fires neither load point', async () => {
    const sb = copy();
    const r = await unit(sb, 'load', 'refs', 'zz-unit');
    expect(r.code).toBe(0);
    expect(marker(sb)).toEqual([]);
    expect(r.stdout).not.toMatch(/^HOOK /m);
  });

  it('HK-S5 [modules-r5]: refresh runs the board and the audit, then exactly the refresh hooks, their stdout through the verb', async () => {
    const sb = copy();
    const r = await unit(sb, 'refresh', 'zz-unit');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('anchor');
    expect(r.stdout).toMatch(/^HOOK az-refresh point=refresh/m);
    expect(marker(sb)).toEqual([ctxLine('az-refresh', 'refresh'), ctxLine('zz-refresh', 'refresh')]);
  });

  it('HK-S5b [the-engine-r13]: a failing block hook at refresh fails the verb rc 1 though the audit was clean', async () => {
    const sb = copy();
    const r = await exec('./.contexture/ctx', ['unit', 'refresh', 'zz-unit'], { cwd: sb, ...FAIL });
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('hook blocked the point at refresh: zzz-block-refresh: 10-fail.sh');
    const lines = marker(sb);
    expect(lines).toHaveLength(3);
    expect(lines[2]).toBe('FAIL zzz-refresh-block-fail point=refresh');
  });

  it('HK-S6 [modules-r5]: task add fires task-landing with the act and the slug, module order', async () => {
    const sb = copy();
    expect((await unit(sb, 'task', 'add', 'zz-unit', 'fix-2', '--objective=o', '--desc=d', '--criteria=c', '--details=i')).code).toBe(0);
    expect(marker(sb)).toEqual([ctxLine('az-task', 'task-landing', { act: 'add', slugs: 'fix-2' }), ctxLine('zz-task', 'task-landing', { act: 'add', slugs: 'fix-2' })]);
  });

  it('HK-S6 [modules-r5]: start, complete, reopen, and drop each fire task-landing with their act', async () => {
    const sb = copy(tasked);
    const acts: [string, string[]][] = [
      ['start', ['task', 'start', 'zz-unit', 'fix-1']],
      ['complete', ['task', 'complete', 'zz-unit', 'fix-1', '--evidence=fixture evidence']],
      ['reopen', ['task', 'reopen', 'zz-unit', 'fix-1']],
      ['drop', ['task', 'drop', 'zz-unit', 'fix-1', '--reason=fixture drop']],
    ];
    for (const [act, args] of acts) {
      clearMarker(sb);
      expect((await unit(sb, ...args)).code).toBe(0);
      expect(marker(sb)[0]).toBe(ctxLine('az-task', 'task-landing', { act, slugs: 'fix-1' }));
    }
  });

  it('HK-S6 [modules-r5]: the retired next refuses rc 1 naming active, and fires no hook', async () => {
    const sb = copy(tasked);
    const r = await unit(sb, 'next', 'zz-unit', 'fix-1 is next');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('ctx unit next retired: use active');
    expect(marker(sb)).toEqual([]);
  });

  it('HK-S6 [modules-r5]: refs, task update, and a refused task write fire no task-landing', async () => {
    const sb = copy(tasked);
    expect((await unit(sb, 'refs', 'zz-unit')).code).toBe(0);
    expect((await unit(sb, 'task', 'update', 'zz-unit', 'fix-1', '--objective=fixture task amended')).code).toBe(0);
    expect((await unit(sb, 'task', 'start', 'zz-unit', 'no-such-task')).code).not.toBe(0);
    expect(marker(sb)).toEqual([]);
  });

  it('HK-S7 [modules-r5]: close fires the close hooks only, never the refresh hooks, and prints CLOSED', async () => {
    const sb = copy();
    const r = await unit(sb, 'close', 'zz-unit');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^CLOSED: zz-unit$/m);
    expect(marker(sb)).toEqual([ctxLine('az-close', 'close'), ctxLine('zz-close', 'close')]);
  });

  it('HK-S8 [the-engine-r13]: a failing block hook at load-pre stops the point rc 1: no banner, no later hook', async () => {
    const sb = copy();
    const r = await exec('./.contexture/ctx', ['unit', 'load', 'zz-unit'], { cwd: sb, ...FAIL });
    expect(r.code).toBe(1);
    expect(r.stdout).not.toContain('LOAD COMPLETE');
    expect(r.stderr).toContain('hook blocked the point at load-pre: zb-block-test: 10-fail.sh');
    expect(marker(sb)).toEqual(['FAIL zb-block-fail point=load-pre']);
  });
});
