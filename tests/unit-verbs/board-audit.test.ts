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

  it('R-h: ctx unit help audit sends every finding no verb can repair, a missing THREAD and a dangling closer among them, to the human, never to an entry minted only to quiet it', async () => {
    const help = await unit(stage('posix', 'audit-help'), 'help', 'audit');
    expect(help.code).toBe(0);
    const human = help.stdout.split('\n').filter((l) => l.includes('goes to the human'));
    expect(human).toHaveLength(1);
    expect(human[0]).toContain('a finding no verb can repair (a bracketed field line, an inline marker, a dateless slug, a missing THREAD, a slugless or dangling closer)');
    expect(human[0]).toContain('never to a hand edit of the record or to an entry minted only to quiet it');
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
