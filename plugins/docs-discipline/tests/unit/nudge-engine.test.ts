import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { corpusDir, matches, SAMPLE, TESTS } from '../support/corpus';
import { nudge } from '../support/engines';

let corpus: string;
beforeAll(() => {
  corpus = corpusDir('nudge-corpus');
  copyFileSync(join(SAMPLE, 'backlog.md'), join(corpus, 'backlog.md'));
});

describe('the nudge engine', { concurrent: true }, () => {
  it('points the sample task at its docs, the top pitfall first, against committed output', async () => {
    const r = await nudge(corpus, 'backlog.md');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toMatch(/^Pitfalls: order-flow-p1/m);
    expect(r.stdout).toBe(matches(r.stdout, join(TESTS, 'unit/expected/nudge/sample-backlog.txt')));
  });

  it('null check: a task naming nothing the corpus owns gets no pitfall', async () => {
    writeFileSync(join(corpus, 'empty-task.md'), '@task tidy-notes\n  STATUS: IN_PROGRESS\n  OBJECTIVE: "Tidy the meeting notes"\n');
    const r = await nudge(corpus, 'empty-task.md');
    expect(r.stdout).not.toContain('order-flow-p1');
  });
});
