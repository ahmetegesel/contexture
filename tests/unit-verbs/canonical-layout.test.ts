import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { artifactPath } from '../support/record';
import { fresh, seed } from '../support/snapshot';
import { stage } from '../support/stage';
import { lane, must, plantArtifact, run, seedUnit, unit } from '../support/unit';

const D = '2026-09-27';
const WS = 'kept line\n   \n\t';
const chomp = (s: string): string => s.replace(/\n+$/, '');
const LEGACY: Record<string, string> = {
  state: 'status: ACTIVE\ncurrent_anchor: A2\nnext_action: "plan the legacy unit"\nobjective: Legacy objective;\n  continued on a second line\nrepos: [cl]\n',
  backlog: '# backlog grammar\n\n@task cl-task\n  OBJECTIVE: "legacy task"\n  STATUS: TODO\n  REFS: a#b c#d\n  DESCRIPTION ::\n    legacy body\n\n\n@task cl-other\n  STATUS: TODO\n  OBJECTIVE: "other task"\n',
  knowledge: '@finding CL_FIND\n  SUMMARY ::\n    a legacy summary\n  REF: "journal#2026-09-20-cl-zero"\n',
  journal: '@anchor A1 ("unit birth", attention: legacy)\n\n@entry 2026-09-20-cl-zero\n  ANCHOR: A1\n  WHAT: "the closed target"\n  THREAD: none\n\n@entry 2026-09-20-cl-one\n  ANCHOR: A1\n  GROUP: cl\n  STATUS: DONE\n  WHAT: unquoted legacy what\n  NOTE: an unknown field\n  CLOSES: 2026-09-20-cl-zero (done: a (nested) reason, kept)\n  THREAD: none\n@anchor A2 ("continues A1", attention: second)\n',
  'lane/cl-lane/recipe': '# recipe\n',
  'lane/cl-lane/journal': '@anchor A0 ("lane boot, no parent anchor")\n\n@entry 2026-09-20-cl-lane\n  ANCHOR: A2\n  GROUP: cl\n  WHAT :: a head line with text\n    and a body line\n  RESULT: kept\n',
};
const files = (sb: string): string => Object.keys(LEGACY).map((k) => readFileSync(artifactPath(sb, 'cl-unit', k), 'utf8')).join('\0');

