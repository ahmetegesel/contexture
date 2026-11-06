import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exec, type Run } from './exec';
import { ROOT } from './root';

export const UNIT_LIB = join(ROOT, 'base/.contexture/modules/unit/lib');
const ENGINE = ['canon.awk', 'model.awk', 'ops.awk'].flatMap((p) => ['-f', join(UNIT_LIB, p)]);
const SEARCH = ['canon.awk', 'model.awk', 'search.awk'].flatMap((p) => ['-f', join(UNIT_LIB, p)]);
const IDENT = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;
const PARTS = ['backlog', 'journal', 'knowledge'] as const;

const store = (sb: string): string => join(sb, '.contexture/sessions');

function keys(sb: string, prefix = ''): string[] {
  const found: string[] = [];
  const walk = (dir: string, rel: string) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, `${rel}${name}/`);
      else if (name.endsWith('.md')) found.push(`${rel}${name.slice(0, -3)}`);
    }
  };
  walk(store(sb), '');
  return found.filter((k) => k.startsWith(prefix)).sort();
}

class Manifest {
  readonly lines: string[] = [];
  readonly files: string[] = [];

  constructor(readonly sb: string) {}

  add(key: string, storeKey: string): boolean {
    const file = join(store(this.sb), `${storeKey}.md`);
    if (!existsSync(file)) return false;
    this.lines.push(`F\t${key}\t${file}`);
    this.files.push(file);
    return true;
  }

  held(unit: string): boolean {
    return existsSync(join(store(this.sb), unit, 'state.md'));
  }

  unit(unit: string, parts: string, required: boolean): string | undefined {
    const want = ` ${parts} `;
    if (/ all | lane:| __lanes__ /.test(want)) {
      let state = false;
      const lanes: string[] = [];
      for (const k of keys(this.sb, `${unit}/`)) {
        const rest = k.slice(unit.length + 1);
        if (rest === 'state') state = this.add(`${unit}|state`, k);
        else if ((PARTS as readonly string[]).includes(rest)) {
          if (want.includes(' all ') || want.includes(` ${rest} `)) this.add(`${unit}|${rest}`, k);
        } else {
          const m = /^lanes\/([^/]+)\/(recipe|journal|report)$/.exec(rest);
          if (!m || !IDENT.test(m[1])) continue;
          if (!lanes.includes(m[1])) lanes.push(m[1]);
          if (want.includes(' all ') || want.includes(' lanes ') || want.includes(` lane:${m[1]} `)) this.add(`${unit}|lane/${m[1]}/${m[2]}`, k);
        }
      }
      if (state) this.lines.push(`U\t${unit}`);
      else if (required) return `unit '${unit}' not found`;
      for (const l of lanes) this.lines.push(`L\t${unit}\t${l}`);
      return undefined;
    }
    if (this.add(`${unit}|state`, `${unit}/state`)) this.lines.push(`U\t${unit}`);
    else if (required) return `unit '${unit}' not found`;
    for (const p of PARTS) if (want.includes(` ${p} `)) this.add(`${unit}|${p}`, `${unit}/${p}`);
    return undefined;
  }

  all(journals: boolean, backlogs = false): void {
    const units = keys(this.sb)
      .filter((k) => k.endsWith('/state'))
      .map((k) => k.slice(0, -6))
      .filter((u) => !u.includes('/') && IDENT.test(u));
    for (const u of units) {
      this.add(`${u}|state`, `${u}/state`);
      this.lines.push(`U\t${u}`);
    }
    if (journals) for (const u of units) this.add(`${u}|journal`, `${u}/journal`);
    if (backlogs) {
      const status = (u: string) => readFileSync(join(store(this.sb), u, 'state.md'), 'utf8').split('\n').find((l) => l.startsWith('status:'))?.slice(7).trim();
      for (const u of units.filter((u) => status(u) === 'ACTIVE')) this.add(`${u}|backlog`, `${u}/backlog`);
    }
  }
}

interface Plan {
  unit: string;
  args: readonly string[];
  write: boolean;
  doc: boolean;
  build: (m: Manifest) => string | undefined;
}

