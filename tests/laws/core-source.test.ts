import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { ROOT } from '../support/root';
import { blockClauses, CORE_SRC } from '../support/laws';

const COMPOSE_SRC = join(ROOT, 'base/.contexture/laws/compose');
const SKELETON = 'laws layout record journal backlog query boot interact rhythms subagents refresh close handoff git update';

describe.concurrent('the core law source and the composer', () => {
  it('ships the core source and an executable composer that parses under sh -n', async () => {
    expect(existsSync(CORE_SRC)).toBe(true);
    expect(existsSync(COMPOSE_SRC)).toBe(true);
    expect(statSync(COMPOSE_SRC).mode & 0o111).toBe(0o111);
    const r = await exec('sh', ['-n', COMPOSE_SRC], { cwd: ROOT });
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('keeps the 15-block skeleton in order, the version on line 1, the storage layout line, and an empty @record', () => {
    const core = readFileSync(CORE_SRC, 'utf8');
    const blocks = core.split('\n').filter((l) => /^@[A-Za-z0-9._-]+$/.test(l)).map((l) => l.slice(1));
    expect(blocks.join(' ')).toBe(SKELETON);
    expect(core.split('\n')[0]).toMatch(/^# contexture v\d+\.\d+\.\d+:/);
    const storage = core.split('\n').slice(0, 25).filter((l) => /^ {2}\.contexture\/storage\/: the storage core/.test(l));
    expect(storage).toHaveLength(1);
    expect(storage[0]).toContain('the driver resolver, the store-data reader, the module-facing library, the store contract, and the built-in posix driver;');
    expect(blockClauses(core, 'record')).toEqual([]);
  });
});
