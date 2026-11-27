import { appendFileSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { kids, walk } from './walk';

// The durable write census: every write primitive of the shipped core, the packages, the
// installer, and the worked package lands in scratch or stands on the table's allow list under
// its class (durable-writes.awk holds the rules, durable-writes.txt the names and the list).
const CENSUS = join(ROOT, 'tests/governance/durable-writes.awk');
const TABLE = join(ROOT, 'tests/governance/durable-writes.txt');
const CLASSES = ['store', 'config', 'laws', 'overlay', 'backups', 'graph', 'payload', 'tmp-fallback'];
const DECLARATION = /\/(data|laws|module|manifest|config|schema\.sql|doc\.grammar)$/;

const one = (path: string): string[] => (existsSync(path) && statSync(path).isFile() ? [path] : []);
const shipped = (path: string): boolean => !path.endsWith('.md') && !(DECLARATION.test(path) && !readFileSync(path, 'utf8').startsWith('#!'));

const SCAN_ROOTS: readonly [name: string, files: (root: string) => string[], floor: number][] = [
  ['the base drawer', (root) => walk(join(root, 'base/.contexture')), 75],
  ['the plugin drawer trees', (root) => kids(join(root, 'plugins')).flatMap((p) => walk(join(p, '.contexture'))), 45],
  ['the plugin hooks', (root) => kids(join(root, 'plugins')).flatMap((p) => walk(join(p, 'hooks'))), 5],
  ['the installer', (root) => one(join(root, 'install.sh')), 1],
  ['the worked package', (root) => walk(join(root, 'tests/fixtures/worked-package'), (p) => p.endsWith('/tests')), 5],
];

type Census = { code: number; stdout: string; stderr: string; remainder: string[]; dead: string[]; unproven: string[]; classes: Record<string, number>; summary: number[] };

async function census(root: string, files: readonly string[], table = TABLE): Promise<Census> {
  const r = await exec('awk', ['-f', CENSUS, ...files], { cwd: sandbox('durable-writes'), input: '', env: { CENSUS_TABLE: table, CENSUS_ROOT: root } });
  const lines = r.stdout.split('\n');
  const classes: Record<string, number> = {};
  for (const l of lines) {
    const m = /^class (\S+) (\d+)$/.exec(l);
    if (m) classes[m[1]!] = Number(m[2]);
  }
  const s = /^census: files (\d+) flagged (\d+) = scratch (\d+) \+ listed (\d+) \+ remainder (\d+)$/m.exec(r.stdout);
  return {
    code: r.code,
    stdout: r.stdout,
    stderr: r.stderr,
    remainder: lines.filter((l) => l.startsWith('REMAINDER ')),
    dead: lines.filter((l) => l.startsWith('DEAD ')),
    unproven: lines.filter((l) => l.startsWith('UNPROVEN ')),
    classes,
    summary: s ? s.slice(1).map(Number) : [],
  };
}

function scope(root: string) {
  const counts: Record<string, number> = {};
  const files: string[] = [];
  for (const [name, list] of SCAN_ROOTS) {
    const scanned = list(root).filter(shipped);
    counts[name] = scanned.length;
    files.push(...scanned);
  }
  return { counts, files: [...new Set(files)] };
}

// planted: one shipped file copied into a sandbox tree at its own path, the plant appended
function planted(rel: string, lines: readonly string[]): { root: string; file: string } {
  const root = sandbox('durable-plant');
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  copyFileSync(join(ROOT, rel), file);
  appendFileSync(file, `${lines.join('\n')}\n`);
  return { root, file };
}

const STORE = 'base/.contexture/modules/store/scripts/store';
const RENDER = 'base/.contexture/modules/unit/lib/render.awk';
const GRAPH_TS = 'plugins/ast-doc-graph/.contexture/extensions/modules/ast-doc-graph/loader/index-graph.ts';

async function plantedRemainder(rel: string, lines: readonly string[]): Promise<string[]> {
  const p = planted(rel, lines);
  return (await census(p.root, [p.file])).remainder;
}

describe.concurrent('the durable write census: every write outside the store lands in scratch or stands on the allow list', () => {
  it('[the-record-r10, modules-r-xdxq4] every write primitive of the shipped core, the packages, the installer, and the worked package is scratch or listed, the flagged count equal to scratch plus listed plus remainder, no entry dead or unproven', async () => {
    const s = scope(ROOT);
    for (const [name, , floor] of SCAN_ROOTS) expect(s.counts[name], `${name} scanned too few files`).toBeGreaterThanOrEqual(floor);
    const r = await census(ROOT, s.files);
    expect(r.stderr).toBe('');
    expect(r.remainder.join('\n')).toBe('');
    expect(r.dead.join('\n')).toBe('');
    expect(r.unproven.join('\n')).toBe('');
    const [files, flagged, scratch, listed, remainder] = r.summary;
    expect(files).toBe(s.files.length);
    expect(remainder).toBe(0);
    expect(flagged).toBe(scratch! + listed! + remainder!);
    expect(scratch).toBeGreaterThan(1000);
    expect(Object.keys(r.classes).sort()).toEqual([...CLASSES].sort());
    expect(Object.values(r.classes).reduce((a, b) => a + b, 0)).toBe(listed);
    expect(r.code).toBe(0);
  });

  it('[the-record-r10] a dead allow list line, a dead scratch name, and a dead bound name each read red', async () => {
    const s = scope(ROOT);
    const table = join(sandbox('durable-dead'), 'table.txt');
    cpSync(TABLE, table);
    appendFileSync(table, ['store\tbase/.contexture/ctx\ta line no file holds\t  rm -rf "$CTX_ROOT/gone"', 'scratch\tbase/.contexture/ctx\tNO_SUCH_SCRATCH\ta name no line uses', 'bound\tinstall.sh\tNO_SUCH_BOUND\ta name no line uses', ''].join('\n'));
    const r = await census(ROOT, s.files, table);
    expect(r.code).toBe(1);
    expect(r.remainder).toEqual([]);
    expect(r.dead.sort()).toEqual(['DEAD bound install.sh: NO_SUCH_BOUND', 'DEAD listed base/.contexture/ctx:   rm -rf "$CTX_ROOT/gone"', 'DEAD scratch base/.contexture/ctx: NO_SUCH_SCRATCH']);
  });

  it('[the-record-r10] an empty census reads red: no file, no flagged line', async () => {
    const r = await census(ROOT, []);
    expect(r.code).toBe(1);
    expect(r.summary[1]).toBe(0);
  });

  it('[the-record-r10] a from name its source file does not prove reads red', async () => {
    const s = scope(ROOT);
    const table = join(sandbox('durable-from'), 'table.txt');
    cpSync(TABLE, table);
    const body = readFileSync(table, 'utf8').replace('from\tbase/.contexture/modules/unit/scripts/load\tVB_DIR\tbase/.contexture/modules/unit/lib/verb.sh', 'from\tbase/.contexture/modules/unit/scripts/load\tVB_DIR\tbase/.contexture/modules/unit/scripts/board');
    writeFileSync(table, body);
    const r = await census(ROOT, s.files, table);
    expect(r.code).toBe(1);
    expect(r.unproven).toEqual(['UNPROVEN from base/.contexture/modules/unit/scripts/load: VB_DIR is no scratch variable base/.contexture/modules/unit/scripts/board proves by assignment']);
  });

  it.each([
    ['a module verb redirect into the drawer outside scratch', STORE, ['printf \'x\\n\' > "$CTX_DIR/notes"']],
    ['a TypeScript writeFileSync into the workspace root', GRAPH_TS, ["fs.writeFileSync(path.join(repoRoot, 'notes.json'), '');"]],
    ['an awk print into a path built from ENVIRON', RENDER, ['END { print "x" > (ENVIRON["CTX_ROOT"] "/notes") }']],
    ['a scratch variable reassigned to a durable path', STORE, ['SCR="$CTX_ROOT/.contexture/notes"']],
    ['a store_get_into into a durable path', STORE, ['store_get_into "$CTX_ROOT/notes.targets"']],
  ])('[the-record-r10, modules-r-xdxq4] %s planted reads red with exactly one remainder', async (_name, rel, lines) => {
    const rest = await plantedRemainder(rel, lines);
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain(lines[lines.length - 1]!);
  });

  it.each([
    ['an append redirect', 'printf x >> "$CTX_ROOT/notes"'],
    ['a clobber redirect', 'printf x >| "$CTX_ROOT/notes"'],
    ['a stderr redirect into a file', 'printf x 2> "$CTX_ROOT/notes"'],
    ['a mkdir', 'mkdir -p "$CTX_ROOT/notes"'],
    ['a mv', 'mv "$SCR/a" "$CTX_ROOT/notes"'],
    ['a cp', 'cp "$SCR/a" "$CTX_ROOT/notes"'],
    ['a ln', 'ln -s "$SCR/a" "$CTX_ROOT/notes"'],
    ['a tee', 'printf x | tee "$CTX_ROOT/notes"'],
    ['a touch', 'touch "$CTX_ROOT/notes"'],
    ['an install', 'install -m 644 "$SCR/a" "$CTX_ROOT/notes"'],
    ['a dd', 'dd if="$SCR/a" of="$CTX_ROOT/notes"'],
    ['a mktemp outside scratch', 'n=$(mktemp "$CTX_ROOT/notes.XXXXXX")'],
    ['a mktemp in the system temp', 'n=$(mktemp)'],
    ['a rm', 'rm -f "$CTX_ROOT/notes"'],
    ['a rmdir', 'rmdir "$CTX_ROOT/notes"'],
    ['a chmod', 'chmod 600 "$CTX_ROOT/notes"'],
    ['a sed -i', 'sed -i \'s/a/b/\' "$CTX_ROOT/notes"'],
    ['a tar extraction', 'tar -xzf "$SCR/a.tgz" -C "$CTX_ROOT/notes"'],
    ['a gzip', 'gzip "$CTX_ROOT/notes"'],
    ['a curl -o', 'curl -fsSL -o "$CTX_ROOT/notes" https://example.invalid/x'],
    ['a wget', 'wget https://example.invalid/x'],
    ['a sqlite3 on a database file', 'sqlite3 "$CTX_ROOT/notes.db" "SELECT 1;"'],
    ['a sqlite binary variable on a database file', '"$SQLITE_BIN" "$CTX_ROOT/notes.db" "SELECT 1;"'],
    ['an awk print redirect inside a shell script', 'awk \'{ print > "notes" }\' "$SCR/a"'],
    ['an awk system() that writes', 'awk \'BEGIN { system("rm -f notes") }\''],
    ['an awk pipe into a command that writes', 'awk \'{ print | "cat > notes" }\' "$SCR/a"'],
    ['a fields_apply into a durable path', 'fields_apply "$SCR/d" "$SCR/o" "$SCR/a" "$CTX_ROOT/notes"'],
    ['a fields_own into a durable path', 'fields_own "$CTX_ROOT/notes"'],
    ['a fields_put into a durable path', 'fields_put k "$SCR/a" "$CTX_ROOT/notes"'],
    ['a fields_set into a durable path', 'fields_set k "$SCR/a" "$CTX_ROOT/notes"'],
    ['a fields_get into a durable path', 'fields_get k "$CTX_ROOT/notes"'],
    ['a scratch helper handed a durable path', 'scr_new "$CTX_ROOT/notes"'],
    ['a new reach into the system temp', 'printf x > "${TMPDIR:-/tmp}/notes"'],
    ['a write after an assignment word and env', 'LC_ALL=C env rm -f "$CTX_ROOT/notes"'],
    ['a write in a case arm', 'case "$x" in a) rm -f "$CTX_ROOT/notes" ;; esac'],
    ['a write inside a substitution', 'v=$(printf x > "$CTX_ROOT/notes")'],
  ])('[the-record-r10] the census flags %s planted in a module', async (_name, line) => {
    const rest = await plantedRemainder(STORE, [line]);
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain(line);
  });

  it.each([
    ['an awk printf redirect', 'END { printf "%s", x > ("notes" ".txt") }'],
    ['an awk print pipe into a writing command', 'END { print x | ("sort > " ENVIRON["CTX_ROOT"] "/notes") }'],
    ['an awk system() through a variable assigned a writing command', 'END { notes_cmd = "rm -f " ENVIRON["CTX_ROOT"] "/notes"; system(notes_cmd) }'],
  ])('[the-record-r10] the census flags %s planted in an awk file', async (_name, line) => {
    const rest = await plantedRemainder(RENDER, [line]);
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain(line);
  });

  it.each([
    ['a renameSync', "fs.renameSync(tmp, path.join(repoRoot, 'notes.json'));"],
    ['a rmSync', "fs.rmSync(path.join(repoRoot, 'notes'), { recursive: true });"],
    ['a database open', "const notes = new DatabaseSync(path.join(repoRoot, 'notes.db'));"],
    ['a sqlite3 run', "execFileSync(sqliteBin, ['-bail', path.join(repoRoot, 'notes.db')]);"],
  ])('[the-record-r10] the census flags %s planted in a TypeScript file', async (_name, line) => {
    const rest = await plantedRemainder(GRAPH_TS, [line]);
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain(line);
  });

  it.each([
    ['a redirect into the null device', 'printf x > /dev/null'],
    ['a descriptor dup', 'printf x >&2'],
    ['a write under the per verb scratch root', 'mkdir -p "$CTX_SCRATCH_ROOT/notes"'],
    ['a write under the drawer scratch folder', 'printf x > "$CTX_ROOT/.contexture/tmp/notes"'],
    ['a mktemp of a drawer scratch template', 'n=$(mktemp "$CTX_DIR/tmp/notes.XXXXXX")'],
    ['a write through a proven scratch variable', 'printf x > "$SCR/notes"'],
    ['a sqlite3 on the memory database', 'sqlite3 :memory: "SELECT 1;"'],
    ['an awk print into stderr', 'awk \'{ print > "/dev/stderr" }\' "$SCR/a"'],
    ['an awk pipe into a command that writes nothing', 'awk \'{ print | "sort" }\' "$SCR/a"'],
    ['a sed without -i', 'sed -n \'1p\' "$CTX_ROOT/notes"'],
    ['a curl to stdout', 'curl -fsSL https://example.invalid/x'],
    ['a wget to stdout', 'wget -O - https://example.invalid/x'],
    ['a comment line', '# rm -rf "$CTX_ROOT/notes"'],
    ['a write word in help text', 'printf \'usage: rm, mv, or mkdir > a file\\n\''],
    ['a scratch helper handed a scratch file', 'scr_new "$SCR/notes"'],
  ])('[the-record-r10] a planted line that writes nothing outside scratch adds no remainder: %s', async (_name, line) => {
    expect(await plantedRemainder(STORE, [line])).toEqual([]);
  });
});
