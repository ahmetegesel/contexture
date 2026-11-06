import { join } from 'node:path';
import { beforeAll, describe, expect, it, onTestFinished } from 'vitest';
import { chmodPlant, ROOT_USER } from '../support/plants';
import { sandbox } from '../support/sandbox';
import { stage } from '../support/stage';
import { run } from '../support/unit';

describe.concurrent('ctx run capture', () => {
  let sb: string;
  beforeAll(() => {
    sb = stage('posix', 'run-capture');
  });

  it('CT-RD [the-engine-r14]: run --diagnose reports the temp directory, the anonymous capture, and the builtin filters rc 0', async () => {
    const r = await run(sb, ['run', '--diagnose']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('runner compaction diagnostics');
    expect(r.stdout).toContain(`temp directory:  ${join(sb, '.contexture/tmp')} (writable)`);
    expect(r.stdout).toContain('capture mode:    anonymous');
    expect(r.stdout).toContain('builtin filters:');
  });

  it('CT-RD [the-engine-r14]: the wrapped command never sees the runner capture files, while it sees its own', async () => {
    const r = await run(sb, ['run', 'sh', '-c', ': > .contexture/tmp/own-probe-file; find .contexture/tmp -type f -print']);
    expect(r.stdout).toContain('own-probe-file');
    expect(r.stdout).not.toContain('compact-stdout');
    expect(r.stdout).not.toContain('compact-stderr');
  });

  it('CT-RD [the-engine-r14]: the capture carries stdin, keeps stderr out of stdout and visible, and keeps the exit code', async () => {
    const r = await run(sb, ['run', 'sh', '-c', 'cat; echo "err line" >&2'], { input: 'stdin line\n' });
    expect(r.stdout).toContain('stdin line');
    expect(r.stdout).not.toContain('err line');
    expect(r.stderr).toContain('err line');
    expect((await run(sb, ['run', 'sh', '-c', 'exit 7'])).code).toBe(7);
  });
});

describe('the capture scratch fallback', () => {
  it.skipIf(ROOT_USER)('N9 [the-engine-r14]: with the drawer read-only the capture falls back to TMPDIR and still captures (skipped as root, where the plant cannot take)', async () => {
    const sb = stage('posix', 'run-fallback');
    const alt = sandbox('run-fallback-tmpdir');
    const drawer = join(sb, '.contexture/tmp');
    expect((await run(sb, ['run', '--diagnose'], { env: { TMPDIR: alt } })).stdout).toContain(`temp directory:  ${drawer} (writable)`);
    chmodPlant(drawer, 0o555, 0o755, onTestFinished);
    const diag = await run(sb, ['run', '--diagnose'], { env: { TMPDIR: alt } });
    expect(diag.stdout).toContain(`temp directory:  ${alt} (writable)`);
    const r = await run(sb, ['run', 'sh', '-c', 'echo captured; exit 4'], { env: { TMPDIR: alt } });
    expect(r.code).toBe(4);
    expect(r.stdout).toBe('captured\n');
  });
});
