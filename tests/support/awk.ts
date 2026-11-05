import { exec, type Run } from './exec';

export interface AwkOptions {
  input?: string | Buffer;
  env?: Record<string, string>;
}

export function awk(cwd: string, program: string, { input, env }: AwkOptions = {}): Promise<Run> {
  return exec('awk', ['-f', program], { cwd, input, env });
}
