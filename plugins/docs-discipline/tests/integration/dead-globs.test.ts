import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { sandbox } from '@support/sandbox';
import { fresh, seed } from '@support/snapshot';
import { addModule, docs } from '../support/corpus';
import { check } from '../support/engines';
import { git, gitCommit, gitInit } from '../support/git';

const put = (sb: string, path: string, body = 'echo x\n'): void => {
  mkdirSync(join(sb, path, '..'), { recursive: true });
  writeFileSync(join(sb, path), body);
};

async function newDoc(sb: string, repo: string, slug: string, sources: string): Promise<void> {
  const r = await docs(sb, ['new', repo, slug, '--kind=capability', `--description=the ${slug} unit`, `--sources=${sources}`, `--keywords=${slug}`]);
  if (r.code !== 0) throw new Error(`docs new ${repo} ${slug}: rc ${r.code}: ${r.stderr}`);
}

async function repo(dir: string, ...files: string[]): Promise<string> {
  for (const f of files) put(dir, f);
  await gitInit(dir);
  await git(dir, 'add', '-A');
  return gitCommit(dir, 'c0');
}

let ws: string;
let parent: string;
let apps: string;
let nested: string;
beforeAll(async () => {
  [ws, parent, apps, nested] = await Promise.all([
    seed(async (sb) => {
      addModule(sb);
      writeFileSync(join(sb, '.gitignore'), '.contexture/\n/docs/\nlib/ignored.sh\n');
      await repo(sb, 'lib/a.sh');
      await newDoc(sb, 'workspace', 'libs', 'lib/*.sh');
    }, 'posix', 'globs-ws'),
    seed(async (sb) => {
      addModule(sb);
      put(sb, 'tools/x.sh');
      await repo(join(sb, 'api'), 'lib/a.sh', 'lib/b.sh');
      mkdirSync(join(sb, 'broken/.git'), { recursive: true });
      put(sb, 'broken/src/a.ts');
      await newDoc(sb, 'api', 'core', 'lib/*.sh');
      await newDoc(sb, 'broken', 'unit', 'src/*.ts');
      await newDoc(sb, 'workspace', 'tools', 'tools/*.sh');
      await newDoc(sb, 'workspace', 'wide', '**/*.sh');
    }, 'posix', 'globs-parent'),
    seed(async (sb) => {
      addModule(sb);
      await repo(join(sb, 'apps/api'), 'lib/a.sh', 'lib/b.sh');
      await newDoc(sb, 'workspace', 'appsapi', 'apps/api/lib/*.sh');
    }, 'posix', 'globs-apps'),
    seed(async (sb) => {
      addModule(sb);
      writeFileSync(join(sb, '.gitignore'), '.contexture/\n/docs/\n');
      await repo(join(sb, 'child'), 'lib/a.sh');
      put(sb, 'README.txt');
      await gitInit(sb, '.gitignore', 'README.txt');
      await gitCommit(sb, 'c0');
      await newDoc(sb, 'workspace', 'kid', 'child/**');
    }, 'posix', 'globs-nested'),
  ]);
});

const deadLines = (out: string): string[] => (out.match(/^DEAD SOURCE: .*$/gm) ?? []).sort();
const LIBS_DEAD = "DEAD SOURCE: workspace/libs lists glob 'lib/*.sh' that no longer matches any file after deleting 'lib/a.sh' (cleanup required)";
const checkWs = (sb: string, input: string, env: Record<string, string> = {}) => docs(sb, ['check', 'workspace'], { input, env });

