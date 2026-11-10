import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, type Run } from '@support/exec';
import { sandbox } from '@support/sandbox';
import { unit } from '@support/unit';
import { docs, stageSeed } from '../support/corpus';

const UNIT = 'space-demo';
const TASK = 'space-task';

let ws: string;

const handler = (name: string, env: Record<string, string>): Promise<Run> =>
  exec(join(ws, '.contexture/extensions/modules/docs/hooks', name), [], { cwd: ws, env: { CTX_ROOT: ws, CTX_BIN: join(ws, '.contexture/ctx'), ...env } });

beforeAll(async () => {
  const staged = await stageSeed('posix', 'space-root', async (sb) => {
    for (const args of [
      ['bootstrap', UNIT, 'the space-root nudge case'],
      ['task', 'add', UNIT, TASK, '--objective=Install the local toolchain and run the demo-orders service', '--desc=Set up the environment and run the build.'],
      ['task', 'start', UNIT, TASK],
    ]) {
      const r = await unit(sb, ...args);
      if (r.code !== 0) throw new Error(`unit ${args.join(' ')}: ${r.stderr}`);
    }
  });
  ws = join(sandbox('space-root'), 'workspace with space');
  renameSync(staged, ws);
});

describe('the nudge and its handlers under a workspace root holding a space', { concurrent: false }, () => {
  it('RS5d [docs-module-r26] the default and the named nudge print their block rc 0', async () => {
    const byDefault = await docs(ws, ['nudge', UNIT]);
    expect([byDefault.code, byDefault.stderr]).toEqual([0, '']);
    expect(byDefault.stdout).toContain(`[CONTEXT NUDGE: Task '${TASK}']`);
    const named = await docs(ws, ['nudge', UNIT, `--task=${TASK}`]);
    expect([named.code, named.stderr]).toEqual([0, '']);
    expect(named.stdout).toContain(`[CONTEXT NUDGE: Task '${TASK}']`);
  });

  it('RS4g [docs-module-r26, modules-r5] both handler files nudge through the space-bearing root', async () => {
    const landing = await handler('task-landing', { CTX_ACT: 'start', CTX_UNIT: UNIT, CTX_SLUGS: TASK });
    expect([landing.code, landing.stderr]).toEqual([0, '']);
    expect(landing.stdout).toContain(`[CONTEXT NUDGE: Task '${TASK}']`);
    const end = await handler('load-end', { CTX_UNIT: UNIT });
    expect([end.code, end.stderr]).toEqual([0, '']);
    expect(end.stdout).toContain(`[CONTEXT NUDGE: Task '${TASK}']`);
  });
});
