import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { text } from './walk';

const FORBID = /session\.sh|compact\.sh|session-[a-z]+\.awk|\.contexture\/scripts\/|laws\/compose(?![\w.-])|\.contexture\/package-(un)?install\b|plugins\/[^\s\/`'"]+\/(un)?install(?![\w.-])/;

const SURFACES = [
  'base/AGENTS.md',
  'base/.contexture/ONBOARDING.md',
  'AGENTS.workspace.md',
  'README.md',
  'docs/the-engine.md',
  'docs/units-and-lanes.md',
  'docs/the-record.md',
  'docs/adoption.md',
  'docs/rhythms.md',
  'docs/overlays.md',
  'docs/modules.md',
  'docs/plugins.md',
  'plugins/starter-rhythms/README.md',
  'plugins/toolchain-filters/README.md',
  'plugins/toolchain-filters/tests/README.md',
  'plugins/docs-discipline/README.md',
  'plugins/ast-doc-graph/README.md',
  'plugins/storage-fts5/README.md',
  'tests/README.md',
];

const hits = (body: string): string[] => body.split('\n').filter((l) => FORBID.test(l));

describe.concurrent('the main-surface forbid grep: no invocable raw tool path', () => {
  it('the instrument reads a planted raw tool path and passes the ctx form', () => {
    expect(hits('run .contexture/scripts/session.sh now\nrun ctx unit load\n')).toEqual(['run .contexture/scripts/session.sh now']);
    expect(hits('compact.sh\nsession-board.awk\n')).toHaveLength(2);
  });

  it('[modules-r19] the instrument reads the composer path and passes ctx compose and a test file name that only starts with it', () => {
    expect(hits('sh .contexture/laws/compose --check\nthe laws/compose-merge test\n.contexture/ctx compose\n')).toEqual(['sh .contexture/laws/compose --check']);
  });

  it('[the-engine-r22] the instrument reads the private installer paths and a plugin install script, and passes ctx package and the payload declaration', () => {
    const body = [
      'run .contexture/package-install plugins/x',
      'sh .contexture/package-uninstall x',
      'sh plugins/docs-discipline/install',
      '`sh plugins/<name>/uninstall`',
      '.contexture/ctx package install docs-discipline',
      'base/.contexture/{ctx,package-install,package-uninstall,storage}',
      'plugins/docs-discipline/installer-notes.md',
      'the install part hook at .contexture/extensions/modules/docs/install',
    ].join('\n');
    expect(hits(body)).toEqual(body.split('\n').slice(0, 4));
  });

  it.each(SURFACES)('%s carries no raw tool path', (rel) => {
    expect(hits(text(join(ROOT, rel)))).toEqual([]);
  });

  it.each([
    ['help', ['help']],
    ['help --all', ['help', '--all']],
    ['unit help', ['unit', 'help']],
    ['unit help load', ['unit', 'help', 'load']],
  ])('ctx %s teaches only ctx forms', async (_form, args) => {
    const r = await ctx(stage('posix', 'forbid'), ...args);
    expect(r.code).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(0);
    expect(hits(r.stdout + r.stderr)).toEqual([]);
  });
});
