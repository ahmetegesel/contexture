import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addFile, addModule, extPath, install, installPkg, newPkg, recordPath, uninstall, writeManifest } from '../support/packages';
import { twinPkg } from '../support/twin';
import { chmodPlant, ROOT_USER } from '../support/plants';
import { stage } from '../support/stage';
import { put } from '../support/tree';

const sandbox = () => stage('posix', 'pkg-hooks');

describe.concurrent('package-install: the module part hooks', () => {
  it('[modules-r13, the-engine-r22] the install hook runs after the overlay and the record with the roots exported; the uninstall hook runs before the removal', async () => {
    const sb = sandbox();
    const ph = newPkg(sb, 'pkgh');
    addModule(ph, 'h');
    const h = join(ph, '.contexture/extensions/modules/h');
    put(
      join(h, 'install'),
      [
        '#!/bin/sh',
        '[ -f "$CTX_ROOT/.contexture/extensions/modules/h/module" ] || exit 1',
        '[ -f "$CTX_ROOT/.contexture/extensions/.state/pkgh.files" ] || exit 1',
        '[ "$(pwd)" = "$(cd "$CTX_ROOT" && pwd)" ] || exit 2',
        'printf "install %s %s\\n" "$CTX_ROOT" "$CTX_PACKAGE_ROOT" >> "$CTX_ROOT/hook.log"',
        '',
      ].join('\n'),
      0o755,
    );
    put(join(h, 'uninstall'), '#!/bin/sh\n[ -f "$CTX_ROOT/.contexture/extensions/modules/h/module" ] || exit 1\nprintf "uninstall\\n" >> "$CTX_ROOT/hook.log"\n', 0o755);
    expect((await installPkg(sb, ph)).code).toBe(0);
    const log = join(sb, 'hook.log');
    expect(existsSync(log)).toBe(true);
    expect(readFileSync(log, 'utf8')).toContain(`install ${realpathSync(sb)} ${realpathSync(ph)}`);
    expect((await uninstall(sb, ph)).code).toBe(0);
    expect(readFileSync(log, 'utf8')).toContain('uninstall');
    expect(existsSync(extPath(sb, 'modules/h/module'))).toBe(false);
  });

  it('[modules-r13] a failing install hook fails the install rc2, naming itself, with the overlay and the record in place', async () => {
    const sb = sandbox();
    const pf = newPkg(sb, 'pkgfail');
    addModule(pf, 'f');
    put(join(pf, '.contexture/extensions/modules/f/install'), '#!/bin/sh\nexit 3\n', 0o755);
    const r = await installPkg(sb, pf);
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('install hook failed');
    expect(existsSync(extPath(sb, 'modules/f/module'))).toBe(true);
    expect(existsSync(recordPath(sb, 'pkgfail'))).toBe(true);
    expect((await uninstall(sb, pf)).code).toBe(0);
  });
});

