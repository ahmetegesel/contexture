import { beforeAll, describe, expect, it } from 'vitest';
import { run } from '../support/unit';
import { declare, INV, refused, snapshot, store } from './support';

let sandbox: () => string;
beforeAll(async () => {
  sandbox = await snapshot('store-search', async (sb) => {
    await store(sb, ['put', 'containers/ideas', '--description=ideas about the needle', '--minting=given', '--add-fields=what: required block', '--add-fields=status: optional line']);
    await declare(sb, 'memos', 'generated', ['body: optional line']);
    await declare(sb, 'gone', 'given', ['body: optional line']);
    await store(sb, ['put', 'ideas/a-needle', '--stdin=what'], 'first line\na Needle in a block\nanother needle line\n');
    await store(sb, ['put', 'ideas/b-plain', '--stdin=what', '--status=needle status'], 'nothing here\n');
    await store(sb, ['put', 'ideas/c-none', '--stdin=what'], 'no match\n');
    await store(sb, ['put', 'gone/x', '--body=needle in a dropped container']);
    await store(sb, ['delete', 'containers/gone']);
  });
});

describe.concurrent('the store search: the shared search shape', () => {
  it('[store-r9] answers {query, mode, total, rows}, one row per matching record of every live container, declarations never', async () => {
    const sb = sandbox();
    const m = (await store(sb, ['put', 'memos', '--body=a needle memo'])).stdout.trim();
    const r = await store(sb, ['search', 'needle', '--json']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(JSON.parse(r.stdout)).toEqual({
      query: 'needle',
      mode: 'exact',
      total: 3,
      rows: [
        { module: 'store', container: 'ideas', type: 'ideas', id: 'a-needle', address: 'store#ideas/a-needle', snippet: 'a Needle in a block', read: 'ctx store get ideas/a-needle' },
        { module: 'store', container: 'ideas', type: 'ideas', id: 'b-plain', address: 'store#ideas/b-plain', snippet: 'status: "needle status"', read: 'ctx store get ideas/b-plain' },
        { module: 'store', container: 'memos', type: 'memos', id: m, address: `store#memos/${m}`, snippet: 'body: "a needle memo"', read: `ctx store get memos/${m}` },
      ],
    });
  });

  it('[store-r9] the text form names the count, each row with its address, and the read', async () => {
    const r = await store(sandbox(), ['search', 'needle', '--container=ideas']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toBe('search "needle": 2 matches, 2 shown\n  ideas store#ideas/a-needle: a Needle in a block\n  ideas store#ideas/b-plain: status: "needle status"\nread one: ctx store get <container>/<id> (the address after store#)\n');
  });

  it('[store-r9] --limit caps the rows while total counts every match; --type narrows to one container', async () => {
    const sb = sandbox();
    const a = JSON.parse((await store(sb, ['search', 'needle', '--limit=1', '--json'])).stdout);
    expect([a.total, a.rows.length]).toEqual([2, 1]);
    const t = JSON.parse((await store(sb, ['search', 'needle', '--type=ideas', '--json'])).stdout);
    expect(t.rows.map((x: { id: string }) => x.id)).toEqual(['a-needle', 'b-plain']);
  });

  it('[store-r9] zero hits is an answer: rc 0, total 0', async () => {
    const r = await store(sandbox(), ['search', 'nothing-matches-this', '--json']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '{"query":"nothing-matches-this","mode":"exact","total":0,"rows":[]}\n', '']);
  });

  it.each([
    ['a type naming no live container', ['needle', '--type=gone'], "type 'gone' names no live container (the store's types are its containers: ideas, memos)"],
    ['a container naming no live container', ['needle', '--container=nope'], "container 'nope' is not a live container (live: ideas, memos)"],
    ['a mode the store cannot answer', ['needle', '--mode=hybrid'], "mode 'hybrid' cannot answer the store (it answers: exact)"],
    ['a limit of zero', ['needle', '--limit=0'], "--limit takes a positive whole number, not '0'"],
    ['an unknown flag', ['needle', '--module=x'], 'unknown flag \'--module=x\' (usage: ctx store search "<query>" [--container=<c>] [--type=<t>] [--mode=<m>] [--limit=<n>] [--json])'],
    ['a second query', ['needle', 'again'], 'search takes one query'],
  ])('[store-r9] a direct call refuses %s rc 1', async (_name, argv, message) => {
    refused(await store(sandbox(), ['search', ...argv]), 'search', INV, message);
  });

  it('[store-r9, the-engine-r-ha7uc] under ctx search the store is one group whose rows read through ctx store get; a type it lacks is zero hits', async () => {
    const sb = sandbox();
    const r = await run(sb, ['search', 'needle', '--module=store', '--json']);
    expect([r.code, r.stderr]).toEqual([0, '']);
    const g = JSON.parse(r.stdout).groups;
    expect(g.map((x: { module: string; status: string }) => `${x.module} ${x.status}`)).toEqual(['store ok']);
    expect(g[0].total).toBe(2);
    expect(g[0].rows.every((x: { read: string; container: string; id: string }) => x.read === `ctx store get ${x.container}/${x.id}`)).toBe(true);
    const typed = JSON.parse((await run(sb, ['search', 'needle', '--module=store', '--type=task', '--json'])).stdout).groups[0];
    expect([typed.status, typed.total]).toEqual(['ok', 0]);
  });
});
