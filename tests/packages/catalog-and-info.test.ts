import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { leaks } from '../support/drawer';
import { addFile, addModule, extPath, install, newPkg, recordPath } from '../support/packages';
import { chmodPlant, ROOT_USER } from '../support/plants';
import { stage } from '../support/stage';
import { put, treeState } from '../support/tree';

const sandbox = (label: string) => stage('posix', `pkg-cat-${label}`);

function makePkg(
  root: string,
  name: string,
  opts: {
    version?: string;
    kind?: 'feature' | 'driver';
    driver?: string;
    extraManifest?: string[];
    probe?: { body: string; mode?: number };
    installHook?: string;
    uninstallHook?: string;
  } = {},
): string {
  const p = join(root, name);
  mkdirSync(join(p, '.contexture/extensions'), { recursive: true });
  const kind = opts.kind ?? 'feature';
  const lines = [
    `# summary: summary for ${name}`,
    `# version: ${opts.version ?? '1.0.0'}`,
    `# kind: ${kind}`,
  ];
  if (kind === 'driver') {
    const drv = opts.driver ?? name;
    lines.push(`# driver: ${drv}`);
    lines.push(`# part: driver storage/drivers/${drv}`);
    addFile(p, `storage/drivers/${drv}/driver`, '#!/bin/sh\nexit 0', 0o755);
  } else {
    addModule(p, `m-${name}`);
    lines.push(`# part: module modules/m-${name}`);
  }
  if (opts.extraManifest) lines.push(...opts.extraManifest.map((l) => (l.startsWith('#') ? l : `# ${l}`)));
  put(join(p, 'manifest'), lines.join('\n') + '\n');
  if (opts.probe) put(join(p, 'hooks/probe'), opts.probe.body, opts.probe.mode ?? 0o755);
  if (opts.installHook) put(join(p, 'hooks/install'), opts.installHook, 0o755);
  if (opts.uninstallHook) put(join(p, 'hooks/uninstall'), opts.uninstallHook, 0o755);
  return p;
}

