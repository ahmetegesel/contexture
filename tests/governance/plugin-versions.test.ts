import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRERELEASE } from '../support/fts5';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { put } from '../support/tree';
import { atTop, git } from './walk';

type Verdict = { plugin: string; red: boolean; line: string };
type Check = { need?: string; verdicts: Verdict[] };
type Mention = { kind: 'comment' | 'quiet' | 'read' | 'unread'; line: string; reads: string[] };

const lines = (s: string): string[] => s.split('\n').filter(Boolean);

function run(root: string, ...args: string[]): string {
  const r = git(root, ...args);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} in ${root}: rc ${r.status}: ${r.stderr}`);
  return r.stdout;
}

const probe = (root: string, ...args: string[]): string | undefined => {
  const r = git(root, ...args);
  return r.status === 0 ? r.stdout : undefined;
};

const READ = /\$(?:\{CTX_PACKAGE_ROOT(?::-)?\}|CTX_PACKAGE_ROOT)\/([\w.-]+(?:\/[\w.-]+)*)(?![\w./$-])/g;
const GUARD = /\$\{CTX_PACKAGE_ROOT:-\}(?!"?\/)/g;

function census(body: string): Mention[] {
  return lines(body)
    .filter((line) => line.includes('CTX_PACKAGE_ROOT'))
    .map((line): Mention => {
      if (/^\s*#/.test(line)) return { kind: 'comment', line, reads: [] };
      const reads: string[] = [];
      const rest = line
        .replace(/'[^']*'/g, '')
        .replace(READ, (_m, path: string) => {
          reads.push(path);
          return '';
        })
        .replace(GUARD, '');
      const kind = rest.includes('CTX_PACKAGE_ROOT') ? 'unread' : reads.length ? 'read' : 'quiet';
      return { kind, line, reads };
    });
}

function readers(root: string, plugin = '*'): string[] {
  const r = git(root, 'grep', '--cached', '-l', '-F', 'CTX_PACKAGE_ROOT', '--', `:(glob)plugins/${plugin}/.contexture/**`, ':(exclude,glob)**/*.md');
  if (r.status === 1) return [];
  if (r.status !== 0) throw new Error(`git grep in ${root}: rc ${r.status}: ${r.stderr}`);
  return lines(r.stdout);
}

function extras(root: string, plugin: string): string[] {
  const reads = readers(root, plugin).flatMap((f) => census(run(root, 'show', `:${f}`)).flatMap((m) => m.reads));
  return [...new Set(reads)].sort().map((p) => `plugins/${plugin}/${p}`);
}

