import { renameSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { filter, writeModule } from '../support/modules';
import { run } from '../support/unit';
import { engineSandbox, withBin } from './fixture';

const DEBUG = { COMPACT_DEBUG: '1' };

describe.concurrent('ctx run selection over the fixture sandbox', () => {
  let sb: string;
  beforeAll(() => {
    sb = engineSandbox('run-selection');
  });

  it('CT-R1 [the-engine-r10]: an explicit filter resolves in a filter-only module, and the stream signature selects it too', async () => {
    expect((await run(sb, ['run', '--filter=probe'], { input: 'ZZMARK hello\n' })).stdout).toBe('P\n');
    expect((await run(sb, ['run'], { input: 'ZZMARK hello\n' })).stdout).toBe('P\n');
  });

  it('CT-R1 [the-engine-r10]: an unmatched stream passes through raw', async () => {
    expect((await run(sb, ['run'], { input: 'plain unmatched text\n' })).stdout).toBe('plain unmatched text\n');
  });

  it('CT-R1: an explicit missing filter names the miss, passes the raw stream, and keeps rc 0', async () => {
    const r = await run(sb, ['run', '--filter=nope'], { input: 'x\n' });
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('filter not found: nope');
    expect(r.stdout).toBe('x\n');
  });

  it('CT-R1: ctx run --help prints the run usage rc 0', async () => {
    const r = await run(sb, ['run', '--help']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('usage: ctx run');
  });

  it('CT-XR4 [the-engine-r10]: an extension filter resolves by name and by signature', async () => {
    expect((await run(sb, ['run', '--filter=ext'], { input: 'EXTMARK x\n' })).stdout).toBe('EXTFILTER\n');
    expect((await run(sb, ['run'], { input: 'EXTMARK x\n' })).stdout).toBe('EXTFILTER\n');
  });
});

function familySandbox(label: string): string {
  const sb = engineSandbox(label);
  writeModule(sb, 'modules', 'famone', { manifest: '# summary: fixture module one\n', files: { 'filters/a.awk': filter({ filter: 'famone', command: '^famcmd$', 'format-only': 'famone' }, '{ print "FAM-ONE" }') } });
  writeModule(sb, 'modules', 'famtow', { manifest: '# summary: fixture module two\n', files: { 'filters/b.awk': filter({ filter: 'famtow', command: '^famcmd$', 'format-only': 'famtow' }, '{ print "FAM-TWO" }') } });
  return sb;
}

describe.concurrent('ctx run filter merge', () => {
  it('CT-R2 [the-engine-r10, modules-r4]: the first module claiming a command wins and a later claim warns as a shadow', async () => {
    const sb = familySandbox('run-shadow');
    const r = await run(sb, ['run', 'famcmd'], { env: withBin(sb) });
    expect(r.stdout).toBe('FAM-ONE\n');
    expect(r.stderr).toContain('shadow warning: a.awk and famtow/b.awk both claim: famcmd');
  });

  it('CT-R2 [the-engine-r10, modules-r4]: priority over replaces the earlier selection, reported in debug', async () => {
    const sb = familySandbox('run-priority');
    writeModule(sb, 'modules', 'famtow', { files: { 'filters/b.awk': filter({ filter: 'famtow', command: '^famcmd$', 'format-only': 'famtow', 'ctx-filter-priority': 'over' }, '{ print "FAM-TWO" }') } });
    const r = await run(sb, ['run', 'famcmd'], { env: withBin(sb, DEBUG) });
    expect(r.stdout).toBe('FAM-TWO\n');
    expect(r.stderr).toContain('selected famtow/b.awk (command match: famcmd, priority over)');
  });

  it('CT-R2 [the-engine-r10]: a module default fills an empty selection, reported in debug', async () => {
    const sb = engineSandbox('run-default');
    writeModule(sb, 'modules', 'famdef', { manifest: '# summary: fixture module default\n', files: { 'filters/d.awk': filter({ filter: 'famdef', default: 'famdef', 'format-only': 'famdef' }, '{ print "DEF" }') } });
    const log = join(sb, '.contexture/modules/run/filters/log.awk');
    renameSync(log, `${log}.off`);
    const r = await run(sb, ['run'], { input: 'hello world\n', env: DEBUG });
    expect(r.stdout).toBe('DEF\n');
    expect(r.stderr).toContain('selected famdef/d.awk (module default)');
  });
});

describe.concurrent('ctx run signature bounds and root order', () => {
  const sigSandbox = (label: string): string => {
    const sb = engineSandbox(label);
    writeModule(sb, 'modules', 'sigmod', { manifest: '# summary: signature fixture\n', files: { 'filters/sig.awk': filter({ filter: 'sig', match: '^SIGLINE', 'format-only': 'sig' }, '/SIGLINE/ { print "SIG" }') } });
    return sb;
  };
  const stream = (at: number): string => Array.from({ length: at - 1 }, (_, i) => `filler ${i + 1}`).concat('SIGLINE here').join('\n') + '\n';

  it('N10 [the-engine-r10]: a signature on line 40 selects its filter', async () => {
    const r = await run(sigSandbox('run-sig40'), ['run'], { input: stream(40), env: DEBUG });
    expect(r.stderr).toContain('selected sigmod/sig.awk (signature match: ^SIGLINE)');
    expect(r.stdout).toBe('SIG\n');
  });

  it('N10 [the-engine-r10]: a signature on line 41 is past the sample and never selects', async () => {
    const input = stream(41);
    const r = await run(sigSandbox('run-sig41'), ['run'], { input, env: DEBUG });
    expect(r.stderr).not.toContain('sigmod/sig.awk');
    expect(r.stdout).not.toContain('SIG\n');
  });

  it('N11 [the-engine-r10]: on a shared signature the workspace module wins over an extension module that sorts first by name', async () => {
    const sb = engineSandbox('run-shared');
    writeModule(sb, 'modules', 'zzclaim', { manifest: '# summary: the workspace claim\n', files: { 'filters/w.awk': filter({ filter: 'w', match: '^SHARED', 'format-only': 'w' }, '{ print "WS" }') } });
    writeModule(sb, 'extensions', 'aaclaim', { manifest: '# summary: the extension claim\n', files: { 'filters/e.awk': filter({ filter: 'e', match: '^SHARED', 'format-only': 'e' }, '{ print "EXT" }') } });
    const r = await run(sb, ['run'], { input: 'SHARED line\n', env: DEBUG });
    expect(r.stdout).toBe('WS\n');
    expect(r.stderr).toContain('selected zzclaim/w.awk (signature match: ^SHARED)');
    expect(r.stderr).toContain('shadow warning: w.awk and aaclaim/e.awk both claim: ^SHARED');
  });
});
