import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { RECORD_ROOT } from '../support/drawer';
import { driverOp } from '../support/driver';
import type { Run } from '../support/exec';
import { DATE } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { put } from '../support/tree';
import { lane, must, run, unit } from '../support/unit';

const U = 'vs';

type Read = () => Promise<Run>;

const stored = (sb: string, key: string): Promise<Run> => driverOp(sb, 'posix', 'store.get', ['unit', key]);

async function landsEveryLayer(sb: string, key: string, needle: string, write: Read, verb: Read, script: Read): Promise<void> {
  const layers: [string, Read][] = [['the verb', verb], ['the data script', script], ['the driver', () => stored(sb, key)]];
  const shows = async (layer: string, read: Read, when: string, want: boolean): Promise<void> => {
    const r = await read();
    expect(r.code === 0 && r.stdout.includes(needle), `${layer} ${when} the write [rc ${r.code}: ${r.stderr}]`).toBe(want);
  };
  for (const [layer, read] of layers) await shows(layer, read, 'before', false);
  await must(write());
  for (const [layer, read] of layers) await shows(layer, read, 'after', true);
  expect(readFileSync(join(sb, RECORD_ROOT, `${key}.md`)).equals((await stored(sb, key)).bytes), `the posix file ${key}.md is the stored value`).toBe(true);
}

let seeded: string;
beforeAll(async () => {
  seeded = await seed(async (sb) => {
    await must(unit(sb, 'bootstrap', U, 'the chain objective'));
  }, 'posix', 'chain');
});

describe.concurrent('a unit verb reaches the store through the data script, the library, the resolver, and the driver (C5, knowledge#LOGIC_ONCE_DRIVERS_BY_CONTRACT)', () => {
  it('[the-engine-r16, the-record-r10] state: a bootstrap lands in the verb, the data script, the driver, and the posix file', async () => {
    const sb = stage('posix', 'chain-state');
    await landsEveryLayer(sb, `${U}/state`, 'the chain objective',
      () => unit(sb, 'bootstrap', U, 'the chain objective'),
      () => unit(sb, 'active'),
      () => data(sb, 'session.load', [U]));
  });

  it('[the-engine-r16, the-record-r10] backlog: a task add lands every way', async () => {
    const sb = fresh(seeded);
    await landsEveryLayer(sb, `${U}/backlog`, 'the chain task',
      () => unit(sb, 'task', 'add', U, 'vt1', '--objective=the chain task'),
      () => unit(sb, 'task', 'show', U, 'vt1'),
      () => data(sb, 'task.get', [U, 'vt1']));
  });

  it('[the-engine-r16, the-record-r10] journal: a record lands every way', async () => {
    const sb = fresh(seeded);
    const slug = `${DATE}-chain-entry`;
    await landsEveryLayer(sb, `${U}/journal`, 'the chain entry',
      () => unit(sb, 'record', U, `--slug=${slug}`, '--what=the chain entry'),
      () => unit(sb, 'entry', 'show', U, slug),
      () => data(sb, 'entry.get', [U, slug]));
  });

  it('[the-engine-r16, the-record-r10] knowledge: a finding add lands every way', async () => {
    const sb = fresh(seeded);
    await landsEveryLayer(sb, `${U}/knowledge`, 'the chain finding',
      () => unit(sb, 'finding', 'add', U, 'CHAIN_FINDING', '--summary=the chain finding'),
      () => unit(sb, 'finding', 'show', U, 'CHAIN_FINDING'),
      () => data(sb, 'finding.get', [U, 'CHAIN_FINDING']));
  });

  it('[the-engine-r16, the-record-r10] lane: the recipe, the journal, and the report the extension-root lane module writes land every way (C6)', async () => {
    const sb = fresh(seeded);
    const writes: [string, string, Read][] = [
      ['recipe', 'the chain recipe', () => run(sb, ['lane', 'create', U, 'chain-lane'], { input: '# the chain recipe\n' })],
      ['journal', 'the chain lane event', () => lane(sb, 'record', U, 'chain-lane', '--what=the chain lane event')],
      ['report', 'the chain report', () => run(sb, ['lane', 'report', U, 'chain-lane'], { input: '# the chain report\n' })],
    ];
    for (const [artifact, needle, write] of writes) {
      await landsEveryLayer(sb, `${U}/lanes/chain-lane/${artifact}`, needle, write,
        () => lane(sb, 'show', U, 'chain-lane', artifact),
        () => data(sb, 'lane.get', [U, 'chain-lane', artifact]));
    }
  });
});

const STORE = ['list', 'get', 'put', 'delete', 'changes', 'batch', 'scan'];

function plantDriver(sb: string, name: string, without?: string): string {
  const log = join(sb, `${name}.calls`);
  const card = JSON.stringify({ driver: name, version: '3.0.0', contract: '3', store: STORE.filter((s) => s !== without), search_modes: ['exact'], optional: [] });
  put(
    join(sb, '.contexture/extensions/storage/drivers', name, 'driver'),
    [
      '#!/bin/sh',
      `printf '%s\\n' "\${1:-}" >> '${log}'`,
      `[ "\${1:-}" = capability ] && { printf '%s\\n' '${card}'; exit 0; }`,
      `exec '${join(sb, '.contexture/storage/drivers/posix/driver')}' "$@"`,
      '',
    ].join('\n'),
    0o755,
  );
  return log;
}

const calls = (log: string): string[] => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []);

describe.concurrent('a verb on a driver that fails the capability handshake (the session Z verb half)', () => {
  it('[the-engine-r8, the-engine-r19] bootstrap on a planted driver missing put refuses rc2 naming the family, creates nothing, and never reaches its store', async () => {
    const sb = stage('posix', 'z-bad');
    const log = plantDriver(sb, 'z-bad', 'put');
    const r = await run(sb, ['unit', 'bootstrap', 'z-unit', 'handshake unit'], { env: { CTX_STORAGE_DRIVER: 'z-bad' } });
    expect(r.code).toBe(2);
    expect(r.stdout + r.stderr).toContain('not the seven data names in the fixed order (ERR_DRIVER_PROTOCOL)');
    expect(existsSync(join(sb, RECORD_ROOT, 'z-unit'))).toBe(false);
    expect((await data(sb, 'session.load', ['z-unit'])).code).toBe(1);
    expect(calls(log).length).toBeGreaterThan(0);
    expect(calls(log).filter((c) => c !== 'capability')).toEqual([]);
  });

  it('[the-engine-r8, the-engine-r19] the same plant carrying all seven names serves the bootstrap through its store', async () => {
    const sb = stage('posix', 'z-good');
    const log = plantDriver(sb, 'z-good');
    const r = await run(sb, ['unit', 'bootstrap', 'z-unit', 'handshake unit'], { env: { CTX_STORAGE_DRIVER: 'z-good' } });
    expect(r.code, r.stderr).toBe(0);
    expect(calls(log).filter((c) => c !== 'capability').length).toBeGreaterThan(0);
    expect(existsSync(join(sb, RECORD_ROOT, 'z-unit/state.md'))).toBe(true);
  });
});
