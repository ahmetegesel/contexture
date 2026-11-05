import { exec, type Run } from './exec';

export interface ShOptions {
  input?: string | Buffer;
  env?: Record<string, string>;
}

export function shFunction(cwd: string, file: string, fn: string, args: readonly string[] = [], { input, env }: ShOptions = {}): Promise<Run> {
  return exec('sh', ['-c', 'f=$1; shift; . "$f" && "$@"', 'sh', file, fn, ...args], { cwd, input, env });
}
