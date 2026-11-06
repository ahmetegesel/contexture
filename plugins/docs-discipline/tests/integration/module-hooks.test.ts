import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, type Run } from '@support/exec';
import { stage } from '@support/stage';
import { addModule, docs, PLUGIN } from '../support/corpus';

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
