import { dataFile } from './data-file';
import { driverOp } from './driver';
import type { Run } from './exec';
import { type Driver, stage } from './stage';
import { batchPayload } from './store';

export function lcg(seed: number): () => number {
  let st = seed % 2147483647;
  if (st <= 0) st += 2147483646;
  return () => (st = (st * 48271) % 2147483647);
}

export function genSequence(seed: number, calls: number): string[] {
  const next = lcg(seed);
  const pick = (m: number) => (next() % m) + 1;
  const lines = ['put|a/k1|p1', 'put|a/k2|p6'];
  for (let n = 2; n < calls; n++) {
    const r = next() % 100;
    if (r < 55) lines.push(`put|a/k${pick(10)}|p${pick(6)}`);
    else if (r < 80) lines.push(`delete|a/k${pick(10)}|`);
    else {
      const c = 2 + (next() % 3);
      const items: string[] = [];
      for (let i = 0; i < c; i++) items.push(next() % 100 < 70 ? `put:a/k${pick(10)}:p${pick(6)}` : `delete:a/k${pick(10)}`);
      lines.push(`batch|${items.join(';')}`);
    }
  }
  return lines;
}

export interface Profile {
  ns: string;
  data: string;
  key: (k: string) => string;
  payload: (p: string) => Buffer;
  prefix?: string;
  needle: string;
}

const DOCS_PAYLOADS: Record<string, Buffer> = {
  p1: Buffer.from('alpha line\nneedle first\nomega\n'),
  p2: Buffer.from('no trailing newline'),
  p3: Buffer.from([0x61, 0x00, 0x62, 0xff]),
  p4: Buffer.from('quote " tab\tbackslash \\ newline\nsecond line with needle\n'),
  p5: Buffer.from('türkçe ğüşiöç needle\n'),
  p6: Buffer.from('first\nNeedle in caps\nthird\n'),
};

export const KEY_VALUE: Profile = {
  ns: 'fuzz',
  data: 'namespace: fuzz\nroot: fuzz-root\nsuffix: .txt\nkey: <a>/<b>\nchanges: false\nsearch: flat\nformat: text\nmodes: exact\n',
  key: (k) => k,
  payload: (p) => DOCS_PAYLOADS[p],
  needle: 'needle',
};

const UNIT_KEYS = ['u1/state', 'u1/backlog', 'u1/journal', 'u1/knowledge', 'u1/lanes/l1/recipe', 'u1/lanes/l1/report', 'u10/state', 'u2/journal', 'u2/lanes/l2/journal', 'u2/state'];

function recordValue(i: number): Buffer {
  const entries = Array.from({ length: 40 + i * 12 }, (_, n) =>
    `@entry 2026-11-0${(n % 9) + 1}-event-${1793900000 + n}\n  ANCHOR: A${(n % 3) + 1}\n  WHAT: "write ${n} of value ${i}: \\"quoted\\" a\\\\b türkçe needle"\n  REF: "journal#e-${n}"\n  THREAD: none\n`);
  return Buffer.from(`${i % 2 ? 'status: ACTIVE\nobjective: "two\nline value"\n\n' : ''}${entries.join('\n')}`);
}

export const UNIT_SHAPED: Profile = {
  ns: 'fuzzu',
  data: 'namespace: fuzzu\nroot: fuzzu-root\nsuffix: .md\nkey: <unit>/<path...>\nchanges: false\n',
  key: (k) => UNIT_KEYS[Number(k.slice(3)) - 1],
  payload: (p) => recordValue(Number(p.slice(1))),
  prefix: 'u1/',
  needle: 'needle',
};

export interface Call {
  fn: string;
  args: string[];
  input: Buffer | string;
}

export function calls(seq: readonly string[], profile: Profile): Call[] {
  const { ns, key, payload } = profile;
  const out: Call[] = [];
  const queries = [profile.needle, profile.needle.toUpperCase(), `${profile.needle} in`, 'türkçe', 'absent-word'];
  seq.forEach((line, i) => {
    const step = i + 1;
    const [op, k, spec] = line.split('|');
    let touched: string[];
    if (op === 'put') {
      out.push({ fn: 'store.put', args: [ns, key(k)], input: payload(spec) });
      touched = [key(k)];
    } else if (op === 'delete') {
      out.push({ fn: 'store.delete', args: [ns, key(k)], input: '' });
      touched = [key(k)];
    } else {
      const actions = k.split(';').map((item) => {
        const [act, ik, ip] = item.split(':');
        return act === 'put' ? { action: 'put' as const, key: key(ik), head: 'none', value: payload(ip) } : { action: 'delete' as const, key: key(ik), head: 'none' };
      });
      out.push({ fn: 'store.batch', args: [ns], input: batchPayload(actions) });
      touched = actions.map((a) => a.key);
    }
    for (const t of touched) out.push({ fn: 'store.get', args: [ns, t], input: '' });
    if (step % 2 === 0) {
      out.push({ fn: 'store.list', args: [ns], input: '' });
      if (profile.prefix) out.push({ fn: 'store.list', args: [ns, profile.prefix], input: '' });
      out.push({ fn: 'store.scan', args: [ns], input: '' });
    }
    if (step % 6 === 0) out.push({ fn: 'store.search', args: [ns, 'exact', '20'], input: `query=${queries[(step / 6) % 5]}\n` });
  });
  for (let i = 1; i <= 6; i++) out.push({ fn: 'store.get', args: [ns, key(`a/k${i}`)], input: '' });
  out.push({ fn: 'store.list', args: [ns], input: '' }, { fn: 'store.scan', args: [ns], input: '' });
  const extra = profile === UNIT_SHAPED ? 'u3/zzneedle' : 'a/zzneedle';
  out.push({ fn: 'store.put', args: [ns, extra], input: payload('p1') }, { fn: 'store.get', args: [ns, extra], input: '' });
  out.push({ fn: 'store.search', args: [ns, 'exact', '20'], input: `query=${profile.needle}\n` });
  return out;
}

export function side(driver: Driver, profile: Profile): string {
  const sb = stage(driver, `fuzz-${profile.ns}`);
  dataFile(sb, 'modules', profile.ns, profile.data);
  return sb;
}

export async function replay(sb: string, driver: Driver, plan: readonly Call[]): Promise<Run[]> {
  const runs: Run[] = [];
  for (const c of plan) runs.push(await driverOp(sb, driver, c.fn, c.args, c.input));
  return runs;
}

export function firstDifference(a: readonly Run[], b: readonly Run[]): number {
  return a.findIndex((r, i) => r.code !== b[i].code || !r.bytes.equals(b[i].bytes) || r.stderr !== b[i].stderr);
}

export function blindSpots(plan: readonly Call[], runs: readonly Run[]): string[] {
  const seen = (fn: string, ok: (out: string) => boolean) => runs.some((r, i) => plan[i].fn === fn && r.code === 0 && ok(r.stdout));
  const need: [string, string, (out: string) => boolean][] = [
    ['a successful put', 'store.put', (o) => o.includes('"op":"write"')],
    ['a successful get', 'store.get', (o) => o.length > 0],
    ['a non-empty list', 'store.list', (o) => o.includes('"keys":["')],
    ['a non-empty scan', 'store.scan', (o) => o.includes('"items":[{')],
    ['a matching search', 'store.search', (o) => /"total_matches":[1-9]/.test(o)],
  ];
  return need.filter(([, fn, ok]) => !seen(fn, ok)).map(([what]) => what);
}
