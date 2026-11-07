import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_SHAPED, dataFile, moduleDir } from '../support/data-file';
import { exec } from '../support/exec';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';

const STORE_DATA = join(ROOT, 'base/.contexture/storage/scripts/store-data');

function workspace(): string {
  const sb = sandbox('store-data');
  mkdirSync(join(sb, '.contexture/modules'), { recursive: true });
  dataFile(sb, 'extensions', 'docs', DOCS_SHAPED);
  return sb;
}

const storeData = (sb: string, ns: string) => exec(STORE_DATA, [ns], { cwd: sb, env: { CTX_STORE_WORKSPACE: sb } });
const listing = (sb: string, ...extra: string[]) => exec(STORE_DATA, ['--list', ...extra], { cwd: sb, env: { CTX_STORE_WORKSPACE: sb } });

async function answerLines(sb: string, ns: string): Promise<string[]> {
  const r = await storeData(sb, ns);
  expect(r.stderr).toBe('');
  expect(r.code).toBe(0);
  return r.stdout.split('\n').slice(0, -1);
}

async function refusal(sb: string, ns: string, rc: number, reason: string): Promise<void> {
  const r = await storeData(sb, ns);
  expect(r.stdout).toBe('');
  expect(r.stderr).toBe(`store-data: ${reason}\n`);
  expect(r.code).toBe(rc);
}

const probe = (fields: string) => `namespace: probe\nroot: probe-root\nsuffix: .txt\nkey: <a>/<b>\n${fields}`;

