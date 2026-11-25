import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sandbox } from '@support/sandbox';
import { corpusDir, matches, TESTS } from '../support/corpus';
import { check } from '../support/engines';
import { gitInit } from '../support/git';

const EXPECTED = join(TESTS, 'unit/expected/check');

let matrix: string;
let corpus: string;
let eng: string;
let tools: string;
let dead: string;
let drawer: string;
let globs: string;
let spans: string;
const WGLOB = '@doc capability wglob\n  repo: workspace\n  description: "The glob unit."\n  sources: [lib/*.sh, lib/old.sh, bin/*]\n';
const API_CORE = '@doc capability core\n  repo: api\n  description: "The api core."\n  sources: [src/*.ts]\n';
beforeAll(async () => {
  globs = sandbox('check-globs');
  mkdirSync(join(globs, 'docs/workspace'), { recursive: true });
  mkdirSync(join(globs, 'docs/api'), { recursive: true });
  writeFileSync(join(globs, 'docs/workspace/wglob.md'), WGLOB);
  writeFileSync(join(globs, 'docs/workspace/opt.md'), '@doc capability opt\n  repo: workspace\n  description: "The optional unit."\n  sources: [opt/ab?.sh]\n');
  writeFileSync(join(globs, 'docs/api/core.md'), API_CORE);
  spans = sandbox('check-spans');
  mkdirSync(join(spans, 'docs/workspace'), { recursive: true });
  mkdirSync(join(spans, 'docs/api'), { recursive: true });
  writeFileSync(join(spans, 'docs/workspace/wglob.md'), WGLOB);
  writeFileSync(join(spans, 'docs/workspace/map.md'), '@doc capability map\n  repo: workspace\n  description: "The api map."\n  sources: [projects/api/src/**]\n');
  writeFileSync(join(spans, 'docs/api/core.md'), API_CORE);
  dead = sandbox('check-dead');
  mkdirSync(join(dead, 'docs/workspace'), { recursive: true });
  writeFileSync(join(dead, 'docs/workspace/dead.md'), '@doc capability dead\n  repo: workspace\n  description: "The dead-source unit."\n  sources: [src/**, src/old.sh, bin/*, bin/tool]\n');
  tools = sandbox('check-tools');
  mkdirSync(join(tools, 'docs/demo'), { recursive: true });
  writeFileSync(join(tools, 'docs/demo/tools.md'), '@doc capability tools\n  repo: demo\n  description: "The demo tools."\n  sources: [bin/*, lib/gone, etc/conf]\n');
  await gitInit(tools, 'docs/demo/tools.md');
  drawer = sandbox('check-drawer');
  mkdirSync(join(drawer, 'docs/workspace'), { recursive: true });
  writeFileSync(join(drawer, 'docs/workspace/drawer.md'), '@doc capability drawer\n  repo: workspace\n  description: "Custom workspace module."\n  sources: [.contexture/modules/custom/**, .contexture/modules/custom/exact.sh]\n');
  await gitInit(drawer, 'docs/workspace/drawer.md');
  matrix = sandbox('check-matrix');
  mkdirSync(join(matrix, 'docs/demo'), { recursive: true });
  writeFileSync(join(matrix, 'docs/demo/widgets.md'), '@doc capability widgets\n  repo: demo\n  description: "Widget catalog and rendering."\n  sources: [src/widgets/*.cs]\n');
  writeFileSync(join(matrix, 'docs/demo/platform.md'), '@doc structural platform\n  repo: demo\n  description: "Shared platform services."\n  sources: [src/widgets/Widget.cs]\n');
  await gitInit(matrix, 'docs/demo/widgets.md', 'docs/demo/platform.md');
  corpus = corpusDir('check-corpus');
  eng = sandbox('check-eng');
  mkdirSync(join(eng, 'docs/workspace'), { recursive: true });
  writeFileSync(join(eng, 'docs/workspace/eng.md'), '@doc capability eng\n  repo: workspace\n  description: "The eng unit."\n  sources: [src/a.sh]\n');
});

