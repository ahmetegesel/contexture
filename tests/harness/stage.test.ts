import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ctx } from '../support/ctx';
import { SQLITE_DB, RECORD_ROOT } from '../support/drawer';
import { exec } from '../support/exec';
import { ROOT } from '../support/root';
import { DRIVERS, probeFts5, probeSqlite, sqliteAvailable, stage } from '../support/stage';

function files(dir: string, skip: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => !f.startsWith(skip) && statSync(join(dir, f)).isFile())
    .sort();
}

describe('stage', () => {
  it('the stage holds exactly the tracked base/ payload with its executable modes', async () => {
    const sb = stage();
    const tracked = await exec('git', ['ls-files', '-s', 'base'], { cwd: ROOT });
    expect(tracked.code, tracked.stderr).toBe(0);
    const shipped = tracked.stdout
      .trim()
      .split('\n')
      .map((l) => {
        const [meta, path] = l.split('\t');
        return { path: relative('base', path), exec: meta.startsWith('100755') };
      })
      .sort((a, b) => (a.path < b.path ? -1 : 1));
    expect(shipped.length).toBeGreaterThan(0);
    expect(files(sb, join('.contexture', 'tmp'))).toEqual(shipped.map((s) => s.path));
    for (const s of shipped) {
      expect((statSync(join(sb, s.path)).mode & 0o111) !== 0, `${s.path} executable`).toBe(s.exec);
    }
  });

  for (const driver of DRIVERS) {
    describe.skipIf(driver === 'sqlite' && !sqliteAvailable())(driver, () => {
      it(`[plugins-r4] the staged ctx bootstraps a unit, lists it, and names the ${driver} driver`, async () => {
        const sb = stage(driver);
        const boot = await ctx(sb, 'unit', 'bootstrap', 'probe-unit', 'staging probe');
        expect(boot.code, boot.stderr).toBe(0);
        const active = await ctx(sb, 'unit', 'list');
        expect(active.code, active.stderr).toBe(0);
        expect(active.stdout).toMatch(/^probe-unit$/m);
        const diag = await ctx(sb, 'unit', 'diagnose', '--json');
        expect(diag.code, diag.stderr).toBe(0);
        const resolved = JSON.parse(diag.stdout).driver;
        expect({ name: resolved.name, descriptor: resolved.descriptor.driver }).toEqual({ name: driver, descriptor: driver });
        expect({
          posix: existsSync(join(sb, RECORD_ROOT, 'probe-unit')),
          sqlite: existsSync(join(sb, SQLITE_DB)),
        }).toEqual({ posix: driver === 'posix', sqlite: driver === 'sqlite' });
      });
    });
  }

  it('[plugins-r3] the sqlite and FTS5 probes read absent where sqlite3 is not on PATH, so the sqlite cases skip', () => {
    expect(probeSqlite('/nonexistent')).toBe(false);
    expect(probeFts5('/nonexistent')).toBe(false);
  });
});
