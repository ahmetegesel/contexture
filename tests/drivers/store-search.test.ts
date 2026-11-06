import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';

const STORE_SEARCH = join(ROOT, 'base/.contexture/storage/scripts/store-search');

import { NEEDLE_ROWS, SEARCH_DATA, SEARCH_VALUES, row, searchAnswer } from '../support/search-fixture';

let dir: string;
const files: Record<string, { data: string; manifest: string }> = {};

beforeAll(() => {
  dir = sandbox('store-search');
  for (const [ns, text] of Object.entries(SEARCH_DATA)) {
    const data = join(dir, `${ns}.data`);
    writeFileSync(data, text);
    const lines = SEARCH_VALUES[ns].map(([key, value], i) => {
      const path = join(dir, `${ns}-${i}.value`);
      writeFileSync(path, value);
      return `${key}\t${path}\n`;
    });
    const manifest = join(dir, `${ns}.manifest`);
    writeFileSync(manifest, lines.join(''));
    files[ns] = { data, manifest };
  }
});

const exact = (ns: string, query: string, limit = 20) =>
  exec(STORE_SEARCH, ['exact', files[ns].data, ns, query, String(limit), files[ns].manifest], { cwd: dir });

async function wants(ns: string, query: string, limit: number, line: string): Promise<void> {
  const r = await exact(ns, query, limit);
  expect(r.stderr).toBe('');
  expect(r.code).toBe(0);
  expect(r.stdout).toBe(line);
}

describe.concurrent('store-search exact, the shared search rule', () => {
  it('answers one row per entity and section over the document set, the first matching line, in bytewise key order', () =>
    wants('searchdoc', 'needle', 20, searchAnswer('searchdoc', 'needle', 3, NEEDLE_ROWS)));

  it('applies the limit after the complete walk, and limit 0 answers every result', async () => {
    await wants('searchdoc', 'needle', 1, searchAnswer('searchdoc', 'needle', 3, NEEDLE_ROWS.slice(0, 1)));
    await wants('searchdoc', 'needle', 0, searchAnswer('searchdoc', 'needle', 3, NEEDLE_ROWS));
  });

  it('answers two entities of one key and section as two rows, and the state as its own row', async () => {
    await wants('searchdoc', 'alpha', 20, searchAnswer('searchdoc', 'alpha', 1, [row('u1/backlog', 'task', 'alpha', 'backlog', '@task alpha')]));
    await wants('searchdoc', 'status', 20, searchAnswer('searchdoc', 'status', 3, [
      row('u1/backlog', 'task', 'alpha', 'backlog', 'TODO'),
      row('u1/backlog', 'task', 'beta', 'backlog', 'TODO'),
      row('u1/state', 'session', 'u1/state', 'state', 'status: ACTIVE'),
    ]));
  });

  it('never matches a column-0 comment line', () => wants('searchdoc', 'period', 20, searchAnswer('searchdoc', 'period', 0, [])));

  it('folds ASCII case', () => wants('searchdoc', 'NEEDLE IN', 20, searchAnswer('searchdoc', 'NEEDLE IN', 1, [NEEDLE_ROWS[1]])));

  it('searches the flat form as one document in section body, its id the key', () =>
    wants('flatdoc', 'needle', 20, searchAnswer('flatdoc', 'needle', 1, [row('f1/x', 'document', 'f1/x', 'body', 'flat needle value')])));

  it('searches a module with no search schema through the generic fallback', () =>
    wants('genericdoc', 'needle', 20, searchAnswer('genericdoc', 'needle', 1, [row('g1/x', 'document', 'g1/x', 'body', 'generic needle value')])));

  it('matches the raw value of a flat JSON schema, never the extracted fields', () =>
    wants('jsondoc', 'needle', 20, searchAnswer('jsondoc', 'needle', 1, [row('j1/x', 'document', 'j1/x', 'body', '{"title":"Needle title","body":"body needle"}')])));
});

describe.concurrent('store-search docs, the derived documents of the fts5 index', () => {
  const docs = (ns: string, i: number) =>
    exec(STORE_SEARCH, ['docs', files[ns].data, ns, SEARCH_VALUES[ns][i][0], join(dir, `${ns}-${i}.value`), 'sig-1'], { cwd: dir });

  it('replaces a key\'s rows: one DELETE, then one INSERT per derived document carrying the signature', async () => {
    const r = await docs('searchdoc', 0);
    expect(r.code).toBe(0);
    expect(r.stderr).toBe('');
    const statements = r.stdout.split(';\n').filter((s) => s.trim() !== '');
    expect(statements[0]).toMatch(/^DELETE FROM store_docs WHERE .*'searchdoc'.*'u1\/backlog'/s);
    const inserts = statements.slice(1);
    expect(inserts.length).toBe(3);
    for (const s of inserts) expect(s).toMatch(/^INSERT INTO store_docs\b.*'sig-1'/s);
    expect(inserts.map((s) => /'(alpha|beta)'/.exec(s)?.[1] ?? 'session')).toEqual(['session', 'alpha', 'beta']);
  });

  it('derives one body document for a flat value, its id and title the key', async () => {
    const r = await docs('flatdoc', 0);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(
      "DELETE FROM store_docs WHERE namespace = 'flatdoc' AND key = 'f1/x';\n" +
        "INSERT INTO store_docs (namespace, key, section, entity_type, entity_id, title, body, ord, sig) VALUES ('flatdoc', 'f1/x', 'body', 'document', 'f1/x', 'f1/x', 'flat needle value', 1, 'sig-1');\n",
    );
  });
});
