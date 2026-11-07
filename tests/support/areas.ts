export const EVERY = '*';

const CORE = ['harness', 'drivers', 'unit-record', 'unit-verbs', 'governance', 'filters', 'engine', 'hooks', 'laws', 'packages', 'base', 'integration', 'sqlite-smoke'];

export const AREAS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['tests/support/**', [EVERY]],
  ['tests/vitest.config.mts', [EVERY]],
  ['tests/package.json', [EVERY]],
  ['tests/bun.lock', [EVERY]],
  ['tests/tsconfig.json', [EVERY]],
  ['tests/README.md', ['governance']],
  ...CORE.map((p): readonly [string, readonly string[]] => [`tests/${p}/**`, [p]]),
  ['tests/fixtures/compliance/**', ['unit-record']],
  ['tests/fixtures/worked-package/**', ['packages', 'sqlite-smoke']],
  ['base/AGENTS.md', ['laws']],
  ['base/.contexture/ONBOARDING.md', ['governance']],
  ['base/.contexture/ctx', ['engine', 'filters', 'hooks', 'laws', 'packages', 'base', 'integration', 'governance']],
  ['base/.contexture/laws/**', ['laws']],
  ['base/.contexture/laws/compose', ['governance']],
  ['base/.contexture/package-install', ['packages', 'laws', 'governance']],
  ['base/.contexture/package-uninstall', ['packages', 'laws', 'governance']],
  ['base/.contexture/modules/run/**', ['filters', 'engine', 'toolchain-filters', 'governance']],
  ['base/.contexture/modules/unit/**', ['unit-record', 'unit-verbs', 'hooks', 'base', 'integration', 'sqlite-smoke', 'governance']],
  ['base/.contexture/extensions/modules/lane/**', ['unit-verbs', 'base', 'integration', 'governance']],
  ['base/.contexture/extensions/modules/rhythm/**', ['unit-verbs', 'base', 'packages', 'laws', 'engine', 'integration', 'governance']],
  ['base/.contexture/storage/**', ['drivers', 'storage-fts5', 'unit-record', 'base', 'integration', 'sqlite-smoke', 'docs-discipline', 'governance']],
  ['plugins/*/manifest', ['packages', 'governance']],
  ['plugins/*/.contexture/**', ['governance']],
  ['plugins/*/install', ['packages']],
  ['plugins/*/uninstall', ['packages']],
  ['plugins/*/README.md', ['governance']],
  ['plugins/storage-fts5/**', ['storage-fts5', 'drivers', 'sqlite-smoke']],
  ['plugins/docs-discipline/**', ['docs-discipline', 'packages', 'governance']],
  ['plugins/ast-doc-graph/**', ['ast-doc-graph', 'governance']],
  ['plugins/toolchain-filters/**', ['toolchain-filters']],
  ['plugins/starter-rhythms/**', ['packages']],
  ['docs/**', ['governance']],
  ['README.md', ['governance']],
  ['AGENTS.workspace.md', ['governance']],
];

function pattern(glob: string): RegExp {
  const body = glob
    .split('**')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
    .join('.*');
  return new RegExp(`^${body}$`);
}

const RULES = AREAS.map(([glob, projects]) => [pattern(glob), projects] as const);

export function projectsOf(path: string): string[] {
  return [...new Set(RULES.filter(([re]) => re.test(path)).flatMap(([, projects]) => projects))];
}