function plan(fn: string, argv: readonly string[]): Plan {
  const [u = '', ...rest] = argv;
  const unitParts = (parts: string, write = false, args = rest): Plan => ({ unit: u, args, write, doc: false, build: (m) => m.unit(u, parts, true) });
  switch (fn) {
    case 'session.create':
      return { unit: u, args: [], write: true, doc: false, build: (m) => (keys(m.sb, `${u}/`).length ? `unit '${u}' already exists` : undefined) };
    case 'session.load':
      return { unit: u, args: [], write: false, doc: false, build: () => undefined };
    case 'session.list':
      return { unit: '', args: [], write: false, doc: false, build: (m) => void m.all(true) };
    case 'session.active':
      return { unit: '', args: [], write: false, doc: false, build: (m) => void m.all(false, true) };
    case 'session.refload':
      return {
        unit: u,
        args: rest,
        write: false,
        doc: false,
        build: (m) => {
          const absent = argv.find((r) => !m.held(r));
          if (absent !== undefined) return `unit '${absent}' not found`;
          for (const r of argv) m.unit(r, 'backlog knowledge journal', false);
          return undefined;
        },
      };
    case 'session.refs':
      return { unit: u, args: rest, write: true, doc: false, build: (m) => (m.held(u) ? void m.all(false) : `unit '${u}' not found`) };
    case 'session.units':
    case 'session.refs_to':
      return { unit: u, args: [], write: false, doc: false, build: (m) => void m.all(false) };
    case 'session.board':
    case 'session.audit':
      return unitParts('backlog journal');
    case 'session.stamp':
      return unitParts('journal', true);
    case 'session.close':
      return unitParts('backlog journal', true);
    case 'session.reopen':
      return unitParts('', true);
    case 'task.get':
    case 'task.list':
      return unitParts('backlog');
    case 'task.complete':
    case 'task.drop':
      return unitParts('backlog journal', true);
    case 'task.add':
    case 'task.update':
    case 'task.start':
    case 'task.reopen':
      return unitParts('backlog', true);
    case 'entry.record':
      return unitParts('journal', true);
    case 'entry.get':
    case 'entry.closure':
    case 'entry.list':
      return unitParts('journal');
    case 'finding.get':
    case 'finding.list':
      return unitParts('knowledge');
    case 'finding.add':
    case 'finding.update':
    case 'finding.drop':
    case 'finding.supersede':
      return unitParts('knowledge', true);
    case 'lane.create':
    case 'lane.write_report':
      return { ...unitParts('__lanes__', true), doc: true };
    case 'lane.record':
      return unitParts(`lane:${rest[0]}`, true);
    case 'lane.get':
      return unitParts(`lane:${rest[0]}`);
    default:
      throw new Error(`no engine plan for ${fn}`);
  }
}

function scratch(sb: string): string {
  const tmp = join(sb, '.contexture/tmp');
  mkdirSync(tmp, { recursive: true });
  return mkdtempSync(join(tmp, 'engine-'));
}

function sizes(m: Manifest): string {
  return m.files.map((f) => `${statSync(f).size} ${f}\n`).join('');
}

function refusal(fn: string, code: string, message: string, rc = 1): Run {
  return { code: rc, stdout: '', stderr: `${fn}: error: ${message} (${code})\n`, bytes: Buffer.alloc(0) };
}

async function engineRun(sb: string, fn: string, unit: string, args: readonly string[], m: Manifest, scr: string, extra: Record<string, string>): Promise<Run> {
  writeFileSync(join(scr, 'man'), m.lines.map((l) => `${l}\n`).join(''));
  writeFileSync(join(scr, 'sizes'), sizes(m));
  const env: Record<string, string> = { PX_FN: fn, PX_UNIT: unit, PX_MAN: join(scr, 'man'), PX_SIZES: join(scr, 'sizes'), PX_ERR: join(scr, 'err'), PX_NA: String(args.length), PX_DOCSIZE: '0', ...extra };
  args.forEach((a, i) => (env[`PX_A${i + 1}`] = a));
  const r = await exec('awk', ENGINE, { cwd: sb, env, input: null });
  if (r.code === 0) return r;
  const err = existsSync(join(scr, 'err')) ? readFileSync(join(scr, 'err'), 'utf8') : '';
  return err ? { ...r, stdout: '', stderr: err } : refusal(fn, 'ERR_STORAGE_READ', `the record engine failed (rc ${r.code})`, 2);
}

