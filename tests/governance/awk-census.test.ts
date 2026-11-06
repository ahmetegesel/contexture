import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { put } from '../support/tree';
import { text, walk } from './walk';

const AWKREPL = join(ROOT, 'tests/governance/awkrepl.awk');
const PROSE = /\.(ts|js|json|md|py|sql)$/;
const SKIPPED = /\/(node_modules|fixtures)(\/|$)|\/\.contexture\/(tmp|sessions)(\/|$)/;

function censusFiles(root = ROOT): string[] {
  const roots = [
    join(root, 'base/.contexture'),
    ...readdirSync(join(root, 'plugins')).sort().map((p) => join(root, 'plugins', p, '.contexture')),
    join(root, 'tests'),
  ];
  const skip = (p: string) => SKIPPED.test(`/${relative(root, p)}`) || PROSE.test(p);
  return roots.flatMap((r) => walk(r, skip));
}

const census = (files: readonly string[]) => exec('awk', ['-f', AWKREPL, ...files], { cwd: sandbox('awk-census'), input: '' });

describe.concurrent('the awk replacement census: no sub or gsub replacement carries a backslash before another character', () => {
  it('[modules-r8] the shipped awk and sh files, the plugin module copies, and the suites read clean', async () => {
    const files = censusFiles();
    const withSub = files.filter((f) => text(f).includes('sub('));
    expect(files.length).toBeGreaterThan(100);
    expect(withSub.length).toBeGreaterThan(20);
    const r = await census(withSub);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe('');
  });

  it('[modules-r8] the exclusions match paths inside the repository, so a repository under a .contexture/tmp folder still reads its files', () => {
    const root = sandbox('census-root');
    const kept = ['base/.contexture/modules/m/scripts/v.sh', 'plugins/p/.contexture/x.awk', 'tests/lib.sh'];
    const skipped = ['base/.contexture/tmp/t.awk', 'base/.contexture/sessions/u/s.sh', 'tests/fixtures/f.awk', 'tests/node_modules/n.sh', 'tests/notes.md'];
    for (const f of [...kept, ...skipped]) put(join(root, f), 'x\n');
    expect(root).toContain('/.contexture/tmp/');
    expect(censusFiles(root).map((f) => relative(root, f))).toEqual(kept);
  });

  it('[modules-r8] the census reads the three planted unportable forms and none of the four portable ones', async () => {
    const plant = put(
      join(sandbox('awk-plant'), 'plant.awk'),
      [
        String.raw`  gsub(/"/, "\\\"", s)`,
        String.raw`  gsub(/\t/, "\\t", s); x = 1`,
        String.raw`  sub(/a/, "\\n")`,
        String.raw`  gsub(/\\/, "\\\\", s)`,
        String.raw`  gsub(/b/, "\\&", s)`,
        String.raw`  gsub(/c/, "\034", s)`,
        String.raw`  gsub(/\./, "[.]", s)`,
        '',
      ].join('\n'),
    );
    const r = await census([plant]);
    expect(r.stdout.split('\n').filter(Boolean).map((l) => l.split(':')[1])).toEqual(['1', '2', '3']);
  });
});
