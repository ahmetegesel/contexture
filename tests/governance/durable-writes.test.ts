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
const GRAPH_INDEX = 'plugins/ast-doc-graph/.contexture/extensions/modules/ast-doc-graph/bin/ast-doc-index';
const COMPOSE = 'base/.contexture/laws/compose';
const LOAD = 'base/.contexture/modules/unit/scripts/load';
const VERB = 'base/.contexture/modules/unit/lib/verb.sh';

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

  it('[the-record-r10] each allow list line allows one line: a second entry for a text one line holds reads dead, and a copied listed line reads one remainder', async () => {
    const s = scope(ROOT);
    const table = join(sandbox('durable-twice'), 'table.txt');
    cpSync(TABLE, table);
    const entry = 'laws\tbase/.contexture/laws/compose\tthe composer writes the generated law layer and removes the legacy layer\t  mv -f "$work/generated" "$out" || die 2 "cannot write AGENTS.generated.md"';
    expect(readFileSync(table, 'utf8').split('\n')).toContain(entry);
    appendFileSync(table, `${entry}\n`);
    const r = await census(ROOT, s.files, table);
    expect(r.code).toBe(1);
    expect(r.remainder).toEqual([]);
    expect(r.dead).toEqual(['DEAD listed base/.contexture/laws/compose:   mv -f "$work/generated" "$out" || die 2 "cannot write AGENTS.generated.md"']);
    const copied = await plantedRemainder(COMPOSE, ['  mv -f "$work/generated" "$out" || die 2 "cannot write AGENTS.generated.md"']);
    expect(copied).toHaveLength(1);
    expect(copied[0]).toContain('already holds another line');
  });

  it('[the-record-r10, modules-r-xdxq4] a variable taken from a sourced file and reassigned to a durable path in the file that takes it reads red', async () => {
    const root = sandbox('durable-from-plant');
    for (const rel of [VERB, LOAD]) {
      mkdirSync(dirname(join(root, rel)), { recursive: true });
      copyFileSync(join(ROOT, rel), join(root, rel));
    }
    const clean = await census(root, [join(root, VERB), join(root, LOAD)]);
    expect(clean.remainder).toEqual([]);
    appendFileSync(join(root, LOAD), 'VB_DIR="$CTX_ROOT/keep"\nprintf x > "$VB_DIR/notes"\n');
    const r = await census(root, [join(root, VERB), join(root, LOAD)]);
    expect(r.remainder).toHaveLength(1);
    expect(r.remainder[0]).toContain('VB_DIR="$CTX_ROOT/keep"');
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
    ['a dot dot segment under a scratch variable', 'printf x > "$SCR/../../units/notes"'],
    ['a dot dot segment under the drawer scratch folder', 'rm -rf ".contexture/tmp/../units"'],
    ['a dot dot segment under the per verb scratch root', 'rm -rf "$CTX_SCRATCH_ROOT/../.."'],
    ['a cd and pwd form climbing out of scratch', 'printf x > "$(cd "$SCR/../.." && pwd)/notes"'],
    ['a scratch variable reassigned above its root', 'SCR="$CTX_SCRATCH_ROOT/.."'],
    ['the first segment of a scratch path', 'rm -rf "${SCR%%/*}"'],
    ['an rm whose operands xargs reads', 'printf "%s\\n" "$CTX_ROOT/notes" | xargs rm -f'],
    ['an rm after command -p', 'command -p rm -f "$CTX_ROOT/notes"'],
    ['an rm after env -u', 'env -u LANG rm -f "$CTX_ROOT/notes"'],
    ['a curl -o closing an option cluster', 'curl -fsSLo "$CTX_ROOT/notes" https://example.invalid/x'],
    ['a curl --output=', 'curl --output="$CTX_ROOT/notes" https://example.invalid/x'],
    ['a curl -o with its path attached', 'curl -o"$CTX_ROOT/notes" https://example.invalid/x'],
    ['an awk print redirect in a double quoted program', 'awk "BEGIN { print \\"x\\" > \\"$CTX_ROOT/notes\\" }"'],
    ['a scratch variable reassigned by a for without in', 'for SCR do printf x > "$SCR/notes"; done'],
    ['a sort -o', 'sort -o "$CTX_ROOT/notes" "$SCR/a"'],
    ['a sort -o closing an option cluster', 'sort -uo "$CTX_ROOT/notes" "$SCR/a"'],
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
    ['a write after a here-document whose delimiter is no identifier', STORE, ["cat <<'END-X' > /dev/null", 'body', 'END-X', 'printf x > "$CTX_ROOT/notes"']],
    ['a write after a here-document whose delimiter is backslash quoted', STORE, ['cat <<\\EOF > /dev/null', "don't", 'EOF', 'rm -f "$CTX_ROOT/notes"']],
    ['a write after a shift in a bash arithmetic command, which opens no here-document', GRAPH_INDEX, ['(( n = 1 << 2 ))', 'printf x > "$REPO_ROOT/notes"']],
    ['a bash >& redirect into a file', GRAPH_INDEX, ['echo x >& "$REPO_ROOT/notes"']],
    ['a scratch variable reassigned by declare', GRAPH_INDEX, ['declare SCRATCH_BASE="$REPO_ROOT/keep"']],
    ['an fs write through a namespace import of another name', GRAPH_TS, ["import * as nodeFs from 'node:fs';", "nodeFs.writeFileSync(path.join(repoRoot, 'notes.json'), '');"]],
    ['an fs write through a default import of another name', GRAPH_TS, ["import fsx from 'fs';", "fsx.rmSync(path.join(repoRoot, 'notes'), { recursive: true });"]],
    ['an fs write through a renamed named import of fs/promises', GRAPH_TS, ["import { writeFile as save } from 'node:fs/promises';", "await save(path.join(repoRoot, 'notes'), '');"]],
    ['an fs open for writing', GRAPH_TS, ["fs.openSync(path.join(repoRoot, 'notes'), 'w');"]],
  ])('[the-record-r10] the census flags %s', async (_name, rel, lines) => {
    const rest = await plantedRemainder(rel, lines);
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain(lines[lines.length - 1]!);
  });

  it.each([
    ['a command -v lookup', STORE, ['command -v rm >/dev/null 2>&1']],
    ['a double quoted awk program writing scratch', STORE, ['awk "BEGIN { print \\"x\\" > \\"$SCR/notes\\" }"']],
    ['an awk program held in a variable beside a -v', STORE, ['awk -v x="$SCR/a" "$PROG" "$SCR/b"']],
    ['a descriptor close', STORE, ['printf x >&-']],
    ['a quoted here-document with a quote in its body before a scratch write', STORE, ["cat <<'EOF' > \"$SCR/notes\"", "it's", 'EOF', 'printf x > "$SCR/more"']],
    ['a sort -o into scratch and a sort that only reads', STORE, ['sort -u -o "$SCR/a" "$SCR/a"', 'sort -t, -k1,1 "$SCR/a" > "$SCR/b"']],
    ['an xargs that only reads', STORE, ['printf "%s\\n" "$SCR/a" | xargs cat > "$SCR/b"']],
    ['a curl writing out its effective address with -o into the null device', STORE, ['curl -fsSL -w "%{url_effective}" -o /dev/null https://example.invalid/x']],
    ['a dot dot path read, never written', STORE, ['cat "$SCR/../x" > "$SCR/y"']],
    ['an fs open for reading', GRAPH_TS, ["fs.openSync(path.join(repoRoot, 'notes'), 'r');", "const fd = fs.openSync(path.join(repoRoot, 'notes'));"]],
  ])('[the-record-r10] a planted shape that writes nothing outside scratch adds no remainder: %s', async (_name, rel, lines) => {
    expect(await plantedRemainder(rel, lines)).toEqual([]);
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