const WIDGET = 'projects/demo/src/widgets/Widget.cs';
const MATRIX: [string, number, string, string][] = [
  ['1 a clean tree', 0, '', ''],
  ['2 code changed with its doc', 0, `M\t${WIDGET}\ndocs/demo/widgets.md\n`, 'FRESH: demo > widgets'],
  ['3 an uncovered code file created', 1, 'A\tprojects/demo/src/loose/Unknown.cs\n', 'projects/demo/src/loose/Unknown.cs'],
  ['4 code modified without its doc', 1, `M\t${WIDGET}\n`, 'STALE DOC: demo/platform'],
  ['5 two claimants, one updated', 0, `M\t${WIDGET}\ndocs/demo/platform.md\n`, 'FRESH: demo > platform'],
  ['6 a deleted file with its doc updated', 0, 'D\tprojects/demo/src/widgets/OldWidget.cs\ndocs/demo/widgets.md\n', ''],
  ['7 a deleted file without its doc', 1, `D\t${WIDGET}\n`, WIDGET],
  ['8 an uncovered Python file', 1, 'A\tprojects/demo/src/tools/report.py\n', 'projects/demo/src/tools/report.py'],
];

describe('the check engine: the close gate matrix scenarios', { concurrent: true }, () => {
  it.each(MATRIX)('[docs-module-r8] scenario %s exits %i', async (_, rc, delta, line) => {
    const r = await check(matrix, delta);
    expect(r.code, r.stdout + r.stderr).toBe(rc);
    expect(r.stdout + r.stderr).toContain(line);
  });
});

const DELTAS: [string, string][] = [
  ['01-widget-with-doc', `M\t${WIDGET}\ndocs/demo/widgets.md\n`],
  ['02-uncovered-cs', 'A\tprojects/demo/src/loose/Unknown.cs\n'],
  ['03-widget-alone', `M\t${WIDGET}\n`],
  ['04-widget-with-platform', `M\t${WIDGET}\ndocs/demo/platform.md\n`],
  ['05-deleted-with-doc', 'D\tprojects/demo/src/widgets/OldWidget.cs\ndocs/demo/widgets.md\n'],
  ['06-deleted-alone', `D\t${WIDGET}\n`],
  ['07-uncovered-py', 'A\tprojects/demo/src/tools/report.py\n'],
  ['08-claimant-rides', 'M\tprojects/demo-orders/src/order/validate.ts\ndocs/demo-orders/order-flow.md\n'],
  ['09-claimant-alone', 'M\tprojects/demo-orders/src/order/validate.ts\n'],
  ['10-uncovered-ts', 'A\tprojects/demo-orders/src/tools/report.ts\n'],
  ['11-workspace-doc-rides', 'M\tprojects/demo-orders/src/order/validate.ts\ndocs/workspace/system-map.md\n'],
  ['12-test-script', 'M\ttests/run.sh\n'],
];

describe('the check engine over the staged corpus: the twelve capture deltas, git mode', { concurrent: true }, () => {
  it.each(DELTAS)('[docs-module-r8] %s', async (name, delta) => {
    const r = await check(corpus, delta);
    const got = `rc=${r.code}\n--- stdout\n${r.stdout}--- stderr\n${r.stderr}`;
    expect(got).toBe(matches(got, join(EXPECTED, `${name}.txt`)));
  });
});

const D_BLANKET = 'M\tprojects/demo-orders/src/order/validate.ts\nM\tdocs/workspace/system-map.md\n';
const D_ALONE = 'M\tprojects/demo-orders/src/order/validate.ts\n';
const D_RIDES = 'M\tprojects/demo-orders/src/order/validate.ts\nM\tdocs/demo-orders/order-flow.md\n';

