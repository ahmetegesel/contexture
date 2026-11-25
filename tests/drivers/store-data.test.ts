import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCS_SHAPED, dataFile, moduleDir } from '../support/data-file';
import { RECORD_ROOT } from '../support/drawer';
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

const probe = (fields: string) => `root: probe-root\nsuffix: .txt\nkey: <a>/<b>\n${fields}`;

describe.concurrent('store-data, the data file reader', () => {
  it('[modules-r10] answers a docs-shaped declaration from the extension root on eleven lines, the data file path among them', async () => {
    const sb = workspace();
    expect(await answerLines(sb, 'docs')).toEqual([
      'docs', 'docs', '.md', '<repo>/<slug>', 'true', join(moduleDir(sb, 'extensions', 'docs'), 'data'), '', '', '', 'key', 'line',
    ]);
  });

  it('[modules-r10] a declaration of a key pattern alone takes the defaults: the namespace the folder\'s name, the root the namespace, an empty suffix, changes false', async () => {
    const sb = workspace();
    const file = dataFile(sb, 'modules', 'minimal', 'key: <a>/<b>\n');
    expect(await answerLines(sb, 'minimal')).toEqual(['minimal', 'minimal', '', '<a>/<b>', 'false', file, '', '', '', 'key', 'line']);
  });

  it('[modules-r10, the-engine-r-cj0ey] the namespace is the module folder\'s name: a folder\'s data file serves its own name and never another', async () => {
    const sb = workspace();
    const file = dataFile(sb, 'modules', 'probe2', probe('changes: true\n'));
    expect(await answerLines(sb, 'probe2')).toEqual(['probe2', 'probe-root', '.txt', '<a>/<b>', 'true', file, '', '', '', 'key', 'line']);
    await refusal(sb, 'probe', 3, "namespace 'probe' is declared by no module data file");
  });

  it('[modules-r10, the-engine-r-cj0ey] a namespace line refuses as an unknown field naming the fix', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'probe', `namespace: probe\n${probe('')}`);
    await refusal(sb, 'probe', 1, "unknown field 'namespace' in the data file: the namespace is the module folder's name, so remove the namespace line");
  });

  it('[modules-r10, modules-r14] a workspace module shadows an extension module of its name, as discovery resolves the name', async () => {
    const sb = workspace();
    const file = dataFile(sb, 'modules', 'docs', 'root: ws-docs\nkey: <repo>/<slug>\n');
    expect(await answerLines(sb, 'docs')).toEqual(['docs', 'ws-docs', '', '<repo>/<slug>', 'false', file, '', '', '', 'key', 'line']);
  });

  const record = (sb: string, pkg: string, lines: string) => {
    mkdirSync(join(sb, '.contexture/extensions/.state'), { recursive: true });
    writeFileSync(join(sb, '.contexture/extensions/.state', `${pkg}.files`), `package ${pkg}\nversion 1.0.0\nkind feature\n${lines}`);
  };
  const ROOTED = 'root: docs\nfallback_root: old-docs\nsuffix: .md\nkey: <repo>/<slug>\nchanges: true\n';

  it('[modules-r10, modules-r15, the-engine-r-cj0ey] an extension module installed under an alias answers its namespace as the root and no fallback root: a declared root applies only under the module\'s own name', async () => {
    const sb = workspace();
    const file = dataFile(sb, 'extensions', 'docs2', ROOTED);
    record(sb, 'docs-pro', 'module docs2 docs\nfile rw-r--r-- 1:1 .contexture/extensions/modules/docs2/data\n');
    const aliased = await withFallback(sb, 'docs2');
    expect([aliased.code, aliased.stderr]).toEqual([0, '']);
    expect(aliased.stdout.split('\n').slice(0, 12)).toEqual(['docs2', 'docs2', '.md', '<repo>/<slug>', 'true', file, '', '', '', 'key', 'line', '']);
    expect((await answerLines(sb, 'docs')).slice(0, 2)).toEqual(['docs', 'docs']);
    expect((await listing(sb)).stdout).toBe('docs\tdocs\ndocs2\tdocs2\n');
    const own = workspace();
    dataFile(own, 'extensions', 'docs2', ROOTED);
    record(own, 'docs-pro', 'module docs2 docs2\nmodule other docs\n');
    const plain = await withFallback(own, 'docs2');
    expect(plain.stdout.split('\n').slice(0, 2)).toEqual(['docs2', 'docs']);
    expect(plain.stdout.split('\n')[11]).toBe('old-docs');
    expect((await listing(own)).stdout).toBe('docs\tdocs\ndocs2\tdocs\told-docs\n');
  });

  it('[modules-r10, the-engine-r-cj0ey] a workspace module is never installed under an alias, so a record line never moves its declared root', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'shared', 'root: common\nkey: <a>\n');
    record(sb, 'pkg', 'module shared other\n');
    expect((await answerLines(sb, 'shared')).slice(0, 2)).toEqual(['shared', 'common']);
  });

  it('[modules-r10, the-engine-r-cj0ey] an install record area or record that exists but cannot be read refuses an extension module rc 2 naming no path, the listing leaving it out with one line and exiting 1, while a workspace module still answers', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'wsmod', 'key: <a>\n');
    record(sb, 'docs-pro', 'module docs docs\n');
    const state = join(sb, '.contexture/extensions/.state');
    const line = "store-data: the install record area cannot be read, so the storage root of namespace 'docs' is unknown\n";
    chmodSync(state, 0o000);
    try {
      expect(await storeData(sb, 'docs')).toMatchObject({ code: 2, stdout: '', stderr: line });
      expect((await answerLines(sb, 'wsmod')).slice(0, 2)).toEqual(['wsmod', 'wsmod']);
      const list = await listing(sb);
      expect([list.code, list.stdout, list.stderr]).toEqual([1, 'wsmod\twsmod\n', `store-data: namespace 'docs': ${line.slice('store-data: '.length)}`]);
    } finally {
      chmodSync(state, 0o755);
    }
    chmodSync(join(state, 'docs-pro.files'), 0o000);
    try {
      expect(await storeData(sb, 'docs')).toMatchObject({ code: 2, stdout: '', stderr: line });
    } finally {
      chmodSync(join(state, 'docs-pro.files'), 0o644);
    }
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
    ['.hidden', "malformed namespace '.hidden'"],
    ['..', "malformed namespace '..'"],
    ['_lead', "malformed namespace '_lead'"],
    ['-dash', "malformed namespace '-dash'"],
  ])('[modules-r1, the-engine-r-cj0ey] a malformed namespace token %j refuses, the module name rule starting with a letter or digit', async (ns, reason) => {
    await refusal(workspace(), ns, 1, reason);
  });

  it.each([
    ['an unknown field', probe('mode: fast\nchanges: true\n'), "unknown field 'mode' in the data file"],
    ['a root escaping the workspace', 'root: ../outside\nsuffix: .txt\nkey: <a>/<b>\n', "malformed root '../outside' (a workspace-relative folder inside the workspace)"],
    ['an absolute root', 'root: /abs\nsuffix: .txt\nkey: <a>/<b>\n', "malformed root '/abs' (a workspace-relative folder inside the workspace)"],
    ['a key without placeholders', 'key: a/b\n', "malformed key pattern 'a/b' (a <name> placeholder per slash-separated segment, the last optionally <name...>)"],
    ['a non-final multi-segment placeholder', 'key: <a>/<b...>/<c>\n', "malformed key pattern '<a>/<b...>/<c>' (a <name> placeholder per slash-separated segment, the last optionally <name...>)"],
    ['a bad changes flag', probe('changes: maybe\n'), "malformed changes flag 'maybe' (true or false)"],
    ['a duplicate search key', probe('format: text\nformat: json\n'), "duplicate field 'format' in the data file"],
    ['a document form without a rule', probe('search: documents\n'), 'the document-set search form takes at least one document rule'],
    ['a document form with a format', probe('search: documents\nformat: text\ndocument: <a>/<b> body document -\n'), 'the document-set search form takes no format or fields'],
    ['a document rule on the flat form', probe('search: flat\ndocument: <a>/<b> body document -\n'), 'a document rule needs the document-set search form'],
    ['a three-token document rule', probe('changes: false\nsearch: documents\ndocument: <a>/<b> body document\n'), 'line 6: a document rule takes the key pattern, the section, the entity type, and the head marker (or -)'],
    ['a modes line, the driver registering the modes', probe('search: flat\nmodes: exact\n'), "unknown field 'modes' in the data file: the search modes are the configured driver's registry, so remove the modes line"],
  ])('[modules-r10] %s refuses rc 1 naming the rule', async (_, text, reason) => {
    const sb = workspace();
    dataFile(sb, 'modules', 'probe', text);
    await refusal(sb, 'probe', 1, reason);
  });

  it('[modules-r10] refuses a declaration with no key pattern, and serves a key pattern alone under the folder\'s name', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'nokey', 'root: r\nsuffix: .txt\n');
    const file = dataFile(sb, 'modules', 'keyonly', 'key: <a>/<b>\n');
    await refusal(sb, 'nokey', 1, 'the data file declares no key pattern');
    expect(await answerLines(sb, 'keyonly')).toEqual(['keyonly', 'keyonly', '', '<a>/<b>', 'false', file, '', '', '', 'key', 'line']);
  });

  it('[modules-r10] answers a variable-depth <unit>/<path...> declaration and refuses a non-final <unit...>', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'variable', `root: ${RECORD_ROOT}\nsuffix: .md\nkey: <unit>/<path...>\nchanges: false\n`);
    expect((await answerLines(sb, 'variable')).slice(0, 5)).toEqual(['variable', RECORD_ROOT, '.md', '<unit>/<path...>', 'false']);
    dataFile(sb, 'modules', 'variable', `root: ${RECORD_ROOT}\nsuffix: .md\nkey: <unit...>/<path>\nchanges: false\n`);
    await refusal(sb, 'variable', 1, "malformed key pattern '<unit...>/<path>' (a <name> placeholder per slash-separated segment, the last optionally <name...>)");
  });

  it('[modules-r10, the-engine-r-cj0ey, the-engine-r-kvr01] an empty suffix beside a <name...> pattern and a suffix past 48 bytes refuse rc 1 naming the data file line; an empty suffix with a fixed pattern and a 48 byte suffix read', async () => {
    const sb = workspace();
    const sfx48 = `.${'s'.repeat(47)}`;
    dataFile(sb, 'modules', 'deep', `# no suffix\nkey: <p...>\n`);
    await refusal(sb, 'deep', 1, "line 2: the key pattern '<p...>' ends in a <name...> placeholder while the suffix is empty, so one key could be another key's folder (declare a suffix, or a fixed depth pattern)");
    dataFile(sb, 'modules', 'deep', `key: <u>/<p...>\nsuffix:\n`);
    await refusal(sb, 'deep', 1, "line 1: the key pattern '<u>/<p...>' ends in a <name...> placeholder while the suffix is empty, so one key could be another key's folder (declare a suffix, or a fixed depth pattern)");
    dataFile(sb, 'modules', 'deep', `key: <p...>\nsuffix: ${sfx48}s\n`);
    await refusal(sb, 'deep', 1, `line 2: the suffix '${sfx48}s' is longer than 48 bytes (a 200 byte key segment, the suffix, and the write temp's 7 bytes fit a 255 byte file name)`);
    dataFile(sb, 'modules', 'deep', `key: <p...>\nsuffix: ${sfx48}\n`);
    expect((await answerLines(sb, 'deep')).slice(2, 4)).toEqual([sfx48, '<p...>']);
    dataFile(sb, 'modules', 'flat', 'key: <c>/<id>\n');
    expect((await answerLines(sb, 'flat')).slice(2, 4)).toEqual(['', '<c>/<id>']);
    expect((await listing(sb)).stderr).toBe('');
  });

  it('[modules-r10, the-engine-r-cj0ey] the shipped unit, store, ideas, and docs declarations and the notes worked example still read under the suffix rules', async () => {
    for (const [cwd, ns] of [['base', 'unit'], ['base', 'store'], ['.', 'ideas']] as const) {
      const r = await exec(STORE_DATA, [ns], { cwd: join(ROOT, cwd), env: { CTX_STORE_WORKSPACE: join(ROOT, cwd) } });
      expect([ns, r.code, r.stderr]).toEqual([ns, 0, '']);
    }
    for (const [module, file] of [['docs', 'plugins/docs-discipline/.contexture/extensions/modules/docs/data'], ['notes', 'tests/fixtures/worked-package/.contexture/extensions/modules/notes/data']] as const) {
      const sb = workspace();
      dataFile(sb, 'extensions', module, readFileSync(join(ROOT, file), 'utf8'));
      expect([module, (await answerLines(sb, module)).length > 10]).toEqual([module, true]);
    }
  });

  it('[modules-r10] the optional flat search keys are accepted and answered on the schema lines', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'searchy', probe('changes: false\nformat: text\nfields: title, body\ntitle: title\nsnippet: line\n'));
    const lines = await answerLines(sb, 'searchy');
    expect(lines.slice(0, 5)).toEqual(['searchy', 'probe-root', '.txt', '<a>/<b>', 'false']);
    expect(lines.slice(6)).toEqual(['flat', 'text', 'title,body', 'title', 'line']);
  });

  it('[modules-r10, the-engine-r-cj0ey] refuses an argument beyond the namespace, --with-fallback, --with-fields, and --with-unsearched, a repeated flag, and an argument beyond the listing flag, rc 1', async () => {
    const sb = workspace();
    const usage = (arg: string) => `store-data: unexpected argument '${arg}' (store-data <namespace> [--with-fallback] [--with-fields] [--with-unsearched], or store-data --list)\n`;
    const one = await exec(STORE_DATA, ['docs', 'extra'], { cwd: sb, env: { CTX_STORE_WORKSPACE: sb } });
    expect([one.code, one.stdout, one.stderr]).toEqual([1, '', usage('extra')]);
    const two = await exec(STORE_DATA, ['docs', '--with-fallback', 'extra'], { cwd: sb, env: { CTX_STORE_WORKSPACE: sb } });
    expect([two.code, two.stdout, two.stderr]).toEqual([1, '', usage('extra')]);
    const three = await exec(STORE_DATA, ['docs', '--with-fields', '--with-fallback', 'extra'], { cwd: sb, env: { CTX_STORE_WORKSPACE: sb } });
    expect([three.code, three.stdout, three.stderr]).toEqual([1, '', usage('extra')]);
    for (const flag of ['--with-fallback', '--with-fields', '--with-unsearched']) {
      const twice = await exec(STORE_DATA, ['docs', flag, flag], { cwd: sb, env: { CTX_STORE_WORKSPACE: sb } });
      expect([twice.code, twice.stdout, twice.stderr, flag]).toEqual([1, '', usage(flag), flag]);
    }
    const list = await listing(sb, 'extra');
    expect([list.code, list.stdout, list.stderr]).toEqual([1, '', "store-data: unexpected argument 'extra' (store-data --list takes no argument)\n"]);
  });

  const legacy = (fallback: string, root = 'new-root') => `root: ${root}\nfallback_root: ${fallback}\nsuffix: .md\nkey: <u>/<path...>\nsearch: documents\ndocument: <u>/state state session -\n`;
  const withFallback = (sb: string, ns: string) => exec(STORE_DATA, [ns, '--with-fallback'], { cwd: sb, env: { CTX_STORE_WORKSPACE: sb } });

  it('[modules-r10, the-engine-r-cj0ey] accepts a fallback root and keeps the plain answer byte identical: eleven lines, then the rules', async () => {
    const sb = workspace();
    const file = dataFile(sb, 'modules', 'legacy', legacy('old-root'));
    const lines = await answerLines(sb, 'legacy');
    expect(lines).toEqual(['legacy', 'new-root', '.md', '<u>/<path...>', 'false', file, 'documents', '', '', 'head', 'line', '<u>/state\tstate\tsession\t-']);
    const other = workspace();
    dataFile(other, 'modules', 'legacy', legacy('old-root').replace('fallback_root: old-root\n', ''));
    const plain = await answerLines(other, 'legacy');
    expect(lines.filter((_, i) => i !== 5)).toEqual(plain.filter((_, i) => i !== 5));
  });

  it('[modules-r10, the-engine-r-cj0ey] --with-fallback answers the fallback root as line 12 and the rules from line 13, an empty line 12 when none is declared', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'legacy', legacy('old-root'));
    const r = await withFallback(sb, 'legacy');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout.split('\n').slice(11)).toEqual(['old-root', '<u>/state\tstate\tsession\t-', '']);
    const none = await withFallback(sb, 'docs');
    expect([none.code, none.stderr]).toEqual([0, '']);
    expect(none.stdout.split('\n').slice(10)).toEqual(['line', '', '']);
  });

  it.each([
    ['a malformed fallback root', legacy('../outside'), "malformed fallback root '../outside' (a workspace-relative folder inside the workspace)"],
    ['a fallback root equal to the root', legacy('new-root'), "the fallback root 'new-root' equals the root"],
    ['a fallback root inside the root', legacy('new-root/old'), "the fallback root 'new-root/old' and the root 'new-root' are nested"],
    ['a root inside the fallback root', legacy('old', 'old/new'), "the fallback root 'old' and the root 'old/new' are nested"],
    ['a fallback equal to the default root', 'fallback_root: legacy\nkey: <u>\n', "the fallback root 'legacy' equals the root"],
    ['a duplicate fallback root', 'fallback_root: a\nfallback_root: b\nkey: <u>\n', "duplicate field 'fallback_root' in the data file"],
  ])('[modules-r10, the-engine-r-cj0ey] %s refuses rc 1 naming the rule', async (_, text, reason) => {
    const sb = workspace();
    dataFile(sb, 'modules', 'legacy', text);
    await refusal(sb, 'legacy', 1, reason);
  });

  it('[modules-r10, the-engine-r-cj0ey] the listing answers a declared fallback root as a third column, two columns otherwise', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'legacy', legacy('old-root'));
    const r = await listing(sb);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe('docs\tdocs\nlegacy\tnew-root\told-root\n');
  });

  it('[modules-r10] the listing mode answers every valid declaration of both roots, namespace TAB root, sorted by namespace, the default root the namespace', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'minimal', 'key: <a>/<b>\n');
    dataFile(sb, 'modules', 'probe', probe('changes: false\n'));
    dataFile(sb, 'extensions', 'alpha', 'root: .contexture/alpha-root\nkey: <a>\n');
    const r = await listing(sb);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe('alpha\t.contexture/alpha-root\ndocs\tdocs\nminimal\tminimal\nprobe\tprobe-root\n');
  });

  it('[modules-r10, the-engine-r-cj0ey] the listing leaves out a malformed declaration and a folder name that is no namespace, one stderr line each, answers a name both roots hold once, the workspace module\'s, and exits 1 with the rows it read', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'probe', probe('mode: fast\n'));
    dataFile(sb, 'modules', 'oldline', 'namespace: oldline\nkey: <a>\n');
    dataFile(sb, 'modules', 'Bad!', 'key: <a>\n');
    dataFile(sb, 'extensions', '_lead', 'key: <a>\n');
    dataFile(sb, 'modules', 'twice', 'root: twice-ws\nkey: <a>\n');
    dataFile(sb, 'extensions', 'twice', 'root: twice-ext\nkey: <a>\n');
    const r = await listing(sb);
    expect(r.code).toBe(1);
    expect(r.stdout).toBe('docs\tdocs\ntwice\ttwice-ws\n');
    expect(r.stderr).toBe([
      "store-data: the module folder 'Bad!' names no namespace: a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit",
      "store-data: the module folder '_lead' names no namespace: a module name is lowercase letters, digits, dot, underscore, and dash, starting with a letter or digit",
      "store-data: namespace 'oldline': unknown field 'namespace' in the data file: the namespace is the module folder's name, so remove the namespace line",
      "store-data: namespace 'probe': unknown field 'mode' in the data file",
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

  it('[modules-r10] the document-set form answers its rules after the eleven lines, one tab-separated rule per line', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'unitlike', [
      'key: <unit>/<path...>', 'suffix: .md', 'search: documents',
      'document: <unit>/state state session -', 'document: <unit>/journal journal entry @entry', '',
    ].join('\n'));
    const lines = await answerLines(sb, 'unitlike');
    expect(lines.slice(6, 11)).toEqual(['documents', '', '', 'head', 'line']);
    expect(lines.slice(11)).toEqual(['<unit>/state\tstate\tsession\t-', '<unit>/journal\tjournal\tentry\t@entry']);
  });

  const STATUS = 'status: optional line one-of OPEN|PICKED|DROPPED default OPEN';
  const FIELDED = [
    'root: idea-root', 'key: <id>', 'search: documents', 'document: <id> body idea -',
    `field: ${STATUS}`, 'field:   what: required block', '# a comment between field lines', 'field: dumped: optional line default today', '',
  ].join('\n');
  const UNFIELDED = FIELDED.split('\n').filter((l) => !l.startsWith('field:')).join('\n');
  const asked = (sb: string, ns: string, ...flags: string[]) => exec(STORE_DATA, [ns, ...flags], { cwd: sb, env: { CTX_STORE_WORKSPACE: sb } });
  const okLines = async (sb: string, ns: string, ...flags: string[]) => {
    const r = await asked(sb, ns, ...flags);
    expect([r.code, r.stderr]).toEqual([0, '']);
    return r.stdout;
  };

  it('[modules-r10, the-engine-r-cj0ey] a field line is accepted and answered under --with-fields alone: after the document rules, one @field line per field in declaration order, the blanks after field: dropped', async () => {
    const sb = workspace();
    const file = dataFile(sb, 'modules', 'ideas', FIELDED);
    const fixed = ['ideas', 'idea-root', '', '<id>', 'false', file, 'documents', '', '', 'head', 'line'];
    const rule = '<id>\tbody\tidea\t-';
    const fieldLines = [`@field\t${STATUS}`, '@field\twhat: required block', '@field\tdumped: optional line default today'];
    expect((await okLines(sb, 'ideas', '--with-fields')).split('\n')).toEqual([...fixed, rule, ...fieldLines, '']);
    const both = [...fixed, '', rule, ...fieldLines, ''];
    expect((await okLines(sb, 'ideas', '--with-fallback', '--with-fields')).split('\n')).toEqual(both);
    expect((await okLines(sb, 'ideas', '--with-fields', '--with-fallback')).split('\n')).toEqual(both);
  });

  it('[modules-r10, the-engine-r-cj0ey] the plain, --with-fallback, and --list answers of a data file holding field lines are byte identical to the same file without them', async () => {
    const withFields = workspace();
    dataFile(withFields, 'modules', 'ideas', FIELDED);
    const without = workspace();
    dataFile(without, 'modules', 'ideas', UNFIELDED);
    const strip = (out: string, sb: string) => out.replace(sb, '<sb>');
    for (const flags of [[], ['--with-fallback']]) {
      expect([strip(await okLines(withFields, 'ideas', ...flags), withFields), flags]).toEqual([strip(await okLines(without, 'ideas', ...flags), without), flags]);
    }
    expect(await listing(withFields)).toMatchObject({ code: 0, stdout: 'docs\tdocs\nideas\tidea-root\n', stderr: '' });
  });

  const UNSEARCHED = ['key: <unit>/<path...>', 'suffix: .md', 'search: documents', 'document: <unit>/journal journal entry @entry', 'unsearched: <unit>/state', 'unsearched:   <unit>/lanes/<lane>/notes', 'field: what: optional line', ''].join('\n');
  const UNLISTED = UNSEARCHED.split('\n').filter((l) => !l.startsWith('unsearched:')).join('\n');

  it('[modules-r10, the-engine-r-cj0ey] an unsearched line is answered under --with-unsearched alone: after the document rules and before any field line, one @unsearched line per line in declaration order', async () => {
    const sb = workspace();
    const file = dataFile(sb, 'modules', 'unitlike', UNSEARCHED);
    const fixed = ['unitlike', 'unitlike', '.md', '<unit>/<path...>', 'false', file, 'documents', '', '', 'head', 'line'];
    const rule = '<unit>/journal\tjournal\tentry\t@entry';
    const uns = ['@unsearched\t<unit>/state', '@unsearched\t<unit>/lanes/<lane>/notes'];
    expect((await okLines(sb, 'unitlike', '--with-unsearched')).split('\n')).toEqual([...fixed, rule, ...uns, '']);
    const all = [...fixed, '', rule, ...uns, '@field\twhat: optional line', ''];
    expect((await okLines(sb, 'unitlike', '--with-fields', '--with-unsearched', '--with-fallback')).split('\n')).toEqual(all);
    expect((await okLines(sb, 'unitlike', '--with-unsearched', '--with-fallback', '--with-fields')).split('\n')).toEqual(all);
  });

  it('[modules-r10, the-engine-r-cj0ey] the plain, --with-fallback, --with-fields, and --list answers of a data file holding unsearched lines are byte identical to the same file without them', async () => {
    const withLines = workspace();
    dataFile(withLines, 'modules', 'unitlike', UNSEARCHED);
    const without = workspace();
    dataFile(without, 'modules', 'unitlike', UNLISTED);
    const strip = (out: string, sb: string) => out.replace(sb, '<sb>');
    for (const flags of [[], ['--with-fallback'], ['--with-fields']]) {
      expect([strip(await okLines(withLines, 'unitlike', ...flags), withLines), flags]).toEqual([strip(await okLines(without, 'unitlike', ...flags), without), flags]);
    }
    expect((await listing(withLines)).stdout).toBe((await listing(without)).stdout);
  });

  it.each([
    ['a pattern with a blank inside', 'unsearched: <unit>/a b', 'an unsearched line takes one key pattern'],
    ['an empty pattern', 'unsearched:', 'an unsearched line takes one key pattern'],
    ['a malformed segment', 'unsearched: <unit>/st*te', "malformed unsearched key pattern '<unit>/st*te'"],
    ['a non-final multi-segment placeholder', 'unsearched: <unit...>/state', "malformed unsearched key pattern '<unit...>/state'"],
  ])('[modules-r10, the-engine-r-cj0ey] an unsearched line holding %s refuses rc 1 naming its line', async (_, line, reason) => {
    const sb = workspace();
    dataFile(sb, 'modules', 'unitlike', `key: <unit>/<path...>\n${line}\nsuffix: .md\n`);
    await refusal(sb, 'unitlike', 1, `line 2: ${reason}`);
  });

  it('[modules-r10, the-engine-r-cj0ey] the unit module declares its state an unsearched document, so the state stays out of its document rules', async () => {
    const lines = (await exec(STORE_DATA, ['unit', '--with-unsearched'], { cwd: join(ROOT, 'base'), env: { CTX_STORE_WORKSPACE: join(ROOT, 'base') } })).stdout.split('\n');
    expect(lines.filter((l) => l.startsWith('@unsearched\t'))).toEqual(['@unsearched\t<unit>/state']);
    expect(lines.filter((l) => l.startsWith('<unit>/state\t'))).toEqual([]);
  });

  it('[modules-r10, the-engine-r-cj0ey] a data file with no field line answers --with-fields exactly as without it, docs-shaped and unit-shaped alike', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'legacy', legacy('old-root'));
    for (const ns of ['docs', 'legacy']) {
      expect([await okLines(sb, ns, '--with-fields'), ns]).toEqual([await okLines(sb, ns), ns]);
      expect([await okLines(sb, ns, '--with-fallback', '--with-fields'), ns]).toEqual([await okLines(sb, ns, '--with-fallback'), ns]);
    }
  });

  const RESERVED = 'json, limit, type, mode, container, id, ref, unset, stdin, any name starting with add-, any name starting with remove-';
  it.each([
    ['a malformed presence clause', 'field: status: mandatory line\n', "line 2: field 'status': the presence clause is required or optional, not 'mandatory'"],
    ['an unknown clause', 'field: status: optional line wide\n', "line 2: field 'status': unknown clause 'wide' (a field line is <name>: <required|optional> <line|block> [list] [one-of <A|B|...>] [default <value>])"],
    ['a name declared twice, named on its second line', 'field: status: optional line\n# between\nfield: status: required line\n', "line 4: field 'status': declared twice"],
    ['a reserved name', 'field: json: optional line\n', `line 2: field 'json': the name is reserved (${RESERVED})`],
    ['a reserved prefix after a good line', 'field: what: required block\nfield: add-tag: optional line\n', `line 3: field 'add-tag': the name is reserved (${RESERVED})`],
    ['a trailing blank, the tightened grammar', 'field: status: optional line one-of A|B \n', "line 2: field 'status': the line ends with a blank"],
    ['a doubled blank', 'field: status: optional  line\n', "line 2: field 'status': the line holds a doubled blank"],
    ['a clause after one-of', 'field: status: optional line one-of A|B list\n', "line 2: field 'status': a clause after one-of ('list'): only a default may follow the one-of set"],
    ['an uppercase field name', 'field: Status: optional line\n', "line 2: field 'Status': a field name is lowercase letters, digits, underscore, and dash, starting with a letter"],
    ['a declaration without a colon', 'field: status optional line\n', 'line 2: a field line is <name>: <required|optional> <line|block> [list] [one-of <A|B|...>] [default <value>]'],
    ['an empty field line', 'field:   \n', 'line 2: the field line is empty'],
    ['a carriage return inside the line', 'field: status: optional\rline\n', 'line 2: the field line holds a carriage return'],
  ])('[modules-r10, the-engine-r-cj0ey] %s refuses rc 1 naming the data file line', async (_, fieldText, reason) => {
    const sb = workspace();
    dataFile(sb, 'modules', 'probe', `key: <a>\n${fieldText}`);
    await refusal(sb, 'probe', 1, reason);
    const fields = await asked(sb, 'probe', '--with-fields');
    expect([fields.code, fields.stdout, fields.stderr]).toEqual([1, '', `store-data: ${reason}\n`]);
  });

  it('[modules-r10, the-engine-r-cj0ey] a field line that is not UTF-8 refuses rc 1 naming its line', async () => {
    const sb = workspace();
    const dir = moduleDir(sb, 'modules', 'probe');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'data'), Buffer.concat([Buffer.from('key: <a>\nfield: what: required block\nfield: tag: optional line default '), Buffer.from([0xff]), Buffer.from('\n')]));
    await refusal(sb, 'probe', 1, 'line 3: the field line is not valid UTF-8');
  });

  it('[modules-r10, the-engine-r-cj0ey] another refusal of the file comes first, and the listing leaves out a malformed field declaration with its one line, exiting 1', async () => {
    const sb = workspace();
    dataFile(sb, 'modules', 'probe', 'key: <a>\nmode: fast\nfield: status: bogus line\n');
    await refusal(sb, 'probe', 1, "unknown field 'mode' in the data file");
    dataFile(sb, 'modules', 'probe', 'key: <a>\nfield: status: bogus line\n');
    dataFile(sb, 'modules', 'good', `key: <a>\nfield: ${STATUS}\n`);
    const r = await listing(sb);
    expect([r.code, r.stdout, r.stderr]).toEqual([1, 'docs\tdocs\ngood\tgood\n', "store-data: namespace 'probe': line 2: field 'status': the presence clause is required or optional, not 'bogus'\n"]);
  });
});