describe.concurrent('ctx package catalog', () => {
  it('[the-engine-r22] empty catalog prints plain message rc 0, empty --names, and empty --json array', async () => {
    const sb = sandbox('empty');
    const before = treeState(sb);
    const txt = await ctx(sb, 'package', 'catalog');
    expect([txt.code, txt.stderr, txt.stdout]).toEqual([0, '', 'package catalog: no catalog packages found (.contexture/plugins/ and plugins/ hold none)\n']);
    const names = await ctx(sb, 'package', 'catalog', '--names');
    expect([names.code, names.stderr, names.stdout]).toEqual([0, '', '']);
    const js = await ctx(sb, 'package', 'catalog', '--json');
    expect([js.code, js.stderr]).toEqual([0, '']);
    expect(JSON.parse(js.stdout)).toEqual({ packages: [] });
    expect(treeState(sb)).toBe(before);
  });

  it('[the-engine-r22] --names prints LC_ALL=C sorted names without running probes, refuses --json together and rejects extra args', async () => {
    const sb = sandbox('names');
    makePkg(join(sb, 'plugins'), 'zeta', {
      probe: { body: '#!/bin/sh\ntouch "$CTX_ROOT/probe-ran"\nexit 1\n' },
    });
    makePkg(join(sb, '.contexture/plugins'), 'alpha');
    makePkg(join(sb, 'plugins'), 'alpha');

    const r = await ctx(sb, 'package', 'catalog', '--names');
    expect([r.code, r.stderr, r.stdout]).toEqual([0, '', 'alpha\nzeta\n']);
    expect(existsSync(join(sb, 'probe-ran'))).toBe(false);

    const conflict = await ctx(sb, 'package', 'catalog', '--names', '--json');
    expect(conflict.code).toBe(1);
    expect(conflict.stderr).toContain('--names and --json cannot be used together');

    const extra = await ctx(sb, 'package', 'catalog', '--names', 'extra');
    expect(extra.code).toBe(1);
    expect(extra.stderr).toContain('unexpected argument');

    const badFlag = await ctx(sb, 'package', 'catalog', '--bogus');
    expect(badFlag.code).toBe(1);
    expect(badFlag.stderr).toContain('unknown option');
  });

  it('[the-engine-r22, plugins-r6] renders ready, partial, unmet, error, absent probes, /dev/null stdin, installed/declared states, and shadowing with zero internal leaks', async () => {
    const sb = sandbox('states');
    const pluginsDir = join(sb, 'plugins');
    const ctxPluginsDir = join(sb, '.contexture/plugins');

    makePkg(pluginsDir, 'p-absent', {
      extraManifest: ['category: workflow', 'pitch: absent probe defaults ready'],
    });
    makePkg(pluginsDir, 'p-ready', {
      extraManifest: ['category: tools', 'needs: none', 'tags: ok fast'],
      probe: {
        body: [
          '#!/bin/sh',
          'if [ -t 0 ] || read -r _u; then echo "stdin-open" >&2; exit 9; fi',
          'printf "all good from %s\\n" "$CTX_PACKAGE_NAME"',
          'exit 0',
          '',
        ].join('\n'),
      },
    });
    makePkg(pluginsDir, 'p-partial', {
      probe: { body: '#!/bin/sh\nprintf "optional tool missing\\n"\nexit 3\n' },
    });
    makePkg(pluginsDir, 'p-unmet', {
      extraManifest: ['needs: missing-bin'],
      probe: { body: '#!/bin/sh\nprintf "missing-bin absent\\n"\nexit 1\n' },
    });
    makePkg(pluginsDir, 'p-error', {
      probe: { body: '#!/bin/sh\nprintf "unexpected failure\\n" >&2\nexit 2\n' },
    });
    makePkg(pluginsDir, 'p-shadow', { version: '1.0.0', extraManifest: ['pitch: fallback pitch'] });
    makePkg(ctxPluginsDir, 'p-shadow', { version: '2.0.0', extraManifest: ['pitch: primary pitch'] });

    // Hidden dir, manifest-less dir (skipped silently), and malformed manifest (warned & skipped)
    mkdirSync(join(pluginsDir, '.hidden'), { recursive: true });
    mkdirSync(join(pluginsDir, 'no-manifest'), { recursive: true });
    put(join(pluginsDir, 'broken/manifest'), '# summary: broken\n# requires: nope\n');

    expect((await install(sb, 'p-ready')).code).toBe(0);
    writeFileSync(join(sb, '.contexture/config'), `${readFileSync(join(sb, '.contexture/config'), 'utf8')}package.p-partial: p-partial\n`);

    const before = treeState(sb);
    const txt = await ctx(sb, 'package', 'catalog');
    expect(txt.code).toBe(0);
    expect(txt.stderr).toContain("skipping 'broken'");
    expect(txt.stderr).not.toContain('.hidden');
    expect(txt.stderr).not.toContain('no-manifest');
    expect(txt.stdout).toContain('p-absent (1.0.0, feature, workflow) [not installed] [probe: ready]');
    expect(txt.stdout).toContain('p-ready (1.0.0, feature, tools) [installed 1.0.0] [probe: ready]');
    expect(txt.stdout).toContain('p-partial (1.0.0, feature) [declared, not installed] [probe: partial]');
    expect(txt.stdout).toContain('p-unmet (1.0.0, feature) [not installed] [probe: unmet]');
    expect(txt.stdout).toContain('p-error (1.0.0, feature) [not installed] [probe: error]');
    expect(txt.stdout).toContain('probe: rc 2: unexpected failure');
    expect(txt.stdout).toContain('p-shadow (2.0.0, feature) [not installed] [probe: ready]');
    expect(txt.stdout).toContain('primary pitch');
    expect(txt.stdout).not.toContain('fallback pitch');
    expect(txt.stdout).toContain('package catalog: 6 packages (1 installed, 3 ready, 1 partial, 1 unmet, 1 error)');
    for (const line of txt.stdout.split('\n')) expect(leaks(line)).toBe(false);
    expect(treeState(sb)).toBe(before);

    const js = await ctx(sb, 'package', 'catalog', '--json');
    expect(js.code).toBe(0);
    const parsed = JSON.parse(js.stdout);
    expect(parsed.packages).toHaveLength(6);
    expect(parsed.packages.find((p: any) => p.name === 'p-shadow').version).toBe('2.0.0');
    expect(parsed.packages.find((p: any) => p.name === 'p-ready').probe).toEqual({ status: 'ready', code: 0, detail: 'all good from p-ready' });
    expect(parsed.packages.find((p: any) => p.name === 'p-partial').declared).toBe(true);
    expect(parsed.packages.find((p: any) => p.name === 'p-error').probe).toEqual({ status: 'error', code: 2, detail: 'unexpected failure' });

    const skipped = await ctx(sb, 'package', 'catalog', '--no-probe');
    expect(skipped.code).toBe(0);
    expect(skipped.stdout).toContain('package catalog: 6 packages (1 installed, probes skipped)');
  });

  it.skipIf(ROOT_USER)('[the-engine-r22] unreadable install record area refuses rc 2', async ({ onTestFinished }) => {
    const sb = sandbox('unreadable-state');
    const p = makePkg(join(sb, 'plugins'), 'p-one');
    expect((await install(sb, p)).code).toBe(0);
    chmodPlant(extPath(sb, '.state'), 0o000, 0o755, onTestFinished);
    const r = await ctx(sb, 'package', 'catalog');
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toContain('the install record area cannot be read');
  });
});

