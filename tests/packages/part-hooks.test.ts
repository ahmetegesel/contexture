import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addModule, extPath, installPkg, newPkg, recordPath, uninstall } from '../support/packages';
import { stage } from '../support/stage';
import { put } from '../support/tree';

const sandbox = () => stage('posix', 'pkg-hooks');

describe.concurrent('package-install: the module part hooks (modules-r13)', () => {
  it('the install hook runs after the overlay and the record with the roots exported; the uninstall hook runs before the removal', async () => {
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

  it('a failing install hook fails the install rc2, naming itself, with the overlay and the record in place', async () => {
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
