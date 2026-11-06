import { exec, type Run } from './exec';

export interface AwkOptions {
  input?: string | Buffer;
  env?: Record<string, string>;
  args?: readonly string[];
  vars?: Record<string, string>;
}

export function awk(cwd: string, program: string | readonly string[], { input, env, args = [], vars = {} }: AwkOptions = {}): Promise<Run> {
  const v = Object.entries(vars).flatMap(([k, val]) => ['-v', `${k}=${val}`]);
  const f = (typeof program === 'string' ? [program] : program).flatMap((p) => ['-f', p]);
  return exec('awk', [...v, ...f, ...args], { cwd, input, env });
}
