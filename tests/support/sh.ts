import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { type ModuleRoot, moduleDir } from './data-file';
import { exec, type Run } from './exec';

export interface ShOptions {
  input?: string | Buffer;
  env?: Record<string, string>;
}

export function shFunction(cwd: string, file: string, fn: string, args: readonly string[] = [], { input, env }: ShOptions = {}): Promise<Run> {
  return exec('sh', ['-c', 'f=$1; shift; . "$f" && "$@"', 'sh', file, fn, ...args], { cwd, input, env });
}

export interface ModuleCallOptions extends ShOptions {
  root?: ModuleRoot;
  shell?: string;
}

// moduleScript: a private script (no summary line) inside the module folder, the folder made a
// module by a manifest when it holds none, so the storage library's caller lookup names the
// folder from the script's absolute path
export function moduleScript(sb: string, module: string, name: string, body: string, root: ModuleRoot = 'modules'): string {
  const dir = moduleDir(sb, root, module);
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  if (!existsSync(join(dir, 'module'))) writeFileSync(join(dir, 'module'), `# summary: the ${module} test module\n`);
  const script = join(dir, 'scripts', name);
  writeFileSync(script, body, { mode: 0o755 });
  return script;
}

// moduleCall: one library function called by a script of the named module, run by its
// absolute path, so the library serves that module's namespace
export function moduleCall(sb: string, module: string, file: string, fn: string, args: readonly string[] = [], { input, env, root = 'modules', shell = 'sh' }: ModuleCallOptions = {}): Promise<Run> {
  const script = moduleScript(sb, module, 'lib-call', 'f=$1; shift; . "$f" && "$@"\n', root);
  return exec(shell, [script, file, fn, ...args], { cwd: sb, input, env });
}
