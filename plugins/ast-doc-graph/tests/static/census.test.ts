import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODULE } from '../support/graph';

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .flatMap((d) => (d.isDirectory() ? files(join(dir, d.name)) : [join(dir, d.name)]));

const hits = (pattern: RegExp, text: string, where: string): string[] =>
  text.split('\n').flatMap((line, i) => (pattern.test(line) ? [`${where}:${i + 1}: ${line}`] : []));

const RULES: [name: string, pattern: RegExp, plant: string, miss: string][] = [
  ['no launcher edits PATH', /(^|[^A-Za-z0-9_])PATH\s*=(?!=)/, 'export PATH="/opt/homebrew/bin:$PATH"', 'export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--no-deprecation"; command -v node "$PATH"'],
  ['no sibling project glob', /\.\.\/\*\//, 'for candidate in "$SCRIPT_DIR/../../../../../*/node_modules/.bin/tsx"; do', 'SETUP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"; "$SCRIPT_DIR/../schema.sql"'],
  ['no pre-extension-root path', /\.contexture\/modules\/ast-doc-graph/, ' * Emits intermediate JSONL conforming to plugins/ast-doc-graph/.contexture/modules/ast-doc-graph/spec.md.', 'plugins/ast-doc-graph/.contexture/extensions/modules/ast-doc-graph/spec.md'],
  ['no absolute /tmp path', /(^|[^A-Za-z0-9._~}/-])\/tmp/, '    CACHE_DIR="/tmp/ast-doc-graph-$(basename "$REPO_ROOT")"', 'mkdir -p "$DRAWER/.contexture/tmp" "${base}/tmp" ~/tmp'],
];

const tree = files(MODULE);

describe('the static census of the module tree', { concurrent: true }, () => {
  it('walks every module file, the three launchers and the driver among them', () => {
    const rel = tree.map((f) => relative(MODULE, f));
    for (const f of ['bin/ast-doc-index', 'extractors/ts/extract-ts.sh', 'extractors/docs/extract-docs.sh', 'loader/index-graph.sh', 'spec.md']) expect(rel).toContain(f);
  });

  it.each(RULES)('%s', (_name, pattern) => {
    expect(tree.flatMap((f) => hits(pattern, readFileSync(f, 'utf8'), relative(MODULE, f)))).toEqual([]);
  });

  it.each(RULES)('null check: %s reads a planted line and passes its near miss', (_name, pattern, plant, miss) => {
    expect(hits(pattern, `${miss}\n${plant}\n`, 'plant')).toEqual([`plant:2: ${plant}`]);
  });
});
