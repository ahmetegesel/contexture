import { beforeAll, describe, expect, it } from 'vitest';
import { run } from '../support/unit';
import { engineSandbox, writeManifests } from './fixture';

describe.concurrent('the ctx _module reader', () => {
  let sb: string;
  beforeAll(() => {
    sb = engineSandbox('module-manifest');
    writeManifests(sb);
  });
  const read = (name: string, word?: string) => run(sb, ['_module', `.contexture/modules/${name}/module`, ...(word ? [word] : [])]);

  it('CT-MF1 [modules-r11]: a full manifest validates and reads its summary, version, and description with its blank lines', async () => {
    expect((await read('fullmod', 'validate')).code).toBe(0);
    expect((await read('fullmod', 'summary')).stdout).toBe('a full manifest\n');
    expect((await read('fullmod', 'version')).stdout).toBe('1.2.3\n');
    expect((await read('fullmod', 'description')).stdout).toBe('The corpus preamble.\n\nA second paragraph.\n');
  });

  it('CT-MF1 [modules-r11]: a summary-only manifest validates and reads an empty version and description', async () => {
    expect((await read('sumonly', 'validate')).code).toBe(0);
    expect((await read('sumonly', 'version')).stdout.trim()).toBe('');
    expect((await read('sumonly', 'description')).stdout.trim()).toBe('');
  });

  it('CT-MF1 [modules-r11, the-engine-p5]: a requires line refuses validate and every field read rc 1', async () => {
    for (const word of ['validate', 'summary']) {
      const r = await read('reqmod', word);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain('requires is reserved and refused');
    }
  });

  it.for([
    ['dupmod', 'duplicate # summary:'],
    ['unkmod', "unknown field 'parts'"],
    ['badvermod', 'malformed version'],
    ['baddescmod', 'description block takes only # lines'],
  ] as const)('CT-MF1 [modules-r11]: %s refuses validate rc 1 naming its rule', async ([name, message]) => {
    const r = await read(name, 'validate');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(message);
  });

  it('CT-MF1 [modules-r11]: an unknown field word and a missing argument refuse rc 1, the latter with the usage', async () => {
    expect((await read('fullmod', 'nosuch')).code).toBe(1);
    const r = await run(sb, ['_module']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('_module: usage:');
  });
});
