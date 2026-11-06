import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { engineCall } from '../support/engine';
import { artifactPath, COMPLIANCE, plantUnit } from '../support/record';
import { sandbox } from '../support/sandbox';
import { fresh } from '../support/snapshot';
import { answer, answerLine, payload } from '../support/wire';
import { goldens, holdsGoldens, verbBuilt, VU } from './goldens';

const planted = (unit: string): string => {
  const sb = sandbox('engine-model');
  plantUnit(sb, unit);
  return sb;
};

describe.concurrent('the record engine alone (canon.awk, model.awk, ops.awk) over the posix files', () => {
  it('[the-record-r20] parses every legacy shape of the legacy fixture into the golden answers with no store, driver, or lock', async () => {
    const sb = planted('legacy-u');
    await holdsGoldens('legacy-u', 'legacy-u', (fn, args) => engineCall(sb, fn, args));
  });

  it('[the-record-r20] answers the golden JSON of the verb-built unit', async () => {
    const sb = fresh(await verbBuilt(VU));
    await holdsGoldens(VU, 'verb-u', (fn, args) => engineCall(sb, fn, args));
  });

  it('[the-record-r12] reads a legacy journal with carriage returns as its LF twin, no carriage return in any value', async () => {
    const lf = planted('tc57-u');
    const crlf = planted('tc57-u');
    const journal = artifactPath(crlf, 'tc57-u', 'journal');
    writeFileSync(journal, readFileSync(journal, 'utf8').replace(/\n/g, '\r\n'));
    expect(readFileSync(journal, 'utf8')).toContain('\r\n');
    for (const [fn, args] of [['session.board', ['tc57-u']], ['entry.list', ['tc57-u']], ['entry.get', ['tc57-u', '2026-09-20-repeat']]] as const) {
      const want = answerLine(await engineCall(lf, fn, args), fn);
      expect(answerLine(await engineCall(crlf, fn, args), fn)).toBe(want);
      expect(want).not.toContain('\\r');
    }
  });

  it('[the-record-r20] a write rewrites the touched legacy item canonical and keeps every other item and value', async () => {
    const sb = planted('legacy-u');
    const before = goldens('legacy-u', 'legacy-u').filter((g) => g.fn === 'task.get' && g.args[1] !== 'bare-refs-task');
    expect(before.length).toBe(3);
    const updated = answer(await engineCall(sb, 'task.update', ['legacy-u', 'bare-refs-task'], payload().kv('objective', 'rewritten canonical').toString()), 'task.update').task;
    const golden = JSON.parse(readFileSync(join(COMPLIANCE, 'golden/legacy-u/task.get.bare-refs-task.json'), 'utf8')).task;
    expect(updated.objective).toBe('rewritten canonical');
    expect([updated.refs, updated.status, updated.description]).toEqual([golden.refs, golden.status, golden.description]);
    expect(readFileSync(artifactPath(sb, 'legacy-u', 'backlog'), 'utf8')).toContain('OBJECTIVE: "rewritten canonical"');
    for (const g of before) expect(answerLine(await engineCall(sb, g.fn, g.args), g.fn)).toBe(readFileSync(g.file, 'utf8').trimEnd());
  });
});
