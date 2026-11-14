import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { shVerb, writeModule } from '../support/modules';
import type { Run } from '../support/exec';
import { stage } from '../support/stage';
import { run } from '../support/unit';
import { engineSandbox, listed, verbs, writeManifests } from './fixture';

describe.concurrent('discovery over both module roots', () => {
  let help: Run;
  beforeAll(async () => {
    help = await run(engineSandbox('discovery'), ['help']);
  });

  it('CT-D1 [the-engine-r1, modules-r1]: ctx help lists a module with a summary and hides every unlisted shape', () => {
    expect(help.code).toBe(0);
    expect(help.stdout).toContain('ctx: the workspace command binder');
    expect(help.stdout).toMatch(/^ {2}good +a good fixture module$/m);
    for (const hidden of ['nosummary', 'scriptsonly', 'filteronly', 'hookonly', 'load ', 'shadow-help']) expect(help.stdout).not.toContain(hidden);
  });

  it('CT-D1 [the-engine-r1, the-engine-r2, modules-r1, modules-r6]: the broken shapes and the reserved name warn on stderr; the legal shapes stay silent', () => {
    expect(help.stderr).toContain('skipping module nosummary: module file has no summary');
    expect(help.stderr).toContain('skipping module scriptsonly: scripts/ without a module file');
    expect(help.stderr).toContain('reserved name refused (shadow): load');
    expect(help.stderr).not.toContain('filteronly');
    expect(help.stderr).not.toContain('hookonly');
  });

  it('CT-XR1 [the-engine-r1, modules-r14]: the workspace modules list before the extension modules, each root in byte order; collisions stay unlisted', () => {
    expect(help.stdout).toContain('an extension fixture module');
    for (const hidden of ['the extension good that must not shadow', 'a reserved extension module', 'a builtin collision', 'a lane leftover collision', 'a rhythm leftover collision', 'a store collision']) expect(help.stdout).not.toContain(hidden);
    expect(listed(help.stdout)).toEqual(['good', 'lane', 'rhythm', 'store', 'unit', 'aaaext', 'filterext', 'hookext']);
  });

  it('CT-XR1 [the-engine-r1, modules-r14, modules-r6]: the workspace name, builtin, and reserved collisions in the extension root warn', () => {
    expect(help.stderr).toContain('skipping extension module good: collides with a workspace module');
    for (const builtin of ['unit', 'lane', 'rhythm', 'store']) expect(help.stderr).toContain(`skipping extension module ${builtin}: collides with a builtin`);
    expect(help.stderr.match(/reserved name refused \(shadow\): load/g)).toHaveLength(2);
  });

  it('CT-D1 [the-engine-r1, modules-r1, modules-r19]: a module name holding an uppercase letter warns in each root with the lowercase rule and never lists, and the compose leaves its laws out', async () => {
    const sb = stage('posix', 'discovery-upper');
    writeModule(sb, 'modules', 'Upper', { manifest: '# summary: an uppercase fixture module\n', files: { 'scripts/hi': shVerb('say hi', 'echo hi'), laws: '@append @laws\n  upper-law: an uppercase module law\n' } });
    writeModule(sb, 'extensions', 'ExtUpper', { manifest: '# summary: an uppercase extension module\n', files: { 'scripts/hi': shVerb('say hi', 'echo hi') } });
    const r = await run(sb, ['help']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('skipping module Upper: a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit\n');
    expect(r.stderr).toContain('skipping module ExtUpper: a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit\n');
    expect(listed(r.stdout)).not.toContain('Upper');
    expect(r.stdout).not.toContain('an uppercase');
    expect((await run(sb, ['Upper', 'hi'])).code).toBe(1);
    const compose = await run(sb, ['compose']);
    expect(compose.code).toBe(0);
    expect(readFileSync(join(sb, 'AGENTS.generated.md'), 'utf8')).not.toContain('upper-law');
  });

  it('CT-D1 [the-engine-r1, modules-r1, modules-r19]: a module name starting with an underscore or a dash warns in each root with the module name rule and never lists, and the compose leaves its laws out', async () => {
    const sb = stage('posix', 'discovery-lead');
    writeModule(sb, 'modules', '_lead', { manifest: '# summary: a leading underscore fixture module\n', files: { 'scripts/hi': shVerb('say hi', 'echo hi'), laws: '@append @laws\n  lead-law: a leading underscore module law\n' } });
    writeModule(sb, 'extensions', '-dash', { manifest: '# summary: a leading dash extension module\n', files: { 'scripts/hi': shVerb('say hi', 'echo hi'), laws: '@append @laws\n  dash-law: a leading dash module law\n' } });
    const r = await run(sb, ['help']);
    expect(r.code).toBe(0);
    expect(r.stderr).toContain('skipping module _lead: a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit\n');
    expect(r.stderr).toContain('skipping module -dash: a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit\n');
    expect(r.stdout).not.toContain('a leading');
    expect((await run(sb, ['_lead', 'hi'])).code).toBe(1);
    const compose = await run(sb, ['compose']);
    expect(compose.code).toBe(0);
    const generated = readFileSync(join(sb, 'AGENTS.generated.md'), 'utf8');
    expect(generated).not.toContain('lead-law');
    expect(generated).not.toContain('dash-law');
  });

  it.each(['compose', 'package', 'search'])('CT-XR1 [the-engine-r2, modules-r6]: a valid module named %s warns in each root and never lists, since the engine builtin holds the name', async (name) => {
    const sb = engineSandbox(`discovery-${name}`);
    for (const root of ['modules', 'extensions'] as const) {
      writeModule(sb, root, name, { manifest: `# summary: a ${name} fixture module\n`, files: { 'scripts/hi': shVerb('say hi', 'echo hi') } });
    }
    const r = await run(sb, ['help']);
    expect(r.code).toBe(0);
    expect(r.stderr.match(new RegExp(`reserved name refused \\(shadow\\): ${name}$`, 'gm'))).toHaveLength(2);
    expect(listed(r.stdout)).not.toContain(name);
    expect(r.stdout).not.toContain(`a ${name} fixture module`);
  });

  it('[the-engine-r1, modules-r14]: an absent extension root is silent and lists no extension module', async () => {
    const sb = engineSandbox('discovery-noext');
    rmSync(`${sb}/.contexture/extensions`, { recursive: true });
    const r = await run(sb, ['help']);
    expect(r.code).toBe(0);
    expect(listed(r.stdout)).toEqual(['good', 'lane', 'rhythm', 'store', 'unit']);
    expect(r.stderr).not.toMatch(/extension/);
  });
});

describe.concurrent('discovery validates every manifest', () => {
  let help: Run;
  beforeAll(async () => {
    const sb = engineSandbox('discovery-mf');
    writeManifests(sb);
    help = await run(sb, ['help']);
  });

  it('CT-MF2 [modules-r11, the-engine-r1]: a valid and a summary-only manifest list; every refused manifest stays unlisted', () => {
    expect(help.stdout).toContain('a full manifest');
    expect(help.stdout).toContain('a summary-only manifest');
    for (const name of ['reqmod', 'dupmod', 'unkmod', 'badvermod', 'baddescmod']) expect(listed(help.stdout)).not.toContain(name);
    expect(help.stdout).not.toContain('unknown command: summary');
  });

  it('CT-MF2 [modules-r11, the-engine-r1, the-engine-p5]: discovery warns each refusal with its line', () => {
    for (const line of [
      'skipping module reqmod: line 2: requires is reserved and refused',
      'skipping module dupmod: line 2: duplicate # summary:',
      "skipping module unkmod: line 2: unknown field 'parts'",
      'skipping module badvermod: line 2: malformed version',
      'skipping module baddescmod: line 4: the description block takes only # lines',
    ])
      expect(help.stderr).toContain(line);
  });
});

describe('a module verb table', () => {
  it('N12 [the-engine-r3, modules-r2]: verbs are the summary-carrying files in LC_ALL=C order; a private file beside them stays unlisted and undispatchable', async () => {
    const sb = engineSandbox('discovery-order');
    writeModule(sb, 'modules', 'ordmod', {
      manifest: '# summary: verb order fixture\n',
      files: {
        'scripts/b-verb': shVerb('the b verb', 'echo b'),
        'scripts/a-verb': shVerb('the a verb', 'echo a'),
        'scripts/Z-verb': shVerb('the Z verb', 'echo Z'),
        'scripts/engine': '#!/bin/sh\necho private\n',
      },
    });
    const table = await run(sb, ['ordmod', 'help']);
    expect(table.code).toBe(0);
    expect(verbs(table.stdout)).toEqual(['Z-verb', 'a-verb', 'b-verb']);
    const priv = await run(sb, ['ordmod', 'engine']);
    expect(priv.code).toBe(1);
    expect(priv.stderr).toContain('unknown verb: engine');
    expect(priv.stdout).not.toContain('private');
    expect((await run(sb, ['ordmod', 'Z-verb'])).stdout).toBe('Z\n');
  });
});
