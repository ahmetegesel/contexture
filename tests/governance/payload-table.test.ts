import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FTS5_DB } from '../support/drawer';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { atTop, git, kids, text } from './walk';

const SHIPPED = 'base/.contexture/{ctx,package-install,package-uninstall,storage,laws,modules/run,modules/unit,extensions,ONBOARDING.md}';

const rooted = atTop();

const declaration = (rel: string): string => text(join(ROOT, rel)).match(/base\/\.contexture\/\{[^}]*\}/)?.[0] ?? '';

function roots(decl: string): string[] {
  const [prefix, inner] = [decl.slice(0, decl.indexOf('{')), decl.slice(decl.indexOf('{') + 1, -1)];
  return inner.split(',').map((r) => prefix + r);
}

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

const guide = (): string => text(join(ROOT, 'docs/adoption.md'));

const stepOf = (heading: string, n: number): string => {
  const body = guide();
  const start = body.indexOf(`\n## ${heading}\n`);
  if (start < 0) return '';
  const end = body.indexOf('\n## ', start + 1);
  return body.slice(start, end < 0 ? undefined : end).match(new RegExp(`^${n}\\. .*$`, 'm'))?.[0] ?? '';
};

const updatingStep = (n: number): string => stepOf('Updating', n);

const listing = (tree: string): string => `git diff --name-only --no-renames --diff-filter=D <live-tag> <tag> -- ${tree}`;

const REMOVE_EMPTIED = 'while IFS= read -r p; do rm -f "$p"; rmdir -p "$(dirname "$p")" 2>/dev/null || :; done';

const loopAfterListing = (step: string, tree: string): string => {
  const head = `${listing(tree)} | `;
  const at = step.indexOf(head);
  if (at < 0) return '';
  const rest = step.slice(at + head.length);
  return rest.slice(0, rest.indexOf('`'));
};

const deleteListings = (body: string): string[] => body.match(/git diff [^`\n]*--diff-filter=D[^`\n]*/g) ?? [];

const guides = (): string[] => [...kids(join(ROOT, 'docs')).filter((p) => p.endsWith('.md')), join(ROOT, 'README.md')];

const COMPARE = 'diff -rq base/.contexture .contexture';

const compareFilter = (): string => {
  const line = guide().split('\n').find((l) => l.startsWith(COMPARE)) ?? '';
  return line.slice(COMPARE.length).replace(/^\s*\|\s*/, '');
};

const compareReading = (): string => guide().split('\n').find((l) => l.startsWith('Each `Only in .contexture...` line')) ?? '';

