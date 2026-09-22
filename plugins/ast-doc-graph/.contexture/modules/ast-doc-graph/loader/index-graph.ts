/**
 * AST and Documentation Graph Ingestion Loader
 * Initializes SQLite schema, ingests intermediate JSONL artifacts,
 * supports incremental delta updates, and computes automatic GOVERNS, WARNS, and COVERS edges.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

/* Interfaces conforming to spec.md */

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

export interface IndexedFileRecord {
  file: string;
  mtime: number;
  hash: string;
}

/* Glob matching utilities */

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

export function candidateDocIdsForFile(file: string): string[] {
  const norm = file.replace(/^\.\//, '').replace(/\.md$/i, '');
  const res: string[] = [];
  if (norm.startsWith('docs/')) {
    const sub = norm.slice('docs/'.length);
    res.push(`doc:${sub.replace(/\//g, ':')}`);
    const parts = sub.split('/');
    if (parts.length > 1) {
      res.push(`doc:${parts[parts.length-1]}`);
    }
  }
  res.push(`doc:${norm.replace(/\//g, ':')}`);
  const base = path.basename(norm);
  res.push(`doc:${base}`);
  return Array.from(new Set(res));
}

export function resolveDocFile(docId: string, projectRoot?: string): string | null {
  if (!docId.startsWith('doc:')) return null;
  const parts = docId.slice(4).split(':');
  const candidateRels = [
    path.join('docs', ...parts) + '.md',
    path.join('docs', parts[parts.length-1]) + '.md',
    path.join(...parts) + '.md',
  ];
  for (const rel of candidateRels) {
    const full = projectRoot ? path.resolve(projectRoot, rel) : path.resolve(rel);
    if (fs.existsSync(full)) {
      return rel;
    }
  }
  return null;
}

/* JSONL reader */

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

/* CLI usage */

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
  --delta                 Incremental delta update mode without recreating database
  --files <list>          Comma-separated list of modified files
  --file <path>           Individual modified file path
  --modified-files <list> Comma-separated list of modified files
  --project-root <path>   Project root path for relative file resolution
  --schema <file>         Path to schema.sql (default: ../schema.sql)
  --clean                 Remove existing database before indexing
  -h, --help              Display this help message
`);
}

/* SQL helper for fallback */

function sqlEscape(val: any): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return "'" + String(val).replace(/'/g, "''") + "'";
}

/* Edge computation helper */

export function computeDerivedEdges(
  rulesToProcess: DocRuleRecord[],
  pitfallsToProcess: DocPitfallRecord[],
  docsToProcess: DocRecord[],
  allSymbolsForCovers: SymbolRecord[],
  symbolsByQname: Map<string, SymbolRecord[]>,
  symbolsByName: Map<string, SymbolRecord[]>,
  docsById: Map<string, DocRecord>,
  addEdge: (source: string, target: string, kind: string) => void
): void {
  // Compute GOVERNS edges
  for (const rule of rulesToProcess) {
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
  for (const pitfall of pitfallsToProcess) {
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
  for (const doc of docsToProcess) {
    const docSources = doc.sources || [];
    if (docSources.length === 0) continue;

    const coveredFiles = new Set<string>();
    for (const s of allSymbolsForCovers) {
      if (fileMatchesGlobs(s.file, docSources)) {
        addEdge(doc.id, s.id, 'COVERS');
        coveredFiles.add(s.file);
      }
    }
    for (const file of coveredFiles) {
      addEdge(doc.id, file, 'COVERS');
    }
  }
}

/* Main ingestion logic */

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
  let explicitFiles: string[] = [];
  let clean = false;
  let delta = false;

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
    } else if (arg === '--files' || arg === '--indexed-files') {
      const val = args[++i];
      if (val) explicitFiles.push(...val.split(',').map((x) => x.trim()).filter(Boolean));
    } else if (arg.startsWith('--files=')) {
      const val = arg.slice('--files='.length);
      explicitFiles.push(...val.split(',').map((x) => x.trim()).filter(Boolean));
    } else if (arg.startsWith('--indexed-files=')) {
      const val = arg.slice('--indexed-files='.length);
      explicitFiles.push(...val.split(',').map((x) => x.trim()).filter(Boolean));
    } else if (arg === '--file') {
      const val = args[++i];
      if (val) explicitFiles.push(val.trim());
    } else if (arg.startsWith('--file=')) {
      const val = arg.slice('--file='.length);
      if (val) explicitFiles.push(val.trim());
    } else if (arg === '--modified-files') {
      const val = args[++i];
      if (val) explicitFiles.push(...val.split(',').map((x) => x.trim()).filter(Boolean));
    } else if (arg.startsWith('--modified-files=')) {
      const val = arg.slice('--modified-files='.length);
      explicitFiles.push(...val.split(',').map((x) => x.trim()).filter(Boolean));
    } else if (arg === '--clean') {
      clean = true;
    } else if (arg === '--delta') {
      delta = true;
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

  if (clean && delta) {
    console.error('Error: --clean and --delta cannot be used together.');
    process.exit(1);
  }

  if (delta && !fs.existsSync(dbPath)) {
    console.error(`Error: delta mode requires an existing database at ${dbPath}`);
    process.exit(1);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));

  // Locate schema.sql
  if (!schemaPath) {
    const candidate1 = path.resolve(scriptDir, '../schema.sql');
    const candidate2 = path.resolve(process.cwd(), 'plugins/ast-doc-graph/.contexture/modules/ast-doc-graph/schema.sql');
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

  // 2. Identify modified files and target docs
  const modifiedFiles = new Set<string>();
  for (const f of explicitFiles) {
    modifiedFiles.add(f);
  }
  for (const s of symbols) {
    if (s.file) modifiedFiles.add(s.file);
  }
  for (const e of rawEdges) {
    if (e.kind === 'DEFINES' && e.source) {
      modifiedFiles.add(e.source);
    }
  }
  for (const d of docs) {
    if ((d as any).file) {
      modifiedFiles.add((d as any).file);
    } else {
      const resolved = resolveDocFile(d.id, projectRoot);
      if (resolved) {
        modifiedFiles.add(resolved);
      }
    }
  }

  const docIdsToDelete = new Set<string>();
  for (const d of docs) {
    if (d.id) docIdsToDelete.add(d.id);
  }
  for (const f of modifiedFiles) {
    if (f.endsWith('.md')) {
      const candidates = candidateDocIdsForFile(f);
      for (const c of candidates) {
        docIdsToDelete.add(c);
      }
    }
  }

  // Detect DatabaseSync availability
  let DatabaseSync: any = null;
  try {
    // @ts-ignore
    const sqlite = await import('node:sqlite');
    DatabaseSync = sqlite.DatabaseSync;
  } catch {
    DatabaseSync = null;
  }

  let finalNewEdges: EdgeRecord[] = [];
  let totalEdgeCount = 0;

  if (DatabaseSync) {
    const db = new DatabaseSync(dbPath);
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec('PRAGMA busy_timeout = 5000;');
    db.exec(schemaSql);

    db.exec('BEGIN TRANSACTION;');

    if (delta) {
      // Delta mode: delete records for modified files and target docs
      const deleteSymbolsStmt = db.prepare('DELETE FROM symbols WHERE file = ?;');
      const deleteEdgesBySourceStmt = db.prepare('DELETE FROM edges WHERE source = ?;');
      for (const file of modifiedFiles) {
        deleteSymbolsStmt.run(file);
        deleteEdgesBySourceStmt.run(file);
      }

      const selectDocByCoveredFile = db.prepare("SELECT source FROM edges WHERE target = ? AND kind = 'COVERS' AND source LIKE 'doc:%';");
      for (const file of modifiedFiles) {
        if (file.endsWith('.md')) {
          const rows = selectDocByCoveredFile.all(file) as any[];
          for (const row of rows) {
            if (row.source) docIdsToDelete.add(row.source);
          }
        }
      }

      const deleteDocsStmt = db.prepare('DELETE FROM docs WHERE id = ?;');
      for (const docId of docIdsToDelete) {
        deleteDocsStmt.run(docId);
      }

      // Clean file-level edges for doc files
      for (const file of modifiedFiles) {
        if (file.endsWith('.md')) {
          deleteEdgesBySourceStmt.run(file);
        }
      }
    } else {
      // Full mode: clear all edges
      db.exec('DELETE FROM edges;');
    }

    // Insert incoming symbols
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

    // Insert incoming docs
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

    // Insert incoming rules
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

    // Insert incoming pitfalls
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

    // Insert raw edges
    const insertEdge = db.prepare(`
      INSERT INTO edges (source, target, kind)
      VALUES (?, ?, ?);
    `);
    for (const e of rawEdges) {
      insertEdge.run(e.source, e.target, e.kind);
    }

    if (delta) {
      // Re-link GOVERNS, WARNS, and COVERS edges
      const allSymbolsRaw = db.prepare('SELECT id, name, qname, kind, file, line_start, line_end, signature, docstring FROM symbols;').all() as SymbolRecord[];
      const allDocsRaw = db.prepare('SELECT id, repo, kind, summary, sources, keywords FROM docs;').all() as any[];
      const allRulesRaw = db.prepare('SELECT id, doc_id, statement, evidence_symbols, evidence_raw, detail, anti, good FROM rules;').all() as any[];
      const allPitfallsRaw = db.prepare('SELECT id, doc_id, severity, type, statement, trigger, evidence_symbols, evidence_raw FROM pitfalls;').all() as any[];
      const existingEdgesRaw = db.prepare('SELECT source, target, kind FROM edges;').all() as any[];

      const allDocs: DocRecord[] = allDocsRaw.map((d: any) => ({
        id: d.id,
        repo: d.repo,
        kind: d.kind,
        summary: d.summary,
        sources: typeof d.sources === 'string' ? JSON.parse(d.sources) : (d.sources || []),
        keywords: typeof d.keywords === 'string' ? JSON.parse(d.keywords) : (d.keywords || []),
      }));

      const allRules: DocRuleRecord[] = allRulesRaw.map((r: any) => ({
        id: r.id,
        doc_id: r.doc_id,
        statement: r.statement,
        evidence_symbols: typeof r.evidence_symbols === 'string' ? JSON.parse(r.evidence_symbols) : (r.evidence_symbols || []),
        evidence_raw: r.evidence_raw,
        detail: r.detail,
        anti: r.anti,
        good: r.good,
      }));

      const allPitfalls: DocPitfallRecord[] = allPitfallsRaw.map((p: any) => ({
        id: p.id,
        doc_id: p.doc_id,
        severity: p.severity,
        type: p.type,
        statement: p.statement,
        trigger: p.trigger,
        evidence_symbols: typeof p.evidence_symbols === 'string' ? JSON.parse(p.evidence_symbols) : (p.evidence_symbols || []),
        evidence_raw: p.evidence_raw,
      }));

      const edgeSet = new Set<string>();
      for (const e of existingEdgesRaw) {
        edgeSet.add(`${e.source}|${e.target}|${e.kind}`);
      }

      const symbolsByQname = new Map<string, SymbolRecord[]>();
      const symbolsByName = new Map<string, SymbolRecord[]>();
      const docsById = new Map<string, DocRecord>();

      for (const sym of allSymbolsRaw) {
        const qList = symbolsByQname.get(sym.qname) || [];
        qList.push(sym);
        symbolsByQname.set(sym.qname, qList);

        const nList = symbolsByName.get(sym.name) || [];
        nList.push(sym);
        symbolsByName.set(sym.name, nList);
      }

      for (const doc of allDocs) {
        docsById.set(doc.id, doc);
      }

      const newEdges: EdgeRecord[] = [];
      function addDeltaEdge(source: string, target: string, kind: string): void {
        if (!source || !target || !kind) return;
        const key = `${source}|${target}|${kind}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          newEdges.push({ source, target, kind });
        }
      }

      computeDerivedEdges(
        allRules,
        allPitfalls,
        allDocs,
        allSymbolsRaw,
        symbolsByQname,
        symbolsByName,
        docsById,
        addDeltaEdge
      );

      for (const e of newEdges) {
        insertEdge.run(e.source, e.target, e.kind);
      }
      finalNewEdges = newEdges;

      // Update indexed_files for modifiedFiles
      const insertFile = db.prepare(`
        INSERT OR REPLACE INTO indexed_files (file, mtime, hash, indexed_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP);
      `);
      const deleteFile = db.prepare(`DELETE FROM indexed_files WHERE file = ?;`);
      for (const relFile of modifiedFiles) {
        const absPath = projectRoot ? path.resolve(projectRoot, relFile) : path.resolve(relFile);
        if (fs.existsSync(absPath)) {
          try {
            const stat = fs.statSync(absPath);
            const mtime = stat.mtimeMs / 1000;
            const content = fs.readFileSync(absPath);
            const hash = crypto.createHash('sha256').update(content).digest('hex');
            insertFile.run(relFile, mtime, hash);
          } catch {
            insertFile.run(relFile, 0, '');
          }
        } else {
          deleteFile.run(relFile);
        }
      }

      const totalEdgesRow = db.prepare('SELECT count(*) AS count FROM edges;').get() as any;
      totalEdgeCount = totalEdgesRow ? totalEdgesRow.count : 0;
    } else {
      // Full load: compute edges across incoming batches
      const symbolsByQname = new Map<string, SymbolRecord[]>();
      const symbolsByName = new Map<string, SymbolRecord[]>();
      const docsById = new Map<string, DocRecord>();

      for (const sym of symbols) {
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

      const fullDerivedEdges: EdgeRecord[] = [];
      const edgeSet = new Set<string>();
      for (const e of rawEdges) {
        edgeSet.add(`${e.source}|${e.target}|${e.kind}`);
      }

      function addFullEdge(source: string, target: string, kind: string): void {
        if (!source || !target || !kind) return;
        const key = `${source}|${target}|${kind}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          fullDerivedEdges.push({ source, target, kind });
        }
      }

      computeDerivedEdges(
        rules,
        pitfalls,
        docs,
        symbols,
        symbolsByQname,
        symbolsByName,
        docsById,
        addFullEdge
      );

      for (const e of fullDerivedEdges) {
        insertEdge.run(e.source, e.target, e.kind);
      }
      finalNewEdges = fullDerivedEdges;
      totalEdgeCount = rawEdges.length + fullDerivedEdges.length;

      // Populate indexed_files
      const filesToIndex = new Set<string>();
      for (const f of explicitFiles) filesToIndex.add(f);
      for (const s of symbols) if (s.file) filesToIndex.add(s.file);
      for (const d of docs) {
        if ((d as any).file) {
          filesToIndex.add((d as any).file);
        } else {
          const resolved = resolveDocFile(d.id, projectRoot);
          if (resolved) filesToIndex.add(resolved);
        }
      }

      const insertFile = db.prepare(`
        INSERT OR REPLACE INTO indexed_files (file, mtime, hash, indexed_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP);
      `);
      for (const relFile of Array.from(filesToIndex).sort()) {
        const absPath = projectRoot ? path.resolve(projectRoot, relFile) : path.resolve(relFile);
        let mtime = 0;
        let hash = '';
        if (fs.existsSync(absPath)) {
          try {
            const stat = fs.statSync(absPath);
            mtime = stat.mtimeMs / 1000;
            const content = fs.readFileSync(absPath);
            hash = crypto.createHash('sha256').update(content).digest('hex');
          } catch {
            mtime = 0;
            hash = '';
          }
        }
        insertFile.run(relFile, mtime, hash);
      }
    }

    db.exec('COMMIT;');
    db.close();
  } else {
    // Fallback to /usr/bin/sqlite3 CLI
    const sqliteBin = fs.existsSync('/usr/bin/sqlite3') ? '/usr/bin/sqlite3' : 'sqlite3';

    if (delta) {
      // Query existing state to re-link edges
      const queryJson = (sql: string): any[] => {
        try {
          const res = execFileSync(sqliteBin, [dbPath, '-json', sql], { encoding: 'utf8' });
          return res.trim() ? JSON.parse(res) : [];
        } catch {
          return [];
        }
      };

      const existingSymbolsRaw = queryJson('SELECT id, name, qname, kind, file, line_start, line_end, signature, docstring FROM symbols;');
      const existingDocsRaw = queryJson('SELECT id, repo, kind, summary, sources, keywords FROM docs;');
      const existingRulesRaw = queryJson('SELECT id, doc_id, statement, evidence_symbols, evidence_raw, detail, anti, good FROM rules;');
      const existingPitfallsRaw = queryJson('SELECT id, doc_id, severity, type, statement, trigger, evidence_symbols, evidence_raw FROM pitfalls;');
      const existingEdgesRaw = queryJson('SELECT source, target, kind FROM edges;');

      // Also query docs covering modifiedFiles
      for (const file of modifiedFiles) {
        if (file.endsWith('.md')) {
          const coveredDocs = queryJson(`SELECT source FROM edges WHERE target = '${file.replace(/'/g, "''")}' AND kind = 'COVERS' AND source LIKE 'doc:%';`);
          for (const row of coveredDocs) {
            if (row.source) docIdsToDelete.add(row.source);
          }
        }
      }

      // In-memory simulation to compute re-linked edges
      const combinedSymbols = [
        ...existingSymbolsRaw.filter((s: any) => !modifiedFiles.has(s.file)),
        ...symbols,
      ];
      const combinedDocs = [
        ...existingDocsRaw
          .filter((d: any) => !docIdsToDelete.has(d.id))
          .map((d: any) => ({
            id: d.id,
            repo: d.repo,
            kind: d.kind,
            summary: d.summary,
            sources: typeof d.sources === 'string' ? JSON.parse(d.sources) : (d.sources || []),
            keywords: typeof d.keywords === 'string' ? JSON.parse(d.keywords) : (d.keywords || []),
          })),
        ...docs,
      ];
      const combinedRules = [
        ...existingRulesRaw
          .filter((r: any) => !docIdsToDelete.has(r.doc_id))
          .map((r: any) => ({
            id: r.id,
            doc_id: r.doc_id,
            statement: r.statement,
            evidence_symbols: typeof r.evidence_symbols === 'string' ? JSON.parse(r.evidence_symbols) : (r.evidence_symbols || []),
            evidence_raw: r.evidence_raw,
            detail: r.detail,
            anti: r.anti,
            good: r.good,
          })),
        ...rules,
      ];
      const combinedPitfalls = [
        ...existingPitfallsRaw
          .filter((p: any) => !docIdsToDelete.has(p.doc_id))
          .map((p: any) => ({
            id: p.id,
            doc_id: p.doc_id,
            severity: p.severity,
            type: p.type,
            statement: p.statement,
            trigger: p.trigger,
            evidence_symbols: typeof p.evidence_symbols === 'string' ? JSON.parse(p.evidence_symbols) : (p.evidence_symbols || []),
            evidence_raw: p.evidence_raw,
          })),
        ...pitfalls,
      ];

      const edgeSet = new Set<string>();
      for (const e of existingEdgesRaw) {
        edgeSet.add(`${e.source}|${e.target}|${e.kind}`);
      }
      for (const e of rawEdges) {
        edgeSet.add(`${e.source}|${e.target}|${e.kind}`);
      }

      const symbolsByQname = new Map<string, SymbolRecord[]>();
      const symbolsByName = new Map<string, SymbolRecord[]>();
      const docsById = new Map<string, DocRecord>();

      for (const sym of combinedSymbols) {
        const qList = symbolsByQname.get(sym.qname) || [];
        qList.push(sym);
        symbolsByQname.set(sym.qname, qList);

        const nList = symbolsByName.get(sym.name) || [];
        nList.push(sym);
        symbolsByName.set(sym.name, nList);
      }

      for (const doc of combinedDocs) {
        docsById.set(doc.id, doc);
      }

      const newEdges: EdgeRecord[] = [];
      function addFallbackEdge(source: string, target: string, kind: string): void {
        if (!source || !target || !kind) return;
        const key = `${source}|${target}|${kind}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          newEdges.push({ source, target, kind });
        }
      }

      computeDerivedEdges(
        combinedRules,
        combinedPitfalls,
        combinedDocs,
        combinedSymbols,
        symbolsByQname,
        symbolsByName,
        docsById,
        addFallbackEdge
      );

      finalNewEdges = newEdges;

      // Build SQL transaction for fallback execution
      const sqlChunks: string[] = [
        'PRAGMA foreign_keys = ON;',
        'PRAGMA busy_timeout = 5000;',
        'BEGIN TRANSACTION;',
      ];

      for (const file of modifiedFiles) {
        sqlChunks.push(`DELETE FROM symbols WHERE file = ${sqlEscape(file)};`);
        sqlChunks.push(`DELETE FROM edges WHERE source = ${sqlEscape(file)};`);
      }
      for (const docId of docIdsToDelete) {
        sqlChunks.push(`DELETE FROM docs WHERE id = ${sqlEscape(docId)};`);
      }
      for (const file of modifiedFiles) {
        if (file.endsWith('.md')) {
          sqlChunks.push(`DELETE FROM edges WHERE source = ${sqlEscape(file)};`);
        }
      }

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

      for (const e of rawEdges) {
        sqlChunks.push(`INSERT INTO edges (source, target, kind) VALUES (${sqlEscape(e.source)}, ${sqlEscape(e.target)}, ${sqlEscape(e.kind)});`);
      }
      for (const e of newEdges) {
        sqlChunks.push(`INSERT INTO edges (source, target, kind) VALUES (${sqlEscape(e.source)}, ${sqlEscape(e.target)}, ${sqlEscape(e.kind)});`);
      }

      for (const relFile of modifiedFiles) {
        const absPath = projectRoot ? path.resolve(projectRoot, relFile) : path.resolve(relFile);
        if (fs.existsSync(absPath)) {
          let mtime = 0;
          let hash = '';
          try {
            const stat = fs.statSync(absPath);
            mtime = stat.mtimeMs / 1000;
            const content = fs.readFileSync(absPath);
            hash = crypto.createHash('sha256').update(content).digest('hex');
          } catch {
            mtime = 0;
            hash = '';
          }
          sqlChunks.push(
            `INSERT OR REPLACE INTO indexed_files (file, mtime, hash, indexed_at) VALUES (${sqlEscape(relFile)}, ${mtime}, ${sqlEscape(hash)}, CURRENT_TIMESTAMP);`
          );
        } else {
          sqlChunks.push(`DELETE FROM indexed_files WHERE file = ${sqlEscape(relFile)};`);
        }
      }

      sqlChunks.push('COMMIT;');

      execFileSync(sqliteBin, [dbPath], {
        input: sqlChunks.join('\n'),
        stdio: ['pipe', 'inherit', 'inherit'],
      });

      const countRes = queryJson('SELECT count(*) AS count FROM edges;');
      totalEdgeCount = countRes && countRes[0] ? countRes[0].count : 0;
    } else {
      // Full mode fallback
      const symbolsByQname = new Map<string, SymbolRecord[]>();
      const symbolsByName = new Map<string, SymbolRecord[]>();
      const docsById = new Map<string, DocRecord>();

      for (const sym of symbols) {
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

      const fullDerivedEdges: EdgeRecord[] = [];
      const edgeSet = new Set<string>();
      for (const e of rawEdges) {
        edgeSet.add(`${e.source}|${e.target}|${e.kind}`);
      }

      function addFallbackFullEdge(source: string, target: string, kind: string): void {
        if (!source || !target || !kind) return;
        const key = `${source}|${target}|${kind}`;
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          fullDerivedEdges.push({ source, target, kind });
        }
      }

      computeDerivedEdges(
        rules,
        pitfalls,
        docs,
        symbols,
        symbolsByQname,
        symbolsByName,
        docsById,
        addFallbackFullEdge
      );

      finalNewEdges = fullDerivedEdges;
      totalEdgeCount = rawEdges.length + fullDerivedEdges.length;

      const filesToIndex = new Set<string>();
      for (const f of explicitFiles) filesToIndex.add(f);
      for (const s of symbols) if (s.file) filesToIndex.add(s.file);
      for (const d of docs) {
        if ((d as any).file) {
          filesToIndex.add((d as any).file);
        } else {
          const resolved = resolveDocFile(d.id, projectRoot);
          if (resolved) filesToIndex.add(resolved);
        }
      }

      const sqlChunks: string[] = [
        'PRAGMA foreign_keys = ON;',
        'PRAGMA busy_timeout = 5000;',
        schemaSql,
        'BEGIN TRANSACTION;',
        'DELETE FROM edges;',
      ];

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

      for (const e of rawEdges) {
        sqlChunks.push(`INSERT INTO edges (source, target, kind) VALUES (${sqlEscape(e.source)}, ${sqlEscape(e.target)}, ${sqlEscape(e.kind)});`);
      }
      for (const e of fullDerivedEdges) {
        sqlChunks.push(`INSERT INTO edges (source, target, kind) VALUES (${sqlEscape(e.source)}, ${sqlEscape(e.target)}, ${sqlEscape(e.kind)});`);
      }

      for (const relFile of Array.from(filesToIndex).sort()) {
        const absPath = projectRoot ? path.resolve(projectRoot, relFile) : path.resolve(relFile);
        let mtime = 0;
        let hash = '';
        if (fs.existsSync(absPath)) {
          try {
            const stat = fs.statSync(absPath);
            mtime = stat.mtimeMs / 1000;
            const content = fs.readFileSync(absPath);
            hash = crypto.createHash('sha256').update(content).digest('hex');
          } catch {
            mtime = 0;
            hash = '';
          }
        }
        sqlChunks.push(
          `INSERT OR REPLACE INTO indexed_files (file, mtime, hash, indexed_at) VALUES (` +
            [
              sqlEscape(relFile),
              mtime,
              sqlEscape(hash),
              'CURRENT_TIMESTAMP',
            ].join(', ') +
            ');'
        );
      }

      sqlChunks.push('COMMIT;');

      execFileSync(sqliteBin, [dbPath], {
        input: sqlChunks.join('\n'),
        stdio: ['pipe', 'inherit', 'inherit'],
      });
    }
  }

  // 3. Output summary block in clean dialect
  if (delta) {
    const edgeCounts: Record<string, number> = {};
    for (const e of [...rawEdges, ...finalNewEdges]) {
      edgeCounts[e.kind] = (edgeCounts[e.kind] || 0) + 1;
    }

    console.log(`@graph_loaded`);
    console.log(`  MODE: delta`);
    console.log(`  DATABASE: ${dbPath}`);
    console.log(`  MODIFIED_FILES: ${modifiedFiles.size}`);
    for (const f of Array.from(modifiedFiles).sort()) {
      console.log(`    ${f}`);
    }
    console.log(`  UPDATED_SYMBOLS: ${symbols.length}`);
    console.log(`  UPDATED_DOCS: ${docs.length}`);
    console.log(`  UPDATED_RULES: ${rules.length}`);
    console.log(`  UPDATED_PITFALLS: ${pitfalls.length}`);
    console.log(`  NEW_EDGES: ${finalNewEdges.length + rawEdges.length}`);
    for (const kind of Object.keys(edgeCounts).sort()) {
      console.log(`    ${kind}: ${edgeCounts[kind]}`);
    }
    console.log(`  TOTAL_EDGES: ${totalEdgeCount}`);
  } else {
    const edgeCounts: Record<string, number> = {};
    for (const e of [...rawEdges, ...finalNewEdges]) {
      edgeCounts[e.kind] = (edgeCounts[e.kind] || 0) + 1;
    }

    console.log(`@graph_loaded`);
    console.log(`  DATABASE: ${dbPath}`);
    console.log(`  SYMBOLS: ${symbols.length}`);
    console.log(`  EDGES: ${totalEdgeCount}`);
    for (const kind of Object.keys(edgeCounts).sort()) {
      console.log(`    ${kind}: ${edgeCounts[kind]}`);
    }
    console.log(`  DOCS: ${docs.length}`);
    console.log(`  RULES: ${rules.length}`);
    console.log(`  PITFALLS: ${pitfalls.length}`);
  }
}

main().catch((err) => {
  console.error('Fatal loader error:', err);
  process.exit(1);
});
