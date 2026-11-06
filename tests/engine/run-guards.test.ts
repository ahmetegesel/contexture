import { beforeAll, describe, expect, it } from 'vitest';
import { filter, writeModule } from '../support/modules';
import { stage } from '../support/stage';
import { run } from '../support/unit';

const RAW = 'GUARD one\nGUARD two\nGUARD three\n';

describe.concurrent('the run guards', () => {
  let sb: string;
  beforeAll(() => {
    sb = stage('posix', 'run-guards');
    writeModule(sb, 'modules', 'guards', {
      manifest: '# summary: the guard fixture filters\n',
      files: {
        'filters/empty.awk': filter({ filter: 'empty' }, '{ }'),
        'filters/grow.awk': filter({ filter: 'grow' }, '{ print; print; print "extra" }'),
        'filters/notice.awk': filter({ filter: 'notice' }, 'END { print "[3 lines elided]" }'),
        'filters/shrink.awk': filter({ filter: 'shrink' }, 'NR == 1 { print "GUARD" }'),
        'filters/layout.awk': filter({ filter: 'layout', 'format-only': 'layout' }, 'NR == 1 { print "GUARD" }'),
      },
    });
  });
  const through = (name: string, cmd: readonly string[] = [], env: Record<string, string> = {}) =>
    run(sb, ['run', `--filter=${name}`, '--stats', ...cmd], { input: cmd.length ? '' : RAW, env });

  it('CT-R3 [the-engine-r11]: COMPACT_DISABLE runs raw: the command rc kept, the pipe passed, the bypass named in debug', async () => {
    expect((await run(sb, ['run', 'sh', '-c', 'exit 5'], { env: { COMPACT_DISABLE: '1' } })).code).toBe(5);
    expect((await run(sb, ['run'], { input: 'raw line\n', env: { COMPACT_DISABLE: '1' } })).stdout).toBe('raw line\n');
    const debug = await run(sb, ['run', 'sh', '-c', 'exit 0'], { env: { COMPACT_DISABLE: '1', COMPACT_DEBUG: '1' } });
    expect(debug.stderr).toContain('debug: bypassed (COMPACT_DISABLE=1)');
  });

  it('N4 [the-engine-r11]: an empty filter output falls back to the raw stream', async () => {
    const r = await through('empty');
    expect(r.stdout).toBe(RAW);
    expect(r.stderr).toContain('[ctx: empty.awk (fail-safe passthrough:');
  });

  it('N5 [the-engine-r11]: a grown filter output falls back to the raw stream', async () => {
    const r = await through('grow');
    expect(r.stdout).toBe(RAW);
    expect(r.stderr).toContain('[ctx: grow.awk (fail-safe passthrough:');
  });

  it('N6 [the-engine-r11]: a notice-only output passes through with the command rc, never reverted to raw', async () => {
    const r = await through('notice', ['sh', '-c', 'printf "a\\nb\\nc\\n"; exit 3']);
    expect(r.code).toBe(3);
    expect(r.stdout).toBe('[3 lines elided]\n');
    expect(r.stderr).toContain('notice-only output passed through');
  });

  it('N6, N7 [the-engine-r11]: null check: a shrink with no notice and no format-only declaration reverts to raw', async () => {
    const r = await through('shrink');
    expect(r.stdout).toBe(RAW);
    expect(r.stderr).toContain('[ctx: shrink.awk (recovery fallback:');
  });

  it('N7 [the-engine-r11]: the same shrink kept when the filter declares format-only', async () => {
    const r = await through('layout');
    expect(r.stdout).toBe('GUARD\n');
    expect(r.stderr).toMatch(/\[ctx: layout\.awk, \d+ -> \d+ bytes \(\d+% reduction\)\]/);
  });

  const noisy = (lines: number, rc: number) => ['sh', '-c', `echo out; i=1; while [ $i -le ${lines} ]; do echo e$i >&2; i=$((i+1)); done; exit ${rc}`];
  const errs = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `e${from + i}\n`).join('');

  it('N8 [the-engine-r11]: a successful command with more than 10 stderr lines shows the cap notice and the last 10', async () => {
    const r = await run(sb, ['run', ...noisy(12, 0)]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('out\n');
    expect(r.stderr).toBe(`[ctx: stderr capped: showing the last 10 of 12 lines; COMPACT_DISABLE=1 for the full stream]\n${errs(3, 12)}`);
  });

  it('N8 [the-engine-r11]: null check: a failing command keeps its whole stderr, and 10 lines are never capped', async () => {
    const failing = await run(sb, ['run', ...noisy(12, 1)]);
    expect(failing.code).toBe(1);
    expect(failing.stderr).toBe(errs(1, 12));
    expect((await run(sb, ['run', ...noisy(10, 0)])).stderr).toBe(errs(1, 10));
  });
});
