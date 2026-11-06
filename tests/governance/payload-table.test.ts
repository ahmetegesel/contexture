import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { atTop, git, text } from './walk';

const SHIPPED = 'base/.contexture/{ctx,package-install,package-uninstall,storage,laws,modules/run,modules/unit,extensions,ONBOARDING.md}';

const rooted = atTop();

const declaration = (rel: string): string => text(join(ROOT, rel)).match(/base\/\.contexture\/\{[^}]*\}/)?.[0] ?? '';

function roots(decl: string): string[] {
  const [prefix, inner] = [decl.slice(0, decl.indexOf('{')), decl.slice(decl.indexOf('{') + 1, -1)];
  return inner.split(',').map((r) => prefix + r);
}

const under = (path: string, root: string) => path === root || path.startsWith(`${root}/`);

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

    it('the payload modules are exactly lane, run, and unit; the storage core is not a module', () => {
      const modules = new Set<string>();
      for (const p of tracked) {
        const parts = p.split('/');
        if (parts[1] === '.contexture' && parts[2] === 'modules' && parts.length > 4) modules.add(parts[3]);
        if (parts[1] === '.contexture' && parts[2] === 'extensions' && parts[3] === 'modules' && parts.length > 5) modules.add(parts[4]);
      }
      expect([...modules].sort()).toEqual(['lane', 'run', 'unit']);
    });
  });
});
