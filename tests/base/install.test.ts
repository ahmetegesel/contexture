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
    expect(r.stdout).toContain('onboard this workspace in guided mode');
    expect(r.stdout).toContain('onboard this workspace in familiar mode');
    expect(r.stdout).toContain('boots from AGENTS.md');
    expect(r.stdout).toContain('.contexture/ctx package catalog');
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
    writeFileSync(ttyPick, 'y\ninfo git\n4\nn\nstarter-rhythms,3\ny\n');
    const picked = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbPick], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyPick },
    });
    expect(picked.code, picked.stderr).toBe(0);
    expect(picked.stdout).toContain('This will install contexture in');
    expect(picked.stdout).toContain('Adds: AGENTS.md (loader), AGENTS.generated.md (composed laws), and .contexture/');
    expect(picked.stdout).toContain('No other project files are modified; optional plugins come next only if you select them.');
    expect(picked.stdout).toContain('Proceed? [Y/n]:');
    expect(picked.stdout).toContain('Core is ready now:');
    expect(picked.stdout).toContain('Optional plugins add project capabilities');
    expect(picked.stdout).toContain('git (');
    expect(picked.stdout).toContain('Selection cancelled.');
    expect(picked.stdout).toContain('plugins installed: starter-rhythms git');
    expect(readFileSync(join(sbPick, '.contexture/config'), 'utf8')).toContain('package.starter-rhythms:');
    expect(readFileSync(join(sbPick, '.contexture/config'), 'utf8')).toContain('package.git:');

    const sbEnter = sandbox('install-tty-enter');
    const ttyEnter = join(caller, 'tty-enter.txt');
    writeFileSync(ttyEnter, '\n\n');
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
    writeFileSync(ttyGlob, 'y\n*\n\n');
    const sbGlob = sandbox('install-tty-glob');
    const globRes = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbGlob], {
      cwd: globCaller,
      env: { CTX_INSTALL_TTY: ttyGlob },
    });
    expect(globRes.code, globRes.stderr).toBe(0);
    expect(globRes.stdout).toContain("Unknown plugin selection '*'");
    expect(existsSync(join(sbGlob, '.contexture/extensions'))).toBe(false);
  });

  it('declining or EOF on Proceed? [Y/n] (including replace disposition and after invalid input) exits 0 with zero files or directories written', async () => {
    const caller = sandbox('install-decline-caller');

    const sbFresh = sandbox('install-decline-fresh');
    const ttyDecline = join(caller, 'tty-decline.txt');
    writeFileSync(ttyDecline, 'n\n');
    const freshRes = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbFresh], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyDecline },
    });
    expect(freshRes.code, freshRes.stderr).toBe(0);
    expect(freshRes.stdout).toContain('Installation cancelled.');
    expect(existsSync(join(sbFresh, '.contexture'))).toBe(false);
    expect(existsSync(join(sbFresh, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(sbFresh, 'AGENTS.generated.md'))).toBe(false);

    const sbEof = sandbox('install-decline-eof');
    const ttyEof = join(caller, 'tty-eof.txt');
    writeFileSync(ttyEof, '');
    const eofRes = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbEof], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyEof },
    });
    expect(eofRes.code, eofRes.stderr).toBe(0);
    expect(eofRes.stdout).toContain('Installation cancelled.');
    expect(existsSync(join(sbEof, '.contexture'))).toBe(false);
    expect(existsSync(join(sbEof, 'AGENTS.md'))).toBe(false);
    expect(existsSync(join(sbEof, 'AGENTS.generated.md'))).toBe(false);

    const sbReplace = sandbox('install-decline-replace');
    const oldLoader = '# contexture v0.1.0: old loader\n';
    writeFileSync(join(sbReplace, 'AGENTS.md'), oldLoader);
    const replaceRes = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbReplace], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyDecline },
    });
    expect(replaceRes.code, replaceRes.stderr).toBe(0);
    expect(replaceRes.stdout).toContain('Updates: AGENTS.md (existing loader), AGENTS.generated.md (composed laws), and adds .contexture/');
    expect(replaceRes.stdout).toContain('Installation cancelled.');
    expect(existsSync(join(sbReplace, '.contexture'))).toBe(false);
    expect(existsSync(join(sbReplace, 'AGENTS.generated.md'))).toBe(false);
    expect(readFileSync(join(sbReplace, 'AGENTS.md'), 'utf8')).toBe(oldLoader);

    const sbRetry = sandbox('install-decline-retry');
    const existing = '# Existing Rules\n\nDo not modify on cancel.\n';
    writeFileSync(join(sbRetry, 'AGENTS.md'), existing);
    const ttyRetry = join(caller, 'tty-retry.txt');
    writeFileSync(ttyRetry, 'maybe\nn\n');
    const retryRes = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbRetry], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyRetry },
    });
    expect(retryRes.code, retryRes.stderr).toBe(0);
    expect(retryRes.stdout).toContain('Preserves existing AGENTS.md untouched');
    expect(retryRes.stdout).toContain('Please enter y or n.');
    expect(retryRes.stdout).toContain('Installation cancelled.');
    expect(existsSync(join(sbRetry, '.contexture'))).toBe(false);
    expect(existsSync(join(sbRetry, 'AGENTS.generated.md'))).toBe(false);
    expect(readFileSync(join(sbRetry, 'AGENTS.md'), 'utf8')).toBe(existing);
  });

  it('accepting Proceed? [Y/n] followed by EOF at the plugin menu installs core only rc 0', async () => {
    const caller = sandbox('install-menu-eof-caller');
    const sb = sandbox('install-menu-eof');
    const ttyMenuEof = join(caller, 'tty-menu-eof.txt');
    writeFileSync(ttyMenuEof, 'y\n');
    const r = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sb], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyMenuEof },
    });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('Proceed? [Y/n]:');
    expect(r.stdout).toContain('plugins installed: none (core only');
    expect(existsSync(join(sb, '.contexture/extensions'))).toBe(false);
  });

  it('--plugins, --non-interactive, and --dry-run skip Proceed? [Y/n] and the interactive menu even when CTX_INSTALL_TTY is readable', async () => {
    const caller = sandbox('install-plugins-skip-tty-caller');
    const ttyDecline = join(caller, 'tty-n.txt');
    writeFileSync(ttyDecline, 'n\n');

    const sbPlugins = sandbox('install-plugins-skip-tty');
    const rPlugins = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbPlugins, '--plugins=git'], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyDecline },
    });
    expect(rPlugins.code, rPlugins.stderr).toBe(0);
    expect(rPlugins.stdout).not.toContain('Proceed? [Y/n]:');
    expect(rPlugins.stdout).toContain('plugins installed: git');
    expect(readFileSync(join(sbPlugins, '.contexture/config'), 'utf8')).toContain('package.git:');

    const sbNonInt = sandbox('install-nonint-skip-tty');
    const rNonInt = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbNonInt, '--non-interactive'], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyDecline },
    });
    expect(rNonInt.code, rNonInt.stderr).toBe(0);
    expect(rNonInt.stdout).not.toContain('Proceed? [Y/n]:');
    expect(rNonInt.stdout).toContain('plugins installed: none (core only');

    const sbDry = sandbox('install-dry-skip-tty');
    const rDry = await exec('sh', [INSTALL_SH, '--from', ROOT, '--dir', sbDry, '--dry-run'], {
      cwd: caller,
      env: { CTX_INSTALL_TTY: ttyDecline },
    });
    expect(rDry.code, rDry.stderr).toBe(0);
    expect(rDry.stdout).toContain('dry-run: fresh install plan');
    expect(rDry.stdout).not.toContain('Proceed? [Y/n]:');
    expect(existsSync(join(sbDry, '.contexture'))).toBe(false);
  });
});
