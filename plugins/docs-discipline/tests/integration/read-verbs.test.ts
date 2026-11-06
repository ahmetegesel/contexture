import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { exec } from '@support/exec';
import { fresh } from '@support/snapshot';
import { unit } from '@support/unit';
import { docs, ENGINE_FIXTURES, putDocs, SAMPLE, stageSeed, TESTS } from '../support/corpus';

const fixtureDocs = (): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const repo of ['etest', 'ebad']) {
    for (const f of readdirSync(join(ENGINE_FIXTURES, 'docs', repo))) out[`${repo}/${f.replace(/\.md$/, '')}`] = readFileSync(join(ENGINE_FIXTURES, 'docs', repo, f), 'utf8');
  }
  return out;
};

let staged: string;
let corpus: string;
beforeAll(async () => {
  staged = await stageSeed('posix', 'staged');
  corpus = await stageSeed('posix', 'read', async (sb) => {
    await putDocs(sb, 'posix', fixtureDocs());
    for (const args of [
      ['bootstrap', 'nudge-demo', 'the sample nudge task'],
      ['task', 'add', 'nudge-demo', 'install-and-run-local', '--objective=Install the local toolchain and run the demo-orders service before the pricing change lands', '--refs=docs/demo-orders/operational.md', '--desc=Set up the environment, run the build, and test the checkout path on demo-orders.', '--criteria=- the suite is green'],
      ['task', 'start', 'nudge-demo', 'install-and-run-local'],
    ]) {
      const r = await unit(sb, ...args);
      if (r.code !== 0) throw new Error(`unit ${args.join(' ')}: ${r.stderr}`);
    }
  });
});

