import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sqlite } from '@support/sqlite';
import { count, SCHEMA, seededDb, sqliteFts5 } from '../support/graph';

describe.skipIf(!sqliteFts5)('the graph schema over the seeded rows', { concurrent: true }, () => {
  it('TD1 applies to a fresh database with every table and virtual table', () => {
    const db = seededDb('schema-tables');
    const tables = sqlite(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;").split('\n');
    for (const t of ['docs', 'edges', 'fts_docs', 'fts_symbols', 'indexed_files', 'pitfalls', 'rules', 'symbols']) expect(tables).toContain(t);
  });

  it('TD3 the trigram symbol search finds both start symbols and nothing else', () => {
    expect(count(seededDb('schema-trigram'), "SELECT count(*) FROM fts_symbols WHERE fts_symbols MATCH 'start';")).toBe(2);
  });

  it('TD4 the unicode61 docs search finds the cascade doc', () => {
    expect(count(seededDb('schema-unicode'), "SELECT count(*) FROM fts_docs WHERE fts_docs MATCH 'cascade';")).toBeGreaterThanOrEqual(1);
  });

  it('TD7 links the governing rule, the pitfall, and the doc to sym:1', () => {
    expect(count(seededDb('schema-governance'), "SELECT count(*) FROM edges WHERE target = 'sym:1' AND kind IN ('GOVERNS', 'WARNS', 'COVERS');")).toBe(3);
  });

  it('TD8 sets busy_timeout 5000', () => {
    const db = seededDb('schema-busy');
    const out = sqlite(db, `${readFileSync(SCHEMA, 'utf8')}\nPRAGMA busy_timeout;`).trim().split('\n');
    expect(out[out.length - 1]).toBe('5000');
  });

  it('TD9 keeps indexed_files keyed by file, upserted, with its mtime index', () => {
    const db = seededDb('schema-indexed');
    sqlite(db, "INSERT INTO indexed_files (file, mtime, hash) VALUES ('backend/core/orderCore.ts', 1726910000.5, 'hash_initial_123');");
    expect(count(db, "SELECT count(*) FROM indexed_files WHERE file = 'backend/core/orderCore.ts' AND mtime = 1726910000.5 AND hash = 'hash_initial_123';")).toBe(1);
    sqlite(db, "INSERT OR REPLACE INTO indexed_files (file, mtime, hash) VALUES ('backend/core/orderCore.ts', 1726910100.0, 'hash_updated_456');");
    expect(sqlite(db, "SELECT hash FROM indexed_files WHERE file = 'backend/core/orderCore.ts';").trim()).toBe('hash_updated_456');
    expect(count(db, "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = 'idx_indexed_files_mtime';")).toBe(1);
  });

  it('TD10 a symbol delete purges its fts row and its edges', () => {
    const db = seededDb('schema-symbol-delete');
    sqlite(db, "DELETE FROM symbols WHERE id = 'sym:4';");
    expect(count(db, "SELECT count(*) FROM fts_symbols WHERE symbol_id = 'sym:4';")).toBe(0);
    expect(count(db, "SELECT count(*) FROM edges WHERE source = 'sym:4' OR target = 'sym:4';")).toBe(0);
    sqlite(db, "DELETE FROM symbols WHERE id = 'sym:1';");
    expect(count(db, "SELECT count(*) FROM edges WHERE source = 'sym:1' OR target = 'sym:1';")).toBe(0);
    expect(count(db, "SELECT count(*) FROM fts_symbols WHERE symbol_id = 'sym:1';")).toBe(0);
    expect(count(db, "SELECT count(*) FROM symbols;")).toBe(2);
  });

  it('TD11 a doc delete cascades its rules, pitfalls, edges, and fts rows', () => {
    const db = seededDb('schema-doc-delete');
    const ids = "('doc:order-protocol', 'rule:phase-tracking', 'pitfall:rounding-threshold')";
    expect(count(db, `SELECT count(*) FROM edges WHERE source IN ${ids};`)).toBe(3);
    sqlite(db, "PRAGMA foreign_keys = ON; DELETE FROM docs WHERE id = 'doc:order-protocol';");
    expect(count(db, "SELECT count(*) FROM docs WHERE id = 'doc:order-protocol';")).toBe(0);
    expect(count(db, "SELECT count(*) FROM rules WHERE doc_id = 'doc:order-protocol';")).toBe(0);
    expect(count(db, "SELECT count(*) FROM pitfalls WHERE doc_id = 'doc:order-protocol';")).toBe(0);
    expect(count(db, `SELECT count(*) FROM edges WHERE source IN ${ids} OR target IN ${ids};`)).toBe(0);
    expect(count(db, "SELECT count(*) FROM fts_docs WHERE doc_id = 'doc:order-protocol';")).toBe(0);
  });
});