describe('the check engine: the two delta sources', { concurrent: true }, () => {
  it('S3 [docs-module-r13] git mode: a workspace doc riding keeps the blanket reported', async () => {
    const r = await check(corpus, D_BLANKET);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('FRESH (BLANKET): demo-orders > order-flow');
    expect(r.stdout).toContain('ARCH-COVERED: 1 file(s)');
  });
  it('S4 [docs-module-r14] git mode: an untracked claimant stays process-owned', async () => {
    const r = await check(corpus, D_ALONE);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('UNTRACKED CLAIMANT: demo-orders/order-flow');
  });
  it('S1 [docs-module-r13] log mode: a workspace doc riding freshens nothing its sources do not claim', async () => {
    const r = await check(corpus, D_BLANKET, { log: true });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('STALE DOC: demo-orders/order-flow');
    expect(r.stdout + r.stderr).not.toContain('BLANKET');
    expect(r.stdout + r.stderr).not.toContain('ARCH-COVERED');
  });
  it('S2 [docs-module-r14] log mode: an untracked claimant reads STALE', async () => {
    const r = await check(corpus, D_ALONE, { log: true });
    expect(r.code).toBe(1);
    expect(r.stdout + r.stderr).toContain('STALE DOC: demo-orders/order-flow');
    expect(r.stdout + r.stderr).not.toContain('UNTRACKED CLAIMANT');
  });
  it.each([['git', false], ['log', true]] as const)('S5 [docs-module-r8] %s mode: the claiming doc riding reads FRESH', async (_, log) => {
    const r = await check(corpus, D_RIDES, { log });
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('FRESH: demo-orders > order-flow (doc updated in change delta)');
  });
});

describe('the check engine: a doc touch only at the corpus logical address docs/<repo>/<slug>.md', { concurrent: true }, () => {
  it('[docs-module-r12] log mode: a code path ending in a corpus-shaped tail freshens nothing', async () => {
    const r = await check(eng, 'M\tsrc/a.sh\nM\tplugins/p/tests/sample/docs/workspace/eng.md\n', { log: true });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('STALE DOC: workspace/eng');
    expect(r.stdout).not.toContain('FRESH:');
  });
  it('[docs-module-r12] log mode: the doc at its logical address still reads FRESH', async () => {
    const r = await check(eng, 'M\tsrc/a.sh\nM\tdocs/workspace/eng.md\n', { log: true });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toContain('FRESH: workspace > eng (doc updated in change delta)');
  });
  it('[docs-module-r12] git mode: a package seed of a workspace doc triggers no blanket', async () => {
    const r = await check(matrix, `M\t${WIDGET}\nM\tplugins/p/docs/workspace/conventions.md\n`);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('STALE DOC: demo/platform');
    expect(r.stdout).not.toContain('BLANKET');
    expect(r.stdout).not.toContain('ARCH-COVERED');
  });
  it("[docs-module-r12] git mode: a child repository's own guide under its prefix is no doc touch", async () => {
    const r = await check(matrix, `M\t${WIDGET}\nM\tprojects/demo/docs/demo/widgets.md\n`);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('STALE DOC: demo/platform');
    expect(r.stdout).not.toContain('FRESH: demo > widgets');
  });
});

const shebangs = (name: string, body: string): string => {
  const path = join(tools, `${name}.list`);
  writeFileSync(path, body);
  return path;
};
const uncovered = (out: string): string[] => out.match(/^UNCOVERED: .*$/gm) ?? [];

