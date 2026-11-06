import { cpSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataFile } from '../support/data-file';
import { driverOp } from '../support/driver';
import { exec, type Run } from '../support/exec';
import { stage } from '../support/stage';
import { answerLine } from '../support/wire';

const PROBE = 'namespace: probe\nroot: probe-data\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n';

function probeStage(): string {
  const sb = stage('posix', 'store-smoke');
  dataFile(sb, 'modules', 'probe', PROBE);
  return sb;
}

const storeData = (sb: string, ns: string): Promise<Run> => exec('.contexture/storage/scripts/store-data', [ns], { cwd: sb });
const resolver = (sb: string, args: readonly string[], env: Record<string, string> = {}): Promise<Run> =>
  exec('.contexture/storage/scripts/driver-resolver', args, { cwd: sb, env });
const op = (sb: string, name: string, args: readonly string[], input = ''): Promise<Run> => driverOp(sb, 'posix', name, args, input);

describe.concurrent('the bare base: the store-data owner scan over both module roots', () => {
  it("[modules-r10] an extension module's data file answers its five validated fields", async () => {
    const sb = probeStage();
    dataFile(sb, 'extensions', 'extprobe', 'namespace: extprobe\nroot: ext-data\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\n');
    const r = await storeData(sb, 'extprobe');
    expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: '' });
    expect(r.stdout.split('\n').slice(0, 5)).toEqual(['extprobe', 'ext-data', '.txt', '<a>/<b>', 'false']);
  });

  it('[modules-r10, the-engine-p4] a namespace declared in both module roots refuses rc1 naming both owners', async () => {
    const sb = probeStage();
    dataFile(sb, 'extensions', 'probe2', 'namespace: probe\nroot: ext-probe-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: true\n');
    const r = await storeData(sb, 'probe');
    expect({ code: r.code, stdout: r.stdout, stderr: r.stderr }).toEqual({
      code: 1,
      stdout: '',
      stderr: "store-data: namespace 'probe' is declared by more than one module: probe probe2\n",
    });
  });

  it('[modules-r10] an absent extension root is silent to the owner scan', async () => {
    const sb = probeStage();
    renameSync(join(sb, '.contexture/extensions'), join(sb, '.contexture/extensions.away'));
    const r = await storeData(sb, 'probe');
    expect({ code: r.code, stderr: r.stderr }).toEqual({ code: 0, stderr: '' });
  });
});

describe.concurrent('the bare base: the driver resolver tiers', () => {
  it('[the-engine-r19] resolves the core posix driver and an extension-root driver by name', async () => {
    const sb = probeStage();
    const core = await resolver(sb, ['resolve']);
    expect(core.code).toBe(0);
    expect(core.stdout.trim()).toMatch(/\/\.contexture\/storage\/drivers\/posix\/driver$/);
    cpSync(join(sb, '.contexture/storage/drivers/posix'), join(sb, '.contexture/extensions/storage/drivers/extposix'), { recursive: true });
    const ext = await resolver(sb, ['resolve'], { CTX_STORAGE_DRIVER: 'extposix' });
    expect(ext.code).toBe(0);
    expect(ext.stdout.trim()).toMatch(/\/\.contexture\/extensions\/storage\/drivers\/extposix\/driver$/);
  });

  it('[the-engine-r15] require and has answer the posix capabilities: store yes, store.changelog no', async () => {
    const sb = probeStage();
    expect((await resolver(sb, ['require', 'store'])).code).toBe(0);
    expect((await resolver(sb, ['has', 'store.changelog'])).code).toBe(1);
    const req = await resolver(sb, ['require', 'store.changelog']);
    expect(req.code).toBe(2);
    expect(req.stderr).toContain('lacks capability: store.changelog');
  });
});

describe('the bare base: the store seven over a synthetic namespace', () => {
  it('[the-engine-r19] list, put, get, and delete answer exactly on posix', async () => {
    const sb = probeStage();
    expect(answerLine(await op(sb, 'store.list', ['probe']), 'store.list')).toBe('{"namespace":"probe","keys":[]}');
    expect(answerLine(await op(sb, 'store.put', ['probe', 'x/one'], 'one\n'), 'store.put')).toBe('{"namespace":"probe","key":"x/one","op":"write"}');
    answerLine(await op(sb, 'store.put', ['probe', 'x/two'], 'two\n'), 'store.put');
    answerLine(await op(sb, 'store.put', ['probe', 'y/three'], 'three\n'), 'store.put');
    expect(answerLine(await op(sb, 'store.list', ['probe']), 'store.list')).toBe('{"namespace":"probe","keys":["x/one","x/two","y/three"]}');
    const got = await op(sb, 'store.get', ['probe', 'x/one']);
    expect({ code: got.code, stdout: got.stdout }).toEqual({ code: 0, stdout: 'one\n' });
    expect(answerLine(await op(sb, 'store.delete', ['probe', 'x/two']), 'store.delete')).toBe('{"namespace":"probe","key":"x/two","op":"remove"}');
    expect(answerLine(await op(sb, 'store.list', ['probe']), 'store.list')).toBe('{"namespace":"probe","keys":["x/one","y/three"]}');
  });
});
