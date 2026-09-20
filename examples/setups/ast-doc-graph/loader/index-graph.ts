/**
 * AST and Documentation Graph Ingestion Loader
 * Initializes SQLite schema, ingests intermediate JSONL artifacts,
 * and computes automatic GOVERNS, WARNS, and COVERS edges.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// --- INTERFACES (conforming to spec.md) ---

export interface SymbolRecord {
  id: string;
  name: string;
  qname: string;
  kind: string;
  file: string;
  line_start: number;
  line_end: number;
  signature: string | null;
  docstring: string | null;
}

export interface EdgeRecord {
  source: string;
  target: string;
  kind: string;
}

export interface DocRecord {
  id: string;
  repo: string;
  kind: string;
  summary: string;
  sources: string[];
  keywords: string[];
}

export interface DocRuleRecord {
  id: string;
  doc_id: string;
  statement: string;
  evidence_symbols: string[];
  evidence_raw: string | null;
  detail: string | null;
  anti: string | null;
  good: string | null;
}

export interface DocPitfallRecord {
  id: string;
  doc_id: string;
  severity: string;
  type: string;
  statement: string;
  trigger: string | null;
  evidence_symbols: string[];
  evidence_raw: string | null;
}

// --- GLOB MATCHING UTILITIES ---

function globToRegex(glob: string): RegExp {
  const norm = glob.replace(/^\.\//, '');
  let reStr = '^';
  let i = 0;
  while (i < norm.length) {
    const c = norm[i];
    if (c === '*' && norm[i + 1] === '*') {
      i += 2;
      if (norm[i] === '/') {
        reStr += '(?:.*/)?';
        i++;
      } else {
        reStr += '.*';
      }
    } else if (c === '*') {
      reStr += '[^/]*';
      i++;
    } else if (c === '?') {
      reStr += '[^/]';
      i++;
    } else if ('[].+^$(){}|\\'.includes(c)) {
      reStr += '\\' + c;
      i++;
    } else {
      reStr += c;
      i++;
    }
  }
  reStr += '$';
  return new RegExp(reStr);
}

