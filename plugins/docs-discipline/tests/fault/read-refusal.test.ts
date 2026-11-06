import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { driverPath } from '@support/driver';
import { fresh } from '@support/snapshot';
import { docs, stageSeed } from '../support/corpus';

const CARD = '{"driver":"planted","version":"3.0.0","contract":"3","store":[],"search_modes":["exact"],"optional":[]}';

function plantStoreless(sb: string): void {
  const dir = join(sb, '.contexture/extensions/storage/drivers/planted');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'driver'), `#!/bin/sh\nif [ "\${1:-}" = capability ]; then\n  echo '${CARD}'\n  exit 0\nfi\nexec "${driverPath(sb, 'posix')}" "$@"\n`, { mode: 0o755 });
  writeFileSync(join(sb, '.contexture/config'), 'storage.driver: planted\n');
}

let staged: string;
beforeAll(async () => {
  staged = await stageSeed('posix', 'refusal');
});

describe('RS5f the read verbs on a driver that declares no store', { concurrent: true }, () => {
  it.each([
    ['audit', ['audit'], ''],
    ['query --index', ['query', '--index'], ''],
    ['gate', ['gate'], ''],
    ['nudge', ['nudge', 'nudge-demo'], ''],
    ['check', ['check', 'workspace'], 'M\tx.ts\n'],
  ])('[docs-module-r1, the-engine-r15] %s refuses rc 2 naming the store capability', async (_, args, input) => {
    const sb = fresh(staged);
    plantStoreless(sb);
    const r = await docs(sb, args, { input });
    expect(r.code, r.stdout + r.stderr).toBe(2);
    expect(r.stderr).toContain('store (ERR_CAPABILITY_UNSUPPORTED)');
  });

  it('[docs-module-r1, the-engine-r15] null check: the same verb on the shipped posix driver answers', async () => {
    const r = await docs(fresh(staged), ['query', '--index']);
    expect(r.code).toBe(0);
  });
});
