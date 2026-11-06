import { exec, type Run } from './exec';

export interface AwkOptions {
  input?: string | Buffer;
  env?: Record<string, string>;
  args?: readonly string[];
  vars?: Record<string, string>;
}

export function awk(cwd: string, program: string, { input, env, args = [], vars = {} }: AwkOptions = {}): Promise<Run> {
  const v = Object.entries(vars).flatMap(([k, val]) => ['-v', `${k}=${val}`]);
  return exec('awk', [...v, '-f', program, ...args], { cwd, input, env });
}