describe('the check engine: the governed set, the code extensions with awk plus the shebang scripts the verb vouched for', { concurrent: true }, () => {
  it('[docs-module-r10] an unclaimed shebang script reads UNCOVERED rc 1', async () => {
    const r = await check(tools, 'A\tnowhere/brand-new-script\n', { shebangs: shebangs('unclaimed', 'shebang\tnowhere/brand-new-script\n') });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(uncovered(r.stdout)).toEqual(['UNCOVERED: nowhere/brand-new-script']);
  });
  it('[docs-module-r10] an unclaimed .awk engine reads UNCOVERED rc 1', async () => {
    const r = await check(tools, 'A\tnowhere/engine.awk\n');
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(uncovered(r.stdout)).toEqual(['UNCOVERED: nowhere/engine.awk']);
  });
  it('[docs-module-r10] an extensionless file without a shebang stays out, a header source listing it exactly included', async () => {
    const r = await check(tools, 'A\tnowhere/notes\nM\tprojects/demo/etc/conf\n', { shebangs: shebangs('plain', 'plain\tnowhere/notes\nplain\tprojects/demo/etc/conf\n') });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toContain('UNCOVERED:');
    expect(r.stdout).not.toContain('STALE DOC');
  });
  it('[docs-module-r10] EXCLUDE_RE applies before the shebang list', async () => {
    const r = await check(tools, 'A\tspec/run\n', { shebangs: shebangs('excluded', 'shebang\tspec/run\n') });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toContain('UNCOVERED:');
  });
  it('[docs-module-r8, docs-module-r10] a claimed shebang script changed with no claimant riding reads STALE DOC under a tracked corpus', async () => {
    const r = await check(tools, 'M\tprojects/demo/bin/run\n', { shebangs: shebangs('claimed', 'shebang\tprojects/demo/bin/run\n') });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('STALE DOC: demo/tools (code modified without doc update)');
  });
  it('[docs-module-r9, docs-module-r11] a deleted extensionless path a header source lists exactly is governed', async () => {
    const r = await check(tools, 'D\tprojects/demo/lib/gone\n');
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('STALE DOC: demo/tools (code deleted without doc update)');
    expect(r.stdout).toContain("DEAD SOURCE: demo/tools still explicitly lists deleted file 'projects/demo/lib/gone'");
  });
  it.each([
    ['a code file', 'src/old.sh'],
    ['an extensionless script', 'bin/tool'],
  ])('[docs-module-r9] %s listed exactly after a broader glob of the same doc reads its DEAD SOURCE once deleted, its doc riding', async (_, path) => {
    const r = await check(dead, `D\t${path}\nM\tdocs/workspace/dead.md\n`);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('FRESH: workspace > dead (doc updated in change delta)');
    expect(r.stdout).toContain(`DEAD SOURCE: workspace/dead still explicitly lists deleted file '${path}'`);
  });
  it('[docs-module-r9, docs-module-r11] a deleted extensionless path a glob alone claims stays out', async () => {
    const r = await check(tools, 'D\tprojects/demo/bin/old\n');
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toContain('STALE DOC');
  });
  it.each([
    ['beside an uncovered script', 'A\tnowhere/brand-new.sh\n', 1, ['UNCOVERED: nowhere/brand-new.sh']],
    ['alone', '', 0, []],
  ])('[docs-module-r10, docs-module-r11] a folder line and a <dir>/ line leave the verdict to the other paths, %s', async (_, rest, rc, lines) => {
    const r = await check(tools, `M\tprojects/demo/vendor/sub\nA\tprojects/demo/vendor/embedded/\n${rest}`);
    expect(r.code, r.stdout + r.stderr).toBe(rc);
    expect(uncovered(r.stdout)).toEqual(lines);
  });
  it('[docs-module-r10] unclaimed .contexture/ scripts (.awk, .sh, shebang) stay out of the governed set', async () => {
    const r = await check(
      drawer,
      'A\t.contexture/ctx\nA\t.contexture/modules/unit/scripts/list\nA\t.contexture/extensions/modules/docs/scripts/docs-check.awk\nA\t.contexture/storage/drivers/posix/driver.sh\n',
      { shebangs: shebangs('drawer-unclaimed', 'shebang\t.contexture/ctx\nshebang\t.contexture/modules/unit/scripts/list\n') },
    );
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(uncovered(r.stdout)).toEqual([]);
    expect(r.stdout).not.toContain('STALE DOC');
  });
  it('[docs-module-r10, docs-module-r11] claimed .contexture/ paths remain governed while unclaimed .contexture/ scripts pass', async () => {
    const stale = await check(drawer, 'M\t.contexture/modules/custom/run.sh\nA\t.contexture/ctx\n', {
      shebangs: shebangs('drawer-claimed-stale', 'shebang\t.contexture/ctx\n'),
    });
    expect(stale.code, stale.stdout + stale.stderr).toBe(1);
    expect(stale.stdout).toContain('STALE DOC: workspace/drawer');
    expect(uncovered(stale.stdout)).toEqual([]);
    const freshRun = await check(drawer, 'M\t.contexture/modules/custom/run.sh\nA\t.contexture/ctx\nM\tdocs/workspace/drawer.md\n', {
      shebangs: shebangs('drawer-claimed-fresh', 'shebang\t.contexture/ctx\n'),
    });
    expect(freshRun.code, freshRun.stdout + freshRun.stderr).toBe(0);
    expect(freshRun.stdout).toContain('FRESH: workspace > drawer');
    expect(uncovered(freshRun.stdout)).toEqual([]);
  });
  it('[docs-module-r10] nested non-root .contexture/ paths stay governed while deeply nested and deleted unclaimed drawer paths stay out', async () => {
    const r = await check(
      drawer,
      'A\tbase/.contexture/ctx\nA\tplugins/demo/.contexture/hook.sh\nA\tprojects/app/.contexture/run.sh\nA\t.contexture/plugins/demo/nested/.contexture/sub.sh\nD\t.contexture/modules/unit/old.sh\nM\t.contexture/modules/custom/README.md\n',
      { shebangs: shebangs('drawer-nested', 'shebang\tbase/.contexture/ctx\n') },
    );
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(uncovered(r.stdout).sort()).toEqual([
      'UNCOVERED: base/.contexture/ctx',
      'UNCOVERED: plugins/demo/.contexture/hook.sh',
      'UNCOVERED: projects/app/.contexture/run.sh',
    ]);
    expect(r.stdout).not.toContain('STALE DOC');
  });
  it('[docs-module-r9, docs-module-r10] deleted exact-listed .contexture/ source triggers DEAD SOURCE even when its claiming doc rides', async () => {
    const r = await check(drawer, 'D\t.contexture/modules/custom/exact.sh\nM\tdocs/workspace/drawer.md\n');
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout).toContain('FRESH: workspace > drawer');
    expect(r.stdout).toContain("DEAD SOURCE: workspace/drawer still explicitly lists deleted file '.contexture/modules/custom/exact.sh'");
  });
});

