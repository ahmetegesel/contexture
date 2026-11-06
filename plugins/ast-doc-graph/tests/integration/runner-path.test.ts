import { constants, accessSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathPlant } from '@support/plants';
import { sandbox } from '@support/sandbox';
import { astDocIndex, docsRepo, sqliteFts5 } from '../support/graph';

const callerNode = (process.env.PATH ?? '')
  .split(':')
  .filter(Boolean)
  .map((d) => join(d, 'node'))
  .find((p) => {
    try {
      accessSync(p, constants.X_OK);
      return statSync(p).isFile();
    } catch {
      return false;
    }
  });

describe.skipIf(!sqliteFts5 || !callerNode)('the caller chooses the runner', { concurrent: true }, () => {
  it("the node first on the caller's PATH runs every launcher, with the caller's NODE_OPTIONS extended and no experimental warning", async () => {
    const mark = join(sandbox('runner-mark'), 'calls');
    const plant = pathPlant('node', `printf '%s\\n' "$NODE_OPTIONS" >> "${mark}"\nexec "${callerNode}" "$@"`);
    const repo = docsRepo('runner-docs');
    const r = await astDocIndex(repo, ['--clean'], { env: { ...plant, NODE_OPTIONS: '--max-old-space-size=2048' } });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('DOCS: 1');
    expect(readFileSync(mark, 'utf8').trim().split('\n')).toEqual(['--max-old-space-size=2048 --no-deprecation', '--max-old-space-size=2048 --no-deprecation']);
    expect(r.stderr).not.toContain('ExperimentalWarning');
  });
});
