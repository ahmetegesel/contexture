import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { exec, type Run } from './exec';
import { ROOT } from './root';
import { put } from './tree';

export const extPath = (sb: string, rel = ''): string => join(sb, '.contexture/extensions', rel);
export const recordPath = (sb: string, name: string): string => extPath(sb, `.state/${name}.files`);
export const recordText = (sb: string, name: string): string => readFileSync(recordPath(sb, name), 'utf8');
export const isExec = (path: string): boolean => (statSync(path).mode & 0o111) !== 0;
export const out = (r: Run): string => r.stdout.replace(/\n+$/, '');

export function newPkg(sb: string, name: string): string {
  const p = join(sb, 'catalog', name);
  mkdirSync(join(p, '.contexture/extensions'), { recursive: true });
  put(join(p, 'README.md'), '# fixture package\n');
  put(join(p, 'tests/fixture.test.ts'), '// a package test never installs\n');
  put(join(p, 'AGENTS.workspace.md'), '@append @laws\n  fixture-law: a fixture law\n');
  put(join(p, 'docs/workspace/conventions.md'), '# seed\n');
  return p;
}

export function addModule(pkg: string, name: string, namespace?: string): void {
  const dir = join(pkg, '.contexture/extensions/modules', name);
  put(join(dir, 'module'), `# summary: the ${name} fixture module\n# version: 1.0.0\n# description:\n# A fixture module for the package overlay suite.\n`);
  put(join(dir, 'scripts/hello'), `#!/bin/sh\n# summary: say hello from ${name}\necho "hello from ${name}"\n`, 0o755);
  put(join(dir, 'laws'), `@append @laws\n  ${name}-law: a fixture law\n`);
  if (namespace) put(join(dir, 'data'), `namespace: ${namespace}\nkey: <a>/<b>\n`);
}

export function addFile(pkg: string, rel: string, text: string, mode = 0o644): void {
  put(join(pkg, '.contexture/extensions', rel), `${text}\n`, mode);
}

const entries = (dir: string): string[] => (existsSync(dir) ? readdirSync(dir).sort() : []);

export function writeManifest(pkg: string, version = '1.0.0'): void {
  const ext = join(pkg, '.contexture/extensions');
  const parts: string[] = [];
  const driver = entries(join(ext, 'storage/drivers'))[0];
  if (driver) parts.push(`driver storage/drivers/${driver}`);
  for (const m of entries(join(ext, 'modules'))) {
    const d = join(ext, 'modules', m);
    if (!statSync(d).isDirectory()) continue;
    if (existsSync(join(d, 'module')) || existsSync(join(d, 'scripts'))) {
      parts.push(`module modules/${m}`);
      continue;
    }
    if (existsSync(join(d, 'filters'))) parts.push(`filters modules/${m}/filters`);
    if (existsSync(join(d, 'hooks'))) parts.push(`hooks modules/${m}/hooks`);
    if (existsSync(join(d, 'laws'))) parts.push(`laws modules/${m}/laws`);
  }
  if (existsSync(join(ext, 'rhythms'))) parts.push('rhythms rhythms');
  if (entries(join(ext, 'laws')).length > 0) parts.push('laws laws');
  const name = pkg.split('/').pop();
  const head = [`# summary: fixture package ${name}`, `# version: ${version}`, `# kind: ${driver ? 'driver' : 'feature'}`];
  if (driver) head.push(`# driver: ${driver}`);
  writeFileSync(join(pkg, 'manifest'), [...head, ...parts.map((p) => `# part: ${p}`)].join('\n') + '\n');
}

export function install(sb: string, pkg: string): Promise<Run> {
  return exec('./.contexture/package-install', [pkg], { cwd: sb });
}

export function installPkg(sb: string, pkg: string, version = '1.0.0'): Promise<Run> {
  writeManifest(pkg, version);
  return install(sb, pkg);
}

export function uninstall(sb: string, target: string): Promise<Run> {
  return exec('./.contexture/package-uninstall', [target], { cwd: sb });
}

export function catalogCopy(sb: string, plugin: string): string {
  const p = join(sb, 'catalog', plugin);
  cpSync(join(ROOT, 'plugins', plugin), p, { recursive: true });
  return p;
}

export function wrapper(sb: string, pkg: string, verb: 'install' | 'uninstall'): Promise<Run> {
  return exec('sh', [join(pkg, verb)], { cwd: sb, env: { CTX_ROOT: sb } });
}
