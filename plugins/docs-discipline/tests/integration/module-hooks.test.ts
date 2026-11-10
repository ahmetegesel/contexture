import { mkdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, type Run } from '@support/exec';
import { stage } from '@support/stage';
import { unit } from '@support/unit';
import { addModule, docs, PLUGIN, stageSeed } from '../support/corpus';

let ws: string;
const hook = (name: string, env: Record<string, string>): Promise<Run> => exec(join(ws, '.contexture/extensions/modules/docs', name), [], { cwd: ws, env });
const context = (): Record<string, string> => ({ CTX_ROOT: ws, CTX_PACKAGE_ROOT: PLUGIN });

beforeAll(() => {
  ws = stage('posix', 'hooks');
  addModule(ws);
  mkdirSync(join(ws, 'docs/workspace'), { recursive: true });
});

describe('the docs module part hooks, in order on one workspace', { concurrent: false }, () => {
  it('RS3a [plugins-r1, plugins-r2, modules-r13] install seeds the corpus conventions once', async () => {
    const r = await hook('install', context());
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout + r.stderr).toContain('seeded workspace conventions');
  });

  it('RS3b [modules-r13] the seeded doc reads back through ctx docs query', async () => {
    const r = await docs(ws, ['query', 'workspace', 'conventions']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Universal workspace conventions');
  });

  it('RS3c [plugins-r2, modules-r13] a second install leaves a present doc byte for byte', async () => {
    expect((await docs(ws, ['header', 'workspace', 'conventions', '--description=A locally kept description'])).code).toBe(0);
    const before = (await docs(ws, ['query', 'workspace', 'conventions'])).stdout;
    const r = await hook('install', context());
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toContain('already present; left unchanged');
    const after = (await docs(ws, ['query', 'workspace', 'conventions'])).stdout;
    expect(after).toContain('A locally kept description');
    expect(after).toBe(before);
  });

  it('RS3d [plugins-r2, modules-r13] uninstall leaves the corpus readable', async () => {
    const r = await hook('uninstall', context());
    expect(r.code).toBe(0);
    expect(r.stdout + r.stderr).toContain('stays in the configured store');
    expect((await docs(ws, ['query', 'workspace', 'conventions'])).stdout).toContain('A locally kept description');
  });

  it('RS3e install refuses rc 2 without the package root context', async () => {
    const r = await hook('install', { CTX_ROOT: ws });
    expect(r.code).toBe(2);
    expect(r.stdout + r.stderr).toContain('CTX_PACKAGE_ROOT is not set');
  });

  it('RS3f uninstall refuses rc 2 without the workspace root context', async () => {
    const r = await hook('uninstall', {});
    expect(r.code).toBe(2);
    expect(r.stdout + r.stderr).toContain('CTX_ROOT is not set');
  });
});

describe('the docs module handler files on the unit points, in order on one workspace', { concurrent: false }, () => {
  let handlers: string;
  const loadPages = async (): Promise<Run[]> => {
    const pages: Run[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await unit(handlers, 'load', 'handlers-demo', String(page));
      if (r.code !== 0) throw new Error(`load page ${page}: ${r.stderr}`);
      pages.push(r);
      if (r.stdout.includes('load complete:')) return pages;
    }
    throw new Error('the load did not reach its last page');
  };

  beforeAll(async () => {
    handlers = await stageSeed('posix', 'handlers');
    const r = await unit(handlers, 'bootstrap', 'handlers-demo', 'the handler cases');
    if (r.code !== 0) throw new Error(`bootstrap: ${r.stderr}`);
  });

  it('RS4a [docs-module-r26, modules-r5] a task add fires the point but prints no nudge', async () => {
    const r = await unit(handlers, 'task', 'add', 'handlers-demo', 'start-nudge', '--objective=Install the local toolchain and run the demo-orders service', '--desc=Set up the environment, run the build, and test the checkout path on demo-orders.');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).not.toContain('[CONTEXT NUDGE');
  });

  it('RS4b [docs-module-r26, modules-r5] a task start prints one nudge block for the task', async () => {
    const r = await unit(handlers, 'task', 'start', 'handlers-demo', 'start-nudge');
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.match(/^\[CONTEXT NUDGE: Task 'start-nudge'\]$/gm)).toHaveLength(1);
  });

  it('RS4c [docs-module-r26, modules-r5] the last load page nudges the in-progress tasks, after the render; page 1 never', async () => {
    const pages = await loadPages();
    const last = pages[pages.length - 1] as Run;
    expect(pages[0]?.stdout).not.toContain('[CONTEXT NUDGE');
    expect(last.stdout).toContain("[CONTEXT NUDGE: Task 'start-nudge']");
    expect(last.stdout.indexOf('load complete:')).toBeLessThan(last.stdout.indexOf('[CONTEXT NUDGE'));
  });

  it('RS4d [docs-module-r26, modules-r5] complete and drop print no nudge, and reopen off an in-progress task prints none', async () => {
    const complete = await unit(handlers, 'task', 'complete', 'handlers-demo', 'start-nudge', '--evidence=the handler case is green');
    expect(complete.code, complete.stderr).toBe(0);
    expect(complete.stdout).not.toContain('[CONTEXT NUDGE');
    const add = await unit(handlers, 'task', 'add', 'handlers-demo', 'reopen-me', '--objective=Install the local toolchain');
    expect(add.code, add.stderr).toBe(0);
    const start = await unit(handlers, 'task', 'start', 'handlers-demo', 'reopen-me');
    expect(start.code, start.stderr).toBe(0);
    expect(start.stdout).toContain("[CONTEXT NUDGE: Task 'reopen-me']");
    const reopen = await unit(handlers, 'task', 'reopen', 'handlers-demo', 'reopen-me');
    expect(reopen.code, reopen.stderr).toBe(0);
    expect(reopen.stdout).not.toContain('[CONTEXT NUDGE');
    const drop = await unit(handlers, 'task', 'drop', 'handlers-demo', 'reopen-me', '--reason=covered');
    expect(drop.code, drop.stderr).toBe(0);
    expect(drop.stdout).not.toContain('[CONTEXT NUDGE');
  });

  it('RS4e [docs-module-r26, modules-r5] the load-end prints nothing when no task is in progress', async () => {
    const pages = await loadPages();
    expect((pages[pages.length - 1] as Run).stdout).not.toContain('[CONTEXT NUDGE');
  });

  it('RS4f [docs-module-r26, modules-r5] a failing nudge warns at its point and the task write lands', async () => {
    const nudge = join(handlers, '.contexture/extensions/modules/docs/scripts/nudge');
    renameSync(nudge, `${nudge}.off`);
    try {
      const add = await unit(handlers, 'task', 'add', 'handlers-demo', 'warn-nudge', '--objective=Install the local toolchain');
      expect(add.code, add.stderr).toBe(0);
      const start = await unit(handlers, 'task', 'start', 'handlers-demo', 'warn-nudge');
      expect(start.code, start.stderr).toBe(0);
      expect(start.stderr).toContain('hook failed at task-landing: docs: task-landing');
      expect(start.stderr).toContain('continuing');
    } finally {
      renameSync(`${nudge}.off`, nudge);
    }
  });
});
