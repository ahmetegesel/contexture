import { appendFileSync, cpSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { moduleDirs, text, walk } from './walk';

const STORE_REACH = /\.contexture\/(sessions|units)|sessions\.db|storage\/drivers\/|drivers\/[a-z0-9_-]+\/driver|driver-resolver[^|;]* resolve([^a-z]|$)|sqlite3|tmp\/locks/;
const COMMENT = /^[ \t]*(#|\/\/)/;

const UNIT = 'base/.contexture/modules/unit';
const GRAPH = 'plugins/ast-doc-graph/.contexture/extensions/modules/ast-doc-graph';

const ALLOW: readonly [file: string, line: string, why: string][] = [
  [`${UNIT}/data`, 'root: .contexture/units', 'the unit namespace declaration the storage core reads'],
  [`${UNIT}/data`, 'fallback_root: .contexture/sessions', 'the unit namespace declaration the storage core reads'],
  [`${UNIT}/scripts/data`, '  mkdir -p "$u_tmp/locks/unit" 2>/dev/null || u_refuse 2 ERR_STORAGE_WRITE "cannot create the lock folder"', 'the unit lock folder, not a store file'],
  [`${UNIT}/scripts/data`, '  U_LT="$u_tmp/locks/unit/$1.lock"', 'the unit lock folder, not a store file'],
  [`${GRAPH}/bin/graph-query`, 'SQLITE_BIN="/usr/bin/sqlite3"', 'the graph module queries its own graph database'],
  [`${GRAPH}/bin/graph-query`, '  SQLITE_BIN="$(command -v sqlite3 || true)"', 'the graph module queries its own graph database'],
  [`${GRAPH}/bin/graph-query`, '  echo "Error: sqlite3 binary not found." >&2', 'the graph module queries its own graph database'],
  [`${GRAPH}/loader/index-graph.ts`, "    const sqliteBin = fs.existsSync('/usr/bin/sqlite3') ? '/usr/bin/sqlite3' : 'sqlite3';", 'the graph loader writes its own graph database'],
];

const allowed = new Set(ALLOW.map(([file, line]) => `${file}\n${line}`));

function scan(root: string) {
  const files = moduleDirs(root).flatMap((d) => walk(d)).filter((f) => !f.endsWith('.md'));
  let flagged = 0;
  const remainder: string[] = [];
  for (const file of files) {
    const rel = relative(root, file);
    text(file)
      .split('\n')
      .forEach((line, i) => {
        if (COMMENT.test(line) || !STORE_REACH.test(line.replace(/["'\\]/g, ''))) return;
        flagged++;
        if (!allowed.has(`${rel}\n${line}`)) remainder.push(`${rel}:${i + 1}: ${line}`);
      });
  }
  return { files: files.length, flagged, remainder };
}

function plantedTree(line: string): string {
  const tree = sandbox('bypass-plant');
  cpSync(join(ROOT, 'base/.contexture/modules/unit'), join(tree, 'base/.contexture/modules/unit'), { recursive: true });
  appendFileSync(join(tree, 'base/.contexture/modules/unit/scripts/board'), `${line}\n`);
  return tree;
}

describe.concurrent('the static store-bypass check: module code reaches the store only through the storage core', () => {
  it('[the-record-r10] every module line naming the store, a driver, the resolver answer, sqlite3, or the lock area is allow-listed by its exact text', () => {
    const r = scan(ROOT);
    expect(r.files).toBeGreaterThan(80);
    expect(r.flagged).toBeGreaterThan(0);
    expect(r.remainder.join('\n')).toBe('');
    expect(r.flagged).toBe(ALLOW.length);
  });

  it.each([
    ['a direct read of the posix record store', 'cat "$CTX_ROOT/.contexture/sessions/$1/journal.md"'],
    ['a direct posix driver call', '"$CTX_ROOT/.contexture/storage/drivers/posix/driver" store.get unit "$1/state"'],
    ['a name split by quoting', 'cat "$CTX_ROOT/.contexture/"sess"ions/$1/state.md"'],
  ])('[the-record-r10] %s planted in a verb reads red', (_name, line) => {
    const r = scan(plantedTree(line));
    expect(r.remainder).toHaveLength(1);
    expect(r.remainder[0]).toContain(line);
  });
});
