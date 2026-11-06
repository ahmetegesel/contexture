import { type ChildProcess, spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { constants } from 'node:os';
import { join } from 'node:path';

export interface Run {
  code: number;
  stdout: string;
  stderr: string;
  bytes: Buffer;
}

export interface ExecOptions {
  cwd: string;
  input?: string | Buffer | null;
  env?: Record<string, string>;
}

const PASSED = ['PATH', 'HOME', 'USER', 'TZ'] as const;

function cleanEnv(cwd: string, extra: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const k of PASSED) {
    const v = process.env[k];
    if (v !== undefined) env[k] = v;
  }
  const tmp = join(cwd, '.contexture', 'tmp');
  mkdirSync(tmp, { recursive: true });
  return { ...env, LC_ALL: 'C', TMPDIR: tmp, ...extra };
}

export function exec(cmd: string, args: readonly string[], options: ExecOptions): Promise<Run> {
  return launch(cmd, args, options).result;
}

export function launch(cmd: string, args: readonly string[], { cwd, input = '', env = {} }: ExecOptions): { child: ChildProcess; result: Promise<Run> } {
  const child = spawn(cmd, args, { cwd, env: cleanEnv(cwd, env), stdio: ['pipe', 'pipe', 'pipe'] });
  const result = new Promise<Run>((done, fail) => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => err.push(b));
    child.on('error', fail);
    child.on('close', (code, signal) => {
      const bytes = Buffer.concat(out);
      done({
        code: code ?? 128 + (signal ? constants.signals[signal] : 0),
        stdout: bytes.toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
        bytes,
      });
    });
  });
  child.stdin.on('error', () => undefined);
  if (input !== null) child.stdin.end(input);
  return { child, result };
}
