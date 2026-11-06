import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { mk, ok } from '../support/record';
import { answer, answerLine, payload, refused } from '../support/wire';
import { ALPHA, at, BETA, SUNIT, TUNIT } from './chain';

const FA =
  '{"name":"FINDING_ALPHA","ordinal":1,"supersedes":null,"refs":["journal#2026-09-27-event-1790000010"],"summary":"Alpha architectural decision summary","extra_fields":[],"head_text":null,"extra_lines":[],"superseded_by":null,"active":true,"next":null}';
const summary = (text: string) => payload().kv('summary', text).toString();
const names = (findings: { name: string }[]): string[] => findings.map((f) => f.name);

describe.concurrent('the knowledge findings through the unit data script', () => {
  it('TC13: finding.add answers the finding with its summary and refs', async () => {
    const sb = await at('T0');
    const add = payload().kv('summary', 'Alpha architectural decision summary').kl('refs', `journal#${ALPHA}`).toString();
    expect(answerLine(await data(sb, 'finding.add', [TUNIT, 'FINDING_ALPHA'], add), 'finding.add')).toBe(`{"unit":"compliance-tasks","finding":${FA}}`);
  });

  it('TC14: finding.get answers the finding; an absent NAME refuses rc1', async () => {
    const sb = await at('T13');
    expect(answerLine(await data(sb, 'finding.get', [TUNIT, 'FINDING_ALPHA']), 'finding.get')).toBe(`{"unit":"compliance-tasks","finding":${FA}}`);
    refused(await data(sb, 'finding.get', [TUNIT, 'NO_SUCH_FINDING']), 'finding.get', 1, 'ERR_ENTITY_NOT_FOUND', "finding 'NO_SUCH_FINDING' not found in unit 'compliance-tasks'");
  });

  it('TC15: finding.list filters the superseded finding; the predecessor names its successor', async () => {
    const sb = await at('T13');
    const add = payload().kv('summary', 'Beta superseding finding').kl('refs', `journal#${BETA}`).kv('supersedes', 'FINDING_ALPHA').toString();
    expect(answerLine(await data(sb, 'finding.add', [TUNIT, 'FINDING_BETA'], add), 'finding.add')).toBe(
      '{"unit":"compliance-tasks","finding":{"name":"FINDING_BETA","ordinal":2,"supersedes":{"name":"FINDING_ALPHA","reason":"superseded"},"refs":["journal#2026-09-27-event-1790000011"],"summary":"Beta superseding finding","extra_fields":[],"head_text":null,"extra_lines":[],"superseded_by":null,"active":true,"next":null}}',
    );
    const beta = '{"name":"FINDING_BETA","summary":"Beta superseding finding","refs":["journal#2026-09-27-event-1790000011"],"supersedes":"FINDING_ALPHA","active":true}';
    expect(answerLine(await data(sb, 'finding.list', [TUNIT, 'all']), 'finding.list')).toBe(
      `{"unit":"compliance-tasks","findings":[{"name":"FINDING_ALPHA","summary":"Alpha architectural decision summary","refs":["journal#2026-09-27-event-1790000010"],"supersedes":null,"active":false},${beta}]}`,
    );
    expect(answerLine(await data(sb, 'finding.list', [TUNIT, 'active']), 'finding.list')).toBe(`{"unit":"compliance-tasks","findings":[${beta}]}`);
    const { finding } = await ok(sb, 'finding.get', [TUNIT, 'FINDING_ALPHA']);
    expect([finding.superseded_by, finding.active, finding.next]).toEqual(['FINDING_BETA', false, 'finding']);
  });

  it('TC33: finding.update, finding.supersede, finding.drop answer and mutate the knowledge', async () => {
    const sb = await at('SS32');
    const update = payload().kv('summary', 'Updated').kl('refs', 'journal#2026-09-25-s-l1').toString();
    expect(answerLine(await data(sb, 'finding.update', [SUNIT, 'STORE_F'], update), 'finding.update')).toBe(
      '{"unit":"compliance-store","finding":{"name":"STORE_F","ordinal":1,"supersedes":null,"refs":["journal#2026-09-25-s-l1"],"summary":"Updated","extra_fields":[],"head_text":null,"extra_lines":[],"superseded_by":null,"active":true,"next":null}}',
    );
    refused(await data(sb, 'finding.supersede', [SUNIT, 'NO_SUCH', 'STORE_G'], summary('Successor')), 'finding.supersede', 1, 'ERR_ENTITY_NOT_FOUND', "finding 'NO_SUCH' not found in unit 'compliance-store'");
    expect(answerLine(await data(sb, 'finding.supersede', [SUNIT, 'STORE_F', 'STORE_G'], summary('Successor')), 'finding.supersede')).toBe(
      '{"unit":"compliance-store","superseded":"STORE_F","finding":{"name":"STORE_G","ordinal":2,"supersedes":{"name":"STORE_F","reason":"superseded"},"refs":[],"summary":"Successor","extra_fields":[],"head_text":null,"extra_lines":[],"superseded_by":null,"active":true,"next":null}}',
    );
    const superseded = (await ok(sb, 'finding.get', [SUNIT, 'STORE_F'])).finding;
    expect([superseded.superseded_by, superseded.active]).toEqual(['STORE_G', false]);
    expect(answerLine(await data(sb, 'finding.drop', [SUNIT, 'STORE_G']), 'finding.drop')).toBe('{"unit":"compliance-store","name":"STORE_G"}');
    refused(await data(sb, 'finding.get', [SUNIT, 'STORE_G']), 'finding.get', 1, 'ERR_ENTITY_NOT_FOUND', "finding 'STORE_G' not found in unit 'compliance-store'");
    const restored = (await ok(sb, 'finding.get', [SUNIT, 'STORE_F'])).finding;
    expect([restored.superseded_by, restored.active]).toEqual([null, true]);
  });

  it('TC72 [the-record-r11]: supersedes needs its predecessor and a new successor; the active list leaves the superseded out', async () => {
    const sb = await at('empty');
    const u = 'tc72-u';
    answer(await mk(sb, u), 'session.create');
    refused(await data(sb, 'finding.add', [u, 'NEW_F'], payload().kv('summary', 'orphan successor').kv('supersedes', 'NO_SUCH').toString()), 'finding.add', 1, 'ERR_ENTITY_NOT_FOUND', "finding 'NO_SUCH' not found in unit 'tc72-u'");
    await ok(sb, 'finding.add', [u, 'OLD_F'], summary('old'));
    await ok(sb, 'finding.add', [u, 'OTHER_F'], summary('other'));
    refused(await data(sb, 'finding.supersede', [u, 'OLD_F', 'OTHER_F'], summary('successor')), 'finding.supersede', 1, 'ERR_ENTITY_EXISTS', "finding 'OTHER_F' already exists in unit 'tc72-u'");
    const next = await ok(sb, 'finding.supersede', [u, 'OLD_F', 'NEW_F'], summary('successor'));
    expect([next.superseded, next.finding.name, next.finding.supersedes.name]).toEqual(['OLD_F', 'NEW_F', 'OLD_F']);
    expect(names((await ok(sb, 'finding.list', [u, 'active'])).findings)).toEqual(['OTHER_F', 'NEW_F']);
    const all = (await ok(sb, 'finding.list', [u, 'all'])).findings;
    expect(all.map((f: { name: string; active: boolean }) => [f.name, f.active])).toEqual([
      ['OLD_F', false],
      ['OTHER_F', true],
      ['NEW_F', true],
    ]);
  });
});
