import { expect } from 'vitest';
import type { Run } from './exec';

const DECODE: Record<string, string> = { '\\': '\\', n: '\n', t: '\t', r: '\r' };

export function esc(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
}

export function unesc(v: string): string {
  return v.replace(/\\([\\ntr])/g, (_, c: string) => DECODE[c]);
}

export class Payload {
  private readonly lines: string[] = [];

  kv(key: string, value: string): this {
    this.lines.push(`${key}=${esc(value)}`);
    return this;
  }

  kl(key: string, ...values: string[]): this {
    this.lines.push(`${key}.count=${values.length}`);
    values.forEach((v, i) => this.kv(`${key}.${i + 1}`, v));
    return this;
  }

  toString(): string {
    return this.lines.map((l) => `${l}\n`).join('');
  }
}

export const payload = (): Payload => new Payload();

export const b64 = (bytes: Buffer | string): string => Buffer.from(bytes).toString('base64');
export const unb64 = (text: string): Buffer => Buffer.from(text, 'base64');

const lineCount = (s: string): number => s.split('\n').length - 1;

export function answer(r: Run, fn: string): any {
  expect(r.code, `${fn} rc [${r.stderr}]`).toBe(0);
  expect(r.stderr, `${fn} wrote stderr`).toBe('');
  expect(lineCount(r.stdout), `${fn} answer lines`).toBe(1);
  const parsed: unknown = JSON.parse(r.stdout);
  expect(parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed), `${fn} answer is a JSON object`).toBe(true);
  return parsed;
}

export function refused(r: Run, fn: string, rc: number, code: string, message: string): void {
  expect(r.code, `${fn} rc`).toBe(rc);
  expect(r.stdout, `${fn} stdout on a refusal`).toBe('');
  expect(r.stderr).toBe(`${fn}: error: ${message} (${code})\n`);
}
