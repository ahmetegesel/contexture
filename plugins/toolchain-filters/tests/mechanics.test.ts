import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '@support/exec';
import { viaFilter } from '@support/pairs';
import { pathPlant } from '@support/plants';
import { ROOT } from '@support/root';
import { firstByteDifference } from '@support/tree';
import { staged } from './staged';

const TESTS = join(ROOT, 'plugins/toolchain-filters/tests');
const ESC = 0x1b;

describe.concurrent('the run mechanics over the plugin filters', () => {
  it('the ANSI strip: an ANSI-bearing capture leaves the compiler filter without an escape byte', async () => {
    const input = join(TESTS, 'compiler-errors-pretty.in');
    expect(readFileSync(input).includes(ESC)).toBe(true);
    const r = await viaFilter(staged('ansi'), 'compiler-errors', input);
    expect(r.code).toBe(0);
    expect(r.bytes.includes(ESC)).toBe(false);
    expect(firstByteDifference(r.bytes, readFileSync(join(TESTS, 'compiler-errors-pretty.expected')))).toBe(-1);
  });

  it('[the-engine-r11] a notice-only output passes through with the command exit code, so a false green is never hidden', async () => {
    const env = { ...pathPlant('tsc', 'cat "$FILTER_TESTS_IN" >&2\nexit 2'), FILTER_TESTS_IN: join(TESTS, 'mechanics/compact-false-green.in') };
    const r = await exec('./.contexture/ctx', ['run', '--stats', 'tsc', '--noEmit'], { cwd: staged('false-green'), env });
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('notice-only output passed through');
    expect(firstByteDifference(r.bytes, readFileSync(join(TESTS, 'mechanics/compact-false-green.expected')))).toBe(-1);
  });
});