describe.concurrent('package-install and package-uninstall: package-level lifecycle hooks', () => {
  it('[modules-r13, the-engine-r22] feature package hooks/install runs after module part hooks with /dev/null stdin and full env; stashed hooks/uninstall runs LIFO even after catalog deletion', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkglife');
    addModule(p, 'lm');
    const modDir = join(p, '.contexture/extensions/modules/lm');
    put(join(modDir, 'install'), '#!/bin/sh\nprintf "mod-install\\n" >> "$CTX_ROOT/order.log"\n', 0o755);
    put(join(modDir, 'uninstall'), '#!/bin/sh\nprintf "mod-uninstall\\n" >> "$CTX_ROOT/order.log"\n', 0o755);
    put(
      join(p, 'hooks/install'),
      [
        '#!/bin/sh',
        'if [ -t 0 ] || read -r _unused; then echo "stdin-not-null" >&2; exit 9; fi',
        'printf "pkg-install %s %s %s %s %s\\n" "$CTX_PACKAGE_NAME" "$CTX_PACKAGE_VERSION" "$CTX_ROOT" "$CTX_PACKAGE_ROOT" "$LC_ALL" >> "$CTX_ROOT/order.log"',
        '',
      ].join('\n'),
      0o755,
    );
    put(
      join(p, 'hooks/uninstall'),
      [
        '#!/bin/sh',
        'if [ -t 0 ] || read -r _unused; then echo "stdin-not-null" >&2; exit 9; fi',
        '[ -f "$CTX_ROOT/.contexture/extensions/modules/lm/module" ] || exit 3',
        'printf "pkg-uninstall %s %s root=%s pkgroot=%s\\n" "$CTX_PACKAGE_NAME" "$CTX_PACKAGE_VERSION" "$CTX_ROOT" "${CTX_PACKAGE_ROOT:-EMPTY}" >> "$CTX_ROOT/order.log"',
        '',
      ].join('\n'),
      0o755,
    );

    const realP = realpathSync(p);
    const ir = await installPkg(sb, p, '1.2.0');
    expect(ir.code, ir.stderr).toBe(0);
    const stash = extPath(sb, '.state/pkglife.uninstall');
    expect(existsSync(stash)).toBe(true);
    const log = readFileSync(join(sb, 'order.log'), 'utf8').trim().split('\n');
    expect(log).toEqual([
      'mod-install',
      `pkg-install pkglife 1.2.0 ${realpathSync(sb)} ${realP} C`,
    ]);

    rmSync(p, { recursive: true, force: true });
    const ur = await uninstall(sb, 'pkglife');
    expect(ur.code, ur.stderr).toBe(0);
    expect(existsSync(stash)).toBe(false);
    expect(existsSync(recordPath(sb, 'pkglife'))).toBe(false);
    const ulog = readFileSync(join(sb, 'order.log'), 'utf8').trim().split('\n');
    expect(ulog).toEqual([
      'mod-install',
      `pkg-install pkglife 1.2.0 ${realpathSync(sb)} ${realP} C`,
      `pkg-uninstall pkglife 1.2.0 root=${realpathSync(sb)} pkgroot=EMPTY`,
      'mod-uninstall',
    ]);
  });

  it('[modules-r13, the-engine-r22] driver package hooks/install and non-executable hooks/uninstall work cleanly', { timeout: 900_000 }, async () => {
    const sb = sandbox();
    const p = twinPkg(sb, { name: 'pkgdrv', driver: 'drv', version: '2.0.0' });
    put(join(p, 'hooks/install'), '#!/bin/sh\nprintf "drv-install %s\\n" "$CTX_PACKAGE_NAME" > "$CTX_ROOT/drv.log"\n', 0o644);
    put(join(p, 'hooks/uninstall'), '#!/bin/sh\nprintf "drv-uninstall %s\\n" "$CTX_PACKAGE_NAME" >> "$CTX_ROOT/drv.log"\n', 0o644);

    expect((await install(sb, p)).code).toBe(0);
    expect(existsSync(extPath(sb, '.state/pkgdrv.uninstall'))).toBe(true);
    expect((await uninstall(sb, 'pkgdrv')).code).toBe(0);
    expect(readFileSync(join(sb, 'drv.log'), 'utf8')).toBe('drv-install pkgdrv\ndrv-uninstall pkgdrv\n');
    expect(existsSync(extPath(sb, '.state/pkgdrv.uninstall'))).toBe(false);
  });

  it('[modules-r13] an upgrade that drops hooks/uninstall removes the stashed uninstall hook', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgdrop');
    addModule(p, 'dm');
    put(join(p, 'hooks/uninstall'), '#!/bin/sh\nexit 0\n', 0o755);
    expect((await installPkg(sb, p, '1.0.0')).code).toBe(0);
    expect(existsSync(extPath(sb, '.state/pkgdrop.uninstall'))).toBe(true);
    rmSync(join(p, 'hooks/uninstall'));
    expect((await installPkg(sb, p, '1.1.0')).code).toBe(0);
    expect(existsSync(extPath(sb, '.state/pkgdrop.uninstall'))).toBe(false);
  });

  it('[modules-r13] a failing package hooks/install exits rc 2 with overlay and record in place; a failing stashed uninstall exits rc 2 leaving everything in place', async () => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgbadhook');
    addModule(p, 'bh');
    put(join(p, 'hooks/install'), '#!/bin/sh\nexit 5\n', 0o755);
    put(join(p, 'hooks/uninstall'), '#!/bin/sh\nexit 4\n', 0o755);

    const ir = await installPkg(sb, p, '1.0.0');
    expect(ir.code).toBe(2);
    expect(ir.stderr).toContain("the 'pkgbadhook' package's install hook failed (rc 5)");
    expect(existsSync(extPath(sb, 'modules/bh/module'))).toBe(true);
    expect(existsSync(recordPath(sb, 'pkgbadhook'))).toBe(true);
    expect(existsSync(extPath(sb, '.state/pkgbadhook.uninstall'))).toBe(true);

    const ur = await uninstall(sb, 'pkgbadhook');
    expect(ur.code).toBe(2);
    expect(ur.stderr).toContain("the 'pkgbadhook' package's uninstall hook failed (rc 4); nothing removed");
    expect(existsSync(extPath(sb, 'modules/bh/module'))).toBe(true);
    expect(existsSync(recordPath(sb, 'pkgbadhook'))).toBe(true);
  });

  it.skipIf(ROOT_USER)('[modules-r13, modules-r15] a mid-install rollback restores or cleans up the stashed uninstall hook atomically', async ({ onTestFinished }) => {
    const sb = sandbox();
    const p = newPkg(sb, 'pkgrbhook');
    addModule(p, 'rbh');
    addFile(p, 'rhythms/x.md', 'rhythm x');
    put(join(p, 'hooks/uninstall'), '#!/bin/sh\necho v1\n', 0o755);
    writeManifest(p, '1.0.0');
    mkdirSync(extPath(sb, 'rhythms'), { recursive: true });
    chmodPlant(extPath(sb, 'rhythms'), 0o555, 0o755, onTestFinished);
    const freshFail = await installPkg(sb, p, '1.0.0');
    expect(freshFail.code).toBe(2);
    expect(existsSync(extPath(sb, '.state/pkgrbhook.uninstall'))).toBe(false);

    chmodSync(extPath(sb, 'rhythms'), 0o755);
    expect((await installPkg(sb, p, '1.0.0')).code).toBe(0);
    expect(readFileSync(extPath(sb, '.state/pkgrbhook.uninstall'), 'utf8')).toContain('echo v1');

    put(join(p, 'hooks/uninstall'), '#!/bin/sh\necho v2\n', 0o755);
    addFile(p, 'rhythms/x.md', 'rhythm x v2');
    chmodPlant(extPath(sb, 'rhythms'), 0o555, 0o755, onTestFinished);
    const upgFail = await installPkg(sb, p, '2.0.0');
    expect(upgFail.code).toBe(2);
    expect(readFileSync(extPath(sb, '.state/pkgrbhook.uninstall'), 'utf8')).toContain('echo v1');
  });
});
