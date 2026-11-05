import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { stage } from '../support/stage';
import { answer, payload, refused } from '../support/wire';

describe('data script', () => {
  it('the unit data script answers session.create and session.load, and refuses a repeated create', async () => {
    const sb = stage();
    const create = payload().kv('objective', 'data smoke').kl('repos', 'alpha').kv('attention', 'smoke').toString();
    const created = answer(await data(sb, 'session.create', ['data-unit'], create), 'session.create');
    expect(created.state).toMatchObject({ unit: 'data-unit', status: 'ACTIVE', current_anchor: 'A1', objective: 'data smoke', repos: ['alpha'] });
    const load = answer(await data(sb, 'session.load', ['data-unit']), 'session.load');
    expect(Object.keys(load)).toEqual(['unit', 'state', 'backlog', 'knowledge', 'board', 'refs']);
    expect(load.state).toEqual(created.state);
    refused(
      await data(sb, 'session.create', ['data-unit'], payload().kv('objective', 'again').kv('attention', 'again').toString()),
      'session.create',
      1,
      'ERR_ENTITY_EXISTS',
      "unit 'data-unit' already exists",
    );
  });
});
