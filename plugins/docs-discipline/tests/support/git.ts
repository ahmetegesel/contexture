import { dirname } from 'node:path';
import { exec, type Run } from '@support/exec';

const IDENTITY = { GIT_AUTHOR_NAME: 'suite', GIT_AUTHOR_EMAIL: 'suite@example.invalid', GIT_COMMITTER_NAME: 'suite', GIT_COMMITTER_EMAIL: 'suite@example.invalid' };

export async function git(dir: string, ...args: string[]): Promise<Run> {
  const r = await exec('git', args, { cwd: dir, env: { ...IDENTITY, GIT_CEILING_DIRECTORIES: dirname(dir) } });
  if (r.code !== 0) throw new Error(`git ${args.join(' ')} in ${dir}: rc ${r.code}: ${r.stderr}`);
  return r;
}

export async function gitInit(dir: string, ...paths: string[]): Promise<void> {
  await git(dir, 'init', '-q', '-b', 'main');
  if (paths.length) await git(dir, 'add', ...paths);
}

export async function gitCommit(dir: string, message: string, ...flags: string[]): Promise<string> {
  await git(dir, 'commit', '-q', '-m', message, ...flags);
  return (await git(dir, 'rev-parse', 'HEAD')).stdout.trim();
}
