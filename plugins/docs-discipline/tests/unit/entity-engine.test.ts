import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec } from '@support/exec';
import { sandbox } from '@support/sandbox';
import { corpusDir, ENGINE_FIXTURES, matches, TESTS } from '../support/corpus';
import { edit } from '../support/edit';
import { entities } from '../support/engines';

const EXPECTED = join(TESTS, 'unit/expected/search');

// the reference encoding, written apart from the engine's: every ASCII byte outside letters,
// digits, and - _ . / : , + @ as %XX in uppercase hex, every byte above ASCII kept
const SAFE = new Set(Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_./:,+@'));
const enc = (key: string): string => [...Buffer.from(key)].map((b) => (b >= 0x80 || SAFE.has(b) ? String.fromCharCode(b) : `%${b.toString(16).toUpperCase().padStart(2, '0')}`)).join('');
const encode = (key: string): string => Buffer.from(enc(key), 'latin1').toString('utf8');
const decode = (id: string): string => {
  const b = Buffer.from(id);
  const out: number[] = [];
  for (let i = 0; i < b.length; i++) {
    if (b[i] === 0x25) {
      out.push(Number.parseInt(b.subarray(i + 1, i + 3).toString(), 16));
      i += 2;
    } else out.push(b[i]);
  }
  return Buffer.from(out).toString('utf8');
};

// a doc whose entries are keyed by every awkward byte: blanks, a tab, a control byte, a percent
// sign spelled like another key's address, a byte above ASCII, every byte a shell reads
// specially, a backslash (beside the key it would read as were it an escape), a quote with a
// backslash before it, a data_flow key holding >, a multi token edge, an apostrophe, and a
// keyless rule; written as the writer writes a value (quoted, no byte escaped), plus two
// unquoted keys the writer never writes: trailing blanks and a tab after the colon
const SHELL = String.raw`100% "sure" $(touch pwned) ;|&<>*?[]{}!#~^=` + '`' + String.raw`'\ `.trimEnd();
const NAMES = ['store module', 'plain-key', 'x y', 'x%20y', 'café latte', 'tab\tkey', 'ctl\x01key', SHELL, 'backslash', String.raw`back\slash`, String.raw`say \"hi\"`];
const RAW: readonly (readonly [string, string])[] = [
  ['trail  ', '  - name: trail  '],
  ['\ttabbed', '  - name:\ttabbed'],
];
const NATURAL = [...NAMES, ...RAW.map(([n]) => n)];
const HEADS = [...NAMES.map((n) => `  - name: "${n}"`), ...RAW.map(([, h]) => h)];
const COMPONENTS = NATURAL.map((n, i) => [HEADS[i], `    responsibilities: "zkz ${n.length} bytes or so"`]);
const HEAD = ['@doc architecture keys', '  repo: ekeys', '  description: "Entries keyed by every awkward byte"', '  sources: [k/**]', '  keywords: [k]'];
const RULE = ['  - rule: "zkz a keyless rule stays on the header"'];
const FLOW = ['  - from: "web"', '    to: "orders"', '    evidence: "zkz"'];
const EDGE = ['  - direction: consumes', '    via: streams', '    key: the change delta', '    detail: zkz an edge keyed by more than one token'];
const STEP = ['  - step: "Run a plugin\'s tests"', '    detail ::', '      zkz an apostrophe in a step'];
const KEYS_DOC = [...HEAD, '', '@components', ...COMPONENTS.flat(), '', '@dependency_rules', ...RULE, '', '@data_flow', ...FLOW, '', '@edges', ...EDGE, '', '@run', ...STEP, ''].join('\n');
const KEYED: readonly (readonly [string, readonly string[]])[] = [
  ...NATURAL.map((n, i) => [`components/${n}`, COMPONENTS[i]] as const),
  ['data_flow/web>orders', FLOW],
  ['edges/consumes:the change delta', EDGE],
  ["run/Run a plugin's tests", STEP],
];

let corpus: string;
let engine: string;
let keys: string;
beforeAll(() => {
  corpus = corpusDir('entity-corpus');
  engine = corpusDir('entity-engine', ENGINE_FIXTURES);
  keys = sandbox('entity-keys');
  mkdirSync(join(keys, 'docs/ekeys'), { recursive: true });
  writeFileSync(join(keys, 'docs/ekeys/keys.md'), KEYS_DOC);
});

describe('the entity engine addressing every entry keyed by a value, encoded', { concurrent: true }, () => {
  it('[docs-module-r-yyfxd] every keyed entry is its own row under its encoded key, the keyless rule on the header, in line order', async () => {
    const r = await entities(keys, { mode: 'search', query: 'zkz', limit: 50, json: true });
    expect([r.code, r.stderr]).toEqual([0, '']);
    const rows = JSON.parse(r.stdout).rows as { type: string; id: string; address: string; read: string }[];
    const want = KEYED.map(([k]) => ({ type: 'entry', id: encode(k) }));
    want.splice(NATURAL.length, 0, { type: 'doc', id: 'header' });
    expect(rows.map((x) => ({ type: x.type, id: x.id }))).toEqual(want);
    expect(rows.map((x) => x.id)).toEqual(expect.arrayContaining(['components/backslash', 'components/back%5Cslash', 'components/say%20%5C%22hi%5C%22', 'components/trail%20%20', 'components/%09tabbed']));
    expect(rows.map((x) => x.id)).toContain('components/store%20module');
    expect(rows.map((x) => x.id)).toContain('data_flow/web%3Eorders');
    expect(rows.map((x) => x.id)).toContain('run/Run%20a%20plugin%27s%20tests');
    expect(rows.map((x) => x.id)).toContain('components/x%2520y');
    expect(rows.map((x) => x.id)).toContain('components/café%20latte');
  });

  it('[docs-module-r-yyfxd] every id is one token of safe bytes and decodes back to its natural key byte for byte', async () => {
    const rows = JSON.parse((await entities(keys, { mode: 'search', query: 'zkz', limit: 50, json: true })).stdout).rows as { id: string; address: string; read: string }[];
    const ids = rows.map((x) => x.id).filter((id) => id !== 'header');
    expect(ids.map(decode)).toEqual(KEYED.map(([k]) => k));
    for (const id of ids) {
      expect([...Buffer.from(id)].every((b) => b >= 0x80 || b === 0x25 || SAFE.has(b)), id).toBe(true);
      expect(id).not.toMatch(/%(?![0-9A-F]{2})/);
    }
    for (const row of rows) {
      expect(row.address).toBe(`docs#ekeys/keys/${row.id}`);
      expect(row.read).toBe(`ctx docs get ekeys/keys/${row.id}`);
    }
  });

  it('[docs-module-r-yyfxd] every read line runs unquoted in a POSIX shell as one literal word: no split, glob, expansion, or redirection', async () => {
    const rows = JSON.parse((await entities(keys, { mode: 'search', query: 'zkz', limit: 50, json: true })).stdout).rows as { read: string }[];
    const cwd = sandbox('entity-keys-shell');
    writeFileSync(join(cwd, 'a'), '');
    for (const { read } of rows) {
      const words = await exec('sh', ['-c', `printf '%s\\n' ${read}`], { cwd, env: {} });
      expect([words.code, words.stdout, words.stderr]).toEqual([0, `${read.split(' ').join('\n')}\n`, '']);
    }
    const left = await exec('sh', ['-c', 'ls'], { cwd, env: {} });
    expect(left.stdout).toBe('a\n');
  });

  it.each(KEYED.map(([k, lines]) => [k, lines] as const))('[docs-module-r-98mvk] get prints the entry keyed %j whole by its encoded key', async (k, lines) => {
    const r = await entities(keys, { mode: 'get', key: encode(k) });
    expect([r.code, r.stdout, r.stderr]).toEqual([0, `${lines.join('\n')}\n`, '']);
  });

  // x y is left out: its encoding x%20y is the natural key of another entry, the ambiguity the
  // edit engine refuses naming #N (edit-engine W38b)
  it.each(KEYED.filter(([k]) => k !== 'components/x y').map(([k, lines]) => [k, lines] as const))('[docs-module-r5, docs-module-r21] the edit engine reads the key alike: query --entry answers the encoded key a row prints for %j with the entry get prints', async (k, lines) => {
    const block = k.slice(0, k.indexOf('/'));
    const r = await edit(keys, { op: 'show', repo: 'ekeys', slug: 'keys', doc: join(keys, 'docs/ekeys/keys.md'), block, key: encode(k).slice(block.length + 1) });
    expect([r.code, r.stdout, r.stderr]).toEqual([0, `${lines.join('\n')}\n`, '']);
  });

  it('[docs-module-r-98mvk] get answers the old one token spelling of a key holding a shell byte, never a spelling with a blank, and never takes a percent sign for a decode', async () => {
    const old = await entities(keys, { mode: 'get', key: 'data_flow/web>orders' });
    expect([old.code, old.stdout]).toEqual([0, `${FLOW.join('\n')}\n`]);
    const blank = await entities(keys, { mode: 'get', key: 'components/store module' });
    expect([blank.code, blank.stdout]).toEqual([3, '']);
    const twin = await entities(keys, { mode: 'get', key: 'components/x%20y' });
    expect(twin.stdout).toBe(`${COMPONENTS[2].join('\n')}\n`);
    const pct = await entities(keys, { mode: 'get', key: 'components/x%2520y' });
    expect(pct.stdout).toBe(`${COMPONENTS[3].join('\n')}\n`);
  });

  it('[docs-module-r-98mvk] get header prints every line the header owns in file order: the header block, then the keyless rule under its marker, no marker of a block whose entries are all keyed', async () => {
    const r = await entities(keys, { mode: 'get', key: 'header' });
    expect([r.code, r.stdout, r.stderr]).toEqual([0, `${[...HEAD, '', '@dependency_rules', ...RULE].join('\n')}\n`, '']);
  });
});

describe('the entity engine searching the staged corpus, against committed expected output', { concurrent: true }, () => {
  it.each([
    ['word', 'checkout'],
    ['phrase', 'checkout handoff'],
    ['symbol', 'validateCart'],
  ])('[docs-module-r-yyfxd] %s: one row per matching entity, its first matching line the snippet', async (name, query) => {
    const r = await entities(corpus, { mode: 'search', query, limit: 50 });
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(matches(r.stdout, join(EXPECTED, `${name}.txt`)));
  });

  it('[docs-module-r-yyfxd] --json answers {query, mode, total, rows}, each row in the shared shape, total counting every match before the limit', async () => {
    const all = JSON.parse((await entities(corpus, { mode: 'search', query: 'checkout', limit: 50, json: true })).stdout);
    const two = JSON.parse((await entities(corpus, { mode: 'search', query: 'checkout', limit: 2, json: true })).stdout);
    expect(Object.keys(all)).toEqual(['query', 'mode', 'total', 'rows']);
    expect([all.query, all.mode]).toEqual(['checkout', 'exact']);
    expect(all.total).toBe(all.rows.length);
    expect(all.total).toBeGreaterThan(2);
    expect([two.total, two.rows]).toEqual([all.total, all.rows.slice(0, 2)]);
    for (const row of all.rows) {
      expect(Object.keys(row)).toEqual(['module', 'container', 'type', 'id', 'address', 'snippet', 'read']);
      expect(row.module).toBe('docs');
      expect(row.address).toBe(`docs#${row.container}/${row.id}`);
      expect(row.read).toBe(`ctx docs get ${row.container}/${row.id}`);
      expect(row.id).not.toMatch(/[ \t"]/);
    }
  });

  it('[docs-module-r-yyfxd] the types: an id keyed pitfall, a rule, an entry keyed by one token, and the header for a line no keyed entity holds; --type keeps one', async () => {
    const rows = JSON.parse((await entities(corpus, { mode: 'search', query: 'checkout', limit: 200, json: true })).stdout).rows as { type: string; id: string }[];
    expect(rows).toContainEqual(expect.objectContaining({ type: 'pitfall', id: 'order-flow-p1' }));
    expect(rows).toContainEqual(expect.objectContaining({ type: 'doc', id: 'header' }));
    const pitfalls = JSON.parse((await entities(corpus, { mode: 'search', query: 'checkout', type: 'pitfall', limit: 200, json: true })).stdout).rows as { type: string }[];
    expect(pitfalls.length).toBeGreaterThan(0);
    expect(pitfalls.every((r) => r.type === 'pitfall')).toBe(true);
  });

  it('[docs-module-r-yyfxd] a term no line carries answers zero rows, rc 0, in both forms', async () => {
    const text = await entities(corpus, { mode: 'search', query: 'zzqqxx' });
    expect([text.code, text.stdout, text.stderr]).toEqual([0, 'docs search "zzqqxx": 0 matches\n', '']);
    const json = await entities(corpus, { mode: 'search', query: 'zzqqxx', json: true });
    expect(json.stdout).toBe('{"query":"zzqqxx","mode":"exact","total":0,"rows":[]}\n');
  });

  it('[docs-module-r-yyfxd] finds a multibyte word under LC_ALL=C, a keyless legacy rule landing on the header entity whose first match is the snippet', async () => {
    const r = await entities(engine, { mode: 'search', query: 'değil', limit: 50 });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('  doc docs#etr/turkish/header: description: "Bir kuralın değil, bir notun yeri"\n');
    expect(r.stdout).not.toContain('Kayıt değil');
  });

  it('EC4 [docs-module-r-yyfxd] keeps a backslash in the search text literal, a real tab matching nothing', async () => {
    const r = await entities(engine, { mode: 'search', query: 'zz\\tqq' });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('The marker reads zz\\tqq on disk');
    const tab = await entities(engine, { mode: 'search', query: 'zz\tqq' });
    expect(tab.stdout).toBe('docs search "zz\tqq": 0 matches\n');
  });
});
