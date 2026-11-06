import { beforeAll, describe, expect, it } from 'vitest';
import { fresh, seed } from '../support/snapshot';
import { must, seedUnit, unit } from '../support/unit';

const search = (sb: string, ...args: string[]) => unit(sb, 'search', 'x-unit', ...args);

describe.concurrent('ctx unit search on posix', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'x-unit', 'defect regression unit');
      for (const [slug, objective] of [['x-todo', 'Open task'], ['x-prog', 'Running task'], ['x-shared', 'zzshared term in a task']]) await must(unit(sb, 'task', 'add', 'x-unit', slug!, `--objective=${objective}`));
      await must(unit(sb, 'finding', 'add', 'x-unit', 'X_SHARED', '--summary=zzshared term in a finding'));
      await must(unit(sb, 'finding', 'add', 'x-unit', 'ARCH_DECISION', '--summary=Architecture decision 1'));
      await must(unit(sb, 'finding', 'supersede', 'x-unit', 'ARCH_DECISION', 'ARCH_V2', '--summary=Architecture decision version 2'));
      await seedUnit(sb, 'y-unit', 'payload fidelity unit');
      await must(unit(sb, 'task', 'add', 'y-unit', 'y-keep', '--objective=Kept task'));
      await seedUnit(sb, 'bg2-unit', 'the quote pair unit');
    }, 'posix', 'search');
  });

  it('E-12 [the-record-r13]: search finds a finding', async () => {
    expect((await search(fresh(sb0), 'Architecture decision', '--mode=exact')).stdout).toContain('ARCH_V2');
  });

  it('X-m [the-record-r13]: --limit caps the results; every result carries the one shape and no physical file key', async () => {
    const sb = fresh(sb0);
    expect((await search(sb, 'task', '--mode=exact', '--json', '--limit=1')).stdout.match(/"entity_type":/g)).toHaveLength(1);
    const out = (await search(sb, 'task', '--mode=exact', '--json', '--limit=50')).stdout;
    expect(out).toMatch(/"entity_type":"[a-z_]*","entity_id":"[^"]*","section":"[a-z_]*","snippet":/);
    expect(out).not.toContain('"file":');
  });

  it('X-m E3-2 [the-record-r13]: a search without --mode refuses before any call naming the declared modes; diagnose lists them', async () => {
    const sb = fresh(sb0);
    const r = await search(sb, 'task');
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/^search: error: --mode is required/m);
    expect(r.stderr).toMatch(/declared modes: exact \(ERR_INVALID_ARGUMENT\)$/m);
    expect((await search(sb, 'task', '--json')).stdout).toBe('');
    expect((await unit(sb, 'diagnose')).stdout).toMatch(/^ {2}search modes: {4}exact$/m);
  });

  it('X-m E3-1 [the-record-r13]: the search help and usage name --mode and no driver mode, pointing to diagnose', async () => {
    const sb = fresh(sb0);
    const help = await unit(sb, 'search', '--help');
    expect(help.stdout + help.stderr).toContain(' --mode=MODE ');
    expect(help.stdout + help.stderr).not.toMatch(/hybrid|trigram/);
    const table = await unit(sb, 'help', 'search');
    expect(table.stdout + table.stderr).toContain('ctx unit diagnose');
    expect(table.stdout + table.stderr).not.toMatch(/hybrid|trigram/);
    expect((await unit(sb, 'search')).stderr).not.toMatch(/hybrid|trigram/);
  });

  it('X-m [the-record-r13]: --entity keeps one entity type', async () => {
    const sb = fresh(sb0);
    expect((await search(sb, 'zzshared', '--mode=exact', '--json', '--limit=50')).stdout).toContain('"entity_type":"task"');
    const findings = (await search(sb, 'zzshared', '--mode=exact', '--json', '--entity=finding', '--limit=50')).stdout;
    expect(findings).toContain('"entity_type":"finding"');
    expect(findings).not.toContain('"entity_type":"task"');
  });

  it('X-m [the-record-r13]: --mode=exact is honored and reported; the text view is its own format', async () => {
    const sb = fresh(sb0);
    const json = await search(sb, 'Open task', '--json', '--mode=exact');
    expect(json.code).toBe(0);
    expect(json.stdout).toContain('"entity_id":"x-todo"');
    expect(json.stdout).toContain('"mode":"exact"');
    const text = (await search(sb, 'Open task', '--mode=exact')).stdout;
    expect(text).toMatch(/^search x-unit "Open task": \d+ matches/m);
    expect(text).not.toMatch(/^\{"unit"/m);
  });

  it('X-m [the-record-r13]: an empty query refuses ERR_INVALID_ARGUMENT; --mode=hybrid refuses ERR_CAPABILITY_UNSUPPORTED on posix', async () => {
    const sb = fresh(sb0);
    const empty = await search(sb, '', '--mode=exact');
    expect(empty.code).toBe(1);
    expect(empty.stderr).toContain('ERR_INVALID_ARGUMENT');
    const hybrid = await search(sb, 'task', '--mode=hybrid');
    expect(hybrid.code).toBe(1);
    expect(hybrid.stderr).toContain('ERR_CAPABILITY_UNSUPPORTED');
  });

  it('Y-b R9 [the-record-r13]: an exact snippet carries no edge padding', async () => {
    const out = (await unit(fresh(sb0), 'search', 'y-unit', 'Kept task', '--mode=exact', '--json')).stdout;
    expect(out).toMatch(/"snippet":"[^"]*Kept task/);
    expect(out).not.toContain('\\n"}');
  });

  it('Y-b BG2 [the-record-r13]: a snippet keeps the quote pair on a lowercase field line', async () => {
    const out = (await unit(fresh(sb0), 'search', 'bg2-unit', 'the quote pair unit', '--mode=exact', '--json')).stdout;
    expect(out).toContain('"snippet":"objective: \\"the quote pair unit\\""');
    expect(out).not.toContain('the quote pair unit","score"');
  });
});
