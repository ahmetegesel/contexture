import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { DATE, mk } from '../support/record';
import { answer, answerLine, payload, refused } from '../support/wire';
import { at, UNIT } from './chain';

const U1STATE = '{"unit":"compliance-u1","status":"ACTIVE","current_anchor":"A1","objective":"Compliance test session","repos":["alpha","beta"],"ref_sessions":null,"extra_fields":[],"extra_lines":[]}';
const dated = payload().kv('date', DATE).toString();

describe.concurrent('the unit lifecycle through the unit data script', () => {
  it('TC01: session.create answers the unit\'s state at A1 with no stored pointer', async () => {
    const sb = await at('empty');
    const create = payload().kv('objective', 'Compliance test session').kl('repos', 'alpha', 'beta').kv('attention', 'compliance fixture');
    expect(answerLine(await data(sb, 'session.create', [UNIT], create.toString()), 'session.create')).toBe(`{"unit":"compliance-u1","state":${U1STATE}}`);
  });

  it('TC02: a repeated session.create refuses rc1 ERR_ENTITY_EXISTS; the state untouched', async () => {
    const sb = await at('U1');
    const again = payload().kv('objective', 'Duplicate session').kv('attention', 'again').toString();
    refused(await data(sb, 'session.create', [UNIT], again), 'session.create', 1, 'ERR_ENTITY_EXISTS', "unit 'compliance-u1' already exists");
    expect(answer(await data(sb, 'session.load', [UNIT]), 'session.load').state.objective).toBe('Compliance test session');
  });

  it('TC03: session.load and session.board answer the empty unit; its journal holds the A1 anchor alone', async () => {
    const sb = await at('U1');
    const load = await data(sb, 'session.load', [UNIT]);
    expect(Object.keys(answer(load, 'session.load'))).toEqual(['unit', 'state', 'backlog', 'knowledge', 'board', 'refs']);
    expect(answerLine(load, 'session.load')).toBe(
      `{"unit":"compliance-u1","state":${U1STATE},"backlog":{"preamble":"","tasks":[]},"knowledge":{"preamble":"","findings":[]},"board":{"unit":"compliance-u1","backlog_present":true,"live":[],"open_tasks":[],"open_threads":[]},"refs":[]}`,
    );
    expect(answerLine(await data(sb, 'session.board', [UNIT]), 'session.board')).toBe('{"unit":"compliance-u1","backlog_present":true,"live":[],"open_tasks":[],"open_threads":[]}');
    expect(answerLine(await data(sb, 'search.query', [UNIT, '--mode=exact'], payload().kv('query', 'continues A0').toString()), 'search.query')).toBe(
      '{"unit":"compliance-u1","query":"continues A0","mode":"exact","total_matches":1,"results":[{"entity_type":"session","entity_id":"compliance-u1","section":"journal","snippet":"@anchor A1 (\\"continues A0\\", attention: compliance fixture)","score":0}]}',
    );
    expect(answerLine(await data(sb, 'entry.list', [UNIT]), 'entry.list')).toBe('{"unit":"compliance-u1","entries":[]}');
  });

  it('TC04: session.stamp answers A1 to A2 with its dated anchor; session.close marks the unit CLOSED', async () => {
    const sb = await at('U1');
    expect(answerLine(await data(sb, 'session.stamp', [UNIT], dated), 'session.stamp')).toBe(
      '{"unit":"compliance-u1","previous_anchor":"A1","current_anchor":"A2","receipt":{"kind":"anchor","seq":2,"anchor":"A2","date":"2026-09-27","continues":null,"attention":null,"head_text":null,"extra_lines":[],"next":null}}',
    );
    expect(answer(await data(sb, 'session.load', [UNIT]), 'session.load').state.current_anchor).toBe('A2');
    expect(answerLine(await data(sb, 'session.close', [UNIT]), 'session.close')).toBe(
      '{"unit":"compliance-u1","status":"CLOSED","open_tasks":[],"audit":{"unit":"compliance-u1","clean":true,"findings":[],"open_threads":[]}}',
    );
    expect(answer(await data(sb, 'session.load', [UNIT]), 'session.load').state.status).toBe('CLOSED');
  });

  it('TC66: session.close and session.reopen refuse the move they cannot make', async () => {
    const sb = await at('empty');
    answer(await mk(sb, 'tc66-u'), 'session.create');
    expect(answer(await data(sb, 'session.close', ['tc66-u']), 'session.close').status).toBe('CLOSED');
    refused(await data(sb, 'session.close', ['tc66-u']), 'session.close', 1, 'ERR_INVALID_TRANSITION', "unit 'tc66-u' is CLOSED; session.close moves only from ACTIVE");
    expect(answerLine(await data(sb, 'session.reopen', ['tc66-u']), 'session.reopen')).toBe('{"unit":"tc66-u","status":"ACTIVE"}');
    refused(await data(sb, 'session.reopen', ['tc66-u']), 'session.reopen', 1, 'ERR_INVALID_TRANSITION', "unit 'tc66-u' is ACTIVE; session.reopen moves only from CLOSED");
    expect(answer(await data(sb, 'session.load', ['tc66-u']), 'session.load').state.status).toBe('ACTIVE');
  });

  it('TC73: session.stamp answers the canonical anchor, refuses a missing or malformed date, and the journal holds its line', async () => {
    const sb = await at('empty');
    answer(await mk(sb, 'tc73-s'), 'session.create');
    refused(await data(sb, 'session.stamp', ['tc73-s']), 'session.stamp', 1, 'ERR_INVALID_ARGUMENT', 'missing payload key date');
    refused(await data(sb, 'session.stamp', ['tc73-s'], payload().kv('date', '27-09-2026').toString()), 'session.stamp', 1, 'ERR_INVALID_ARGUMENT', 'date takes YYYY-MM-DD');
    expect(answerLine(await data(sb, 'session.stamp', ['tc73-s'], dated), 'session.stamp')).toBe(
      '{"unit":"tc73-s","previous_anchor":"A1","current_anchor":"A2","receipt":{"kind":"anchor","seq":2,"anchor":"A2","date":"2026-09-27","continues":null,"attention":null,"head_text":null,"extra_lines":[],"next":null}}',
    );
    expect(answerLine(await data(sb, 'search.query', ['tc73-s', '--mode=exact'], payload().kv('query', '@anchor A2').toString()), 'search.query')).toBe(
      '{"unit":"tc73-s","query":"@anchor A2","mode":"exact","total_matches":1,"results":[{"entity_type":"session","entity_id":"tc73-s","section":"journal","snippet":"@anchor A2 2026-09-27","score":0}]}',
    );
    expect(answer(await data(sb, 'session.load', ['tc73-s']), 'session.load').state.current_anchor).toBe('A2');
  });
});
