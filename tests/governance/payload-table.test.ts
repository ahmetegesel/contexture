import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
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

const REMOVE_EMPTIED = 'while IFS= read -r p; do rm -f "$p"; rmdir -p "$(dirname "$p")" 2>/dev/null; done';

const deleteListings = (body: string): string[] => body.match(/git diff [^`\n]*--diff-filter=D[^`\n]*/g) ?? [];

const guides = (): string[] => [...kids(join(ROOT, 'docs')).filter((p) => p.endsWith('.md')), join(ROOT, 'README.md')];

const COMPARE = 'diff -rq base/.contexture .contexture';

const compareFilter = (): string => {
  const line = guide().split('\n').find((l) => l.startsWith(COMPARE)) ?? '';
  return line.slice(COMPARE.length).replace(/^\s*\|\s*/, '');
};

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

  it('the payload compare prints a leftover module folder and the retired templates folder, and drops only the workspace-owned top folders', () => {
    const leftovers = ['Only in .contexture/modules: session', 'Only in .contexture/modules: lane', 'Only in .contexture: templates'];
    const owned = ['Only in .contexture: units', 'Only in .contexture: sessions', 'Only in .contexture: rhythms', 'Only in .contexture: tmp'];
    expect(compareFilter()).not.toBe('');
    expect(throughFilter(compareFilter(), [...leftovers, ...owned])).toEqual(leftovers);
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