describe('the check verb judges a glob that claimed a deleted path against the working tree', { concurrent: true }, () => {
  it('[docs-module-r8, docs-module-r9] deleting the only file a glob claims reads DEAD SOURCE rc 1 with the widened FAILED line', async () => {
    const sb = fresh(ws);
    rmSync(join(sb, 'lib/a.sh'));
    const r = await checkWs(sb, 'D\tlib/a.sh\n');
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual([LIBS_DEAD]);
    expect(r.stderr).toContain('docs-check: FAILED: 1 dead source(s): a deleted file still explicitly listed in doc sources, or a glob source no file matches after the delta.\n');
  });

  it.each([
    ['a tracked path', async (sb: string) => { put(sb, 'lib/b.sh'); await git(sb, 'add', 'lib/b.sh'); await gitCommit(sb, 'c1'); }, 'D\tlib/a.sh\n'],
    ['an untracked path git does not ignore (an uncommitted replacement)', async (sb: string) => put(sb, 'lib/c.sh'), 'D\tlib/a.sh\n'],
    ['a path the delta adds', async () => undefined, 'D\tlib/a.sh\nA\tlib/new.sh\n'],
    ['the new path of a rename', async () => undefined, 'R100\tlib/a.sh\tlib/renamed.sh\n'],
  ])('[docs-module-r9] a surviving match keeps the glob alive: %s', async (_, plant, input) => {
    const sb = fresh(ws);
    rmSync(join(sb, 'lib/a.sh'));
    await plant(sb);
    const r = await checkWs(sb, input);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(deadLines(r.stdout)).toEqual([]);
  });

  it('[docs-module-r9] an ignored path never keeps a glob alive', async () => {
    const sb = fresh(ws);
    rmSync(join(sb, 'lib/a.sh'));
    put(sb, 'lib/ignored.sh');
    const r = await checkWs(sb, 'D\tlib/a.sh\n');
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual([LIBS_DEAD]);
  });

  it('[docs-module-r9] a deleted path still in the index keeps nothing alive, nor does a path the delta deletes while it is still on disk', async () => {
    const sb = fresh(ws);
    put(sb, 'lib/b.sh');
    await git(sb, 'add', 'lib/b.sh');
    await gitCommit(sb, 'c1');
    rmSync(join(sb, 'lib/a.sh'));
    rmSync(join(sb, 'lib/b.sh'));
    const unstaged = await checkWs(sb, 'D\tlib/a.sh\n');
    expect(unstaged.code, unstaged.stdout + unstaged.stderr).toBe(1);
    expect(deadLines(unstaged.stdout)).toEqual([LIBS_DEAD]);
    const onDisk = fresh(ws);
    const r = await checkWs(onDisk, 'D\tlib/a.sh\n');
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual([LIBS_DEAD]);
  });

  it.each([
    ['a quote', 'lib/q"b.sh'],
    ['a backslash', 'lib/back\\slash.sh'],
    ['a non-ASCII byte', 'lib/café.sh'],
  ])('[docs-module-r8, docs-module-r9] a survivor holding %s keeps the glob alive, tracked or untracked', async (_, survivor) => {
    for (const tracked of [false, true]) {
      const sb = fresh(ws);
      rmSync(join(sb, 'lib/a.sh'));
      put(sb, survivor);
      if (tracked) {
        await git(sb, 'add', '-A');
        await gitCommit(sb, 'c1');
      }
      const r = await checkWs(sb, 'D\tlib/a.sh\n');
      expect([tracked, r.code], r.stdout + r.stderr).toEqual([tracked, 0]);
    }
  });

  it('[docs-module-r9] a deleted path holding a quote, still in the index, keeps nothing alive', async () => {
    const sb = fresh(ws);
    put(sb, 'lib/q"b.sh');
    await git(sb, 'add', '-A');
    await gitCommit(sb, 'c1');
    rmSync(join(sb, 'lib/a.sh'));
    rmSync(join(sb, 'lib/q"b.sh'));
    const r = await checkWs(sb, 'D\tlib/a.sh\n');
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual([LIBS_DEAD]);
  });

  it('[docs-module-r10] the verb always sets its own universe list, so an inherited DOCS_UNIVERSE_LIST never reaches the engine', async () => {
    const sb = fresh(ws);
    rmSync(join(sb, 'lib/a.sh'));
    const planted = join(sandbox('globs-inherited'), 'universe');
    writeFileSync(planted, 'listed\t.\npath\tlib/zzz.sh\n');
    const engine = await check(sb, 'D\tlib/a.sh\n', { files: ['docs/workspace/libs.md'], universe: planted });
    expect(engine.code, engine.stdout + engine.stderr).toBe(0);
    const r = await checkWs(sb, 'D\tlib/a.sh\n', { DOCS_UNIVERSE_LIST: planted });
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual([LIBS_DEAD]);
  });
});