const tagsAsked = (): string[] => (compareReading().match(/`git log --tags [^`]*`/g) ?? []).map((c) => c.slice(1, -1));

const shipped = (command: string, placeholder: string, path: string): string =>
  spawnSync('sh', ['-c', command.replace(placeholder, path)], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();

const throughFilter = (filter: string, lines: string[]): string[] =>
  spawnSync('sh', ['-c', `printf '%s\\n' "$@" | ${filter || 'cat'}`, 'sh', ...lines], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

describe.concurrent('the Updating path', () => {
  it('step 8 deletes the catalog paths the range removed, or refreshes the catalog whole, since catalog meta moves no version', () => {
    const step = updatingStep(8);
    expect(step).toMatch(/^8\. Update the installed packages: /);
    expect(step).toContain(listing('plugins/'));
    expect(step).toContain('git archive <tag> plugins/ | tar -x -C <your-repo>');
  });

  it.each([
    ['Payload classes and syncing', 3, 'base/'],
    ['Updating', 6, 'base/'],
    ['Updating', 8, 'plugins/'],
  ] as const)('%s step %i lists the removed %s paths with rename detection off and removes each folder the deletes empty', (heading, n, tree) => {
    const step = stepOf(heading, n);
    expect(step).toMatch(new RegExp(`^${n}\\. `));
    expect(step).toContain(`${listing(tree)} | `);
    expect(step).toContain(REMOVE_EMPTIED);
  });

  it('the step 6 removal loop ends rc 0, deleting every listed path, removing the folders it empties, and keeping a folder that still holds an entry', () => {
    const loop = loopAfterListing(updatingStep(6), 'base/');
    expect(loop).toContain('while IFS= read -r p');
    const tree = sandbox('removal-loop');
    mkdirSync(join(tree, 'gone/deep'), { recursive: true });
    mkdirSync(join(tree, 'kept'));
    for (const f of ['gone/deep/x', 'kept/y', 'kept/z']) writeFileSync(join(tree, f), '');
    const run = spawnSync('sh', ['-c', `printf '%s\\n' "$@" | ${loop}`, 'sh', 'base/gone/deep/x', 'base/kept/y'], { cwd: tree, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(existsSync(join(tree, 'gone/deep/x'))).toBe(false);
    expect(existsSync(join(tree, 'kept/y'))).toBe(false);
    expect(existsSync(join(tree, 'gone'))).toBe(false);
    expect(existsSync(join(tree, 'kept/z'))).toBe(true);
  });

  it('no guide lists removed paths with rename detection on, which reports a moved file as a rename and leaves it off the list', () => {
    const found = guides().flatMap((p) => deleteListings(text(p)));
    expect(found.length).toBeGreaterThanOrEqual(3);
    expect(found.filter((c) => !c.includes('--no-renames'))).toEqual([]);
  });

  it('step 9 ensures the scratch drawer ignore line, after the whitelist in a deny-by-default workspace', () => {
    const step = updatingStep(9);
    expect(step).toMatch(/^9\. Compose the law layer: /);
    expect(step).toContain('the line `.contexture/tmp/`');
    expect(step).toContain('a standalone repository adds `.contexture/tmp/` to its ignore file');
    expect(step).toContain('a deny-by-default workspace adds it after its `!.contexture/**` whitelist line');
  });

  it('the deny-by-default block re-ignores the scratch drawer after the drawer whitelist', () => {
    const block = guide().match(/```\n\*\n!\.gitignore\n[\s\S]*?```/)?.[0].split('\n') ?? [];
    expect(block.indexOf('.contexture/tmp/')).toBeGreaterThan(block.indexOf('!.contexture/**'));
    expect(block.indexOf('!.contexture/**')).toBeGreaterThan(0);
  });

  it('the listing census flags a planted listing with rename detection on', () => {
    const planted = 'delete them (`git diff --name-only --diff-filter=D <live-tag> <tag> -- base/` lists them)';
    expect(deleteListings(planted).filter((c) => !c.includes('--no-renames'))).toHaveLength(1);
  });

  it('the payload compare prints a leftover module folder and the retired templates folder, and drops only the workspace-owned top folders and files', () => {
    const leftovers = ['Only in .contexture/modules: session', 'Only in .contexture/modules: lane', 'Only in .contexture: templates'];
    const owned = ['Only in .contexture: units', 'Only in .contexture: sessions', 'Only in .contexture: rhythms', 'Only in .contexture: tmp'];
    const db = basename(FTS5_DB);
    const files = ['config', 'storage.conf', db, `${db}-wal`, `${db}-shm`, '.DS_Store'].map((f) => `Only in .contexture: ${f}`);
    expect(compareFilter()).not.toBe('');
    expect(throughFilter(compareFilter(), [...leftovers, ...owned, ...files])).toEqual(leftovers);
  });

  it("the compare's reading tells a missed delete from the workspace's own by the tags: shipped under base/, or a module folder a plugin shipped before v0.60", () => {
    const reading = compareReading();
    expect(reading).toContain('a printed path some tag shipped under `base/` is a missed delete (`git log --tags --format=%h -1 -- base/.contexture/<path>` names a commit');
    expect(reading).toContain("a folder under `.contexture/modules/` some tag shipped under a plugin's `.contexture`, that plugin's home from before v0.60 (`git log --tags --format=%h -1 -- 'plugins/*/.contexture/modules/<name>/*'` names a commit)");
    expect(reading).toContain("any other path, where both print nothing, is the workspace's own");
  });

  it.skipIf(!rooted)("the reading's tags commands name the leftovers and a pre v0.60 plugin home, and nothing for the workspace's own names", () => {
    const [base, plugin] = [tagsAsked().find((c) => c.includes('<path>')) ?? '', tagsAsked().find((c) => c.includes('<name>')) ?? ''];
    expect(base).not.toBe('');
    expect(plugin).not.toBe('');
    for (const path of ['modules/session', 'modules/lane', 'templates']) expect(shipped(base, '<path>', path)).toMatch(/^[0-9a-f]{4,}$/);
    expect(shipped(plugin, '<name>', 'docs')).toMatch(/^[0-9a-f]{4,}$/);
    for (const path of ['modules/feedback', 'setups', 'config', 'modules/docs']) expect(shipped(base, '<path>', path)).toBe('');
    for (const name of ['feedback', 'unit']) expect(shipped(plugin, '<name>', name)).toBe('');
  });
});

const topology = (name: 'standalone repo' | 'parent workspace'): string[] => {
  const lines = text(join(ROOT, 'base/.contexture/ONBOARDING.md')).split('\n');
  const start = lines.indexOf(`    ${name}:`);
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^ {0,4}\S/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end);
};

describe.concurrent("the adoption procedure's gitignore guidance", () => {
  it('a standalone repository ignores the scratch drawer', () => {
    expect(topology('standalone repo').some((l) => l.includes('always ignore the scratch drawer with the line .contexture/tmp/'))).toBe(true);
  });

  it('a deny-by-default workspace re-ignores the scratch drawer after the drawer whitelist', () => {
    const lines = topology('parent workspace');
    const whitelist = lines.indexOf('        !.contexture/**');
    expect(whitelist).toBeGreaterThan(0);
    expect(lines.findIndex((l) => l.includes('the line .contexture/tmp/ follows !.contexture/**'))).toBeGreaterThan(whitelist);
  });
});

describe('the payload path tables', () => {
  it('the declaration is one string in adoption.md and the-engine.md', () => {
    expect(declaration('docs/the-engine.md')).toBe(declaration('docs/adoption.md'));
  });

  it('the declaration reads the shipped set', () => {
    expect(declaration('docs/adoption.md')).toBe(SHIPPED);
  });

  describe.skipIf(!rooted)('against git ls-files base/ (needs git and the repository top at the root)', () => {
    const tracked = rooted ? git(ROOT, 'ls-files', 'base/').stdout.split('\n').filter(Boolean) : [];
    const declared = roots(SHIPPED);

    it('git ls-files base/ returns the tracked set', () => {
      expect(tracked.length).toBeGreaterThan(0);
    });

    it('every tracked base/ path sits under a declared root', () => {
      expect(tracked.filter((p) => p !== 'base/AGENTS.md' && !declared.some((r) => under(p, r)))).toEqual([]);
    });

    it('the instrument flags a path outside the declared roots', () => {
      expect(['base/.contexture/stray', 'base/.contexture/ctx'].filter((p) => !declared.some((r) => under(p, r)))).toEqual(['base/.contexture/stray']);
    });

    it.each(declared)('the payload root %s carries tracked files', (root) => {
      expect(tracked.some((p) => p.startsWith(root))).toBe(true);
    });

    it('[modules-r1] the payload modules are exactly lane, rhythm, run, and unit; the storage core is not a module', () => {
      const modules = new Set<string>();
      for (const p of tracked) {
        const parts = p.split('/');
        if (parts[1] === '.contexture' && parts[2] === 'modules' && parts.length > 4) modules.add(parts[3]);
        if (parts[1] === '.contexture' && parts[2] === 'extensions' && parts[3] === 'modules' && parts.length > 5) modules.add(parts[4]);
      }
      expect([...modules].sort()).toEqual(['lane', 'rhythm', 'run', 'unit']);
    });
  });
});
