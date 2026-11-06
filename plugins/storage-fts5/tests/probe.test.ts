import { describe, expect, it } from 'vitest';
import { driverOp } from '@support/driver';
import { fts5Available, stage } from '@support/stage';
import { answer } from '@support/wire';

describe.skipIf(!fts5Available())('the plugin home probe', () => {
  it('a test under plugins/storage-fts5/tests resolves vitest and tests/support and drives the staged fts5 driver', async () => {
    const sb = stage('fts5');
    expect(answer(await driverOp(sb, 'fts5', 'capability'), 'capability').driver).toBe('fts5');
  });
});
