import { accessSync, constants, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { exec } from '../support/exec';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';

const INSTALL_SH = join(ROOT, 'install.sh');
const CATALOG = ['ast-doc-graph', 'docs-discipline', 'git', 'starter-rhythms', 'storage-fts5', 'toolchain-filters'];
const SKIP_BASE = new Set(['tmp', 'AGENTS.generated.md']);

function baseExecutables(dir = join(ROOT, 'base'), rel = ''): string[] {
  const out: string[] = [];
  for (const ent of readdirSync(join(dir, rel), { withFileTypes: true })) {
    if (SKIP_BASE.has(ent.name)) continue;
    const next = rel ? join(rel, ent.name) : ent.name;
    const full = join(dir, next);
    if (ent.isDirectory()) out.push(...baseExecutables(dir, next));
    else if (ent.isFile() && (statSync(full).mode & 0o111) !== 0) out.push(next);
  }
  return out.sort();
}

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function buildCleanBaseCopy(dest: string): void {
  cpSync(join(ROOT, 'base'), join(dest, 'base'), {
    recursive: true,
    filter: (src) => {
      const rel = relative(join(ROOT, 'base'), src);
      return rel !== 'AGENTS.generated.md' && rel !== '.contexture/tmp' && !rel.startsWith('.contexture/tmp/') && rel !== '.contexture/laws/AGENTS.generated.md';
    },
  });
  cpSync(join(ROOT, 'plugins'), join(dest, 'plugins'), { recursive: true });
}

function pathWithoutGit(label: string): string {
  const bin = sandbox(label);
  for (const dir of ['/bin', '/usr/bin']) {
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name === 'git') continue;
      const dst = join(bin, name);
      if (!existsSync(dst)) symlinkSync(join(dir, name), dst);
    }
  }
  return bin;
}

