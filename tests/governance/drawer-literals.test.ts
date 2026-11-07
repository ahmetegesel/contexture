import { appendFileSync, cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { kids, moduleDirs, text, walk } from './walk';

const DRAWER_LITERAL = /\.contexture\/(sessions|units)|sessions\.db|tmp\/locks|locks\/unit|store-[^ \/]*\.lock/;
const COMMENT = /^[ \t]*(#|\/\/)/;

const UNIT = 'base/.contexture/modules/unit';
const POSIX = 'base/.contexture/storage/drivers/posix/driver';
const FTS5 = 'plugins/storage-fts5/.contexture/extensions/storage/drivers/fts5/driver';

const OWNERS: readonly [file: string, line: string, why: string][] = [
  [`${UNIT}/data`, 'root: .contexture/units', 'the record root, declared once by the unit module'],
  [`${UNIT}/data`, 'fallback_root: .contexture/sessions', 'the record\'s deprecated root, declared once by the unit module'],
  [`${UNIT}/scripts/data`, '  mkdir -p "$u_tmp/locks/unit" 2>/dev/null || u_refuse 2 ERR_STORAGE_WRITE "cannot create the lock folder"', 'the unit lock folder (u_lock)'],
  [`${UNIT}/scripts/data`, '  U_LT="$u_tmp/locks/unit/$1.lock"', 'the unit lock (u_lock)'],
  [POSIX, '  sl_lock="$(get_lock_dir)/store-$1.lock"', 'the posix namespace lock (store_lock)'],
  [POSIX, '  lh_lock="$lh_tmp/locks/store-$1.lock"', 'the posix namespace lock probe (store_lock_held)'],
  [FTS5, '  DB_PATH="$ROOT/.contexture/sessions.db"', 'the fts5 database default name'],
  [FTS5, '  sl_lock="$LOCK_BASE/locks/store-$1.lock"', 'the fts5 namespace lock (store_lock)'],
  [FTS5, '  lh_lock="$LOCK_BASE/locks/store-$1.lock"', 'the fts5 namespace lock probe (store_lock_held)'],
];

const owned = new Set(OWNERS.map(([file, line]) => `${file}\n${line}`));

const one = (path: string): string[] => (existsSync(path) && statSync(path).isFile() ? [path] : []);

const SCAN_ROOTS: readonly [name: string, files: (root: string) => string[], floor: number][] = [
  ['the storage core', (root) => walk(join(root, 'base/.contexture/storage')), 7],
  ['the plugin storage drivers', (root) => kids(join(root, 'plugins')).flatMap((p) => walk(join(p, '.contexture/extensions/storage/drivers'))), 3],
  ['the engine', (root) => one(join(root, 'base/.contexture/ctx')), 1],
  ['the composer', (root) => one(join(root, 'base/.contexture/laws/compose')), 1],
  ['the package installer', (root) => one(join(root, 'base/.contexture/package-install')), 1],
  ['the package uninstaller', (root) => one(join(root, 'base/.contexture/package-uninstall')), 1],
  ['the module roots', (root) => moduleDirs(root).flatMap((d) => walk(d)), 80],
];

function scan(root: string) {
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  let flagged = 0;
  const remainder: string[] = [];
  for (const [name, files] of SCAN_ROOTS) {
    const scanned = files(root).filter((f) => !f.endsWith('.md'));
    counts[name] = scanned.length;
    for (const file of scanned) {
      if (seen.has(file)) continue;
      seen.add(file);
      const rel = relative(root, file);
      text(file)
        .split('\n')
        .forEach((line, i) => {
          if (COMMENT.test(line) || !DRAWER_LITERAL.test(line.replace(/["'\\]/g, ''))) return;
          flagged++;
          if (!owned.has(`${rel}\n${line}`)) remainder.push(`${rel}:${i + 1}: ${line}`);
        });
    }
  }
  return { counts, flagged, remainder };
}

const TEST_LITERAL = /\.contexture\/(sessions|units)|sessions\.db|tmp\/locks|locks\/unit|store-[^ \/]*\.lock|\.contexture,\s*(sessions|units)|tmp,\s*locks|locks,\s*unit/;
const TEST_COMMENT = /^[ \t]*(\/\/|\*|\/\*)/;
const HELPER = 'tests/support/drawer.ts';
const QUOTING = ['tests/governance/store-bypass.test.ts', 'tests/governance/drawer-literals.test.ts'];
const LIST_OPEN = /^const (ALLOW|OWNERS|TEST_PATTERNS)\b.*= \[$/;
const PLANTS_OPEN = /^ {2}it\.each\(\[$/;

const TEST_PATTERNS: readonly [file: string, line: string, why: string][] = [
  ['tests/governance/store-bypass.test.ts', "const STORE_REACH = /\\.contexture\\/(sessions|units)|sessions\\.db|storage\\/drivers\\/|drivers\\/[a-z0-9_-]+\\/driver|driver-resolver[^|;]* resolve([^a-z]|$)|sqlite3|tmp\\/locks/;", 'the store-bypass pattern'],
  ['tests/governance/drawer-literals.test.ts', 'const DRAWER_LITERAL = /\\.contexture\\/(sessions|units)|sessions\\.db|tmp\\/locks|locks\\/unit|store-[^ \\/]*\\.lock/;', 'the census pattern'],
  ['tests/governance/drawer-literals.test.ts', 'const TEST_LITERAL = /\\.contexture\\/(sessions|units)|sessions\\.db|tmp\\/locks|locks\\/unit|store-[^ \\/]*\\.lock|\\.contexture,\\s*(sessions|units)|tmp,\\s*locks|locks,\\s*unit/;', 'the census pattern over the tests'],
];

const patternLines = new Set(TEST_PATTERNS.map(([file, line]) => `${file}\n${line}`));

const TEST_ROOTS: readonly [name: string, files: (root: string) => string[], floor: number][] = [
  ['the core tests', (root) => walk(join(root, 'tests'), skipped), 100],
  ['the plugin tests', (root) => kids(join(root, 'plugins')).flatMap((p) => walk(join(p, 'tests'), skipped)), 20],
];

function skipped(path: string): boolean {
  return /\/(node_modules|\.reports)$/.test(path);
}

function quotedRegions(lines: readonly string[]): Set<number> {
  const inside = new Set<number>();
  let open: 'list' | 'plants' | '' = '';
  lines.forEach((line, i) => {
    if (!open && LIST_OPEN.test(line)) open = 'list';
    else if (!open && PLANTS_OPEN.test(line)) open = 'plants';
    else if (open === 'list' && line === '];') open = '';
    else if (open === 'plants' && /^ {2}\]\)\(/.test(line)) open = '';
    else if (open) inside.add(i);
  });
  return inside;
}

function scanTests(root: string) {
  const counts: Record<string, number> = {};
  let flagged = 0;
  const remainder: string[] = [];
  for (const [name, files] of TEST_ROOTS) {
    const scanned = files(root).filter((f) => /\.m?ts$/.test(f));
    counts[name] = scanned.length;
    for (const file of scanned) {
      const rel = relative(root, file);
      const lines = text(file).split('\n');
      const quoted = QUOTING.includes(rel) ? quotedRegions(lines) : new Set<number>();
      lines.forEach((line, i) => {
        if (TEST_COMMENT.test(line) || !TEST_LITERAL.test(line.replace(/["'`\\]/g, ''))) return;
        flagged++;
        if (rel === HELPER || quoted.has(i) || patternLines.has(`${rel}\n${line}`)) return;
        remainder.push(`${rel}:${i + 1}: ${line}`);
      });
    }
  }
  return { counts, flagged, remainder };
}

function plantedTree(rel: string, line: string): string {
  const tree = sandbox('drawer-plant');
  mkdirSync(dirname(join(tree, rel)), { recursive: true });
  cpSync(join(ROOT, rel), join(tree, rel));
  appendFileSync(join(tree, rel), `${line}\n`);
  return tree;
}

describe.concurrent('the drawer literal census: the record root, the database name, and the lock layout live with their owners', () => {
  it('[the-record-r10] the storage core, the plugin drivers, the engine, the composer, the package overlay, and the module roots name a drawer literal only on an owner line', () => {
    const r = scan(ROOT);
    for (const [name, , floor] of SCAN_ROOTS) expect(r.counts[name], `${name} scanned too few files`).toBeGreaterThanOrEqual(floor);
    expect(r.remainder.join('\n')).toBe('');
    expect(r.flagged).toBe(OWNERS.length);
  });

  it.each([
    ['a record read in a copied posix driver', POSIX, 'cat "$STORE_WS/.contexture/sessions/$1/state.md"'],
    ['a database path in a copied fts5 driver', FTS5, 'sqlite3 "$ROOT/.contexture/sessions.db" "SELECT 1;"'],
    ['a lock folder in a copied composer', 'base/.contexture/laws/compose', 'rm -rf "$root/.contexture/tmp/locks/unit"'],
    ['a record root split by quoting', 'base/.contexture/storage/scripts/library', 'cat "$sr_root/.contexture/"sess"ions/u/state.md"'],
    ['a record root in an escaped regex', 'base/.contexture/storage/scripts/store-data', "grep -E '\\.contexture\\/sessions' \"$sd_file\""],
    ['the new record root in a copied posix driver', POSIX, 'ls "$STORE_WS/.contexture/units"'],
  ])('[the-record-r10] %s reads red with exactly one remainder', (_name, rel, line) => {
    const r = scan(plantedTree(rel, line));
    expect(r.remainder).toHaveLength(1);
    expect(r.remainder[0]).toContain(line);
  });

  it('the tests read the record root, the database name, and the lock layout through tests/support/drawer.ts alone', () => {
    const r = scanTests(ROOT);
    for (const [name, , floor] of TEST_ROOTS) expect(r.counts[name], `${name} scanned too few files`).toBeGreaterThanOrEqual(floor);
    expect(r.remainder.join('\n')).toBe('');
    expect(r.flagged).toBeGreaterThan(TEST_PATTERNS.length);
  });

  it.each([
    ['a record path in a core test', 'tests/drivers/store-posix.test.ts', "const planted = join(sb, '.contexture/sessions/u/state.md');"],
    ['a join split record root in a plugin test', 'plugins/docs-discipline/tests/unit/io-helpers.test.ts', "const planted = join(sb, '.contexture', 'sessions', 'u');"],
    ['a lock folder split by join in a support helper', 'tests/support/record.ts', "const held = join(sb, '.contexture', 'tmp', 'locks', 'store-unit.lock');"],
    ['the database name in a template literal', 'plugins/storage-fts5/tests/fts5-store.test.ts', 'const db = `${sb}/.contexture/sessions.db`;'],
    ['a join split new record root in a core test', 'tests/drivers/store-posix.test.ts', "const planted = join(sb, '.contexture', 'units', 'u');"],
  ])('%s reads red with exactly one remainder', (_name, rel, line) => {
    const r = scanTests(plantedTree(rel, line));
    expect(r.remainder).toHaveLength(1);
    expect(r.remainder[0]).toContain(line);
  });
});
