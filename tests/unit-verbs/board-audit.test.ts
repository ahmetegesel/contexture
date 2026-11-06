import { describe, expect, it } from 'vitest';
import { appendArtifact } from '../support/record';
import { stage } from '../support/stage';
import { must, seedUnit, unit } from '../support/unit';

const D = '2026-09-27';
const entry = (slug: string, what: string, extra = ''): string => `\n@entry ${slug}\n  ANCHOR: A1\n  WHAT: "${what}"\n  THREAD: none\n${extra}`;

describe.concurrent('ctx unit board and audit', () => {
  it('R-d: audit of a missing unit refuses rc 1', async () => {
    expect((await unit(stage('posix', 'audit-missing'), 'audit', 'nosuch')).code).toBe(1);
  });

  it('S1-e [the-record-r6]: a legacy repeated slug warns in the audit with rc 0; a closer closes the occurrences before it; entry show reads the last (posix plant)', async () => {
    const sb = stage('posix', 'audit-dup');
    await seedUnit(sb, 'dup-audit', 'duplicate slug unit');
    await must(unit(sb, 'record', 'dup-audit', '--what=first', `--slug=${D}-twice`));
    appendArtifact(sb, 'dup-audit', 'journal', entry(`${D}-twice`, 'second, landed by another path'));
    const audit = await unit(sb, 'audit', 'dup-audit');
    expect(audit.code).toBe(0);
    expect(audit.stdout).toMatch(new RegExp(`LEGACY DUPLICATE SLUG at line \\d+: ${D}-twice \\(first at line \\d+; warning`));
    appendArtifact(sb, 'dup-audit', 'journal', entry(`${D}-fold-twice`, 'folds both', `  CLOSES: ${D}-twice (folded: both precede)\n`));
    appendArtifact(sb, 'dup-audit', 'journal', entry(`${D}-twice`, 'third, after the closer'));
    const board = (await unit(sb, 'board', 'dup-audit')).stdout;
    expect(board.split('\n').filter((l) => l.startsWith(`@entry ${D}-twice`))).toHaveLength(1);
    expect(board).toContain('third, after the closer');
    const shown = (await unit(sb, 'entry', 'show', 'dup-audit', `${D}-twice`, '--json')).stdout;
    expect(shown).toContain('"closed":false');
    expect(shown).toContain('third, after the closer');
  });
});
