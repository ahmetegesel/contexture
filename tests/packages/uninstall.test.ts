import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exec } from '../support/exec';
import { addFile, addModule, extPath, installPkg, newPkg, recordPath, uninstall } from '../support/packages';
import { stage } from '../support/stage';

const sandbox = () => stage('posix', 'pkg-uninstall');

const FORGE = `
entry() { printf 'file %s %s %s\\n' "$(ls -ld "$1" | awk '{print $1}' | cut -c2-10)" "$(cksum < "$1" | awk '{print $1 ":" $2}')" "$2"; }
state=.contexture/extensions/.state
printf 'keep me\\n' > victim
printf 'package other\\n' > "$state/other.files"
printf 'keep me too\\n' > .contexture/victim2
{
  entry victim victim
  entry "$state/other.files" .contexture/extensions/.state/other.files
  entry .contexture/victim2 .contexture/extensions/../victim2
} >> "$state/pkgu.files"
`;

describe.concurrent('package-uninstall: the removal and the changed-file preservation', () => {
  it('[the-engine-r22, modules-r15] preserves a changed file and every forged record line, removes the unchanged overlay and the record, and refuses a second uninstall', async () => {
    const sb = sandbox();
    const pu = newPkg(sb, 'pkgu');
    addModule(pu, 'u');
    addFile(pu, 'rhythms/u.md', 'the u rhythm');
    expect((await installPkg(sb, pu)).code).toBe(0);
    writeFileSync(extPath(sb, 'rhythms/u.md'), 'edited after install\n');
    expect((await exec('sh', ['-c', FORGE], { cwd: sb })).code).toBe(0);
    const r = await uninstall(sb, pu);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('preserved victim (outside the extension root');
    expect(existsSync(join(sb, 'victim'))).toBe(true);
    expect(r.stdout).toContain('preserved .contexture/extensions/.state/other.files (the install record area');
    expect(existsSync(extPath(sb, '.state/other.files'))).toBe(true);
    expect(r.stdout).toContain('preserved .contexture/extensions/../victim2 (a path with an empty or dot segment');
    expect(existsSync(join(sb, '.contexture/victim2'))).toBe(true);
    expect(r.stdout).toContain('preserved .contexture/extensions/rhythms/u.md');
    expect(readFileSync(extPath(sb, 'rhythms/u.md'), 'utf8')).toBe('edited after install\n');
    expect(existsSync(extPath(sb, 'modules/u/module'))).toBe(false);
    expect(existsSync(recordPath(sb, 'pkgu'))).toBe(false);
    expect(existsSync(extPath(sb, 'modules/lane/module'))).toBe(true);
    const again = await uninstall(sb, pu);
    expect(again.code).toBe(1);
    expect(again.stderr).toContain('not installed');
  });

  it('[the-engine-r22, modules-r15] a preserved stale file of an upgrade survives the package uninstall while the record and the module folder go', async () => {
    const sb = sandbox();
    const pa = newPkg(sb, 'pkga');
    addModule(pa, 'alpha', 'docs');
    addFile(pa, 'rhythms/keep.md', 'the kept rhythm');
    expect((await installPkg(sb, pa)).code).toBe(0);
    writeFileSync(extPath(sb, 'rhythms/keep.md'), 'locally edited\n');
    rmSync(join(pa, '.contexture/extensions/rhythms/keep.md'));
    expect((await installPkg(sb, pa)).code).toBe(0);
    expect((await uninstall(sb, pa)).code).toBe(0);
    expect(readFileSync(extPath(sb, 'rhythms/keep.md'), 'utf8')).toBe('locally edited\n');
    expect(existsSync(recordPath(sb, 'pkga'))).toBe(false);
    expect(existsSync(extPath(sb, 'modules/alpha'))).toBe(false);
  });
});
