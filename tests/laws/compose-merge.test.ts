import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, type Run } from '../support/exec';
import { blockClauses, compose, count, DOCS_MOD, layer, layerBytes, lineOf, moduleBlock, synth } from '../support/laws';
import { seed } from '../support/snapshot';

describe.concurrent('the synthetic merge', () => {
  let sb: string;
  let run: Run;
  beforeAll(async () => {
    sb = synth();
    run = await compose(sb);
  });

  it('[modules-r19] composes rc0 under a header carrying the fixture version and both checksums', () => {
    expect(run.code).toBe(0);
    expect(layer(sb).split('\n')[0]).toMatch(/^# contexture v9\.9\.9: generated law layer; core cksum \d+-\d+; sources \d+-\d+; never edit$/);
  });

  it('[modules-r12, modules-r19] appends the clauses under their block keywords in core, module, then standalone order', () => {
    const g = layer(sb);
    expect(blockClauses(g, 'laws')).toEqual(['core-law', 'shared-law', 'alpha-law', 'alpha-extra-law', 'beta-extra-law']);
    expect(blockClauses(g, 'record')).toEqual(['beta-record']);
    expect(blockClauses(g, 'journal')).toEqual(['delta-journal']);
    expect(blockClauses(g, 'custom')).toEqual(['alpha-custom', 'beta-custom', 'delta-custom']);
    expect(blockClauses(g, 'notes')).toEqual(['beta-notes']);
  });

  it('[modules-r19] composes each module once and each standalone part once, with no preamble for a standalone part', () => {
    const g = layer(sb);
    expect(count(g, /^@module /)).toBe(4);
    expect(count(g, /^@module alpha$/)).toBe(1);
    expect(count(g, /alpha-law: alpha contributes a law/)).toBe(1);
    expect(count(g, /^@module alpha-extra$/)).toBe(0);
    expect(count(g, /alpha-extra-law: a standalone law part/)).toBe(1);
  });

  it('[modules-r11, modules-r19] writes each preamble from its manifest: the summary, the indented description, the help pointer', () => {
    const g = layer(sb);
    const beta = moduleBlock(g, 'beta');
    expect(beta).toMatch(/^ {2}summary: beta the summary-only fixture module$/m);
    expect(beta).not.toContain('preamble');
    expect(beta).toMatch(/^ {2}help: ctx beta help$/m);
    expect(moduleBlock(g, 'gamma')).toMatch(/^ {2}Gamma has no laws, only a preamble\.$/m);
    expect(g).not.toContain('gamma-law');
    expect(moduleBlock(g, 'alpha')).toMatch(/^ {2}Alpha's preamble: what it is\.$/m);
  });

  it('[modules-r19] orders the preambles after @layout and before @record, workspace modules in byte order then extension modules, and the custom sections after @update', () => {
    const g = layer(sb);
    const at = (re: RegExp) => lineOf(g, re);
    expect(at(/^@layout$/)).toBeLessThan(at(/^@module alpha$/));
    expect(at(/^@module alpha$/)).toBeLessThan(at(/^@record$/));
    expect(at(/^@module alpha$/)).toBeLessThan(at(/^@module beta$/));
    expect(at(/^@module beta$/)).toBeLessThan(at(/^@module gamma$/));
    expect(at(/^@module gamma$/)).toBeLessThan(at(/^@module delta$/));
    expect(at(/^@update$/)).toBeLessThan(at(/^@custom$/));
    expect(at(/^@custom$/)).toBeLessThan(at(/^@notes$/));
  });
});

describe.concurrent('the discovery filters and the docs composition', () => {
  const plantFiltered = (sb: string, workspaceShadow: boolean) => {
    const mod = (root: string, name: string, summary: string, law: string) => {
      const dir = join(sb, root, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'module'), `# summary: ${summary}\n# version: 0.1.0\n`);
      writeFileSync(join(dir, 'laws'), `@append @laws\n  ${law}\n`);
    };
    mod('.contexture/modules', 'refresh', 'reserved workspace fixture', 'refresh-law: reserved workspace law');
    mod('.contexture/modules', 'compose', 'reserved compose fixture', 'compose-law: reserved compose law');
    mod('.contexture/extensions/modules', 'help', 'reserved extension fixture', 'help-law: reserved extension law');
    mod('.contexture/extensions/modules', 'shadow', 'shadowed extension fixture', 'shadow-law: shadowed extension law');
    if (workspaceShadow) mkdirSync(join(sb, '.contexture/modules/shadow'), { recursive: true });
  };

  it('[modules-r19] composes no reserved module in either root and no extension module a workspace name shadows', async () => {
    const sb = synth();
    plantFiltered(sb, true);
    expect((await compose(sb)).code).toBe(0);
    const g = layer(sb);
    for (const name of ['refresh', 'help', 'compose', 'shadow']) {
      expect(count(g, new RegExp(`^@module ${name}$`))).toBe(0);
      expect(g).not.toContain(`${name}-law`);
    }
    expect(count(g, /^@module /)).toBe(4);
  });

  it('[modules-r19, the-engine-r-n791r] ctx compose prints no discovery warning on a current layer while ctx help warns on the same plants', async () => {
    const sb = synth();
    expect((await compose(sb)).code).toBe(0);
    const before = layerBytes(sb);
    plantFiltered(sb, true);
    mkdirSync(join(sb, '.contexture/modules/wsorphan/scripts'), { recursive: true });
    mkdirSync(join(sb, '.contexture/extensions/modules/extorphan/scripts'), { recursive: true });
    const r = await compose(sb);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    expect(layerBytes(sb)).toEqual(before);
    const help = await exec('sh', ['.contexture/ctx', 'help'], { cwd: sb });
    expect(help.stderr).toContain('skipping module wsorphan: scripts/ without a module file');
    expect(help.stderr).toContain('skipping module extorphan: scripts/ without a module file');
    expect(help.stderr).toContain('reserved name refused (shadow): refresh');
    expect(help.stderr).toContain('reserved name refused (shadow): compose');
  });

  it('[modules-r19] composes the extension module once no workspace folder shadows its name (the shadow assertion discriminates)', async () => {
    const sb = synth();
    plantFiltered(sb, false);
    expect((await compose(sb)).code).toBe(0);
    expect(count(layer(sb), /^@module shadow$/)).toBe(1);
    expect(layer(sb)).toContain('shadow-law: shadowed extension law');
  });

  it('[modules-r12] composes the docs module once with its preamble and its layout, boot, and close clauses', async () => {
    let run: Run | undefined;
    const sb = await seed(async (s) => {
      cpSync(DOCS_MOD, join(s, '.contexture/extensions/modules/docs'), { recursive: true });
      run = await compose(s);
    }, 'posix', 'laws-docs');
    expect(run!.code).toBe(0);
    const g = layer(sb);
    expect(count(g, /^@module docs$/)).toBe(1);
    expect(moduleBlock(g, 'docs')).toMatch(/^ {2}summary: the corpus-first documentation discipline/m);
    expect(moduleBlock(g, 'docs')).toMatch(/^ {2}The docs module holds the agent-facing corpus/m);
    expect(count(g, /^ {2}docs-first: /)).toBe(1);
    expect(count(g, /^ {2}the corpus conventions \(repo workspace, slug conventions\): /)).toBe(1);
    expect(count(g, /^ {2}boot order addition: /)).toBe(1);
    expect(count(g, /^ {2}docs gate \(unit close\): /)).toBe(1);
  });
});
