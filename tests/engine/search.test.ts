import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec, launch } from '../support/exec';
import { shVerb, writeModule } from '../support/modules';
import { fresh, seed } from '../support/snapshot';
import { fts5Available, stage } from '../support/stage';
import { run } from '../support/unit';

const MANIFEST = (name: string) => `# summary: the ${name} search fixture\n# version: 1.0.0\n`;
const row = (m: string, id: string) =>
  `{"module":"${m}","container":"${m}/c","type":"item","id":"${id}","address":"${m}#c/${id}","snippet":"a needle ${id}","read":"ctx ${m} get c/${id}"}`;
const answer = (m: string, total: number, ids: string[]) => `{"query":"needle","mode":"exact","total":${total},"rows":[${ids.map((i) => row(m, i)).join(',')}]}`;
const SEARCH = (body: string) => shVerb('search the fixture', body);

function plant(sb: string, name: string, body: string): void {
  writeModule(sb, 'modules', name, { manifest: MANIFEST(name), files: { 'scripts/search': SEARCH(body) } });
}

const procAlive = (pid: string): boolean => {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
};

describe.concurrent('the ctx search builtin', () => {
  let base: string;
  beforeAll(async () => {
    base = await seed(async (sb) => {
      plant(sb, 'hmod', `printf '%s\\n' '${answer('hmod', 3, ['a', 'b'])}'`);
      plant(sb, 'zmod', `printf '%s\\n' '{"query":"needle","mode":"exact","total":0,"rows":[]}'`);
    }, 'posix', 'search-arm');
  });

  it('[the-engine-r-ha7uc] runs every module carrying a search verb in discovery order, one group each, the rest not searched, rc 0', async () => {
    const sb = fresh(base);
    const r = await run(sb, ['search', 'needle', '--json']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    const a = JSON.parse(r.stdout);
    expect(a.query).toBe('needle');
    const groups = a.groups.map((g: { module: string; status: string }) => `${g.module} ${g.status}`);
    expect(groups).toEqual(['hmod ok', 'lane not searched', 'rhythm not searched', 'store not searched', 'unit ok', 'zmod ok']);
    expect(a.groups[0]).toEqual({ module: 'hmod', status: 'ok', mode: 'exact', total: 3, rows: JSON.parse(`[${row('hmod', 'a')},${row('hmod', 'b')}]`) });
  });

  it('[the-engine-r-ha7uc] the text form prints each group, its rows with their reads, then the closing line', async () => {
    const r = await run(fresh(base), ['search', 'needle']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      [
        'hmod: 2 of 3',
        '  item hmod#c/a: a needle a',
        '    read: ctx hmod get c/a',
        '  item hmod#c/b: a needle b',
        '    read: ctx hmod get c/b',
        'unit: 0 of 0',
        'zmod: 0 of 0',
        'searched 3, failed 0, not searched 3 (lane, rhythm, store)',
        '',
      ].join('\n'),
    );
  });

  it('[the-engine-r-ha7uc] each child gets the query, the shared flags in the --flag=value form, --json, the marker, and no stdin', async () => {
    const sb = fresh(base);
    plant(sb, 'amod', `printf '%s\\n' "$@" > "$CTX_ROOT/amod.args"; printf 'marker=%s module=%s\\n' "$CTX_SEARCH_FANOUT" "\${CTX_MODULE_DIR##*/}" >> "$CTX_ROOT/amod.args"; cat >> "$CTX_ROOT/amod.args"; printf '%s\\n' '${answer('amod', 0, [])}'`);
    const r = await run(sb, ['search', 'needle', '--type=item', '--limit=5', '--module=amod'], { input: 'stdin must not reach\n' });
    expect(r.code, r.stderr).toBe(0);
    expect(readFileSync(join(sb, 'amod.args'), 'utf8')).toBe('needle\n--type=item\n--mode=exact\n--limit=5\n--json\nmarker=1 module=amod\n');
  });

  it('[the-engine-r-ha7uc] a failing, a malformed, and a short answer each read failed with its reason, the other groups still print, rc 2', async () => {
    const sb = fresh(base);
    plant(sb, 'fmod', `printf 'fmod: the search broke\\n' >&2; exit 3`);
    plant(sb, 'mmod', `printf '{not json\\n'`);
    plant(sb, 'rmod', `printf '%s\\n' '{"query":"needle","mode":"exact","total":1,"rows":[{"module":"rmod","container":"c","type":"item","id":"x","address":"rmod#x","snippet":"s"}]}'`);
    const r = await run(sb, ['search', 'needle', '--json']);
    expect(r.code).toBe(2);
    const g = Object.fromEntries(JSON.parse(r.stdout).groups.map((x: { module: string }) => [x.module, x]));
    expect(g.fmod).toEqual({ module: 'fmod', status: 'failed', error: 'fmod: the search broke' });
    expect(g.mmod.status).toBe('failed');
    expect(g.mmod.error).toMatch(/^malformed answer: /);
    expect(g.rmod).toEqual({ module: 'rmod', status: 'failed', error: 'row 1 carries no read' });
    expect(g.hmod.status).toBe('ok');
    const text = await run(sb, ['search', 'needle']);
    expect(text.code).toBe(2);
    expect(text.stdout).toContain('fmod: failed: fmod: the search broke\n');
    expect(text.stdout).toMatch(/^searched 6, failed 3 \(fmod, mmod, rmod\), not searched 3 \(lane, rhythm, store\)$/m);
  });

  it('[the-engine-r-ha7uc] a child\'s stderr on success prints after the results, prefixed with its module name', async () => {
    const sb = fresh(base);
    plant(sb, 'emod', `printf 'a warning\\n' >&2; printf '%s\\n' '${answer('emod', 0, [])}'`);
    const r = await run(sb, ['search', 'needle', '--module=emod']);
    expect([r.code, r.stderr]).toEqual([0, 'emod: a warning\n']);
  });

  it.for(['sh', 'dash'])('[the-engine-r-ha7uc] under %s a module past search.timeout is stopped with its grandchild, reads failed, no process survives, and the shell reports no job', async (shell, { skip }) => {
    if (shell === 'dash' && !existsSync('/bin/dash')) skip();
    const sb = fresh(base);
    const bound = 5;
    writeFileSync(join(sb, '.contexture/config'), `search.timeout: ${bound}\n`);
    plant(sb, 'smod', `sleep 30 & printf '%s\\n%s\\n' "$!" "$$" > "$CTX_ROOT/smod.pids"; sleep 30`);
    const started = Date.now();
    const r = await exec(shell, ['.contexture/ctx', 'search', 'needle', '--module=smod', '--json'], { cwd: sb, timeout: 20_000 });
    expect(Date.now() - started).toBeLessThan(bound * 1000 + 9_000);
    expect([r.code, r.stderr]).toEqual([2, '']);
    expect(JSON.parse(r.stdout).groups).toEqual([{ module: 'smod', status: 'failed', error: `no answer within the bound of ${bound} s (search.timeout)` }]);
    const pids = readFileSync(join(sb, 'smod.pids'), 'utf8').split('\n').filter(Boolean);
    expect(pids).toHaveLength(2);
    expect(pids.filter(procAlive)).toEqual([]);
    expect(readdirSync(join(sb, '.contexture/tmp')).filter((n) => n.includes('search'))).toEqual([]);
  });

  it.for(['sh', 'dash'])('[the-engine-r-ha7uc] under %s a TERM to the engine mid search stops the running child with its grandchild and removes the run\'s scratch, rc 143', async (shell, { skip }) => {
    if (shell === 'dash' && !existsSync('/bin/dash')) skip();
    const sb = fresh(base);
    const pidFile = join(sb, 'imod.pids');
    const written = (): string[] => (existsSync(pidFile) ? readFileSync(pidFile, 'utf8').split('\n').filter(Boolean) : []);
    writeFileSync(join(sb, '.contexture/config'), 'search.timeout: 120\n');
    plant(sb, 'imod', `sleep 120 & printf '%s\\n%s\\n' "$!" "$$" > "$CTX_ROOT/imod.pids"; sleep 120`);
    const { result, signal } = launch(shell, ['.contexture/ctx', 'search', 'needle', '--module=imod'], { cwd: sb, timeout: 90_000 });
    const started = Date.now();
    while (written().length < 2 && Date.now() - started < 60_000) await new Promise((done) => setTimeout(done, 50));
    const pids = written();
    expect(pids).toHaveLength(2);
    signal('SIGTERM');
    const r = await result;
    expect([r.code, r.stderr]).toEqual([143, '']);
    expect(pids.filter(procAlive)).toEqual([]);
    expect(readdirSync(join(sb, '.contexture/tmp')).filter((n) => n.includes('search'))).toEqual([]);
  });

  it.for([
    ['an unknown flag', ['needle', '--entity=x'], "ctx search: unknown option '--entity=x' (the --flag=value forms: --type=, --mode=, --limit=, --module=, and --json; or --modes)"],
    ['a bare value form', ['needle', '--limit', '5'], "ctx search: unknown option '--limit' (the --flag=value forms: --type=, --mode=, --limit=, --module=, and --json; or --modes)"],
    ['a second query', ['needle', 'pin'], "ctx search: unexpected argument 'pin' (one query)"],
    ['no query', [], 'ctx search: a query is required: ctx search "<query>" (or ctx search --modes)'],
    ['a blank query', ['   '], 'ctx search: empty query'],
    ['a carriage return', ['nee\rdle'], 'ctx search: a carriage return in the query'],
    ['a zero limit', ['needle', '--limit=0'], "ctx search: --limit takes a positive whole number: '0'"],
    ['a word limit', ['needle', '--limit=many'], "ctx search: --limit takes a positive whole number: 'many'"],
    ['an unknown module', ['needle', '--module=nomod'], 'ctx search: unknown module nomod'],
    ['a module without a search verb', ['needle', '--module=lane'], 'ctx search: module lane carries no search verb'],
    ['an unregistered mode', ['needle', '--mode=hybrid'], "ctx search: mode 'hybrid' is not registered; registered modes: exact"],
    ['--modes beside a query', ['needle', '--modes'], 'ctx search: --modes takes no query and no flag but --json'],
    ['--modes beside a flag at its default value', ['--modes', '--limit=20'], 'ctx search: --modes takes no query and no flag but --json'],
    ['an empty --module', ['needle', '--module='], 'ctx search: --module= names no module'],
    ['a query beginning with a dash, the stated limit', ['-needle'], "ctx search: unknown option '-needle' (the --flag=value forms: --type=, --mode=, --limit=, --module=, and --json; or --modes)"],
  ] as const)('[the-engine-r-ha7uc] refuses %s rc 1 with one stderr line, nothing run', async ([, args, line]) => {
    const sb = fresh(base);
    plant(sb, 'tmod', `: > "$CTX_ROOT/tmod.ran"; printf '%s\\n' '${answer('tmod', 0, [])}'`);
    const r = await run(sb, ['search', ...args]);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', `${line}\n`]);
    expect(existsSync(join(sb, 'tmod.ran'))).toBe(false);
  });

  it('[the-engine-r-ha7uc] a search.timeout that is not a positive whole number refuses rc 1 naming the key', async () => {
    const sb = fresh(base);
    writeFileSync(join(sb, '.contexture/config'), 'search.timeout = "ten" # seconds\n');
    const r = await run(sb, ['search', 'needle']);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, '', "ctx search: search.timeout takes a positive whole number of seconds: 'ten'\n"]);
    writeFileSync(join(sb, '.contexture/config'), 'search.timeout: ten # a=5\n');
    const colon = await run(sb, ['search', 'needle']);
    expect([colon.code, colon.stdout, colon.stderr]).toEqual([1, '', "ctx search: search.timeout takes a positive whole number of seconds: 'ten'\n"]);
  });

  it('[the-engine-r-ha7uc] the query word help reaches every module as its query, and the --json answer encodes every control character of the query', async () => {
    const sb = fresh(base);
    const r = await run(sb, ['search', 'help', '--json']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(JSON.parse(r.stdout).groups.map((g: { module: string; status: string }) => `${g.module} ${g.status}`)).toEqual(['hmod ok', 'lane not searched', 'rhythm not searched', 'store not searched', 'unit ok', 'zmod ok']);
    const q = 'nee\u001bdle\tx';
    const c = await run(sb, ['search', q, '--json', '--module=unit']);
    expect([c.code, c.stderr]).toEqual([0, '']);
    expect(JSON.parse(c.stdout).query).toBe(q);
  });

  it('[the-engine-r-ha7uc] the discovery stays quiet: a module whose verb table warns prints nothing on stderr', async () => {
    const sb = fresh(base);
    writeModule(sb, 'modules', 'wmod', { manifest: MANIFEST('wmod'), files: { 'scripts/search': SEARCH(`printf '%s\\n' '${answer('wmod', 0, [])}'`), 'scripts/help': shVerb('a help script the engine ignores', 'echo help') } });
    for (const args of [['needle'], ['needle', '--module=wmod']]) {
      const r = await run(sb, ['search', ...args]);
      expect([r.code, r.stderr]).toEqual([0, '']);
    }
  });

  it('[the-engine-r-ha7uc, the-engine-r4] --help answers rc 0 on stdout with an empty stderr from the arm; ctx help prints its one usage line', async () => {
    const sb = fresh(base);
    for (const flag of ['--help', '-h']) {
      const r = await run(sb, ['search', flag]);
      expect([r.code, r.stderr]).toEqual([0, '']);
      expect(r.stdout.split('\n')[0]).toBe('usage: ctx search "<query>" [--type=<type>] [--mode=<mode>] [--limit=N] [--json] [--module=<name>]');
    }
    const top = await run(sb, ['help']);
    expect(top.stdout.split('\n').filter((l) => l.startsWith('  ctx search '))).toHaveLength(1);
  });

  it('[the-engine-r-ha7uc] --modes lists the registry with descriptions, --json the list; exact alone under posix', async () => {
    const sb = fresh(base);
    const text = await run(sb, ['search', '--modes']);
    expect([text.code, text.stderr]).toEqual([0, '']);
    expect(text.stdout).toBe('exact      a case-insensitive substring of one line, the first matching line as the snippet, alike on every driver\n');
    const json = await run(sb, ['search', '--modes', '--json']);
    expect(JSON.parse(json.stdout)).toEqual([{ name: 'exact', description: 'a case-insensitive substring of one line, the first matching line as the snippet, alike on every driver' }]);
  });

  it('[the-engine-r-ha7uc] with no module carrying a search verb the run exits 0 and its closing line says so', async () => {
    const sb = stage('posix', 'search-none');
    for (const m of ['unit']) writeFileSync(join(sb, '.contexture/modules', m, 'scripts/search'), '#!/bin/sh\n# private now\n');
    const r = await run(sb, ['search', 'needle']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^searched 0, failed 0, not searched \d+ \(.*\): no module carries a search verb$/m);
  });
});

describe.skipIf(!fts5Available())('the ctx search builtin over the fts5 registry', () => {
  it('[the-engine-r-ha7uc] a module that cannot answer a registered mode falls back to exact and its group says so', async () => {
    const sb = stage('fts5', 'search-fallback');
    writeModule(sb, 'modules', 'xmod', { manifest: MANIFEST('xmod'), files: { 'scripts/search': SEARCH(`printf '%s\\n' '${answer('xmod', 1, ['a'])}'`) } });
    const r = await run(sb, ['search', 'needle', '--mode=hybrid', '--module=xmod']);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe('xmod: 1 of 1, mode exact (asked hybrid)');
  });
});