export function fileMatchesGlobs(file: string, sources: string[]): boolean {
  const normFile = file.replace(/^\.\//, '');
  for (const pattern of sources) {
    const normPattern = pattern.replace(/^\.\//, '');
    if (normPattern === normFile) return true;
    if (normPattern.endsWith('/') && normFile.startsWith(normPattern)) return true;
    try {
      const re = globToRegex(normPattern);
      if (re.test(normFile)) return true;
    } catch {
      if (normFile.includes(normPattern) || normPattern.includes(normFile)) return true;
    }
  }
  return false;
}

// --- JSONL READER ---

function readJsonl<T>(filePath: string): T[] {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const items: T[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    try {
      items.push(JSON.parse(trimmed) as T);
    } catch (err: any) {
      console.error(`Warning: skipping invalid JSON line in ${filePath}: ${err.message}`);
    }
  }
  return items;
}

// --- CLI USAGE ---

function printUsage(): void {
  console.log(`
ast-doc-graph: index-graph loader
Usage:
  index-graph --db <path> [options]

Required:
  --db <path>             Path to SQLite output database

Inputs:
  --symbols <file>        Path to symbols.jsonl
  --edges <file>          Path to edges.jsonl
  --docs <file>           Path to docs.jsonl
  --rules <file>          Path to doc_rules.jsonl
  --pitfalls <file>       Path to doc_pitfalls.jsonl

Options:
  --project-root <path>   Project root path for relative file resolution
  --schema <file>         Path to schema.sql (default: ../schema.sql)
  --clean                 Remove existing database before indexing
  -h, --help              Display this help message
`);
}

// --- SQL HELPER FOR FALLBACK ---

function sqlEscape(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return "'" + String(val).replace(/'/g, "''") + "'";
}

// --- MAIN INGESTION LOGIC ---

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let dbPath = '';
  let symbolsPath = '';
  let edgesPath = '';
  let docsPath = '';
  let rulesPath = '';
  let pitfallsPath = '';
  let projectRoot = '';
  let schemaPath = '';
  let clean = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--db' || arg === '--out-db') {
      dbPath = args[++i];
    } else if (arg.startsWith('--db=')) {
      dbPath = arg.slice('--db='.length);
    } else if (arg.startsWith('--out-db=')) {
      dbPath = arg.slice('--out-db='.length);
    } else if (arg === '--symbols' || arg === '--in-symbols') {
      symbolsPath = args[++i];
    } else if (arg.startsWith('--symbols=')) {
      symbolsPath = arg.slice('--symbols='.length);
    } else if (arg === '--edges' || arg === '--in-edges') {
      edgesPath = args[++i];
    } else if (arg.startsWith('--edges=')) {
      edgesPath = arg.slice('--edges='.length);
    } else if (arg === '--docs' || arg === '--in-docs') {
      docsPath = args[++i];
    } else if (arg.startsWith('--docs=')) {
      docsPath = arg.slice('--docs='.length);
    } else if (arg === '--rules' || arg === '--in-rules') {
      rulesPath = args[++i];
    } else if (arg.startsWith('--rules=')) {
      rulesPath = arg.slice('--rules='.length);
    } else if (arg === '--pitfalls' || arg === '--in-pitfalls') {
      pitfallsPath = args[++i];
    } else if (arg.startsWith('--pitfalls=')) {
      pitfallsPath = arg.slice('--pitfalls='.length);
    } else if (arg === '--project-root') {
      projectRoot = args[++i];
    } else if (arg.startsWith('--project-root=')) {
      projectRoot = arg.slice('--project-root='.length);
    } else if (arg === '--schema') {
      schemaPath = args[++i];
    } else if (arg.startsWith('--schema=')) {
      schemaPath = arg.slice('--schema='.length);
    } else if (arg === '--clean') {
      clean = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }

  if (!dbPath) {
    console.error('Error: missing required --db argument.');
    printUsage();
    process.exit(1);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));

  // Locate schema.sql
  if (!schemaPath) {
    const candidate1 = path.resolve(scriptDir, '../schema.sql');
    const candidate2 = path.resolve(process.cwd(), 'examples/setups/ast-doc-graph/schema.sql');
    if (fs.existsSync(candidate1)) {
      schemaPath = candidate1;
    } else if (fs.existsSync(candidate2)) {
      schemaPath = candidate2;
    } else {
      console.error('Error: cannot find schema.sql. Please specify --schema <path>.');
      process.exit(1);
    }
  }

  if (!fs.existsSync(schemaPath)) {
    console.error(`Error: schema file not found at ${schemaPath}`);
    process.exit(1);
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // Ensure target DB directory exists
  const dbDir = path.dirname(path.resolve(dbPath));
  fs.mkdirSync(dbDir, { recursive: true });

  if (clean && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
    if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
    if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
  }

  // 1. Read all JSONL inputs
  const symbols = readJsonl<SymbolRecord>(symbolsPath);
  const rawEdges = readJsonl<EdgeRecord>(edgesPath);
  const docs = readJsonl<DocRecord>(docsPath);
  const rules = readJsonl<DocRuleRecord>(rulesPath);
  const pitfalls = readJsonl<DocPitfallRecord>(pitfallsPath);

  // 2. Build index lookup structures for edge resolution
  const symbolById = new Map<string, SymbolRecord>();
  const symbolsByQname = new Map<string, SymbolRecord[]>();
  const symbolsByName = new Map<string, SymbolRecord[]>();
  const docsById = new Map<string, DocRecord>();

  for (const sym of symbols) {
    symbolById.set(sym.id, sym);

    const qList = symbolsByQname.get(sym.qname) || [];
    qList.push(sym);
    symbolsByQname.set(sym.qname, qList);

    const nList = symbolsByName.get(sym.name) || [];
    nList.push(sym);
    symbolsByName.set(sym.name, nList);
  }

  for (const doc of docs) {
    docsById.set(doc.id, doc);
  }

  // 3. Collect and deduplicate edges
  const allEdges: EdgeRecord[] = [];
  const edgeSet = new Set<string>();

  function addEdge(source: string, target: string, kind: string): void {
    if (!source || !target || !kind) return;
    const key = `${source}|${target}|${kind}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      allEdges.push({ source, target, kind });
    }
  }

  // Ingest existing raw edges
  for (const e of rawEdges) {
    addEdge(e.source, e.target, e.kind);
  }

  // Compute GOVERNS edges
  for (const rule of rules) {
    const parentDoc = docsById.get(rule.doc_id);
    const docSources = parentDoc ? parentDoc.sources : [];
    const evidence = rule.evidence_symbols || [];

    for (const token of evidence) {
      const sym = token.trim();
      if (!sym) continue;

      // Check qualified name match first
      const qMatches = symbolsByQname.get(sym);
      if (qMatches && qMatches.length > 0) {
        for (const s of qMatches) {
          addEdge(rule.id, s.id, 'GOVERNS');
        }
        continue;
      }

      // Fallback to bare name match
      const nameMatches = symbolsByName.get(sym);
      if (nameMatches && nameMatches.length > 0) {
        if (nameMatches.length === 1) {
          addEdge(rule.id, nameMatches[0].id, 'GOVERNS');
        } else {
          // Disambiguate against doc sources
          const inScope = nameMatches.filter((s) => fileMatchesGlobs(s.file, docSources));
          if (inScope.length > 0) {
            for (const s of inScope) {
              addEdge(rule.id, s.id, 'GOVERNS');
            }
          }
        }
      }
    }
  }

  // Compute WARNS edges
  for (const pitfall of pitfalls) {
    const parentDoc = docsById.get(pitfall.doc_id);
    const docSources = parentDoc ? parentDoc.sources : [];
    const evidence = pitfall.evidence_symbols || [];

    for (const token of evidence) {
      const sym = token.trim();
      if (!sym) continue;

      // Check qualified name match first
      const qMatches = symbolsByQname.get(sym);
      if (qMatches && qMatches.length > 0) {
        for (const s of qMatches) {
          addEdge(pitfall.id, s.id, 'WARNS');
        }
        continue;
      }

      // Fallback to bare name match
      const nameMatches = symbolsByName.get(sym);
      if (nameMatches && nameMatches.length > 0) {
        if (nameMatches.length === 1) {
          addEdge(pitfall.id, nameMatches[0].id, 'WARNS');
        } else {
          const inScope = nameMatches.filter((s) => fileMatchesGlobs(s.file, docSources));
          if (inScope.length > 0) {
            for (const s of inScope) {
              addEdge(pitfall.id, s.id, 'WARNS');
            }
          }
        }
      }
    }
  }

  // Compute COVERS edges
  for (const doc of docs) {
    const docSources = doc.sources || [];
    if (docSources.length === 0) continue;

    const coveredFiles = new Set<string>();
    for (const s of symbols) {
      if (fileMatchesGlobs(s.file, docSources)) {
        addEdge(doc.id, s.id, 'COVERS');
        coveredFiles.add(s.file);
      }
    }
    for (const file of coveredFiles) {
      addEdge(doc.id, file, 'COVERS');
    }
  }

  // 4. Ingest into SQLite database
  let DatabaseSync: any = null;
  try {
    // @ts-ignore
    const sqlite = await import('node:sqlite');
    DatabaseSync = sqlite.DatabaseSync;
  } catch {
    DatabaseSync = null;
  }

  if (DatabaseSync) {
    const db = new DatabaseSync(dbPath);
    db.exec(schemaSql);

    db.exec('BEGIN TRANSACTION;');

    // Clean existing edges if any to ensure fresh load
    db.exec('DELETE FROM edges;');

    const insertSymbol = db.prepare(`
      INSERT OR REPLACE INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);
    for (const s of symbols) {
      insertSymbol.run(
        s.id,
        s.name,
        s.qname,
        s.kind,
        s.file,
        s.line_start,
        s.line_end,
        s.signature ?? null,
        s.docstring ?? null
      );
    }

    const insertDoc = db.prepare(`
      INSERT OR REPLACE INTO docs (id, repo, kind, summary, sources, keywords)
      VALUES (?, ?, ?, ?, ?, ?);
    `);
    for (const d of docs) {
      insertDoc.run(
        d.id,
        d.repo,
        d.kind,
        d.summary,
        JSON.stringify(d.sources || []),
        JSON.stringify(d.keywords || [])
      );
    }

    const insertRule = db.prepare(`
      INSERT OR REPLACE INTO rules (id, doc_id, statement, evidence_symbols, evidence_raw, detail, anti, good)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `);
    for (const r of rules) {
      insertRule.run(
        r.id,
        r.doc_id,
        r.statement,
        JSON.stringify(r.evidence_symbols || []),
        r.evidence_raw ?? null,
        r.detail ?? null,
        r.anti ?? null,
        r.good ?? null
      );
    }

    const insertPitfall = db.prepare(`
      INSERT OR REPLACE INTO pitfalls (id, doc_id, severity, type, statement, trigger, evidence_symbols, evidence_raw)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `);
    for (const p of pitfalls) {
      insertPitfall.run(
        p.id,
        p.doc_id,
        p.severity,
        p.type,
        p.statement,
        p.trigger ?? null,
        JSON.stringify(p.evidence_symbols || []),
        p.evidence_raw ?? null
      );
    }

    const insertEdge = db.prepare(`
      INSERT INTO edges (source, target, kind)
      VALUES (?, ?, ?);
    `);
    for (const e of allEdges) {
      insertEdge.run(e.source, e.target, e.kind);
    }

    db.exec('COMMIT;');
    db.close();
  } else {
    // Fallback to /usr/bin/sqlite3 CLI
    const sqlChunks: string[] = [schemaSql, 'BEGIN TRANSACTION;', 'DELETE FROM edges;'];

    for (const s of symbols) {
      sqlChunks.push(
        `INSERT OR REPLACE INTO symbols (id, name, qname, kind, file, line_start, line_end, signature, docstring) VALUES (` +
          [
            sqlEscape(s.id),
            sqlEscape(s.name),
            sqlEscape(s.qname),
            sqlEscape(s.kind),
            sqlEscape(s.file),
            s.line_start,
            s.line_end,
            sqlEscape(s.signature),
            sqlEscape(s.docstring),
          ].join(', ') +
          ');'
      );
    }

    for (const d of docs) {
      sqlChunks.push(
        `INSERT OR REPLACE INTO docs (id, repo, kind, summary, sources, keywords) VALUES (` +
          [
            sqlEscape(d.id),
            sqlEscape(d.repo),
            sqlEscape(d.kind),
            sqlEscape(d.summary),
            sqlEscape(JSON.stringify(d.sources || [])),
            sqlEscape(JSON.stringify(d.keywords || [])),
          ].join(', ') +
          ');'
      );
    }

    for (const r of rules) {
      sqlChunks.push(
        `INSERT OR REPLACE INTO rules (id, doc_id, statement, evidence_symbols, evidence_raw, detail, anti, good) VALUES (` +
          [
            sqlEscape(r.id),
            sqlEscape(r.doc_id),
            sqlEscape(r.statement),
            sqlEscape(JSON.stringify(r.evidence_symbols || [])),
            sqlEscape(r.evidence_raw),
            sqlEscape(r.detail),
            sqlEscape(r.anti),
            sqlEscape(r.good),
          ].join(', ') +
          ');'
      );
    }

    for (const p of pitfalls) {
      sqlChunks.push(
        `INSERT OR REPLACE INTO pitfalls (id, doc_id, severity, type, statement, trigger, evidence_symbols, evidence_raw) VALUES (` +
          [
            sqlEscape(p.id),
            sqlEscape(p.doc_id),
            sqlEscape(p.severity),
            sqlEscape(p.type),
            sqlEscape(p.statement),
            sqlEscape(p.trigger),
            sqlEscape(JSON.stringify(p.evidence_symbols || [])),
            sqlEscape(p.evidence_raw),
          ].join(', ') +
          ');'
      );
    }

    for (const e of allEdges) {
      sqlChunks.push(
        `INSERT INTO edges (source, target, kind) VALUES (${sqlEscape(e.source)}, ${sqlEscape(e.target)}, ${sqlEscape(e.kind)});`
      );
    }

    sqlChunks.push('COMMIT;');

    const sqliteBin = fs.existsSync('/usr/bin/sqlite3') ? '/usr/bin/sqlite3' : 'sqlite3';
    execFileSync(sqliteBin, [dbPath], {
      input: sqlChunks.join('\n'),
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  }

  // 5. Output summary block in clean dialect
  const edgeCounts: Record<string, number> = {};
  for (const e of allEdges) {
    edgeCounts[e.kind] = (edgeCounts[e.kind] || 0) + 1;
  }

  console.log(`@graph_loaded`);
  console.log(`  DATABASE: ${dbPath}`);
  console.log(`  SYMBOLS: ${symbols.length}`);
  console.log(`  EDGES: ${allEdges.length}`);
  for (const kind of Object.keys(edgeCounts).sort()) {
    console.log(`    ${kind}: ${edgeCounts[kind]}`);
  }
  console.log(`  DOCS: ${docs.length}`);
  console.log(`  RULES: ${rules.length}`);
  console.log(`  PITFALLS: ${pitfalls.length}`);
}

main().catch((err) => {
  console.error('Fatal loader error:', err);
  process.exit(1);
});
