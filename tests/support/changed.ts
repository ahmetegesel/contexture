import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { EVERY, projectsOf } from './areas';
import { ROOT } from './root';

const git = (...args: string[]): string[] => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.trim()}`);
  return r.stdout.split('\n').filter(Boolean);
};

const [first, ...rest] = process.argv.slice(2);
const ref = first !== undefined && !first.startsWith('-') ? first : undefined;
const forwarded = ref === undefined && first !== undefined ? [first, ...rest] : rest;
const since = ref === undefined ? 'HEAD' : git('merge-base', ref, 'HEAD')[0];

const paths = [...new Set([...git('diff', '--name-only', since), ...git('ls-files', '--others', '--exclude-standard')])].sort();
const selected = new Set(paths.flatMap(projectsOf));
const unowned = paths.filter((p) => projectsOf(p).length === 0);

process.stdout.write(`changed: ${paths.length} paths since ${ref ?? 'HEAD'} (the working tree included)\n`);
if (unowned.length > 0) process.stdout.write(`changed: no project tests ${unowned.join(' ')}\n`);
if (selected.size === 0) {
  process.stdout.write('changed: nothing to run\n');
  process.exit(0);
}
const projects = selected.has(EVERY) ? (selected.has('sqlite-smoke') ? [] : ['!sqlite-smoke']) : [...selected].sort();
process.stdout.write(`changed: running ${selected.has(EVERY) ? 'every default project' : projects.join(' ')}\n`);
const run = spawnSync(join(ROOT, 'tests/node_modules/.bin/vitest'), ['run', ...projects.flatMap((p) => ['--project', p]), ...forwarded], {
  cwd: join(ROOT, 'tests'),
  stdio: 'inherit',
});
process.exit(run.status ?? 1);
