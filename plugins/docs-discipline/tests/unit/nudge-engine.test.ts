import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { corpusDir, matches, SAMPLE, TESTS } from '../support/corpus';
import { docFiles, nudge } from '../support/engines';

let corpus: string;
beforeAll(() => {
  corpus = corpusDir('nudge-corpus');
  copyFileSync(join(SAMPLE, 'backlog.md'), join(corpus, 'backlog.md'));
});

describe('the nudge engine', { concurrent: true }, () => {
  it('[docs-module-r26] points the sample task at its docs, the top pitfall first, against committed output', async () => {
    const r = await nudge(corpus, 'backlog.md');
    expect([r.code, r.stderr]).toEqual([0, '']);
    expect(r.stdout).toMatch(/^Pitfalls: order-flow-p1/m);
    expect(r.stdout).toBe(matches(r.stdout, join(TESTS, 'unit/expected/nudge/sample-backlog.txt')));
  });

  it('[docs-module-r26] null check: a task naming nothing the corpus owns gets no pitfall', async () => {
    writeFileSync(join(corpus, 'empty-task.md'), '@task tidy-notes\n  STATUS: IN_PROGRESS\n  OBJECTIVE: "Tidy the meeting notes"\n');
    const r = await nudge(corpus, 'empty-task.md');
    expect(r.stdout).not.toContain('order-flow-p1');
  });

  it('[docs-module-r26] a named task nudges whatever its status under the force, and no other way', async () => {
    writeFileSync(join(corpus, 'done-task.md'), '@task done-task\n  STATUS: DONE\n  OBJECTIVE: "Tidy the meeting notes"\n');
    const plain = await nudge(corpus, 'done-task.md');
    expect([plain.code, plain.stdout]).toEqual([0, '']);
    const forced = await nudge(corpus, 'done-task.md', docFiles(corpus), { DOCS_NUDGE_TASK: '1' });
    expect(forced.code).toBe(0);
    expect(forced.stdout).toContain("[CONTEXT NUDGE: Task 'done-task']");
  });
});
