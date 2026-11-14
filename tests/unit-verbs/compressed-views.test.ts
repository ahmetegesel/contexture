import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { createLane, must, run, seedUnit, unit } from '../support/unit';

const U = 'cv-unit';
const D = '2026-11-14';
const LEGEND = `legend: ~/ stands for unit#${U}/ (ctx unit get prints the full address)`;

describe.concurrent('the compressed load and board views', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, U, 'the compressed views unit');
      await must(unit(sb, 'record', U, '--what=the target', `--slug=${D}-a1`));
      await must(unit(sb, 'task', 'add', U, 't1', '--objective=a task naming the target', `--refs=unit#${U}/entry/${D}-a1, file#.contexture/ctx`));
      await must(unit(sb, 'record', U, `--what=names unit#${U}/entry/${D}-a1 in its text`, `--slug=${D}-a2`, `--ref=unit#${U}/task/t1`, '--thread=the human'));
      await must(createLane(sb, U, 'l1'));
      await seedUnit(sb, 'cv-other', 'another unit');
      await must(unit(sb, 'record', 'cv-other', '--what=a foreign ref', `--slug=${D}-o1`, `--ref=unit#${U}/entry/${D}-a1`));
    }, 'posix', 'compressed-views');
  });

  it('[the-record-r20] the board prints the viewed unit\'s prefix as ~/ with its legend one line after the head; another unit\'s address stays full', async () => {
    const sb = fresh(sb0);
    const b = (await must(unit(sb, 'board', U))).stdout.split('\n');
    expect(b[1]).toBe(LEGEND);
    expect(b).toContain(`  WHAT: "names ~/entry/${D}-a1 in its text"`);
    expect(b).toContain('  REF: "~/task/t1"');
    expect(b.filter((l) => l !== LEGEND).join('\n')).not.toContain(`unit#${U}/`);
    const other = (await must(unit(sb, 'board', 'cv-other'))).stdout;
    expect(other).toContain(`  REF: "unit#${U}/entry/${D}-a1"`);
    expect(other).toContain('legend: ~/ stands for unit#cv-other/');
  });

  it('[the-record-r20] the load prints the legend once in its map block before the page header, and every page carries the compressed form', async () => {
    const sb = fresh(sb0);
    let pages = '';
    for (let p = 1; p <= 20 && !/load complete/.test(pages); p++) pages += (await must(unit(sb, 'load', U, String(p)))).stdout;
    const first = (await must(unit(sb, 'load', U))).stdout.split('\n');
    const at = first.indexOf(LEGEND);
    expect(at).toBeGreaterThan(0);
    expect(first[at - 1]).toMatch(/^WRITE SCOPE: /);
    expect(first[at + 2]).toMatch(/^\[load cv-unit \| /);
    expect(pages.split('\n').filter((l) => l === LEGEND).length).toBeGreaterThan(0);
    expect(pages).toContain(`  REFS: [~/entry/${D}-a1, file#.contexture/ctx]`);
    expect(pages).toContain('  REF: "~/task/t1"');
    expect(pages.replaceAll(LEGEND, '')).not.toContain(`unit#${U}/`);
  });

  it('[the-record-r20] the item reads print the full canonical form: task show, entry show, and get never compress', async () => {
    const sb = fresh(sb0);
    expect((await must(unit(sb, 'get', `${U}/task/t1`))).stdout).toContain(`  REFS: [unit#${U}/entry/${D}-a1, file#.contexture/ctx]`);
    expect((await must(unit(sb, 'entry', 'show', U, `${D}-a2`))).stdout).toContain(`  REF: "unit#${U}/task/t1"`);
    expect((await must(unit(sb, 'get', `${U}/entry/${D}-a2`))).stdout).toContain(`  WHAT: "names unit#${U}/entry/${D}-a1 in its text"`);
    expect((await must(run(sb, ['lane', 'show', U, 'l1', 'recipe']))).stdout).not.toContain('~/');
  });

  it.for([`~/entry/${D}-a1`, '~/task/t1', '~/lane/l1/recipe'])('[the-record-r18] the shape check refuses the legend token %s copied from a view, naming the full address, nothing written', async (ref) => {
    const sb = fresh(sb0);
    for (const argv of [['unit', 'record', U, '--what=copied', `--ref=${ref}`], ['unit', 'task', 'add', U, 't9', '--objective=copied', `--refs=${ref}`], ['lane', 'record', U, 'l1', '--what=copied', `--ref=${ref}`]]) {
      const r = await run(sb, argv);
      expect([r.code, r.stdout]).toEqual([1, '']);
      expect(r.stderr).toMatch(new RegExp(`malformed ref '${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}': a compressed view form; .*; write unit#${U}/${ref.slice(2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(ERR_INVALID_ARGUMENT\\)\\n$`));
    }
  });

  it.for([
    [`"~/entry/${D}-a1"`, `a compressed view form; a reference is a full address <owner>#<path>; write unit#${U}/entry/${D}-a1`],
    ['"lane#l1/recipe"', `a reference is a full address <owner>#<path>; write unit#${U}/lane/l1/recipe`],
    ['"base/x.sh"', 'a reference is a full address <owner>#<path>; write file#base/x.sh'],
  ] as const)('[the-record-r18] a token %s copied with its quotes is named as given and its suggestion drops the quotes', async ([ref, why]) => {
    const sb = fresh(sb0);
    for (const argv of [['unit', 'record', U, '--what=copied', `--ref=${ref}`], ['unit', 'task', 'add', U, 't9', '--objective=copied', `--refs=${ref}`]]) {
      const r = await run(sb, argv);
      expect([r.code, r.stdout]).toEqual([1, '']);
      expect(r.stderr).toMatch(new RegExp(`: error: malformed ref '${ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}': ${why.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(ERR_INVALID_ARGUMENT\\)\\n$`));
    }
  });

  it('[the-record-r14] refs-to refuses a compressed view target naming its full address', async () => {
    const r = await unit(fresh(sb0), 'refs-to', `~/entry/${D}-a1`);
    expect([r.code, r.stdout, r.stderr]).toEqual([
      1,
      '',
      `refs-to: error: malformed ref '~/entry/${D}-a1': a compressed view form; a reference is a full address <owner>#<path>; write unit#<unit>/entry/${D}-a1 (ERR_INVALID_ARGUMENT)\n`,
    ]);
  });

  it.for(['load', 'board'])('[the-record-r-agqjp] the %s help names the ~/ legend, the full item reads, and a literal ~/ in prose', async (verb) => {
    const r = await unit(fresh(sb0), 'help', verb);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('legend: ~/ stands for unit#<unit>/ (ctx unit get prints the full address)');
    expect(r.stdout).toContain('the item reads (task show, entry show, finding show, get, lane show) and stored data stay full');
    expect(r.stdout).toContain('a literal ~/ in stored prose (a home path) prints the same, never escaped');
  });
});