describe('the check verb in a parent workspace whose root is no work tree: each repository judged against its own listing', { concurrent: true }, () => {
  it("[docs-module-r9, docs-module-r16] a child repository's doc reads its own listing under its prefix", async () => {
    const sb = fresh(parent);
    rmSync(join(sb, 'api/lib/a.sh'));
    const alive = await docs(sb, ['check', 'api'], { input: 'D\tapi/lib/a.sh\n' });
    expect(alive.code, alive.stdout + alive.stderr).toBe(0);
    expect(deadLines(alive.stdout)).toEqual([]);
    const dead = await docs(sb, ['check', 'api'], { input: 'D\tapi/lib/a.sh\nD\tapi/lib/b.sh\n' });
    expect(dead.code, dead.stdout + dead.stderr).toBe(1);
    expect(deadLines(dead.stdout)).toEqual(["DEAD SOURCE: api/core lists glob 'lib/*.sh' that no longer matches any file after deleting 'api/lib/a.sh' and 1 more (cleanup required)"]);
  });

  it('[docs-module-r17] a workspace glob outside every child and a child that is no work tree are skipped and named in a [CHECK NOTICE] while a listed child is judged', async () => {
    const sb = fresh(parent);
    rmSync(join(sb, 'api/lib/a.sh'));
    rmSync(join(sb, 'tools/x.sh'));
    const r = await docs(sb, ['check', 'workspace', 'api', 'broken'], { input: 'D\tapi/lib/a.sh\nD\ttools/x.sh\nD\tbroken/src/a.ts\n' });
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(deadLines(r.stdout)).toEqual([]);
    const notice = r.stderr.match(/^\[CHECK NOTICE\] (\d+) glob source\(s\) claimed a deleted path in a repository git lists nothing for \(([^)]*)\); the check does not judge them: (.*)$/m);
    expect(notice, r.stderr).not.toBeNull();
    expect(notice![1]).toBe('3');
    expect(notice![2]!.split(', ').sort()).toEqual(['broken', 'the workspace root']);
    expect(notice![3]!.split(', ').sort()).toEqual(["broken/unit 'src/*.ts'", "workspace/tools 'tools/*.sh'", "workspace/wide '**/*.sh'"]);
  });

  it('[docs-module-r17] a delta without a D or R line prints no glob notice', async () => {
    const sb = fresh(parent);
    const r = await docs(sb, ['check', 'workspace', 'api', 'broken'], { input: 'M\tapi/lib/a.sh\nM\ttools/x.sh\nM\tbroken/src/a.ts\n' });
    expect(r.stderr).not.toContain('glob source');
  });

  it('[docs-module-r16] the check and the gate list the same children under DOCS_PRODUCT_REPOS_DIR', async () => {
    const env = { DOCS_PRODUCT_REPOS_DIR: 'apps' };
    const sb = fresh(apps);
    rmSync(join(sb, 'apps/api/lib/a.sh'));
    const alive = await checkWs(sb, 'D\tapps/api/lib/a.sh\n', env);
    expect([alive.code, alive.stderr], alive.stdout).toEqual([0, '']);
    const unset = await checkWs(sb, 'D\tapps/api/lib/a.sh\n');
    expect(unset.stderr).toContain("(the workspace root); the check does not judge them: workspace/appsapi 'apps/api/lib/*.sh'");
    rmSync(join(sb, 'apps/api/lib/b.sh'));
    const gate = await docs(sb, ['gate'], { env });
    expect(gate.code, gate.stdout + gate.stderr).toBe(1);
    expect(deadLines(gate.stdout)).toEqual(["DEAD SOURCE: workspace/appsapi lists glob 'apps/api/lib/*.sh' that no longer matches any file after deleting 'apps/api/lib/a.sh' and 1 more (cleanup required)"]);
  });
});

describe("the check verb over a nested repository: the root's <dir>/ line dropped, the child's own listing in the union", { concurrent: true }, () => {
  it("[docs-module-r16] a workspace glob over a child repository's files reads dead once the child holds none, never kept alive by the root's <dir>/ line", async () => {
    const sb = fresh(nested);
    rmSync(join(sb, 'child/lib/a.sh'));
    const r = await checkWs(sb, 'D\tchild/lib/a.sh\n');
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual(["DEAD SOURCE: workspace/kid lists glob 'child/**' that no longer matches any file after deleting 'child/lib/a.sh' (cleanup required)"]);
  });

  it("[docs-module-r16] a child repository's untracked file keeps a workspace glob alive", async () => {
    const sb = fresh(nested);
    rmSync(join(sb, 'child/lib/a.sh'));
    put(sb, 'child/lib/b.sh');
    const r = await checkWs(sb, 'D\tchild/lib/a.sh\n');
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(deadLines(r.stdout)).toEqual([]);
  });
});

