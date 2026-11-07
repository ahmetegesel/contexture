import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { plantArtifact, seedUnit, unit } from '../support/unit';

const state = (objective: string, { status = 'ACTIVE', anchor = 'A1', pointer = 'next_action: "plan"\n' } = {}): string =>
  `status: ${status}\ncurrent_anchor: ${anchor}\n${pointer}objective: "${objective}"\nrepos: []\nref_sessions: []\n`;

function pathFree(text: string): void {
  expect(text).not.toContain('sessions');
  expect(text).not.toContain('.md');
}

const crCount = (sb: string, u: string): number => readFileSync(artifactPath(sb, u, 'journal'), 'utf8').split('\n').filter((l) => l.endsWith('\r')).length;

describe.concurrent('the verb messages name the artifact and its unit, never a storage path', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed((sb) => seedUnit(sb, 'u-unit', 'quote rule unit'), 'posix', 'messages');
  });

  it.for([
    ['stamp', /^ERROR: missing state: unit nosuch$/m],
    ['board', /^ERROR: missing journal: unit nosuch$/m],
    ['audit', /^ERROR: missing journal: unit nosuch$/m],
  ] as const)('UP-a [the-record-r14]: %s of an absent unit names the artifact and the unit', async ([verb, line]) => {
    const err = (await unit(fresh(sb0), verb, 'nosuch')).stderr;
    expect(err).toMatch(line);
    pathFree(err);
  });

  it('UP-a [the-record-r14]: bootstrap of an existing unit names the unit', async () => {
    const err = (await unit(fresh(sb0), 'bootstrap', 'u-unit', 'again')).stderr;
    expect(err).toMatch(/^ERROR: already exists: unit u-unit$/m);
    pathFree(err);
  });

  it('UP-b [the-record-r14]: a unit without backlog or knowledge warns on the board, searches its canonical state, and resolves misses path-free (posix plant)', async () => {
    const sb = stage('posix', 'messages-bare');
    plantArtifact(sb, 'up-bare', 'state', state('bare unit'));
    plantArtifact(sb, 'up-bare', 'journal', '@anchor A1 ("continues A0", attention: bare)\n');
    const board = (await unit(sb, 'board', 'up-bare')).stderr;
    expect(board).toMatch(/^WARNING: missing backlog: unit up-bare$/m);
    pathFree(board);
    const search = await unit(sb, 'search', 'up-bare', 'bare unit', '--mode=exact');
    expect(search.code).toBe(0);
    expect(search.stdout).toContain('session up-bare (state): objective: "bare unit');
    expect(search.stdout).not.toContain('next_action');
    pathFree(search.stdout + search.stderr);
    for (const ref of ['backlog.md#some-task', 'lanes/no-lane/report.md#orientation']) {
      const err = (await unit(sb, 'resolve', 'up-bare', ref)).stderr;
      expect(err).toMatch(new RegExp(`^resolve: error: reference '${ref.replace(/[.#/]/g, '\\$&')}' not found in unit 'up-bare' \\(ERR_ENTITY_NOT_FOUND\\)$`, 'm'));
      pathFree(err.replace(ref, ''));
    }
  });

  it('UP-b [the-record-r1]: a legacy next_action, one-line or multi-line, never prints and the next state write erases it (posix plant)', async () => {
    const sb = stage('posix', 'messages-pointer');
    plantArtifact(sb, 'up-odd', 'state', state('legacy pointer unit', { pointer: 'next_action: "legacy one-line"\n' }));
    const one = await unit(sb, 'load', 'up-odd', '1');
    expect(one.code).toBe(0);
    expect(one.stdout + one.stderr).not.toContain('next_action');
    expect((await unit(sb, 'refs', 'up-odd')).code).toBe(0);
    expect(readFileSync(artifactPath(sb, 'up-odd', 'state'), 'utf8')).not.toMatch(/^next_action:/m);
    plantArtifact(sb, 'up-odd', 'state', state('legacy pointer unit', { pointer: 'next_action: "legacy multi\n  continued pointer"\n' }));
    const multi = await unit(sb, 'load', 'up-odd', '1');
    expect(multi.stdout + multi.stderr).not.toContain('next_action');
    expect(multi.stdout + multi.stderr).not.toContain('continued pointer');
    await unit(sb, 'refs', 'up-odd');
    expect(readFileSync(artifactPath(sb, 'up-odd', 'state'), 'utf8')).not.toContain('continued pointer');
    plantArtifact(sb, 'up-odd', 'state', state('no pointer', { pointer: '' }));
    expect((await unit(sb, 'refs', 'up-odd')).code).toBe(0);
  });

  it('UP-b [the-record-r14]: entry show without a journal names the entry and the unit (posix plant)', async () => {
    const sb = stage('posix', 'messages-nojournal');
    plantArtifact(sb, 'up-nojournal', 'state', state('no journal'));
    const err = (await unit(sb, 'entry', 'show', 'up-nojournal', '2026-09-27-no-entry')).stderr;
    expect(err).toMatch(/^entry\.get: error: entry '2026-09-27-no-entry' not found in unit 'up-nojournal' \(ERR_ENTITY_NOT_FOUND\)$/m);
    pathFree(err);
  });

  it('UP-b [the-record-r14, the-engine-r18]: stamp under a malformed anchor refuses rc 2 ERR_STORAGE_CORRUPT naming the anchor (posix plant)', async () => {
    const sb = stage('posix', 'messages-anchor');
    plantArtifact(sb, 'up-odd', 'state', state('odd', { anchor: 'X9' }));
    plantArtifact(sb, 'up-odd', 'journal', '@anchor A1 ("continues A0", attention: odd)\n');
    plantArtifact(sb, 'up-odd', 'backlog', '');
    plantArtifact(sb, 'up-odd', 'knowledge', '');
    const r = await unit(sb, 'stamp', 'up-odd');
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/^session\.stamp: error: the state's current_anchor 'X9' is not A<N> \(ERR_STORAGE_CORRUPT\)$/m);
    pathFree(r.stderr);
  });

  it('UP-b B5-F2 [the-record-r12]: legacy CRLF lines keep their bytes; a CRLF entry reads with LF-only fields, audits clean, and searches by slug (posix plant)', async () => {
    const sb = stage('posix', 'messages-crlf');
    plantArtifact(sb, 'up-odd', 'state', state('odd'));
    plantArtifact(sb, 'up-odd', 'backlog', '');
    plantArtifact(sb, 'up-odd', 'knowledge', '');
    plantArtifact(sb, 'up-odd', 'journal', '@anchor A1 ("continues A0", attention: odd)\r\n');
    const first = await unit(sb, 'record', 'up-odd', '--what=an event');
    expect(first.code).toBe(0);
    pathFree(first.stdout + first.stderr);
    expect(crCount(sb, 'up-odd')).toBe(1);
    plantArtifact(sb, 'up-odd', 'journal', '@anchor A1 ("continues A0", attention: odd)\r\n\r\n@entry 2026-09-20-up-crlf\r\n  WHAT: "legacy crlf"\r\n  THREAD: none\r\n');
    const shown = await unit(sb, 'entry', 'show', 'up-odd', '2026-09-20-up-crlf', '--json');
    expect(shown.code).toBe(0);
    expect(shown.stdout).toContain('"what":"legacy crlf","group"');
    expect((await unit(sb, 'entry', 'list', 'up-odd')).stdout).not.toContain('\r');
    expect((await unit(sb, 'audit', 'up-odd')).code).toBe(0);
    expect((await unit(sb, 'search', 'up-odd', 'legacy crlf', '--mode=exact', '--json')).stdout).toContain('"entity_type":"entry","entity_id":"2026-09-20-up-crlf","section"');
    await unit(sb, 'record', 'up-odd', '--what=after crlf');
    expect(crCount(sb, 'up-odd')).toBe(5);
  });

  it('UP-b [the-record-r14]: active names the state and the unit of an unknown status (posix plant)', async () => {
    const sb = stage('posix', 'messages-status');
    plantArtifact(sb, 'up-odd', 'state', state('odd', { status: 'WEIRD' }));
    const err = (await unit(sb, 'active')).stderr;
    expect(err).toMatch(/^WARNING: unrecognized status \[WEIRD\] in state: unit up-odd$/m);
    pathFree(err);
  });
});
