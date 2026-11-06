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
  group?: boolean;
  timeout?: number;
}

export const EXEC_TIMEOUT_MS = 90_000;
const KILL_GRACE_MS = 1_000;

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

const groups = new Set<number>();

function signalGroup(pid: number, sig: NodeJS.Signals | 0): boolean {
  try {
    process.kill(-pid, sig);
    return true;
  } catch {
    return false;
  }
}

export function sweep(): void {
  for (const pid of groups) signalGroup(pid, 'SIGKILL');
  groups.clear();
}

export function exec(cmd: string, args: readonly string[], options: ExecOptions): Promise<Run> {
  return launch(cmd, args, options).result;
}

export interface Launched {
  child: ChildProcess;
  result: Promise<Run>;
  signal: (sig: NodeJS.Signals) => void;
}

export function launch(cmd: string, args: readonly string[], { cwd, input = '', env = {}, group = false, timeout = EXEC_TIMEOUT_MS }: ExecOptions): Launched {
  const child = spawn(cmd, args, { cwd, env: cleanEnv(cwd, env), stdio: ['pipe', 'pipe', 'pipe'], detached: true });
  const pid = child.pid;
  if (pid) groups.add(pid);
  const result = new Promise<Run>((done, fail) => {
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      if (!pid) return;
      timedOut = true;
      signalGroup(pid, 'SIGTERM');
      setTimeout(() => signalGroup(pid, 'SIGKILL'), KILL_GRACE_MS);
    }, timeout);
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => err.push(b));
    child.on('error', (e) => {
      clearTimeout(timer);
      fail(e);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (pid && !signalGroup(pid, 0)) groups.delete(pid);
      if (timedOut) {
        fail(new Error(`exec: ${[cmd, ...args].join(' ')} timed out after ${timeout} ms; its process group was killed`));
        return;
      }
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
  const signal = (sig: NodeJS.Signals) => (group && pid ? process.kill(-pid, sig) : child.kill(sig));
  return { child, result, signal };
}
