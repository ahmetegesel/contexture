import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { fresh } from '@support/snapshot';
import { fts5Available } from '@support/stage';
import { store } from '@support/store';
import { answer } from '@support/wire';
import { docs, putDocs, stageSeed } from '../support/corpus';
import { fixture, golden } from '../support/edit';
import { git, gitCommit, gitInit } from '../support/git';

const read = (name: string): string => readFileSync(fixture(name), 'utf8');

interface Row {
  seq: number;
  key: string;
  op: string;
  head: string;
}

const rows = async (sb: string, head: string): Promise<Row[]> => answer(await store(sb, 'fts5').op('store.changes', ['docs'], `head=${head}\n`), 'store.changes').changes;
const headOf = async (sb: string): Promise<string> => (await git(sb, 'rev-parse', 'HEAD')).stdout.trim();

describe.skipIf(!fts5Available())('the change log of the docs writes on fts5', { concurrent: true }, () => {
  let wlog: string;
  beforeAll(async () => {
    wlog = await stageSeed('fts5', 'wlog', async (sb) => {
      await putDocs(sb, 'fts5', { 'wtest/unit': read('unit.md'), 'wtest/conv': read('conv.md'), 'wtest/map': read('map.md') });
      writeFileSync(join(sb, '.gitignore'), '.contexture/\n');
      await gitInit(sb);
      await git(sb, 'add', '-A');
      await gitCommit(sb, 'h0');
    });
  });

  it.each<[string, string[], string, string?]>([
    ['new', ['new', 'wtest', 'late', '--kind=structural', '--description=Late', '--sources=late', '--keywords=late'], 'wtest/late'],
    ['write', ['write', 'wtest', 'written'], 'wtest/written', 'written.md'],
    ['header', ['header', 'wtest', 'conv', '--add-source=more/**'], 'wtest/conv'],
    ['rule', ['rule', 'wtest', 'conv', 'docs/first', '--remove'], 'wtest/conv'],
    ['pitfall', ['pitfall', 'wtest', 'unit', 'unit-p1', '--severity=high'], 'wtest/unit'],
    ['entry', ['entry', 'wtest', 'unit', 'see_also', 'other', '--remove'], 'wtest/unit'],
    ['section', ['section', 'wtest', 'unit', 'see_also'], 'wtest/unit', 'see-also.block'],
    ['replace', ['replace', 'wtest', 'unit', '--old=invariant holds', '--new=invariant stands', '--count=2'], 'wtest/unit'],
    ['remove', ['remove', 'wtest', 'map'], 'wtest/map'],
    ['ids', ['ids', 'wtest'], 'wtest/unit'],
  ])('[modules-r9, docs-module-r18] %s logs one row with its op and the workspace HEAD', async (op, args, key, input) => {
    const sb = fresh(wlog);
    const head = await headOf(sb);
    expect(await rows(sb, head)).toEqual([]);
    const r = await docs(sb, args, { input: input ? read(input) : '' });
    expect(r.code, r.stderr).toBe(0);
    const logged = await rows(sb, head);
    expect(logged.map((l) => [l.op, l.key, l.head])).toEqual([[op, key, head]]);
  });

  it.each<[string, string[], string?]>([
    ['a schema refusal', ['pitfall', 'wtest', 'unit', 'unit-p1', '--severity=urgent']],
    ['an audit refusal', ['write', 'wtest', 'badblock'], 'bad-block.md'],
    ['an unchanged --replace', ['write', 'wtest', 'unit', '--replace'], 'unit.md'],
    ['a dry run', ['entry', 'wtest', 'unit', 'contract', '--rule=A dry rule', '--evidence=drySym', '--dry-run']],
  ])('[docs-module-r18] logs no row for %s', async (_, args, input) => {
    const sb = fresh(wlog);
    const head = await headOf(sb);
    await docs(sb, args, { input: input ? read(input) : '' });
    expect(await rows(sb, head)).toEqual([]);
  });

  it('W61 [docs-module-r15] ctx docs changes reads the window back: A for a new doc, M for a written one, nothing for one created and removed', async () => {
    const sb = fresh(wlog);
    for (const args of [
      ['new', 'wtest', 'late', '--kind=structural', '--description=Late', '--sources=late', '--keywords=late'],
      ['header', 'wtest', 'conv', '--add-source=more/**'],
      ['new', 'wtest', 'gone', '--kind=structural', '--description=Gone', '--sources=gone', '--keywords=gone'],
      ['remove', 'wtest', 'gone'],
    ]) expect((await docs(sb, args)).code).toBe(0);
    const r = await docs(sb, ['changes']);
    expect(r.code).toBe(0);
    const lines = r.stdout.split('\n');
    expect(lines).toContain('A\tdocs/wtest/late.md');
    expect(lines).toContain('M\tdocs/wtest/conv.md');
    expect(r.stdout).not.toContain('docs/wtest/gone.md');
  });

  it('[docs-module-r18] null check: the stored bytes of a logged write are the golden', async () => {
    const sb = fresh(wlog);
    expect((await docs(sb, ['pitfall', 'wtest', 'unit', 'unit-p1', '--severity=high', '--consequence=Now one line'])).code).toBe(0);
    expect((await store(sb, 'fts5').get('docs', 'wtest/unit')).stdout).toBe(golden('exp-pitfall-update.md'));
  });
});
