import { engineCall } from '../support/engine';
import { DATE } from '../support/record';
import { fresh, seedSteps, type Step } from '../support/snapshot';
import { answer, payload, type Payload } from '../support/wire';

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

const write = async (sb: string, fn: string, args: string[], input: Payload | string = ''): Promise<void> => void answer(await engineCall(sb, fn, args, input.toString()), fn);
const entry = (epoch: number, what: string, before = payload(), thread = 'none') => before.kv('what', what).kv('thread', thread).kv('date', DATE).kv('epoch', String(epoch));
const unit = (objective: string) => payload().kv('objective', objective).kv('attention', 'compliance fixture');

const steps: Step[] = [
  { name: 'empty', build: async () => undefined },
  { name: 'U1', build: (sb) => write(sb, 'session.create', [UNIT], payload().kv('objective', 'Compliance test session').kl('repos', 'alpha', 'beta').kv('attention', 'compliance fixture')) },
  {
    name: 'T0',
    build: async (sb) => {
      await write(sb, 'session.stamp', [UNIT], payload().kv('date', DATE));
      await write(sb, 'session.close', [UNIT]);
      await write(sb, 'session.create', [TUNIT], unit('Task verification session'));
    },
  },
  {
    name: 'T5',
    build: (sb) =>
      write(sb, 'task.add', [TUNIT, 'task-sample'], payload().kv('objective', 'Sample task objective').kv('desc', 'Sample description\nwith a second line').kv('criteria', 'Acceptance criteria 1').kv('details', 'Implementation detail 1')),
  },
  { name: 'T6', build: (sb) => write(sb, 'task.update', [TUNIT, 'task-sample'], payload().kv('objective', 'Updated task objective').kv('desc', 'Updated description')) },
  { name: 'T7', build: (sb) => write(sb, 'task.start', [TUNIT, 'task-sample']) },
  { name: 'T8', build: (sb) => write(sb, 'task.complete', [TUNIT, 'task-sample'], payload().kv('evidence', 'Verified via automated test suite').kv('date', DATE)) },
  {
    name: 'T9',
    build: async (sb) => {
      await write(sb, 'task.add', [TUNIT, 'task-keeper'], payload().kv('objective', 'Keeper objective'));
      await write(sb, 'task.reopen', [TUNIT, 'task-sample']);
      await write(sb, 'task.drop', [TUNIT, 'task-sample'], payload().kv('reason', 'Deprecating task').kv('date', DATE));
      await write(sb, 'task.add', [TUNIT, 'task-sample'], payload().kv('objective', 'Re-declared objective'));
    },
  },
  { name: 'T10', build: (sb) => write(sb, 'entry.record', [TUNIT], entry(1790000010, 'Journal event description', payload().kv('group', 'topic-group'))) },
  {
    name: 'T12',
    build: (sb) => write(sb, 'entry.record', [TUNIT], entry(1790000011, 'Closer event', payload().kv('group', 'topic-group').kv('closers.count', '1').kcl(1, 'CLOSES', 'done', 'Closer event', ALPHA))),
  },
  { name: 'T13', build: (sb) => write(sb, 'finding.add', [TUNIT, 'FINDING_ALPHA'], payload().kv('summary', 'Alpha architectural decision summary').kl('refs', `journal#${ALPHA}`)) },
  {
    name: 'T15',
    build: (sb) => write(sb, 'finding.add', [TUNIT, 'FINDING_BETA'], payload().kv('summary', 'Beta superseding finding').kl('refs', `journal#${BETA}`).kv('supersedes', 'FINDING_ALPHA')),
  },
  { name: 'T16', build: (sb) => write(sb, 'lane.create', [TUNIT, 'lane-worker'], RECIPE) },
  {
    name: 'T17',
    build: async (sb) => {
      await write(sb, 'lane.record', [TUNIT, 'lane-worker'], payload().kl('refs', `journal#${ALPHA}`).kv('what', 'Subagent action trace WHAT').kv('thread', 'none').kv('date', DATE).kv('epoch', '1790000020'));
      await write(sb, 'lane.write_report', [TUNIT, 'lane-worker'], REPORT);
    },
  },
  {
    name: 'T27',
    build: async (sb) => {
      await write(sb, 'entry.record', [TUNIT], entry(1790000040, 'Gamma', payload().kv('group', 'topic-group'), 'the human'));
      await write(sb, 'entry.record', [TUNIT], entry(1790000041, 'Delta'));
      await write(sb, 'entry.record', [TUNIT], entry(1790000042, 'Folds two', payload().kv('closers.count', '1').kcl(1, 'CLOSES', 'folded', 'two at once', GAMMA, DELTA)));
    },
  },
  {
    name: 'T34',
    build: async (sb) => {
      await write(sb, 'task.start', [TUNIT, 'task-keeper']);
      await write(sb, 'task.complete', [TUNIT, 'task-keeper'], payload().kv('evidence', 'keeper landed').kv('date', DATE));
    },
  },
  {
    name: 'T35',
    build: async (sb) => {
      await write(sb, 'task.add', [TUNIT, 'task-refs'], payload().kv('objective', 'Refs task').kl('refs', 'backlog#one', 'knowledge#TWO'));
      await write(sb, 'task.update', [TUNIT, 'task-refs'], payload().kv('desc', 'Added description').kv('criteria', 'Added criteria').kv('details', 'Added details'));
      await write(sb, 'task.update', [TUNIT, 'task-refs'], payload().kl('refs'));
    },
  },
  { name: 'T37', build: (sb) => write(sb, 'entry.record', [TUNIT], entry(1790000050, 'Other group', payload().kv('group', 'other-group'))) },
  {
    name: 'SS31',
    from: 'T0',
    build: async (sb) => {
      await write(sb, 'session.create', [SUNIT], unit('store'));
      await write(sb, 'lane.create', [SUNIT, 's-lane'], '# recipe grammar\nMISSION\n  GOAL: "store lane"\n');
    },
  },
  {
    name: 'SS32',
    build: async (sb) => {
      await write(sb, 'finding.add', [SUNIT, 'STORE_F'], payload().kv('summary', 'First'));
      await write(sb, 'lane.record', [SUNIT, 's-lane'], payload().kv('what', 'First').kv('thread', 'none').kv('slug', '2026-09-25-s-l1').kv('date', DATE).kv('epoch', '1790000032'));
    },
  },
];

const snap = seedSteps('compliance', steps);

export const at = async (name: string): Promise<string> => fresh(await snap(name));
