import { copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { viaFilter } from '../support/pairs';
import { pathPlant } from '../support/plants';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { firstByteDifference } from '../support/tree';

const PAIRS = join(ROOT, 'tests/filters/pairs');
const MECHANICS = join(ROOT, 'tests/filters/mechanics');

describe.concurrent('the run mechanics through the staged ctx run', () => {
  it('a git shim selects diff.awk by command identity', async () => {
    const input = join(PAIRS, 'diff-show-trimmed.in');
    const env = { ...pathPlant('git', 'cat "$FILTER_TESTS_IN"'), FILTER_TESTS_IN: input, COMPACT_DEBUG: '1' };
    const r = await exec('./.contexture/ctx', ['run', '--stats', 'git', 'show', 'HEAD'], { cwd: stage('posix', 'identity'), env });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('selected diff.awk (command match: git show HEAD)');
    expect(firstByteDifference(r.bytes, readFileSync(join(PAIRS, 'diff-show-trimmed.expected')))).toBe(-1);
  });

  it('a filter shrinking the stream without a notice falls back to raw', async () => {
    const sb = stage('posix', 'recovery');
    copyFileSync(join(MECHANICS, 'compact-recovery.awk'), join(sb, '.contexture/modules/run/filters/compact-recovery.awk'));
    const r = await exec('./.contexture/ctx', ['run', '--stats', '--filter=compact-recovery'], { cwd: sb, input: readFileSync(join(MECHANICS, 'compact-recovery.in')) });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('recovery fallback');
    expect(firstByteDifference(r.bytes, readFileSync(join(MECHANICS, 'compact-recovery.expected')))).toBe(-1);
  });

  it('the probe filter alone does shrink the stream, so the fallback is what restores it', async () => {
    const sb = stage('posix', 'recovery-probe');
    const probe = await exec('awk', ['-f', join(MECHANICS, 'compact-recovery.awk')], { cwd: sb, input: readFileSync(join(MECHANICS, 'compact-recovery.in')) });
    expect(probe.bytes.length).toBeLessThan(readFileSync(join(MECHANICS, 'compact-recovery.in')).length);
    const pair = await viaFilter(sb, 'log', join(MECHANICS, 'compact-recovery.in'));
    expect(pair.code).toBe(0);
  });
});