describe.concurrent('every item reads in the one canonical layout, every value kept', () => {
  let sb0: string;
  beforeAll(async () => {
    sb0 = await seed(async (sb) => {
      await seedUnit(sb, 'cl-verbs', 'a unit written by the verbs');
      await must(unit(sb, 'task', 'add', 'cl-verbs', 'cl-v', '--objective=a verb task', '--desc=a body'));
      await must(unit(sb, 'record', 'cl-verbs', '--what=a verb entry', `--slug=${D}-cl-v`));
      await must(unit(sb, 'finding', 'add', 'cl-verbs', 'CL_V', '--summary=a verb finding'));
      await must(run(sb, ['lane', 'create', 'cl-verbs', 'cl-vl'], { input: '# recipe\n' }));
      await must(lane(sb, 'record', 'cl-verbs', 'cl-vl', '--what=a lane entry'));
    }, 'posix', 'canonical');
  });

  it('Y-d F5-WS [the-record-r20]: a block value drops its trailing whitespace-only lines on write and read; the item renders canonical', async () => {
    const sb = fresh(sb0);
    await must(unit(sb, 'task', 'add', 'cl-verbs', 'y-ws', '--objective=trailing blank lines', `--desc=${WS}`));
    const json = (await unit(sb, 'task', 'show', 'cl-verbs', 'y-ws', '--json')).stdout;
    expect(json).toContain('"description":"kept line",');
    expect(json).not.toContain('"verbatim"');
    await must(unit(sb, 'task', 'update', 'cl-verbs', 'y-ws', '--details=later section'));
    expect((await unit(sb, 'task', 'show', 'cl-verbs', 'y-ws', '--json')).stdout).toContain('"description":"kept line","criteria":null,"details":"later section"');
    expect(chomp((await unit(sb, 'task', 'show', 'cl-verbs', 'y-ws')).stdout)).toBe('@task y-ws\n  STATUS: TODO\n  OBJECTIVE: "trailing blank lines"\n  DESCRIPTION ::\n    kept line\n  IMPLEMENTATION DETAILS ::\n    later section');
    await must(unit(sb, 'task', 'add', 'cl-verbs', 'y-ws2', '--objective=a block before another', `--desc=${WS}`, '--criteria=a criterion'));
    expect((await unit(sb, 'task', 'show', 'cl-verbs', 'y-ws2', '--json')).stdout).toContain('"description":"kept line","criteria":"a criterion"');
    await must(unit(sb, 'finding', 'add', 'cl-verbs', 'Y_WS', `--summary=${WS}`));
    const finding = (await unit(sb, 'finding', 'show', 'cl-verbs', 'Y_WS', '--json')).stdout;
    expect(finding).toContain('"summary":"kept line",');
    expect(finding).not.toContain('"verbatim"');
  });

  it('CL-a [the-record-r20]: no answer of a verb-written unit carries a verbatim key; entries answer their empty extras', async () => {
    const sb = fresh(sb0);
    const calls = [
      ['unit', 'task', 'show', 'cl-verbs', 'cl-v', '--json'],
      ['unit', 'entry', 'show', 'cl-verbs', `${D}-cl-v`, '--json'],
      ['unit', 'finding', 'show', 'cl-verbs', 'CL_V', '--json'],
      ['lane', 'show', 'cl-verbs', 'cl-vl', 'journal', '--json'],
      ['unit', 'board', 'cl-verbs', '--json'],
      ['unit', 'task', 'list', 'cl-verbs', '--json'],
    ];
    let json = '';
    for (const argv of calls) json += (await run(sb, argv)).stdout;
    expect(json).not.toContain('"verbatim"');
    expect(json).toContain('"extra_fields":[],"head_text":null,"extra_lines":[]');
  });

  describe('CL-b: legacy items read canonical with every value kept and the files untouched (posix plants)', () => {
    let legacy: string;
    beforeAll(() => {
      legacy = stage('posix', 'canonical-legacy');
      for (const [artifact, text] of Object.entries(LEGACY)) plantArtifact(legacy, 'cl-unit', artifact, text);
    });

    it('CL-b [the-record-r5, the-record-r20]: a legacy entry shows canonical: extra fields first, the legacy STATUS, the WHAT quoted, the nested reason whole', async () => {
      const sb = fresh(legacy);
      expect(chomp((await unit(sb, 'entry', 'show', 'cl-unit', '2026-09-20-cl-one')).stdout)).toBe('@entry 2026-09-20-cl-one\n  NOTE: an unknown field\n  ANCHOR: A1\n  STATUS: DONE\n  WHAT: "unquoted legacy what"\n  GROUP: cl\n  THREAD: none\n  CLOSES: 2026-09-20-cl-zero (done: a (nested) reason, kept)');
      const json = (await unit(sb, 'entry', 'show', 'cl-unit', '2026-09-20-cl-one', '--json')).stdout;
      expect(json).not.toContain('"verbatim"');
      expect(json).toContain('"legacy_status":"DONE","refs":[],"closers":[{"kind":"CLOSES","targets":["2026-09-20-cl-zero"],"verdict":"done","reason":"a (nested) reason, kept","extra_text":null}],"extra_fields":[{"key":"NOTE","value":"an unknown field"}]');
      expect((await unit(sb, 'resolve', 'cl-unit', 'entry#2026-09-20-cl-zero')).stdout).toBe('@entry 2026-09-20-cl-zero\n  ANCHOR: A1\n  WHAT: "the closed target"\n  THREAD: none\n\n');
      expect(files(sb)).toBe(Object.values(LEGACY).join('\0'));
    });

    it('CL-b [the-record-r20]: a legacy task, finding, state, and lane journal read canonical; the files stay byte for byte', async () => {
      const sb = fresh(legacy);
      expect(chomp((await unit(sb, 'task', 'show', 'cl-unit', 'cl-task')).stdout)).toBe('@task cl-task\n  STATUS: TODO\n  OBJECTIVE: "legacy task"\n  REFS: [a#b, c#d]\n  DESCRIPTION ::\n    legacy body');
      expect(chomp((await unit(sb, 'finding', 'show', 'cl-unit', 'CL_FIND')).stdout)).toBe('@finding CL_FIND\n  REF: "journal#2026-09-20-cl-zero"\n  SUMMARY ::\n    a legacy summary');
      const page = (await unit(sb, 'load', 'cl-unit', '1')).stdout;
      expect(page).toMatch(/^objective: "Legacy objective;$/m);
      expect(page).toMatch(/^ {2}continued on a second line"$/m);
      expect(chomp((await lane(sb, 'show', 'cl-unit', 'cl-lane', 'journal')).stdout)).toBe('@anchor A0 ("lane boot, no parent anchor")\n\n@entry 2026-09-20-cl-lane\n  RESULT: kept\n  ANCHOR: A2\n  WHAT ::\n    a head line with text\n    and a body line\n  GROUP: cl');
      expect((await lane(sb, 'show', 'cl-unit', 'cl-lane', 'journal', '--json')).stdout).toContain('"head_text":"(\\"lane boot, no parent anchor\\")"');
      expect(files(sb)).toBe(Object.values(LEGACY).join('\0'));
    });

    it('CL-b [the-record-r20]: a write rewrites the touched item canonical in place, every other byte kept; a state write erases next_action', async () => {
      const sb = fresh(legacy);
      await must(unit(sb, 'task', 'update', 'cl-unit', 'cl-task', '--criteria=a criterion'));
      expect(chomp(readFileSync(artifactPath(sb, 'cl-unit', 'backlog'), 'utf8'))).toBe('# backlog grammar\n\n@task cl-task\n  STATUS: TODO\n  OBJECTIVE: "legacy task"\n  REFS: [a#b, c#d]\n  DESCRIPTION ::\n    legacy body\n  ACCEPTANCE CRITERIA ::\n    a criterion\n\n@task cl-other\n  STATUS: TODO\n  OBJECTIVE: "other task"');
      await unit(sb, 'close', 'cl-unit');
      await unit(sb, 'reopen', 'cl-unit');
      expect(chomp(readFileSync(artifactPath(sb, 'cl-unit', 'state'), 'utf8'))).toBe('status: ACTIVE\ncurrent_anchor: A2\nobjective: "Legacy objective;\n  continued on a second line"\nrepos: [cl]');
    });
  });
});