describe('the read verbs through ctx on posix', { concurrent: true }, () => {
  it('RS5a audit over the staged corpus is silent, rc 0', async () => {
    const r = await docs(fresh(staged), ['audit', 'docs/*/*.md']);
    expect([r.code, r.stdout, r.stderr]).toEqual([0, '', '']);
  });

  it('query prints the engine answer unchanged', async () => {
    const r = await docs(fresh(corpus), ['query', 'demo-orders', 'order-flow']);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(readFileSync(join(TESTS, 'unit/expected/query/projection.txt'), 'utf8'));
  });

  it.each([
    ['a repo', ['demo-orders']],
    ['an address', ['docs/demo-orders/order-flow.md']],
    ['a literal repo pattern', ['docs/demo-orders/*.md']],
    ['a prefixed address', ['/elsewhere/docs/demo-web/cart-ui.md']],
  ])('audit takes %s', async (_, args) => {
    const r = await docs(fresh(corpus), ['audit', ...args]);
    expect([r.code, r.stderr]).toEqual([0, '']);
  });

  it.each([
    ['a doc the corpus lacks', ['docs/nosuch/missing.md'], 'no such doc: nosuch/missing'],
    ['a repo the corpus lacks', ['nosuchrepo'], 'no such repo: nosuchrepo'],
    ['a path outside the corpus forms', ['notes/README.txt'], 'not a corpus doc: notes/README.txt'],
  ])('audit refuses %s rc 1', async (_, args, message) => {
    const r = await docs(fresh(corpus), ['audit', ...args]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(message);
  });

  it.each([
    ['search', ['etest', '--search', 'zz_no_such_term'], "no match for 'zz_no_such_term'"],
    ['rules', ['etest', '--rules', 'nosuchcategory'], "no rules match in category 'nosuchcategory'"],
    ['pitfalls', ['etest', '--pitfalls', '--severity', 'critical'], "no pitfalls match at severity 'critical'"],
    ['edge', ['etest', '--edge', 'nosuchchannel'], "no edges match channel 'nosuchchannel'"],
    ['file', ['etest', '--file', 'no/such/path'], "no doc owns 'no/such/path'"],
    ['section', ['etest', 'idone', '--section', 'nosuchsection'], "no 'nosuchsection' section in etest/idone"],
  ])('EC5 a %s miss refuses rc 1', async (_, args, message) => {
    const r = await docs(fresh(corpus), ['query', ...args]);
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toContain(message);
  });

  it('EC4 the verb passes a backslash search through the environment, literal', async () => {
    const r = await docs(fresh(corpus), ['query', 'etest', '--search', 'zz\\tqq']);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('The marker reads zz\\tqq on disk');
  });

  it('EC6 a draft path reads the stored doc by its address, never the file', async () => {
    const sb = fresh(corpus);
    mkdirSync(join(sb, 'draft/docs/etest'), { recursive: true });
    const draft = join(sb, 'draft/docs/etest/esc.md');
    writeFileSync(draft, readFileSync(join(ENGINE_FIXTURES, 'docs/etest/esc.md'), 'utf8').replace('@doc structural esc', '@doc bogus esc'));
    const audit = await docs(sb, ['audit', draft]);
    expect([audit.code, audit.stdout, audit.stderr]).toEqual([0, '', '']);
    const check = await docs(sb, ['check', draft]);
    expect(check.code).toBe(0);
    expect(check.stdout + check.stderr).not.toContain('not the corpus doc');
    const nofile = await docs(sb, ['audit', join(sb, 'nofile/docs/etest/esc.md')]);
    expect([nofile.code, nofile.stdout, nofile.stderr]).toEqual([0, '', '']);
  });

  it.each([
    ['check', 'Usage: git diff --name-status | ctx docs check <repo>...'],
    ['nudge', 'Usage: ctx docs nudge <unit> [<repo>...]'],
  ])('a bare %s refuses rc 1 with its usage', async (verb, usage) => {
    const r = await docs(fresh(corpus), [verb]);
    expect([r.code, r.stdout]).toEqual([1, '']);
    expect(r.stderr).toContain(usage);
  });
});

describe('the check verb governs a shebang script by its first line, read under the workspace root', { concurrent: true }, () => {
  it('from a working folder elsewhere: the script reads UNCOVERED, a plain file and a folder stay out', async () => {
    const sb = fresh(staged);
    const away = join(sb, 'tools/sub');
    mkdirSync(away, { recursive: true });
    writeFileSync(join(sb, 'tools/run'), '#!/bin/sh\necho run\n');
    writeFileSync(join(sb, 'tools/notes'), 'plain notes\n');
    const r = await exec(join(sb, '.contexture/ctx'), ['docs', 'check', 'workspace'], {
      cwd: away,
      input: 'A\ttools/run\nA\ttools/notes\nA\ttools/sub/\nM\ttools/sub\n',
      env: { GIT_CEILING_DIRECTORIES: dirname(sb) },
    });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(r.stdout.match(/^UNCOVERED: .*$/gm)).toEqual(['UNCOVERED: tools/run']);
  });
});

describe('the nudge through its unit', { concurrent: true }, () => {
  it('RS5b the task entered through the unit verbs resolves to the sample block byte for byte', async () => {
    const r = await unit(fresh(corpus), 'resolve', 'nudge-demo', 'task#install-and-run-local');
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(readFileSync(join(SAMPLE, 'backlog.md'), 'utf8'));
  });

  it('RS5b the unit form equals the backlog-file form, the top pitfall first', async () => {
    const sb = fresh(corpus);
    const byUnit = await docs(sb, ['nudge', 'nudge-demo']);
    const byFile = await docs(sb, ['nudge', 'backlog.md', 'demo-orders', 'demo-web', 'workspace']);
    expect([byUnit.code, byFile.code]).toEqual([0, 0]);
    expect(byUnit.stdout).toMatch(/^Pitfalls: order-flow-p1/m);
    expect(byUnit.stdout).toBe(byFile.stdout);
  });

  it('RS5b a path inside the sessions drawer refuses rc 1: a record artifact is read through its unit', async () => {
    const r = await docs(fresh(corpus), ['nudge', '.contexture/sessions/nudge-demo/backlog.md', 'demo-orders']);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('read through its unit');
  });
});
