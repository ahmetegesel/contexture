import { it } from 'vitest';
import { exec } from '../../support/exec';
import { HUNG_TREE } from '../../support/procs';

it('a planted hang', async () => {
  await exec('sh', ['-c', HUNG_TREE], { cwd: process.env.RUNNER_DIR ?? '.' });
});
