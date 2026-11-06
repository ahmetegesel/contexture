import { mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { shVerb, writeModule } from '../support/modules';
import { run } from '../support/unit';
import { engineSandbox } from './fixture';

const vars = (out: string): Record<string, string> =>
  Object.fromEntries(out.trim().split('\n').map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));

describe.concurrent('dispatch', () => {
  let sb: string;
  let real: string;
  beforeAll(() => {
    sb = engineSandbox('dispatch');
    real = realpathSync(sb);
    writeModule(sb, 'modules', 'io', {
      manifest: '# summary: the stream and exit code fixture\n',
      files: { 'scripts/pipe': shVerb('echo stdin, write stderr, exit with the first argument', 'cat\necho "to stderr" >&2\nexit "$1"') },
    });
  });

  it('CT-D3 [the-engine-r5]: an unknown top name refuses rc 1 naming the command, with no help', async () => {
    const r = await run(sb, ['nosuch']);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^ctx: unknown command: nosuch\n$/m);
    expect(r.stderr).not.toContain('ctx good');
    expect(r.stdout).toBe('');
  });

  it('CT-A2 [the-engine-r5]: an unknown verb refuses rc 1 naming the verb, the module table on stderr', async () => {
    const r = await run(sb, ['good', 'nosuch']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('unknown verb: nosuch');
    expect(r.stderr).toContain('ctx good: a good fixture module');
    expect(r.stdout).toBe('');
  });

  it('CT-X [the-engine-r6]: argv passes through, quoted words intact', async () => {
    expect((await run(sb, ['good', 'hi', 'ada'])).stdout).toBe('hi ada\n');
    expect(vars((await run(sb, ['good', 'env', 'a b', 'c'])).stdout).argv).toBe('a b c');
  });

  it('CT-X, N2 [the-engine-r6]: the verb runs at the workspace root with CTX_ROOT, CTX_MODULE_DIR, CTX_BIN, CTX_SCRATCH_ROOT, and LC_ALL=C exported', async () => {
    const v = vars((await run(sb, ['good', 'env'])).stdout);
    expect(v.pwd).toBe(real);
    expect(v.CTX_ROOT).toBe(real);
    expect(v.CTX_MODULE_DIR).toBe(`${real}/.contexture/modules/good`);
    expect(v.CTX_BIN).toBe(`${real}/.contexture/ctx`);
    expect(v.LC_ALL).toBe('C');
    expect(v.CTX_SCRATCH_ROOT).toMatch(new RegExp(`^${real}/\\.contexture/tmp/verb\\.[0-9]+\\.[0-9]+$`));
  });

  it('N2 [the-engine-r6, the-engine-r20]: each dispatch names a scratch root of its own pid', async () => {
    const a = vars((await run(sb, ['good', 'env'])).stdout).CTX_SCRATCH_ROOT!;
    const b = vars((await run(sb, ['good', 'env'])).stdout).CTX_SCRATCH_ROOT!;
    expect(a.split('.').at(-2)).not.toBe(b.split('.').at(-2));
  });

  it('CT-X [the-engine-r6]: a dispatch from a nested folder chdirs to the workspace root', async () => {
    const nested = join(sb, 'nested/deeper');
    mkdirSync(nested, { recursive: true });
    const ctxBin = join(sb, '.contexture/ctx');
    expect((await exec(ctxBin, ['good', 'hi'], { cwd: nested })).stdout).toBe('hi world\n');
    expect(vars((await exec(ctxBin, ['good', 'env'], { cwd: nested })).stdout).pwd).toBe(real);
  });

  it('[the-engine-r6]: stdin, stderr, and the verb exit code pass through', async () => {
    const r = await run(sb, ['io', 'pipe', '7'], { input: 'piped line\n' });
    expect(r.code).toBe(7);
    expect(r.stdout).toBe('piped line\n');
    expect(r.stderr.endsWith('\nto stderr\n')).toBe(true);
    expect((await run(sb, ['io', 'pipe', '0'])).code).toBe(0);
  });

  it('CT-X [the-engine-r2]: a reserved module name is not dispatchable', async () => {
    const r = await run(sb, ['load']);
    expect(r.code).toBe(1);
    expect(r.stdout).not.toContain('shadow');
  });

  it('CT-XR2 [the-engine-r1, the-engine-r6]: an extension module dispatches with CTX_MODULE_DIR in the extension root and renders its own help', async () => {
    const r = await run(sb, ['aaaext', 'hi']);
    expect(r.stdout).toBe(`ext hi\nmodule-dir=${real}/.contexture/extensions/modules/aaaext\n`);
    expect((await run(sb, ['aaaext', 'help'])).stdout).toContain('say hi from the extension root');
    expect((await run(sb, ['help', '--all'])).stdout).toContain('module aaaext:');
  });

  it('CT-XR2 [the-engine-r1]: the workspace module wins a name the extension root also holds', async () => {
    expect((await run(sb, ['good', 'hi'])).stdout).toBe('hi world\n');
  });
});