const universe = (name: string, ...lines: string[]): string => {
  const path = join(globs, `${name}.universe`);
  writeFileSync(path, lines.map((l) => `${l}\n`).join(''));
  return path;
};
const deadLines = (out: string): string[] => (out.match(/^DEAD SOURCE: .*$/gm) ?? []).sort();
const W_RIDES = 'M\tdocs/workspace/wglob.md\n';
const API_RIDES = 'M\tdocs/api/core.md\n';

describe('the check engine: the dead glob test over a planted universe list', { concurrent: true }, () => {
  it('[docs-module-r8, docs-module-r9] a glob no universe path matches reads one DEAD SOURCE line per doc and glob, counted once, rc 1', async () => {
    const r = await check(globs, `D\tlib/a.sh\nD\tlib/b.sh\n${W_RIDES}`, { universe: universe('dead', 'listed\t.', 'path\tREADME.txt') });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual(["DEAD SOURCE: workspace/wglob lists glob 'lib/*.sh' that no longer matches any file after deleting 'lib/a.sh' and 1 more (cleanup required)"]);
    expect(r.stderr).toBe('docs-check: FAILED: 1 dead source(s): a deleted file still explicitly listed in doc sources, or a glob source no file matches after the delta.\n');
  });

  it('[docs-module-r8, docs-module-r9] one deleted path names no count', async () => {
    const r = await check(globs, `D\tlib/a.sh\n${W_RIDES}`, { universe: universe('dead-one', 'listed\t.') });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual(["DEAD SOURCE: workspace/wglob lists glob 'lib/*.sh' that no longer matches any file after deleting 'lib/a.sh' (cleanup required)"]);
  });

  it('[docs-module-r9] a glob of a doc that also lists the deleted path exactly is still a candidate, beside the exact line', async () => {
    const r = await check(globs, `D\tlib/old.sh\n${W_RIDES}`, { universe: universe('both', 'listed\t.') });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual([
      "DEAD SOURCE: workspace/wglob lists glob 'lib/*.sh' that no longer matches any file after deleting 'lib/old.sh' (cleanup required)",
      "DEAD SOURCE: workspace/wglob still explicitly lists deleted file 'lib/old.sh' in sources: (cleanup required)",
    ]);
    expect(r.stderr).toContain('docs-check: FAILED: 2 dead source(s)');
  });

  it('[docs-module-r9] a listed path keeps the glob alive, and the exact dead source keeps its line and its count', async () => {
    const alive = await check(globs, `D\tlib/a.sh\n${W_RIDES}`, { universe: universe('alive', 'listed\t.', 'path\tlib/c.sh') });
    expect(alive.code, alive.stdout + alive.stderr).toBe(0);
    expect(deadLines(alive.stdout)).toEqual([]);
    const exact = await check(globs, `D\tlib/old.sh\n${W_RIDES}`, { universe: universe('exact', 'listed\t.', 'path\tlib/c.sh') });
    expect(exact.code, exact.stdout + exact.stderr).toBe(1);
    expect(deadLines(exact.stdout)).toEqual(["DEAD SOURCE: workspace/wglob still explicitly lists deleted file 'lib/old.sh' in sources: (cleanup required)"]);
    expect(exact.stderr).toContain('docs-check: FAILED: 1 dead source(s)');
  });

  it('[docs-module-r9] a glob that claimed no deleted path is never tested: a dead unrelated glob of the same doc reads nothing', async () => {
    const r = await check(globs, `D\tlib/a.sh\n${W_RIDES}`, { universe: universe('unrelated', 'listed\t.', 'path\tlib/c.sh') });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toContain("'bin/*'");
  });

  it.each([
    ['absent', undefined],
    ['empty', 'empty'],
  ])('[docs-module-r10] with the universe list %s the glob test is skipped', async (_, name) => {
    const r = await check(globs, `D\tlib/a.sh\n${W_RIDES}`, name ? { universe: universe(name) } : {});
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).not.toContain('DEAD SOURCE');
    expect(r.stderr).toBe('');
  });

  it('[docs-module-r6, docs-module-r9] the prefilter never rejects a path the glob rule accepts: an optional character ahead of a ?', async () => {
    const r = await check(globs, 'D\topt/ab.sh\nM\tdocs/workspace/opt.md\n', { universe: universe('optional', 'listed\t.', 'path\topt/a.sh') });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(deadLines(r.stdout)).toEqual([]);
  });

  it.each([
    ['projects/api/src/b.ts', 0],
    ['api/src/b.ts', 0],
    ['src/b.ts', 1],
  ])("[docs-module-r6, docs-module-r9] a child repository's doc reads the paths under its prefix, stripped: survivor %s is rc %i", async (survivor, rc) => {
    const r = await check(globs, `D\tprojects/api/src/a.ts\n${API_RIDES}`, { universe: universe(`child-${rc}-${survivor.length}`, 'listed\t.', 'listed\tprojects/api', `path\t${survivor}`) });
    expect(r.code, r.stdout + r.stderr).toBe(rc);
    expect(deadLines(r.stdout)).toEqual(rc ? ["DEAD SOURCE: api/core lists glob 'src/*.ts' that no longer matches any file after deleting 'projects/api/src/a.ts' (cleanup required)"] : []);
  });

  it("[docs-module-r9] a workspace doc reads every path, a child repository's prefixed paths among them", async () => {
    const delta = 'D\tprojects/api/src/a.ts\nM\tdocs/workspace/map.md\nM\tdocs/api/core.md\n';
    const r = await check(spans, delta, { universe: universe('union', 'listed\t.', 'listed\tprojects/api', 'path\tprojects/api/src/b.ts') });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(deadLines(r.stdout)).toEqual([]);
  });

  it('[docs-module-r17] a candidate of an unlisted repository is named in the notice and left unjudged while a listed one is judged', async () => {
    const delta = `D\tlib/a.sh\nD\tprojects/api/src/a.ts\nD\tprojects/api/src/x/a.ts\n${W_RIDES}${API_RIDES}M\tdocs/workspace/map.md\n`;
    const r = await check(spans, delta, { universe: universe('root-unlisted', 'unlisted\t.', 'listed\tprojects/api') });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual([
      "DEAD SOURCE: api/core lists glob 'src/*.ts' that no longer matches any file after deleting 'projects/api/src/a.ts' (cleanup required)",
      "DEAD SOURCE: workspace/map lists glob 'projects/api/src/**' that no longer matches any file after deleting 'projects/api/src/a.ts' and 1 more (cleanup required)",
    ]);
    expect(r.stderr).toContain("[CHECK NOTICE] 1 glob source(s) claimed a deleted path in a repository git lists nothing for (the workspace root); the check does not judge them: workspace/wglob 'lib/*.sh'\n");
  });

  it('[docs-module-r17] an unlisted child repository leaves its docs unjudged, named with its prefix', async () => {
    const r = await check(globs, `D\tprojects/api/src/a.ts\n${API_RIDES}`, { universe: universe('child-unlisted', 'listed\t.', 'unlisted\tprojects/api') });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stderr).toBe("[CHECK NOTICE] 1 glob source(s) claimed a deleted path in a repository git lists nothing for (projects/api); the check does not judge them: api/core 'src/*.ts'\n");
  });
});
