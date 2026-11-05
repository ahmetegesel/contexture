import { exec, type Run } from './exec';

export function ctx(sb: string, ...args: string[]): Promise<Run> {
  return exec('./.contexture/ctx', args, { cwd: sb });
}

export function ctxIn(sb: string, input: string, ...args: string[]): Promise<Run> {
  return exec('./.contexture/ctx', args, { cwd: sb, input });
}