describe('the gate judges a dead glob in every form but --drift', { concurrent: true }, () => {
  it('[docs-module-r9, docs-module-r16] the default form reads a working tree deletion of the only file a glob claims as DEAD SOURCE', async () => {
    const sb = fresh(ws);
    rmSync(join(sb, 'lib/a.sh'));
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual([LIBS_DEAD]);
  });

  it('[docs-module-r9, docs-module-r16] --since reads a committed deletion as DEAD SOURCE', async () => {
    const sb = fresh(ws);
    const h0 = (await git(sb, 'rev-parse', 'HEAD')).stdout.trim();
    await git(sb, 'rm', '-q', 'lib/a.sh');
    await gitCommit(sb, 'c1');
    const r = await docs(sb, ['gate', `--since=${h0}`]);
    expect(r.code, r.stdout + r.stderr).toBe(1);
    expect(deadLines(r.stdout)).toEqual([LIBS_DEAD]);
  });

  it('[docs-module-r16] --stdin judges against the working tree, the delta deleting a path still on disk', async () => {
    const sb = fresh(ws);
    const dead = await docs(sb, ['gate', '--stdin'], { input: 'D\tlib/a.sh\n' });
    expect(dead.code, dead.stdout + dead.stderr).toBe(1);
    expect(deadLines(dead.stdout)).toEqual([LIBS_DEAD]);
    put(sb, 'lib/c.sh');
    const alive = await docs(sb, ['gate', '--stdin'], { input: 'D\tlib/a.sh\n' });
    expect(alive.code, alive.stdout + alive.stderr).toBe(0);
  });

  it('[docs-module-r17] a candidate of a repository git lists nothing for is named in a [GATE NOTICE]', async () => {
    const sb = fresh(parent);
    rmSync(join(sb, 'api/lib/a.sh'));
    const r = await docs(sb, ['gate']);
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stderr).toContain("[GATE NOTICE] 1 glob source(s) claimed a deleted path in a repository git lists nothing for (the workspace root); the check does not judge them: workspace/wide '**/*.sh'\n");
    rmSync(join(sb, 'api/lib/b.sh'));
    const dead = await docs(sb, ['gate']);
    expect(dead.code, dead.stdout + dead.stderr).toBe(1);
    expect(deadLines(dead.stdout)).toEqual(["DEAD SOURCE: api/core lists glob 'lib/*.sh' that no longer matches any file after deleting 'api/lib/a.sh' and 1 more (cleanup required)"]);
  });

  it('[docs-module-r16, docs-module-r17] --drift skips the glob test with a [GATE NOTICE] only when its incoming delta deletes a path', async () => {
    const sb = fresh(ws);
    const remote = sandbox('globs-remote');
    await git(remote, 'init', '-q', '--bare', '-b', 'main');
    await git(sb, 'remote', 'add', 'origin', remote);
    await git(sb, 'push', '-q', 'origin', 'main');
    const other = join(sandbox('globs-clone'), 'clone');
    await git(join(other, '..'), 'clone', '-q', remote, 'clone');
    put(other, 'lib/a.sh', 'echo changed\n');
    await gitCommit(other, 'modified', '-a');
    await git(other, 'push', '-q', 'origin', 'main');
    await git(sb, 'fetch', '-q', 'origin');
    const modified = await docs(sb, ['gate', '--drift']);
    expect(modified.stderr).not.toContain('--drift skips');
    await git(other, 'rm', '-q', 'lib/a.sh');
    await gitCommit(other, 'deleted');
    await git(other, 'push', '-q', 'origin', 'main');
    await git(sb, 'fetch', '-q', 'origin');
    const deleted = await docs(sb, ['gate', '--drift']);
    expect(deleted.code, deleted.stdout + deleted.stderr).toBe(0);
    expect(deadLines(deleted.stdout)).toEqual([]);
    expect(deleted.stderr).toContain('[GATE NOTICE] --drift skips the dead glob test: the incoming tree is not listed, so a glob source that claimed a deleted path is not judged\n');
  });
});