export function applyStage(sb: string, unit: string, stage: string): void {
  const manifest = join(stage, 'manifest');
  if (!existsSync(manifest)) return;
  for (const line of readFileSync(manifest, 'utf8').split('\n').filter(Boolean)) {
    const [name, rel] = line.split('\t');
    const dest = join(store(sb), unit, rel);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(stage, name), dest);
  }
}

export async function engineCall(sb: string, fn: string, argv: readonly string[], input = ''): Promise<Run> {
  const scr = scratch(sb);
  const m = new Manifest(sb);
  if (fn === 'search.query') return searchCall(sb, argv, input, m, scr);
  const p = plan(fn, argv);
  const pay = join(scr, 'pay');
  const stage = join(scr, 'stage');
  const extra: Record<string, string> = { PX_OUT: join(scr, 'answer'), PX_PAY: p.doc ? '' : pay };
  if (p.write) {
    mkdirSync(stage);
    extra.PX_STAGE = stage;
  }
  if (p.doc) {
    writeFileSync(join(stage, 'doc'), input);
    extra.PX_DOCSIZE = String(Buffer.byteLength(input));
  } else writeFileSync(pay, input);
  if (fn === 'session.load') {
    const absent = m.unit(p.unit, '', true);
    if (absent) return refusal(fn, 'ERR_ENTITY_NOT_FOUND', absent);
    const refs = await engineRun(sb, 'state.refs', p.unit, [], m, scr, { PX_OUT: '', PX_PAY: pay });
    if (refs.code !== 0) return refs;
    m.unit(p.unit, 'backlog knowledge journal', false);
    for (const r of refs.stdout.split(/\s+/).filter((r) => IDENT.test(r) && r !== p.unit && m.held(r))) m.unit(r, 'backlog knowledge journal', false);
  } else {
    const absent = p.build(m);
    if (absent) return refusal(fn, absent.endsWith('exists') ? 'ERR_ENTITY_EXISTS' : 'ERR_ENTITY_NOT_FOUND', absent);
  }
  const r = await engineRun(sb, fn, p.unit, p.args, m, scr, extra);
  if (r.code !== 0) return r;
  if (p.write) applyStage(sb, p.unit, stage);
  const out = readFileSync(join(scr, 'answer'));
  return { code: 0, stdout: out.toString('utf8'), stderr: '', bytes: out };
}

async function searchCall(sb: string, argv: readonly string[], input: string, m: Manifest, scr: string): Promise<Run> {
  const [unit, ...flags] = argv;
  const flag = (name: string, fallback: string) => flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
  m.unit(unit, 'all', false);
  writeFileSync(join(scr, 'man'), m.lines.map((l) => `${l}\n`).join(''));
  writeFileSync(join(scr, 'sizes'), sizes(m));
  writeFileSync(join(scr, 'pay'), input);
  const env = {
    PX_MAN: join(scr, 'man'),
    PX_SIZES: join(scr, 'sizes'),
    PX_PAY: join(scr, 'pay'),
    PX_ERR: join(scr, 'err'),
    SQ_UNIT: unit,
    SQ_LIMIT: flag('limit', '20'),
    SQ_ENTITY: flag('entity', 'all'),
    SQ_MODE: flag('mode', 'exact'),
  };
  const r = await exec('awk', SEARCH, { cwd: sb, env, input: null });
  if (r.code === 0) return r;
  return { ...r, stdout: '', stderr: existsSync(join(scr, 'err')) ? readFileSync(join(scr, 'err'), 'utf8') : r.stderr };
}

export async function renderView(cwd: string, view: string, answer: string, env: Record<string, string> = {}): Promise<Run> {
  const flat = await exec('awk', ['-f', join(UNIT_LIB, 'json.awk')], { cwd, input: answer });
  if (flat.code !== 0) return flat;
  return exec('awk', ['-f', join(UNIT_LIB, 'render.awk')], { cwd, input: flat.stdout, env: { RV_VIEW: view, ...env } });
}
