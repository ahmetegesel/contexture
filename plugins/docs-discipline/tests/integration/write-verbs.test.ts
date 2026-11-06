import { readdirSync, readFileSync, renameSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { launch, type Run } from '@support/exec';
import { pathPlant } from '@support/plants';
import { fresh } from '@support/snapshot';
import { store } from '@support/store';
import { docs, putDocs, stageSeed, STAGED_SCRIPTS } from '../support/corpus';
import { fixture, golden, ID_SEED } from '../support/edit';

const read = (name: string): string => readFileSync(fixture(name), 'utf8');
const WTEST = () => ({ 'wtest/unit': read('unit.md'), 'wtest/conv': read('conv.md'), 'wtest/map': read('map.md') });

let wtest: string;
beforeAll(async () => {
  wtest = await stageSeed('posix', 'wtest', (sb) => putDocs(sb, 'posix', WTEST()));
});

const stored = (sb: string, slug: string): Promise<Run> => store(sb, 'posix').get('docs', `wtest/${slug}`);

async function succeeds(sb: string, args: string[], slug: string, expected: string, input = '', env: Record<string, string> = {}): Promise<Run> {
  const r = await docs(sb, args, { input, env });
  expect(r.code, r.stderr).toBe(0);
  const got = await stored(sb, slug);
  expect(got.code).toBe(0);
  expect(got.stdout).toBe(expected);
  return r;
}

async function unchanged(sb: string, slug: string, act: () => Promise<Run>): Promise<Run> {
  const before = await stored(sb, slug);
  const r = await act();
  const after = await stored(sb, slug);
  expect([after.code, after.stdout]).toEqual([before.code, before.stdout]);
  return r;
}

async function refuses(sb: string, args: string[], slug: string, rc: number, message: string, input = ''): Promise<Run> {
  const r = await unchanged(sb, slug, () => docs(sb, args, { input }));
  expect(r.code).toBe(rc);
  expect(r.stderr).toContain(message);
  return r;
}

describe('the write verbs through ctx on posix: one success per verb, the stored bytes', { concurrent: true }, () => {
  it('[modules-r9, docs-module-r23] new', async () => {
    await succeeds(fresh(wtest), ['new', 'wtest', 'fresh', '--kind=structural', '--description=A fresh doc', '--sources=src/fresh/**', '--keywords=fresh'], 'fresh', golden('exp-new.md'));
  });
  it('[modules-r9, docs-module-r23] write', async () => {
    await succeeds(fresh(wtest), ['write', 'wtest', 'written'], 'written', golden('written.md'), golden('written.md'));
  });
  it('[modules-r9, docs-module-r23] header', async () => {
    await succeeds(fresh(wtest), ['header', 'wtest', 'unit', '--add-source=src/more/**', '--remove-keyword=unit', '--upstream=An upstream note'], 'unit', golden('exp-header.md'));
  });
  it('[modules-r9, docs-module-r21] rule', async () => {
    await succeeds(fresh(wtest), ['rule', 'wtest', 'conv', 'docs/second', '--caution=Mind it', '--status=violated'], 'conv', golden('exp-rule-update.md'));
  });
  it('[modules-r9, docs-module-r21] pitfall', async () => {
    await succeeds(fresh(wtest), ['pitfall', 'wtest', 'unit', 'unit-p1', '--severity=high', '--consequence=Now one line'], 'unit', golden('exp-pitfall-update.md'));
  });
  it('[modules-r9, docs-module-r21] entry', async () => {
    await succeeds(fresh(wtest), ['entry', 'wtest', 'unit', 'contract', '--rule=The middle invariant', '--evidence=midSym', '--after=#1'], 'unit', golden('exp-entry-contract-add.md'), '', { DOCS_ID_SEED: ID_SEED });
  });
  it('[modules-r9, docs-module-r24] section', async () => {
    await succeeds(fresh(wtest), ['section', 'wtest', 'unit', 'see_also'], 'unit', golden('exp-section-replace.md'), read('see-also.block'));
  });
  it('[modules-r9, docs-module-r24] replace', async () => {
    const r = await succeeds(fresh(wtest), ['replace', 'wtest', '--old=invariant holds', '--new=invariant stands', '--count=2'], 'unit', golden('exp-replace.md'));
    expect(r.stdout).toContain('2 replaced in 1 docs');
  });
  it('W25 [docs-module-r24] remove', async () => {
    const sb = fresh(wtest);
    await putDocs(sb, 'posix', { 'wtest/fresh': golden('exp-new.md') });
    const r = await docs(sb, ['remove', 'wtest', 'fresh']);
    expect([r.code, r.stdout]).toEqual([0, 'docs remove: wtest/fresh removed\n']);
    expect((await stored(sb, 'fresh')).code).toBe(1);
  });
  it('[docs-module-r24] remove --dry-run prints the doc it would delete and writes nothing', async () => {
    const sb = fresh(wtest);
    const r = await unchanged(sb, 'unit', () => docs(sb, ['remove', 'wtest', 'unit', '--dry-run']));
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe(`docs remove: wtest/unit removed\n${read('unit.md')}ctx docs remove: dry run, nothing written\n`);
  });
  it('W27 [docs-module-r22] ids keys the legacy entries and names the count', async () => {
    const r = await succeeds(fresh(wtest), ['ids', 'wtest'], 'unit', golden('exp-ids.md'), '', { DOCS_ID_SEED: ID_SEED });
    expect(r.stdout).toContain('4 entries keyed');
  });
});

describe('a dispatched docs verb stages its scratch inside the per-verb root the engine sweeps', { concurrent: true }, () => {
  const scratches = (sb: string): string[] =>
    readdirSync(join(sb, '.contexture/tmp'), { recursive: true })
      .map(String)
      .filter((p) => basename(p).startsWith('docs-io.'));

  it('[docs-module-r25, the-engine-r20] a verb killed while it holds its scratch leaves nothing the next dispatch does not remove', async () => {
    const sb = fresh(wtest);
    const verb = launch('./.contexture/ctx', ['docs', 'write', 'wtest', 'killed'], { cwd: sb, input: null, group: true, env: { GIT_CEILING_DIRECTORIES: dirname(sb) } });
    let held: string[] = [];
    for (let i = 0; i < 200 && !held.length; i++) {
      await new Promise((done) => setTimeout(done, 50));
      held = scratches(sb);
    }
    verb.signal('SIGKILL');
    await verb.result;
    expect(held).toHaveLength(1);
    expect((await docs(sb, ['query', '--index'])).code).toBe(0);
    expect(scratches(sb)).toEqual([]);
    expect(held[0]).toMatch(/^verb\.\d+\.\d+\/docs-io\./);
  });
});

describe('a components entry takes its kind through --kind on posix', { concurrent: true }, () => {
  it('[docs-module-r19] adds a component with its kind', async () => {
    await succeeds(fresh(wtest), ['entry', 'wtest', 'map', 'components', '--name=beta', '--repo=wtest', '--kind=runtime', '--stack=sh', '--responsibilities=Beta things'], 'map', golden('exp-entry-component-kind-add.md'));
  });
  it('[docs-module-r19] changes the kind of an existing component', async () => {
    await succeeds(fresh(wtest), ['entry', 'wtest', 'map', 'components', 'alpha', '--kind=runtime'], 'map', golden('exp-entry-component-kind-change.md'));
  });
});

describe('the write pipeline through ctx on posix', { concurrent: true }, () => {
  it('W4 [docs-module-r18] write --replace of the stored bytes writes nothing', async () => {
    const sb = fresh(wtest);
    const r = await unchanged(sb, 'unit', () => docs(sb, ['write', 'wtest', 'unit', '--replace'], { input: read('unit.md') }));
    expect([r.code, r.stdout]).toEqual([0, 'docs write: wtest/unit unchanged (nothing written)\n']);
  });
  it('W21 [docs-module-r19] a --stdin body past the argument and environment limit lands whole', async () => {
    const sb = fresh(wtest);
    const big = Array.from({ length: 14000 }, (_, i) => `big detail line ${String(i + 1).padStart(6, '0')}, padded out to about eighty bytes wide for the limit\n`).join('');
    expect(big.length).toBeGreaterThan(1_000_000);
    const r = await docs(sb, ['entry', 'wtest', 'map', 'dependency_rules', '#1', '--stdin=detail'], { input: big });
    expect(r.code, r.stderr).toBe(0);
    const doc = (await stored(sb, 'map')).stdout;
    const body = doc.slice(doc.indexOf('@dependency_rules')).split('\n');
    const start = body.indexOf('    detail ::') + 1;
    const end = body.findIndex((l, i) => i >= start && !l.startsWith('      '));
    const detail = body.slice(start, end).map((l) => l.slice(6));
    expect(`${detail.join('\n')}\n`).toBe(big);
  });
  it('W26 [docs-module-r22] ids --dry-run counts and writes nothing', async () => {
    const sb = fresh(wtest);
    const r = await unchanged(sb, 'unit', () => docs(sb, ['ids', 'wtest', '--dry-run']));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('dry run: 4 in 1 docs');
  });
  it('W28 [docs-module-r22] an ids rerun keys 0 and writes nothing', async () => {
    const sb = fresh(wtest);
    expect((await docs(sb, ['ids', 'wtest'])).code).toBe(0);
    const r = await unchanged(sb, 'unit', () => docs(sb, ['ids', 'wtest']));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('0 entries keyed');
  });
  it('W30 [docs-module-r18] entry --dry-run prints and writes nothing', async () => {
    const sb = fresh(wtest);
    const r = await unchanged(sb, 'unit', () => docs(sb, ['entry', 'wtest', 'unit', 'contract', '--rule=A dry rule', '--evidence=drySym', '--dry-run']));
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('dry run, nothing written');
  });
  it('W40 [docs-module-r18] a missing doc', async () => {
    await refuses(fresh(wtest), ['header', 'wtest', 'nosuch', '--description=x'], 'nosuch', 1, 'no such doc: wtest/nosuch (ERR_ENTITY_NOT_FOUND)');
  });
  it('W41 [docs-module-r24] a stale replace count names the real count', async () => {
    await refuses(fresh(wtest), ['replace', 'wtest', 'unit', '--old=invariant holds', '--new=x', '--count=5'], 'unit', 1, '2 occurrences in scope, --count says 5');
  });
  it('W42 [modules-r9, docs-module-r18] the result fails the repo audit: an id another doc holds', async () => {
    const sb = fresh(wtest);
    await putDocs(sb, 'posix', { 'wtest/dup': read('dup.md') });
    const r = await refuses(sb, ['pitfall', 'wtest', 'unit', '--id=unit-p5', '--summary=s', '--class=bug', '--severity=low', '--trigger=t', '--consequence=c', '--evidence=e'], 'unit', 1, 'fails the grammar audit');
    expect(r.stderr).toContain("duplicate id 'unit-p5'");
  });
  it('W43 [modules-r9, docs-module-r18] the result fails the repo audit: an unknown block', async () => {
    await refuses(fresh(wtest), ['write', 'wtest', 'badblock'], 'badblock', 1, "unknown block header '@bogus'", read('bad-block.md'));
  });
  it('W51 [docs-module-r23] new over an existing doc', async () => {
    await refuses(fresh(wtest), ['new', 'wtest', 'unit', '--kind=capability', '--description=d', '--sources=a', '--keywords=b'], 'unit', 1, 'wtest/unit already exists (ERR_ENTITY_EXISTS)');
  });
  it('W52 [docs-module-r23] write over an existing doc without --replace', async () => {
    await refuses(fresh(wtest), ['write', 'wtest', 'unit'], 'unit', 1, '--replace rewrites it whole', read('unit.md'));
  });
  it('W53 [docs-module-r23] --replace of an absent doc', async () => {
    await refuses(fresh(wtest), ['write', 'wtest', 'written', '--replace'], 'written', 1, '--replace rewrites an existing doc', read('written.md'));
  });
  it('RS2 [docs-module-r3] a missing module grammar refuses rc 2 naming the asset and the reinstall fix', async () => {
    const sb = fresh(wtest);
    renameSync(join(sb, STAGED_SCRIPTS, 'doc.grammar'), join(sb, 'doc.grammar.away'));
    const r = await refuses(sb, ['write', 'wtest', 'probe'], 'probe', 2, 'the corpus grammar asset scripts/doc.grammar is missing', '@doc probe probe\n  repo: workspace\n');
    expect(r.stderr).toContain('reinstall the docs module');
  });
});

describe('opaque ids through ctx on posix', { concurrent: true }, () => {
  const SEEDED = { DOCS_ID_SEED: ID_SEED };
  const PITFALL = ['--summary=s', '--class=bug', '--severity=low', '--trigger=t', '--consequence=c', '--evidence=e'];
  const OPAQUE = /^unit-p-[0-9a-z]{5}$/;
  const add = (sb: string, env: Record<string, string> = {}, ...more: string[]): Promise<Run> => docs(sb, ['pitfall', 'wtest', 'unit', ...more, ...PITFALL], { env });
  const pitfallIds = async (sb: string): Promise<string[]> =>
    (await stored(sb, 'unit')).stdout
      .split('\n')
      .filter((l) => l.startsWith('  - id: '))
      .map((l) => l.slice(8));

  it('[docs-module-r22] a fixed seed yields its id, and a second add under it draws again past the id it meets', async () => {
    const sb = fresh(wtest);
    expect((await add(sb, SEEDED)).code).toBe(0);
    expect((await add(sb, SEEDED)).code).toBe(0);
    expect(await pitfallIds(sb)).toEqual(['unit-p1', 'unit-p-kb1uj', 'unit-p-p1cup']);
  });

  it('[docs-module-r22] removing the highest id and adding again never hands the removed id out', async () => {
    for (const env of [SEEDED, {}]) {
      const sb = fresh(wtest);
      expect((await docs(sb, ['pitfall', 'wtest', 'unit', 'unit-p1', '--remove'])).code).toBe(0);
      expect((await add(sb, env)).code).toBe(0);
      const ids = await pitfallIds(sb);
      expect(ids).toHaveLength(1);
      expect(ids[0]).not.toBe('unit-p1');
      expect(ids[0]).toMatch(OPAQUE);
    }
  });

  it('[docs-module-r22] with no fixed seed each call draws its own: two adds at once take different ids', async () => {
    const pair = [fresh(wtest), fresh(wtest)];
    expect((await Promise.all(pair.map((sb) => add(sb)))).map((r) => r.code)).toEqual([0, 0]);
    const [a, b] = await Promise.all(pair.map(async (sb) => (await pitfallIds(sb))[1]));
    expect([a, b]).toEqual([expect.stringMatching(OPAQUE), expect.stringMatching(OPAQUE)]);
    expect(a).not.toBe(b);
  });

  it('[docs-module-r22] with /dev/urandom unread the seed is the process id beside the clock: two adds at once still draw apart', async () => {
    const env = pathPlant('od', 'exit 1');
    const pair = [fresh(wtest), fresh(wtest)];
    expect((await Promise.all(pair.map((sb) => add(sb, env)))).map((r) => r.code)).toEqual([0, 0]);
    const [a, b] = await Promise.all(pair.map(async (sb) => (await pitfallIds(sb))[1]));
    expect([a, b]).toEqual([expect.stringMatching(OPAQUE), expect.stringMatching(OPAQUE)]);
    expect(a).not.toBe(b);
  });

  it('[docs-module-r22] either id form named by --id addresses its entry and refuses a second entry under it', async () => {
    for (const id of ['unit-p7', 'unit-p-zz9zz']) {
      const sb = fresh(wtest);
      expect((await add(sb, {}, `--id=${id}`)).code).toBe(0);
      expect((await docs(sb, ['pitfall', 'wtest', 'unit', id, '--severity=high'])).code).toBe(0);
      const shown = await docs(sb, ['query', 'wtest', 'unit', '--entry', `pitfalls/${id}`]);
      expect([shown.code, shown.stdout.split('\n').slice(0, 4)]).toEqual([0, [`  - id: ${id}`, '    summary: "s"', '    class: bug', '    severity: high']]);
      await refuses(sb, ['pitfall', 'wtest', 'unit', `--id=${id}`, ...PITFALL], 'unit', 1, `the id ${id} already exists`);
    }
  });

  it('[docs-module-r22] an id of neither form refuses naming both', async () => {
    await refuses(fresh(wtest), ['pitfall', 'wtest', 'unit', '--id=unit-p-K3X9M', ...PITFALL], 'unit', 1, "reads unit-p<N> or unit-p-<5 lowercase letters or digits> (got 'unit-p-K3X9M')");
  });
});
