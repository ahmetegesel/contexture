import { DATE, mk, ok, rec } from '../support/record';
import { fresh, seedSteps, type Step } from '../support/snapshot';
import { answer, payload } from '../support/wire';

export const UNIT = 'compliance-u1';
export const TUNIT = 'compliance-tasks';
export const SUNIT = 'compliance-store';
export const ALPHA = '2026-09-27-event-1790000010';
export const BETA = '2026-09-27-event-1790000011';
export const GAMMA = '2026-09-27-event-1790000040';
export const DELTA = '2026-09-27-event-1790000041';
export const EPS = '2026-09-27-event-1790000042';
export const OTHER = '2026-09-27-event-1790000050';
export const RECIPE = '# recipe grammar\nMISSION\n  GOAL: "Subagent goal description"\n';
export const REPORT = 'Subagent report findings\n';

const steps: Step[] = [
  { name: 'empty', build: async () => undefined },
  {
    name: 'U1',
    build: async (sb) => {
      await ok(sb, 'session.create', [UNIT], payload().kv('objective', 'Compliance test session').kl('repos', 'alpha', 'beta').kv('attention', 'compliance fixture'));
    },
  },
  {
    name: 'T0',
    build: async (sb) => {
      await ok(sb, 'session.stamp', [UNIT], payload().kv('date', DATE));
      await ok(sb, 'session.close', [UNIT]);
      answer(await mk(sb, TUNIT, 'Task verification session'), 'session.create');
    },
  },
  {
    name: 'T5',
    build: async (sb) => {
      await ok(sb, 'task.add', [TUNIT, 'task-sample'], payload().kv('objective', 'Sample task objective').kv('desc', 'Sample description\nwith a second line').kv('criteria', 'Acceptance criteria 1').kv('details', 'Implementation detail 1'));
    },
  },
  {
    name: 'T6',
    build: async (sb) => {
      await ok(sb, 'task.update', [TUNIT, 'task-sample'], payload().kv('objective', 'Updated task objective').kv('desc', 'Updated description'));
    },
  },
  { name: 'T7', build: async (sb) => void (await ok(sb, 'task.start', [TUNIT, 'task-sample'])) },
  {
    name: 'T8',
    build: async (sb) => void (await ok(sb, 'task.complete', [TUNIT, 'task-sample'], payload().kv('evidence', 'Verified via automated test suite').kv('date', DATE))),
  },
  {
    name: 'T9',
    build: async (sb) => {
      await ok(sb, 'task.add', [TUNIT, 'task-keeper'], payload().kv('objective', 'Keeper objective'));
      await ok(sb, 'task.reopen', [TUNIT, 'task-sample']);
      await ok(sb, 'task.drop', [TUNIT, 'task-sample'], payload().kv('reason', 'Deprecating task').kv('date', DATE));
      await ok(sb, 'task.add', [TUNIT, 'task-sample'], payload().kv('objective', 'Re-declared objective'));
    },
  },
  {
    name: 'T10',
    build: async (sb) => void answer(await rec(sb, TUNIT, 1790000010, 'Journal event description', { with: payload().kv('group', 'topic-group') }), 'entry.record'),
  },
  {
    name: 'T12',
    build: async (sb) => {
      const closer = payload().kv('group', 'topic-group').kv('closers.count', '1').kcl(1, 'CLOSES', 'done', 'Closer event', ALPHA);
      answer(await rec(sb, TUNIT, 1790000011, 'Closer event', { with: closer }), 'entry.record');
    },
  },
  {
    name: 'T13',
    build: async (sb) => void (await ok(sb, 'finding.add', [TUNIT, 'FINDING_ALPHA'], payload().kv('summary', 'Alpha architectural decision summary').kl('refs', `journal#${ALPHA}`))),
  },
  {
    name: 'T15',
    build: async (sb) => {
      await ok(sb, 'finding.add', [TUNIT, 'FINDING_BETA'], payload().kv('summary', 'Beta superseding finding').kl('refs', `journal#${BETA}`).kv('supersedes', 'FINDING_ALPHA'));
    },
  },
  { name: 'T16', build: async (sb) => void (await ok(sb, 'lane.create', [TUNIT, 'lane-worker'], RECIPE)) },
  {
    name: 'T17',
    build: async (sb) => {
      await ok(sb, 'lane.record', [TUNIT, 'lane-worker'], payload().kl('refs', `journal#${ALPHA}`).kv('what', 'Subagent action trace WHAT').kv('thread', 'none').kv('date', DATE).kv('epoch', '1790000020'));
      await ok(sb, 'lane.write_report', [TUNIT, 'lane-worker'], REPORT);
    },
  },
  {
    name: 'T27',
    build: async (sb) => {
      answer(await rec(sb, TUNIT, 1790000040, 'Gamma', { thread: 'the human', with: payload().kv('group', 'topic-group') }), 'entry.record');
      answer(await rec(sb, TUNIT, 1790000041, 'Delta'), 'entry.record');
      answer(await rec(sb, TUNIT, 1790000042, 'Folds two', { with: payload().kv('closers.count', '1').kcl(1, 'CLOSES', 'folded', 'two at once', GAMMA, DELTA) }), 'entry.record');
    },
  },
  {
    name: 'T34',
    build: async (sb) => {
      await ok(sb, 'task.start', [TUNIT, 'task-keeper']);
      await ok(sb, 'task.complete', [TUNIT, 'task-keeper'], payload().kv('evidence', 'keeper landed').kv('date', DATE));
    },
  },
  {
    name: 'T35',
    build: async (sb) => {
      await ok(sb, 'task.add', [TUNIT, 'task-refs'], payload().kv('objective', 'Refs task').kl('refs', 'backlog#one', 'knowledge#TWO'));
      await ok(sb, 'task.update', [TUNIT, 'task-refs'], payload().kv('desc', 'Added description').kv('criteria', 'Added criteria').kv('details', 'Added details'));
      await ok(sb, 'task.update', [TUNIT, 'task-refs'], payload().kl('refs'));
    },
  },
  {
    name: 'T37',
    build: async (sb) => void answer(await rec(sb, TUNIT, 1790000050, 'Other group', { with: payload().kv('group', 'other-group') }), 'entry.record'),
  },
  {
    name: 'SS31',
    from: 'T0',
    build: async (sb) => {
      answer(await mk(sb, SUNIT, 'store'), 'session.create');
      await ok(sb, 'lane.create', [SUNIT, 's-lane'], '# recipe grammar\nMISSION\n  GOAL: "store lane"\n');
    },
  },
  {
    name: 'SS32',
    build: async (sb) => {
      await ok(sb, 'finding.add', [SUNIT, 'STORE_F'], payload().kv('summary', 'First'));
      await ok(sb, 'lane.record', [SUNIT, 's-lane'], payload().kv('what', 'First').kv('thread', 'none').kv('slug', '2026-09-25-s-l1').kv('date', DATE).kv('epoch', '1790000032'));
    },
  },
];

const snap = seedSteps('compliance', steps);

export const at = async (name: string): Promise<string> => fresh(await snap(name));
