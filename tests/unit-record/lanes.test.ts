import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { RECORD_ROOT } from '../support/drawer';
import { artifactPath, DATE, mk, ok, reads } from '../support/record';
import { answer, answerLine, payload, refused } from '../support/wire';
import { ALPHA, at, RECIPE, REPORT, SUNIT, TUNIT } from './chain';

const LE = `{"kind":"entry","lane":"lane-worker","slug":"2026-09-27-event-1790000020","occurrence":1,"seq":1,"anchor":null,"what":"Subagent action trace WHAT","group":null,"rhythm":null,"knowledge":false,"thread":"none","legacy_status":null,"refs":["journal#${ALPHA}"],"closers":[],"extra_fields":[],"head_text":null,"extra_lines":[],"next":null}`;
const RECIPE_JSON = '"# recipe grammar\\nMISSION\\n  GOAL: \\"Subagent goal description\\"\\n"';
const laneEntry = (what: string, epoch: string) => payload().kv('what', what).kv('thread', 'none').kv('date', DATE).kv('epoch', epoch);

describe.concurrent('the lanes through the unit data script', () => {
  it('TC16 [the-record-r15]: lane.create stores the recipe byte for byte with an empty journal and no report', async () => {
    const sb = await at('T0');
    expect(answerLine(await data(sb, 'lane.create', [TUNIT, 'lane-worker'], RECIPE), 'lane.create')).toBe('{"unit":"compliance-tasks","lane":"lane-worker"}');
    const recipe = await data(sb, 'lane.get', [TUNIT, 'lane-worker', 'recipe']);
    expect(answerLine(recipe, 'lane.get')).toBe(`{"unit":"compliance-tasks","lane":"lane-worker","artifact":"recipe","content":${RECIPE_JSON}}`);
    expect(answer(recipe, 'lane.get').content).toBe(RECIPE);
    expect(answerLine(await data(sb, 'lane.get', [TUNIT, 'lane-worker', 'journal']), 'lane.get')).toBe('{"unit":"compliance-tasks","lane":"lane-worker","artifact":"journal","preamble":"","items":[]}');
    expect(answerLine(await data(sb, 'lane.get', [TUNIT, 'lane-worker', 'report']), 'lane.get')).toBe('{"unit":"compliance-tasks","lane":"lane-worker","artifact":"report","content":null}');
  });

  it('TC17 [the-record-r15]: lane.record and lane.write_report land; lane.get reads the journal and the report back', async () => {
    const sb = await at('T16');
    const record = payload().kl('refs', `journal#${ALPHA}`).kv('what', 'Subagent action trace WHAT').kv('thread', 'none').kv('date', DATE).kv('epoch', '1790000020').toString();
    expect(answerLine(await data(sb, 'lane.record', [TUNIT, 'lane-worker'], record), 'lane.record')).toBe(`{"unit":"compliance-tasks","lane":"lane-worker","entry":${LE}}`);
    expect(answerLine(await data(sb, 'lane.write_report', [TUNIT, 'lane-worker'], REPORT), 'lane.write_report')).toBe('{"unit":"compliance-tasks","lane":"lane-worker","bytes":25}');
    expect(answerLine(await data(sb, 'lane.get', [TUNIT, 'lane-worker', 'journal']), 'lane.get')).toBe(`{"unit":"compliance-tasks","lane":"lane-worker","artifact":"journal","preamble":"","items":[${LE}]}`);
    expect(answerLine(await data(sb, 'lane.get', [TUNIT, 'lane-worker', 'report']), 'lane.get')).toBe('{"unit":"compliance-tasks","lane":"lane-worker","artifact":"report","content":"Subagent report findings\\n"}');
  });

  it('UP-c [the-record-r16]: lane.create keeps a recipe line ending in a carriage return byte for byte, in lane.get and in the posix file', async () => {
    const sb = await at('T0');
    const crlf = '# recipe grammar\r\nMISSION\n  GOAL: "a CRLF recipe"\n';
    await ok(sb, 'lane.create', [TUNIT, 'up-cr'], crlf);
    expect(answer(await data(sb, 'lane.get', [TUNIT, 'up-cr', 'recipe']), 'lane.get').content).toBe(crlf);
    expect(readFileSync(artifactPath(sb, TUNIT, 'lane/up-cr/recipe'), 'utf8')).toBe(crlf);
  });

  it('TC31 [the-engine-r9]: a 2 MB lane report lands over stdin and reads back byte for byte', async () => {
    const sb = await at('T0');
    answer(await mk(sb, SUNIT, 'store'), 'session.create');
    await ok(sb, 'lane.create', [SUNIT, 's-lane'], '# recipe grammar\nMISSION\n  GOAL: "store lane"\n');
    const big = Array.from({ length: 26000 }, (_, i) => `line ${String(i + 1).padStart(6, '0')} of the big report, a \\ backslash, a "quote", a\ttab ....\n`).join('');
    expect(answerLine(await data(sb, 'lane.write_report', [SUNIT, 's-lane'], big), 'lane.write_report')).toBe(`{"unit":"compliance-store","lane":"s-lane","bytes":${Buffer.byteLength(big)}}`);
    const report = answer(await data(sb, 'lane.get', [SUNIT, 's-lane', 'report']), 'lane.get');
    expect(report.artifact).toBe('report');
    expect(report.content === big).toBe(true);
  });

  it('TC71 [the-record-r11, the-record-r15]: lane.create refuses an existing lane; a lane without a report reads content null and an empty journal', async () => {
    const sb = await at('T37');
    refused(await data(sb, 'lane.create', [TUNIT, 'lane-worker'], '# another recipe\n'), 'lane.create', 1, 'ERR_ENTITY_EXISTS', "lane 'lane-worker' already exists in unit 'compliance-tasks'");
    expect(answerLine(await data(sb, 'lane.get', [TUNIT, 'lane-worker', 'recipe']), 'lane.get')).toBe(`{"unit":"compliance-tasks","lane":"lane-worker","artifact":"recipe","content":${RECIPE_JSON}}`);
    await ok(sb, 'lane.create', [TUNIT, 'bare-lane'], '# a bare recipe\n');
    expect(answerLine(await data(sb, 'lane.get', [TUNIT, 'bare-lane', 'journal']), 'lane.get')).toBe('{"unit":"compliance-tasks","lane":"bare-lane","artifact":"journal","preamble":"","items":[]}');
    expect(answerLine(await data(sb, 'lane.get', [TUNIT, 'bare-lane', 'report']), 'lane.get')).toBe('{"unit":"compliance-tasks","lane":"bare-lane","artifact":"report","content":null}');
    refused(await data(sb, 'lane.get', [TUNIT, 'no-such-lane', 'recipe']), 'lane.get', 1, 'ERR_ENTITY_NOT_FOUND', "lane 'no-such-lane' not found in unit 'compliance-tasks'");
  });

  it('TC79 [the-record-r19]: a lane folder without an artifact is no lane: lane.get refuses it, the reads skip it, lane.create lands beside its files (posix plant)', async () => {
    const sb = await at('empty');
    const u = 'tc79-u';
    answer(await mk(sb, u), 'session.create');
    const search = () => data(sb, 'search.query', [u, '--mode=exact', '--entity=lane'], payload().kv('query', 'ghost').toString());
    const before = await reads(sb, u);
    const searched = answerLine(await search(), 'search.query');
    const ghost = join(sb, RECORD_ROOT, u, 'lanes/ghost');
    mkdirSync(ghost, { recursive: true });
    writeFileSync(join(ghost, 'notes.txt'), 'a stray file, no lane artifact\n');
    for (const artifact of ['recipe', 'journal', 'report']) {
      refused(await data(sb, 'lane.get', [u, 'ghost', artifact]), 'lane.get', 1, 'ERR_ENTITY_NOT_FOUND', "lane 'ghost' not found in unit 'tc79-u'");
    }
    expect(await reads(sb, u)).toBe(before);
    expect(answerLine(await search(), 'search.query')).toBe(searched);
    refused(await data(sb, 'lane.record', [u, 'ghost'], laneEntry('into the ghost', '1790000790').toString()), 'lane.record', 1, 'ERR_ENTITY_NOT_FOUND', "lane 'ghost' not found in unit 'tc79-u'");
    expect(answerLine(await data(sb, 'lane.create', [u, 'ghost'], '# the ghost recipe\n'), 'lane.create')).toBe('{"unit":"tc79-u","lane":"ghost"}');
    expect(answerLine(await data(sb, 'lane.get', [u, 'ghost', 'recipe']), 'lane.get')).toBe('{"unit":"tc79-u","lane":"ghost","artifact":"recipe","content":"# the ghost recipe\\n"}');
    expect(answerLine(await data(sb, 'lane.get', [u, 'ghost', 'journal']), 'lane.get')).toBe('{"unit":"tc79-u","lane":"ghost","artifact":"journal","preamble":"","items":[]}');
    expect(readFileSync(join(ghost, 'notes.txt'), 'utf8')).toBe('a stray file, no lane artifact\n');
  });
});