const version = (manifest: string | undefined): string | undefined => manifest?.match(/^# version: [ \t]*(\S+)[ \t]*$/m)?.[1];

const triple = (v: string): number[] | undefined => (/^\d+\.\d+\.\d+$/.test(v) ? v.split('.').map(Number) : undefined);

function greater(a: string, b: string): boolean {
  const [x, y] = [triple(a), triple(b)];
  if (!x || !y) return false;
  const i = x.findIndex((n, k) => n !== y[k]);
  return i >= 0 && x[i] > y[i];
}

function shown(paths: string[]): string {
  const head = paths.slice(0, 5).join(', ');
  return paths.length > 5 ? `${head} (and ${paths.length - 5} more)` : head;
}

function verdict(root: string, tag: string, manifest: string): Verdict {
  const plugin = manifest.split('/')[1];
  const green = (line: string): Verdict => ({ plugin, red: false, line });
  const red = (line: string): Verdict => ({ plugin, red: true, line });
  const now = version(probe(root, 'show', `:${manifest}`));
  const then = version(probe(root, 'show', `${tag}:${manifest}`));
  if (!now) return red(`${plugin}: ${manifest} carries no version line in the index`);
  if (!then) return green(`${plugin} ${now}: absent at ${tag}`);
  if (now !== then) {
    return greater(now, then) ? green(`${plugin} ${now}: bumped from ${then} at ${tag}`) : red(`${plugin} ${now} in the index is not a greater x.y.z than ${then} at ${tag}`);
  }
  const commit = lines(run(root, 'log', '--format=%H', '-G^# version:', tag, '--', manifest)).find((c) => version(probe(root, 'show', `${c}^:${manifest}`)) !== now);
  const first = commit ? lines(run(root, 'tag', '--list', 'v[0-9]*', '--contains', commit, '--merged', tag, '--sort=v:refname'))[0] : undefined;
  if (!first) return red(`${plugin} ${now}: no release tag holds the commit that set it`);
  const paths = lines(run(root, 'diff', '--cached', '--name-only', first, '--', `plugins/${plugin}/.contexture`, ...extras(root, plugin)));
  if (!paths.length) return green(`${plugin} ${now}: payload unchanged since ${first}`);
  return red(`${plugin} ${now} first shipped in ${first}, and its payload changed since: ${shown(paths)}; bump plugins/${plugin}/manifest`);
}

function check(root: string): Check {
  if (probe(root, 'rev-parse', '--is-shallow-repository')?.trim() === 'true') return { need: 'a full clone, not a shallow one (git fetch --unshallow)', verdicts: [] };
  const tag = probe(root, 'describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*')?.trim();
  if (!tag) return { need: 'a release tag reachable from HEAD (git fetch --tags)', verdicts: [] };
  const manifests = lines(run(root, 'ls-files', '--', ':(glob)plugins/*/manifest'));
  return { verdicts: manifests.map((m) => verdict(root, tag, m)) };
}

const summary = (c: Check): string => c.need ?? (c.verdicts.filter((v) => v.red).map((v) => v.line).join(' | ') || 'green');

const real: Check = atTop() ? check(ROOT) : { need: 'git and the repository top at the root', verdicts: [] };

describe.skipIf(real.need !== undefined && !PRERELEASE)(`the plugin versions on the tracked tree${real.need ? ` (needs ${real.need})` : ''}`, () => {
  it('the check has what it needs, since a skipped check proves nothing in the pre-release set', () => {
    expect(real.need).toBeUndefined();
  });

  it('every catalog plugin with a manifest gets a verdict', () => {
    const catalog = readdirSync(join(ROOT, 'plugins')).filter((p) => existsSync(join(ROOT, 'plugins', p, 'manifest'))).sort();
    expect(catalog.length).toBeGreaterThan(4);
    expect(real.verdicts.map((v) => v.plugin)).toEqual(catalog);
  });

  it('a plugin whose payload changed since the release that first shipped its version bumps that version', () => {
    expect(real.verdicts.filter((v) => v.red).map((v) => v.line)).toEqual([]);
  });

  it('the payload scripts, which inherit a part hook environment, name the package root only as a guard, a comment, quoted text, or a literal read', () => {
    const mentions = readers(ROOT).flatMap((f) => census(run(ROOT, 'show', `:${f}`)));
    expect(mentions.length).toBeGreaterThan(0);
    expect(mentions.filter((m) => m.kind === 'unread').map((m) => m.line)).toEqual([]);
    expect(extras(ROOT, 'docs-discipline')).toEqual(['plugins/docs-discipline/docs/workspace/conventions.md']);
  });
});

describe.concurrent('the package root census', () => {
  it('a planted literal read yields its path, braced, bare, or behind the empty default guard', () => {
    expect(census('cp "$CTX_PACKAGE_ROOT/docs/extra.md" "$CTX_ROOT/x"').map((m) => [m.kind, m.reads])).toEqual([['read', ['docs/extra.md']]]);
    expect(census('seed=${CTX_PACKAGE_ROOT}/seed/a.md').map((m) => [m.kind, m.reads])).toEqual([['read', ['seed/a.md']]]);
    expect(census('seed=${CTX_PACKAGE_ROOT:-}/seed/b.md').map((m) => [m.kind, m.reads])).toEqual([['read', ['seed/b.md']]]);
  });

  it('a guard, a comment, and quoted text read no path', () => {
    const body = ['# the installer exports CTX_PACKAGE_ROOT', 'if [ -z "${CTX_PACKAGE_ROOT:-}" ]; then', "  echo 'CTX_PACKAGE_ROOT is not set' >&2"].join('\n');
    expect(census(body).map((m) => m.kind)).toEqual(['comment', 'quiet', 'quiet']);
  });

  it('a read the census cannot name reads unread', () => {
    expect(census('cp "$CTX_PACKAGE_ROOT/$name" .').map((m) => m.kind)).toEqual(['unread']);
    expect(census('cd "$CTX_PACKAGE_ROOT"').map((m) => m.kind)).toEqual(['unread']);
    expect(census('cp "${CTX_PACKAGE_ROOT:-}"/docs/seed.md .').map((m) => m.kind)).toEqual(['unread']);
  });
});

const IDENTITY = { GIT_AUTHOR_NAME: 'suite', GIT_AUTHOR_EMAIL: 'suite@example.invalid', GIT_COMMITTER_NAME: 'suite', GIT_COMMITTER_EMAIL: 'suite@example.invalid' };

function repository(label: string) {
  const dir = sandbox(label);
  const env = { ...process.env, ...IDENTITY, GIT_CEILING_DIRECTORIES: dirname(dir) };
  const sh = (...args: string[]): string => {
    const r = spawnSync('git', ['-C', dir, '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { encoding: 'utf8', env });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')}: rc ${r.status}: ${r.stderr}`);
    return r.stdout;
  };
  const write = (rel: string, body: string): string => put(join(dir, rel), body);
  sh('init', '-q', '-b', 'main');
  return { dir, env, sh, write };
}

const MODULE = 'plugins/demo/.contexture/extensions/modules/demo/module';
const manifest = (v: string): string => `# summary: demo\n# version: ${v}\n# kind: feature\n# part: module modules/demo\n`;

describe('the ship breath states in a sandbox repository', () => {
  it('each state reads its verdict from the index against the release that first shipped the version', () => {
    const { dir, env, sh, write } = repository('plugin-versions');
    write('plugins/demo/manifest', manifest('1.0.0'));
    write(MODULE, '# summary: demo\n');
    write('plugins/demo/.contexture/extensions/modules/demo/install', '#!/bin/sh\nseed=$CTX_PACKAGE_ROOT/docs/seed.md\nsh "$CTX_ROOT/.contexture/extensions/modules/demo/scripts/seed"\n');
    write('plugins/demo/.contexture/extensions/modules/demo/scripts/seed', '#!/bin/sh\ncp "$CTX_PACKAGE_ROOT/docs/extra.md" "$CTX_ROOT/extra.md"\n');
    write('plugins/demo/docs/seed.md', 'seed\n');
    write('plugins/demo/docs/extra.md', 'extra\n');
    write('plugins/demo/README.md', 'readme\n');
    const states: [string, string][] = [];
    const note = (state: string): void => {
      states.push([state, summary(check(dir))]);
    };
    const stage = (): void => {
      sh('add', '-A');
    };

    sh('add', '-A');
    sh('commit', '-q', '-m', 'one');
    sh('tag', '-a', 'v0.0.1', '-m', 'v0.0.1');
    note('tagged');
    write('plugins/demo/README.md', 'readme, changed\n');
    stage();
    note('a package-root README change staged');
    write('plugins/demo/docs/seed.md', 'seed, changed\n');
    stage();
    note('a hook-applied seed change staged');
    sh('reset', '-q', '--hard');
    write('plugins/demo/docs/extra.md', 'extra, changed\n');
    stage();
    note('a change staged to a file a script the hook runs applies');
    sh('reset', '-q', '--hard');
    write(MODULE, '# summary: demo, changed\n');
    note('a payload edit left unstaged');
    stage();
    note('a payload change staged with the version unchanged');
    write('plugins/demo/manifest', manifest('1.0.1'));
    stage();
    note('the bump staged');
    sh('commit', '-q', '-m', 'two');
    note('committed');
    sh('tag', '-a', 'v0.0.2', '-m', 'v0.0.2');
    note('tagged again');
    write(MODULE, '# summary: demo, changed again\n');
    stage();
    note('changed again after the tag');
    write('plugins/demo/manifest', manifest('1.0.0'));
    stage();
    note('a lower version staged');
    sh('reset', '-q', '--hard');
    write('plugins/demo/manifest', manifest('1.0.2'));
    stage();
    note('a bump with no payload change staged');
    sh('reset', '-q', '--hard');
    write('plugins/fresh/manifest', manifest('1.0.0'));
    write('plugins/fresh/.contexture/extensions/modules/fresh/module', '# summary: fresh\n');
    stage();
    note('a plugin absent at the tag staged');
    sh('reset', '-q', '--hard');
    write(MODULE, '# summary: demo, released unbumped\n');
    write('plugins/demo/manifest', manifest('1.0.1 '));
    stage();
    sh('commit', '-q', '-m', 'three');
    sh('tag', '-a', 'v0.0.3', '-m', 'v0.0.3');
    note('released unbumped, the version line touched and its value kept');

    const shallow = sandbox('plugin-versions-shallow');
    const clone = spawnSync('git', ['clone', '-q', '--depth', '1', `file://${dir}`, shallow], { encoding: 'utf8', env });
    expect(clone.status, clone.stderr).toBe(0);
    states.push(['a shallow clone', summary(check(shallow))]);

    const bare = repository('plugin-versions-untagged');
    bare.write('plugins/demo/manifest', manifest('1.0.0'));
    bare.sh('add', '-A');
    bare.sh('commit', '-q', '-m', 'one');
    states.push(['no release tag', summary(check(bare.dir))]);

    expect(states).toEqual([
      ['tagged', 'green'],
      ['a package-root README change staged', 'green'],
      ['a hook-applied seed change staged', 'demo 1.0.0 first shipped in v0.0.1, and its payload changed since: plugins/demo/docs/seed.md; bump plugins/demo/manifest'],
      ['a change staged to a file a script the hook runs applies', 'demo 1.0.0 first shipped in v0.0.1, and its payload changed since: plugins/demo/docs/extra.md; bump plugins/demo/manifest'],
      ['a payload edit left unstaged', 'green'],
      ['a payload change staged with the version unchanged', `demo 1.0.0 first shipped in v0.0.1, and its payload changed since: ${MODULE}; bump plugins/demo/manifest`],
      ['the bump staged', 'green'],
      ['committed', 'green'],
      ['tagged again', 'green'],
      ['changed again after the tag', `demo 1.0.1 first shipped in v0.0.2, and its payload changed since: ${MODULE}; bump plugins/demo/manifest`],
      ['a lower version staged', 'demo 1.0.0 in the index is not a greater x.y.z than 1.0.1 at v0.0.2'],
      ['a bump with no payload change staged', 'green'],
      ['a plugin absent at the tag staged', 'green'],
      ['released unbumped, the version line touched and its value kept', `demo 1.0.1 first shipped in v0.0.2, and its payload changed since: ${MODULE}; bump plugins/demo/manifest`],
      ['a shallow clone', 'a full clone, not a shallow one (git fetch --unshallow)'],
      ['no release tag', 'a release tag reachable from HEAD (git fetch --tags)'],
    ]);
  });

  it('the shown paths stop at five and count the rest; a version line reads as the installer reads it; a greater version compares x.y.z numerically', () => {
    expect(shown(['a', 'b', 'c', 'd', 'e', 'f', 'g'])).toBe('a, b, c, d, e (and 2 more)');
    expect(version('# summary: demo\n# version: \t1.0.0\t\n# kind: feature\n')).toBe('1.0.0');
    expect(greater('1.10.0', '1.9.9')).toBe(true);
    expect(greater('1.0.0', '1.0.0')).toBe(false);
    expect(greater('2.0', '1.0.0')).toBe(false);
  });
});