describe.concurrent('store-data, the data file reader', () => {
  it('[modules-r10] answers a docs-shaped declaration from the extension root on twelve lines, the data file path among them', async () => {
    const sb = workspace();
    expect(await answerLines(sb, 'docs')).toEqual([
      'docs', 'docs', '.md', '<repo>/<slug>', 'true', join(moduleDir(sb, 'extensions', 'docs'), 'data'), '', '', '', 'key', 'line', 'exact',
    ]);
  });

  it('[modules-r10] a declaration of namespace and key alone takes the defaults: root the namespace, an empty suffix, changes false', async () => {
    const sb = workspace();
    const file = dataFile(sb, 'modules', 'minimal', 'namespace: minimal\nkey: <a>/<b>\n');
    expect(await answerLines(sb, 'minimal')).toEqual(['minimal', 'minimal', '', '<a>/<b>', 'false', file, '', '', '', 'key', 'line', 'exact']);
  });

  it('[modules-r10, the-engine-p4] a second module declaring the namespace refuses, naming both owners', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'probe', probe('changes: false\n'));
    dataFile(sb, 'modules', 'probe2', probe('changes: true\n'));
    await refusal(sb, 'probe', 1, "namespace 'probe' is declared by more than one module: probe probe2");
  });

  it('[modules-r10, the-engine-p4] a declaration duplicated across the workspace and the extension roots refuses', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'docs-copy', DOCS_SHAPED);
    await refusal(sb, 'docs', 1, "namespace 'docs' is declared by more than one module: docs-copy docs");
  });

  it('an undeclared namespace answers rc 3 and an absent module drawer rc 2', async () => {
    const sb = workspace();
    await refusal(sb, 'nosuch', 3, "namespace 'nosuch' is declared by no module data file");
    const r = await storeData(sandbox('no-drawer'), 'docs');
    expect(r.code).toBe(2);
    expect(r.stdout).toBe('');
    expect(r.stderr).toMatch(/^store-data: .+\n$/);
  });

  it.each([
    ['Bad!', "malformed namespace 'Bad!'"],
    ['', "malformed namespace ''"],
  ])('a malformed namespace token %j refuses', async (ns, reason) => {
    await refusal(workspace(), ns, 1, reason);
  });

  it.each([
    ['an unknown field', probe('mode: fast\nchanges: true\n'), "unknown field 'mode' in the data file"],
    ['a root escaping the workspace', 'namespace: probe\nroot: ../outside\nsuffix: .txt\nkey: <a>/<b>\n', "malformed root '../outside' (a workspace-relative folder inside the workspace)"],
    ['an absolute root', 'namespace: probe\nroot: /abs\nsuffix: .txt\nkey: <a>/<b>\n', "malformed root '/abs' (a workspace-relative folder inside the workspace)"],
    ['a key without placeholders', 'namespace: probe\nkey: a/b\n', "malformed key pattern 'a/b' (a <name> placeholder per slash-separated segment, the last optionally <name...>)"],
    ['a non-final multi-segment placeholder', 'namespace: probe\nkey: <a>/<b...>/<c>\n', "malformed key pattern '<a>/<b...>/<c>' (a <name> placeholder per slash-separated segment, the last optionally <name...>)"],
    ['a bad changes flag', probe('changes: maybe\n'), "malformed changes flag 'maybe' (true or false)"],
    ['a duplicate search key', probe('format: text\nformat: json\n'), "duplicate field 'format' in the data file"],
    ['a document form without a rule', probe('search: documents\n'), 'the document-set search form takes at least one document rule'],
    ['a document form with a format', probe('search: documents\nformat: text\ndocument: <a>/<b> body document -\n'), 'the document-set search form takes no format or fields'],
    ['a document rule on the flat form', probe('search: flat\ndocument: <a>/<b> body document -\n'), 'a document rule needs the document-set search form'],
    ['a three-token document rule', probe('changes: false\nsearch: documents\ndocument: <a>/<b> body document\n'), 'line 7: a document rule takes the key pattern, the section, the entity type, and the head marker (or -)'],
    ['a repeated mode', probe('search: flat\nmodes: exact, exact\n'), "duplicate mode 'exact'"],
    ['modes without exact', probe('search: flat\nmodes: hybrid\n'), 'the modes must include exact'],
  ])('[modules-r10] %s refuses rc 1 naming the rule', async (_, text, reason) => {
    const sb = workspace();
    dataFile(sb, 'modules', 'probe', text);
    await refusal(sb, 'probe', 1, reason);
  });

  it('[modules-r10] refuses a declaration with no key pattern, and finds none for a file with no namespace', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'nokey', 'namespace: nokey\nroot: r\nsuffix: .txt\n');
    dataFile(sb, 'modules', 'nonamespace', 'key: <a>/<b>\n');
    await refusal(sb, 'nokey', 1, 'the data file declares no key pattern');
    await refusal(sb, 'nonamespace', 3, "namespace 'nonamespace' is declared by no module data file");
  });

  it('[modules-r10] answers a variable-depth <unit>/<path...> declaration and refuses a non-final <unit...>', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'variable', 'namespace: variable\nroot: .contexture/sessions\nsuffix: .md\nkey: <unit>/<path...>\nchanges: false\n');
    expect((await answerLines(sb, 'variable')).slice(0, 5)).toEqual(['variable', '.contexture/sessions', '.md', '<unit>/<path...>', 'false']);
    dataFile(sb, 'modules', 'variable', 'namespace: variable\nroot: .contexture/sessions\nsuffix: .md\nkey: <unit...>/<path>\nchanges: false\n');
    await refusal(sb, 'variable', 1, "malformed key pattern '<unit...>/<path>' (a <name> placeholder per slash-separated segment, the last optionally <name...>)");
  });

  it('[modules-r10] the optional flat search keys are accepted and answered on the schema lines', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'searchy', probe('changes: false\nformat: text\nfields: title, body\ntitle: title\nsnippet: line\nmodes: exact\n'));
    const lines = await answerLines(sb, 'probe');
    expect(lines.slice(0, 5)).toEqual(['probe', 'probe-root', '.txt', '<a>/<b>', 'false']);
    expect(lines.slice(6)).toEqual(['flat', 'text', 'title,body', 'title', 'line', 'exact']);
  });

  it('[modules-r10] refuses an argument beyond the namespace, and beyond the listing flag, rc 1', async () => {
    const sb = workspace();
    const one = await exec(STORE_DATA, ['docs', 'extra'], { cwd: sb, env: { CTX_STORE_WORKSPACE: sb } });
    expect([one.code, one.stdout, one.stderr]).toEqual([1, '', "store-data: unexpected argument 'extra' (store-data <namespace>, or store-data --list)\n"]);
    const list = await listing(sb, 'extra');
    expect([list.code, list.stdout, list.stderr]).toEqual([1, '', "store-data: unexpected argument 'extra' (store-data --list takes no argument)\n"]);
  });

  it('[modules-r10] the listing mode answers every valid declaration of both roots, namespace TAB root, sorted by namespace, the default root the namespace', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'minimal', 'namespace: minimal\nkey: <a>/<b>\n');
    dataFile(sb, 'modules', 'probe', probe('changes: false\n'));
    dataFile(sb, 'extensions', 'alpha', 'namespace: alpha\nroot: .contexture/alpha-root\nkey: <a>\n');
    const r = await listing(sb);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe('alpha\t.contexture/alpha-root\ndocs\tdocs\nminimal\tminimal\nprobe\tprobe-root\n');
  });

  it('[modules-r10, the-engine-p4] the listing leaves out a malformed declaration, a namespace token it cannot serve, a file with no namespace, and a doubly declared namespace, one stderr line each, rc 0', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'probe', probe('mode: fast\n'));
    dataFile(sb, 'modules', 'nonamespace', 'key: <a>/<b>\n');
    dataFile(sb, 'modules', 'badtoken', 'namespace: Bad!\nkey: <a>\n');
    dataFile(sb, 'modules', 'twice', 'namespace: twice\nkey: <a>\n');
    dataFile(sb, 'extensions', 'twice2', 'namespace: twice\nkey: <a>\n');
    const r = await listing(sb);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('docs\tdocs\n');
    expect(r.stderr).toBe([
      "store-data: the data file of module 'badtoken' declares a malformed namespace 'Bad!'",
      "store-data: the data file of module 'nonamespace' declares no namespace",
      "store-data: namespace 'probe': unknown field 'mode' in the data file",
      "store-data: namespace 'twice' is declared by more than one module: twice twice2",
      '',
    ].join('\n'));
  });

  it('the listing mode answers rc 2 with one line on an absent module drawer, and nothing for a drawer declaring nothing', async () => {
    const absent = await listing(sandbox('no-drawer'));
    expect([absent.code, absent.stdout]).toEqual([2, '']);
    expect(absent.stderr).toMatch(/^store-data: .+\n$/);
    const sb = sandbox('empty-drawer');
    mkdirSync(join(sb, '.contexture/modules'), { recursive: true });
    expect(await listing(sb)).toMatchObject({ code: 0, stdout: '', stderr: '' });
  });

  it('[modules-r10] the document-set form answers its rules after the twelve lines, one tab-separated rule per line', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'unitlike', [
      'namespace: unitlike', 'key: <unit>/<path...>', 'search: documents', 'modes: exact, hybrid, trigram',
      'document: <unit>/state state session -', 'document: <unit>/journal journal entry @entry', '',
    ].join('\n'));
    const lines = await answerLines(sb, 'unitlike');
    expect(lines.slice(6, 12)).toEqual(['documents', '', '', 'head', 'line', 'exact,hybrid,trigram']);
    expect(lines.slice(12)).toEqual(['<unit>/state\tstate\tsession\t-', '<unit>/journal\tjournal\tentry\t@entry']);
  });
});