describe.concurrent('ctx package info', () => {
  it('[the-engine-r22, modules-r16] inspects a catalog or path package in text and JSON, flags before or after, with zero internal leaks', async () => {
    const sb = sandbox('info');
    makePkg(join(sb, 'plugins'), 'feat', {
      version: '1.0.0',
      extraManifest: [
        'category: docs',
        'pitch: concise pitch',
        'when: when writing docs',
        'needs: awk',
        'tags: one two-three',
        'description:',
        'Line one of description.',
        'Line two of description.',
      ],
      probe: { body: '#!/bin/sh\nprintf "line 1\\nline 2\\n"\nexit 3\n' },
      installHook: '#!/bin/sh\nexit 0\n',
      uninstallHook: '#!/bin/sh\nexit 0\n',
    });
    makePkg(join(sb, '.contexture/plugins'), 'feat', {
      version: '1.2.0',
      extraManifest: ['pitch: shadowed pitch'],
      probe: { body: '#!/bin/sh\nprintf "shadow line 1\\nshadow line 2\\n"\nexit 0\n' },
      installHook: '#!/bin/sh\nexit 0\n',
    });

    expect((await install(sb, join(sb, 'plugins/feat'))).code).toBe(0);
    const txt = await ctx(sb, 'package', 'info', 'feat');
    expect([txt.code, txt.stderr]).toEqual([0, '']);
    expect(txt.stdout).toContain('package: feat');
    expect(txt.stdout).toContain('version: 1.2.0');
    expect(txt.stdout).toContain('status: installed 1.0.0, declared, catalog holds 1.2.0');
    expect(txt.stdout).toContain('probe: ready\n  shadow line 1\n  shadow line 2');
    for (const line of txt.stdout.split('\n')) expect(leaks(line)).toBe(false);

    const byPath = await ctx(sb, 'package', 'info', '--json', '--no-probe', './plugins/feat');
    expect([byPath.code, byPath.stderr]).toEqual([0, '']);
    const parsed = JSON.parse(byPath.stdout);
    expect(parsed).toMatchObject({
      name: 'feat',
      version: '1.0.0',
      kind: 'feature',
      driver: null,
      category: 'docs',
      pitch: 'concise pitch',
      when: 'when writing docs',
      needs: 'awk',
      tags: ['one', 'two-three'],
      parts: [{ type: 'module', path: 'modules/m-feat' }],
      description: 'Line one of description.\nLine two of description.',
      installed: true,
      installed_version: '1.0.0',
      declared: true,
      lifecycle: ['probe', 'install', 'uninstall'],
      probe: { status: 'skipped', code: null, lines: [] },
    });
  });

  it('[the-engine-r22] inspects a driver package and handles error, missing, malformed, and usage refusals', async () => {
    const sb = sandbox('info-errors');
    const drv = makePkg(join(sb, 'plugins'), 'drvpkg', {
      kind: 'driver',
      driver: 'customdrv',
      probe: { body: '#!/bin/sh\necho "boom"\nexit 7\n' },
    });
    const r = await ctx(sb, 'package', 'info', 'drvpkg');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toContain('kind: driver');
    expect(r.stdout).toContain('driver: customdrv');
    expect(r.stdout).toContain('probe: error (rc 7)\n  boom');

    expect((await ctx(sb, 'package', 'info')).code).toBe(1);
    expect((await ctx(sb, 'package', 'info', '--bad')).code).toBe(1);
    expect((await ctx(sb, 'package', 'info', 'drvpkg', 'extra')).code).toBe(1);
    expect((await ctx(sb, 'package', 'info', 'absent')).code).toBe(1);
    expect((await ctx(sb, 'package', 'info', './plugins/absent')).code).toBe(1);

    const bad = newPkg(sb, 'badinfo');
    put(join(bad, 'manifest'), '# summary: s\n# requires: nope\n');
    const badR = await ctx(sb, 'package', 'info', bad);
    expect(badR.code).toBe(1);
    expect(badR.stderr).toContain('malformed package manifest');
    expect(drv).toBeTruthy();
  });

  it.skipIf(ROOT_USER)('[the-engine-r22] unreadable install record refuses rc 2 on info', async ({ onTestFinished }) => {
    const sb = sandbox('info-unreadable');
    const p = makePkg(join(sb, 'plugins'), 'p-info');
    expect((await install(sb, p)).code).toBe(0);
    chmodPlant(recordPath(sb, 'p-info'), 0o000, 0o644, onTestFinished);
    const r = await ctx(sb, 'package', 'info', 'p-info');
    expect([r.code, r.stdout]).toEqual([2, '']);
    expect(r.stderr).toContain("the install record of 'p-info' cannot be read");
  });
});