describe.concurrent('the root installer install.sh', () => {
  it('fresh install from local checkout stages base, strips plugin tests, preserves all executables, composes laws, and cleans tmp stage', async () => {
    const sb = sandbox('install-local');
    const caller = sandbox('install-caller');
    const r = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb, '--non-interactive'], { cwd: caller });
    expect(r.code, r.stderr).toBe(0);
    expect(existsSync(join(sb, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(sb, 'AGENTS.generated.md'))).toBe(true);
    expect(existsSync(join(sb, '.contexture/ONBOARDING.md'))).toBe(true);
    expect(executable(join(sb, '.contexture/ctx'))).toBe(true);

    const execs = baseExecutables();
    expect(execs.length).toBeGreaterThanOrEqual(50);
    for (const rel of execs) expect(executable(join(sb, rel)), rel).toBe(true);

    const installedPlugins = readdirSync(join(sb, '.contexture/plugins')).sort();
    expect(installedPlugins).toEqual(CATALOG);
    for (const p of CATALOG) expect(existsSync(join(sb, '.contexture/plugins', p, 'tests'))).toBe(false);

    const tmpEntries = existsSync(join(sb, '.contexture/tmp')) ? readdirSync(join(sb, '.contexture/tmp')) : [];
    expect(tmpEntries.filter((e) => e.startsWith('install.'))).toEqual([]);
    expect(existsSync(join(sb, '.contexture/tmp/AGENTS.loader.md'))).toBe(false);

    expect((await ctx(sb, 'compose', '--check')).code).toBe(0);
    const help = await ctx(sb, 'help');
    expect(help.code).toBe(0);
    for (const b of ['lane', 'rhythm', 'store', 'unit']) expect(help.stdout).toContain(`  ${b} `);
    const cat = await ctx(sb, 'package', 'catalog', '--no-probe');
    expect(cat.code).toBe(0);
    for (const p of CATALOG) expect(cat.stdout).toContain(p);
  });

  it('fresh install from local tar.gz archives works for both GitHub-prefixed and flat archive layouts without --strip-components', async () => {
    const srcRoot = sandbox('tar-src');
    const prefixedStage = join(srcRoot, 'prefixed');
    const flatStage = join(srcRoot, 'flat');
    mkdirSync(join(prefixedStage, 'contexture-0.80.0'), { recursive: true });
    mkdirSync(flatStage, { recursive: true });
    buildCleanBaseCopy(join(prefixedStage, 'contexture-0.80.0'));
    buildCleanBaseCopy(flatStage);

    const prefixedTar = join(srcRoot, 'prefixed.tar.gz');
    const flatTar = join(srcRoot, 'flat.tar.gz');
    expect((await exec('tar', ['-czf', prefixedTar, 'contexture-0.80.0'], { cwd: prefixedStage })).code).toBe(0);
    expect((await exec('tar', ['-czf', flatTar, 'base', 'plugins'], { cwd: flatStage })).code).toBe(0);

    for (const archive of [prefixedTar, flatTar]) {
      const sb = sandbox('install-tar');
      const caller = sandbox('install-tar-caller');
      const r = await exec('sh', [INSTALL_SH, '--from', archive, '--dir', sb, '--non-interactive'], { cwd: caller });
      expect(r.code, r.stderr).toBe(0);
      expect(executable(join(sb, '.contexture/ctx'))).toBe(true);
      expect(executable(join(sb, '.contexture/storage/drivers/posix/driver'))).toBe(true);
      expect(readdirSync(join(sb, '.contexture/plugins')).sort()).toEqual(CATALOG);
      expect((await ctx(sb, 'compose', '--check')).code).toBe(0);
    }
  });

  it('runs cleanly in a non-git workspace with git completely absent from PATH', async () => {
    const sb = sandbox('install-nogit');
    const caller = sandbox('install-nogit-caller');
    const cleanBin = pathWithoutGit('nogit-bin');
    const r = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb, '--non-interactive'], {
      cwd: caller,
      env: { PATH: cleanBin },
    });
    expect(r.code, r.stderr).toBe(0);
    expect(existsSync(join(sb, 'AGENTS.generated.md'))).toBe(true);
    expect((await ctx(sb, 'compose', '--check')).code).toBe(0);
  });

  it('preserves a pre-existing non-contexture AGENTS.md untouched and stages the loader in .contexture/tmp/AGENTS.loader.md', async () => {
    const sb = sandbox('install-preserve');
    const caller = sandbox('install-preserve-caller');
    const existing = '# My Existing Workspace Rules\n\nKeep this file intact during install.\n';
    writeFileSync(join(sb, 'AGENTS.md'), existing);

    const r = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb, '--non-interactive'], { cwd: caller });
    expect(r.code, r.stderr).toBe(0);
    expect(readFileSync(join(sb, 'AGENTS.md'), 'utf8')).toBe(existing);
    expect(readFileSync(join(sb, '.contexture/tmp/AGENTS.loader.md'), 'utf8')).toBe(readFileSync(join(ROOT, 'base/AGENTS.md'), 'utf8'));
    expect((await ctx(sb, 'compose', '--check')).code).toBe(0);
    expect(r.stdout).toContain('.contexture/tmp/AGENTS.loader.md');
    expect(r.stdout).toContain('Read .contexture/ONBOARDING.md and prepare the adoption proposal.');
  });

  it('replaces a pre-existing contexture loader AGENTS.md directly when .contexture/ctx is absent (including single-line without trailing newline)', async () => {
    const sb = sandbox('install-replace-loader');
    const caller = sandbox('install-replace-caller');
    writeFileSync(join(sb, 'AGENTS.md'), '# contexture v0.1.0: old loader');

    const r = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb, '--non-interactive'], { cwd: caller });
    expect(r.code, r.stderr).toBe(0);
    expect(readFileSync(join(sb, 'AGENTS.md'), 'utf8')).toBe(readFileSync(join(ROOT, 'base/AGENTS.md'), 'utf8'));
    expect(existsSync(join(sb, '.contexture/tmp/AGENTS.loader.md'))).toBe(false);
  });

  it('refuses rc 1 when AGENTS.md is a directory without writing anything', async () => {
    const sb = sandbox('install-agents-dir');
    const caller = sandbox('install-agents-dir-caller');
    mkdirSync(join(sb, 'AGENTS.md'));

    const r = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb, '--non-interactive'], { cwd: caller });
    expect(r.code).toBe(1);
    expect(existsSync(join(sb, '.contexture'))).toBe(false);
  });

  it('fresh-workspace guard refuses rc 1 when .contexture/ctx already exists and points to docs/adoption.md#updating', async () => {
    const sb = sandbox('install-already');
    const caller = sandbox('install-already-caller');
    expect((await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb, '--non-interactive'], { cwd: caller })).code).toBe(0);

    const again = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb, '--non-interactive'], { cwd: caller });
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('docs/adoption.md#updating');
  });

  it('--dry-run prints the resolved plan and exits 0 without creating .contexture/ or writing any file', async () => {
    const sb = sandbox('install-dry-run');
    const caller = sandbox('install-dry-run-caller');
    writeFileSync(join(sb, 'AGENTS.md'), '# Custom project file\n');

    const r = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb, '--non-interactive', '--plugins=git', '--dry-run'], { cwd: caller });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('dry-run: fresh install plan');
    expect(r.stdout).toContain('preserve existing');
    expect(r.stdout).toContain('plugins: git');
    expect(existsSync(join(sb, '.contexture'))).toBe(false);
    expect(existsSync(join(sb, 'AGENTS.generated.md'))).toBe(false);
  });

  it('--non-interactive --plugins=starter-rhythms,git installs both packages, writes config, recomposes, and leaves zero drift', async () => {
    const sb = sandbox('install-plugins');
    const caller = sandbox('install-plugins-caller');
    const r = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb, '--non-interactive', '--plugins=starter-rhythms,git'], { cwd: caller });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('starter-rhythms git');

    const cfg = readFileSync(join(sb, '.contexture/config'), 'utf8');
    expect(cfg).toContain('package.starter-rhythms:');
    expect(cfg).toContain('package.git:');
    expect(readFileSync(join(sb, 'AGENTS.generated.md'), 'utf8')).toContain('@git');

    const list = await ctx(sb, 'package', 'list');
    expect(list.code).toBe(0);
    expect(list.stdout).toContain('0 drift');
  });

  it('--plugins=none installs core only rc 0 while invalid or unknown --plugins refuses rc 1 without installing any plugin', async () => {
    const sbNone = sandbox('install-none');
    const caller = sandbox('install-none-caller');
    const ok = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbNone, '--non-interactive', '--plugins=none'], { cwd: caller });
    expect(ok.code, ok.stderr).toBe(0);
    expect(existsSync(join(sbNone, '.contexture/extensions'))).toBe(false);

    for (const bad of ['bogus', '../x', 'starter-rhythms,bogus', 'git,git', 'all', '']) {
      const sbBad = sandbox('install-bad-plugin');
      const res = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbBad, '--non-interactive', `--plugins=${bad}`], { cwd: caller });
      expect(res.code, `bad --plugins=${bad}`).toBe(1);
      expect(existsSync(join(sbBad, '.contexture/extensions'))).toBe(false);
    }
  });

  it('refuses unknown flags, empty --tag/--from, --tag + --from conflict, and missing --dir with rc 1, and answers --help / -h rc 0', async () => {
    const sb = sandbox('install-cli');
    const caller = sandbox('install-cli-caller');

    expect((await exec('sh', [INSTALL_SH, '--unknown-flag'], { cwd: caller })).code).toBe(1);
    expect((await exec('sh', [INSTALL_SH, '--tag=', '--dir', sb], { cwd: caller })).code).toBe(1);
    expect((await exec('sh', [INSTALL_SH, '--from=', '--dir', sb], { cwd: caller })).code).toBe(1);
    expect((await exec('sh', [INSTALL_SH, '--tag', 'v0.80.0', '--from', ROOT, '--dir', sb], { cwd: caller })).code).toBe(1);
    expect((await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', join(sb, 'does-not-exist')], { cwd: caller })).code).toBe(1);

    for (const flag of ['--help', '-h']) {
      const h = await exec('sh', [INSTALL_SH, flag], { cwd: caller });
      expect(h.code).toBe(0);
      expect(h.stdout).toContain('usage: install.sh');
    }
  });

  it('headless non-TTY without --non-interactive does not hang, prints stderr notice, and installs core only rc 0', async () => {
    const sb = sandbox('install-nontty');
    const caller = sandbox('install-nontty-caller');
    const r = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: '/nonexistent' },
    });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toContain('no interactive terminal; installing core only');
    expect(existsSync(join(sb, '.contexture/extensions'))).toBe(false);
  });

  it('interactive menu via CTX_INSTALL_TTY supports info inspection, cancel/reselect, number+name selection, and Enter for core-only', async () => {
    const caller = sandbox('install-tty-caller');

    const sbPick = sandbox('install-tty-pick');
    const ttyPick = join(caller, 'tty-pick.txt');
    // catalog order: 1 ast-doc-graph, 2 docs-discipline, 3 git, 4 starter-rhythms, 5 storage-fts5, 6 toolchain-filters
    writeFileSync(ttyPick, 'info git\n4\nn\nstarter-rhythms,3\ny\n');
    const picked = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbPick], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyPick },
    });
    expect(picked.code, picked.stderr).toBe(0);
    expect(picked.stdout).toContain('git (');
    expect(picked.stdout).toContain('Selection cancelled.');
    expect(picked.stdout).toContain('plugins installed: starter-rhythms git');
    expect(readFileSync(join(sbPick, '.contexture/config'), 'utf8')).toContain('package.starter-rhythms:');
    expect(readFileSync(join(sbPick, '.contexture/config'), 'utf8')).toContain('package.git:');

    const sbEnter = sandbox('install-tty-enter');
    const ttyEnter = join(caller, 'tty-enter.txt');
    writeFileSync(ttyEnter, '\n');
    const empty = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbEnter], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyEnter },
    });
    expect(empty.code, empty.stderr).toBe(0);
    expect(empty.stdout).toContain('plugins installed: none (core only');
    expect(existsSync(join(sbEnter, '.contexture/extensions'))).toBe(false);

    // Wildcard selection does not glob against files in the caller working directory
    const globCaller = sandbox('install-tty-glob-caller');
    writeFileSync(join(globCaller, 'git'), 'decoy');
    const ttyGlob = join(globCaller, 'tty-glob.txt');
    writeFileSync(ttyGlob, '*\n\n');
    const sbGlob = sandbox('install-tty-glob');
    const globRes = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbGlob], {
      cwd: globCaller,
      env: { CTX_INSTALL_TTY: ttyGlob },
    });
    expect(globRes.code, globRes.stderr).toBe(0);
    expect(globRes.stdout).toContain("Unknown plugin selection '*'");
    expect(existsSync(join(sbGlob, '.contexture/extensions'))).toBe(false);
  });
});
