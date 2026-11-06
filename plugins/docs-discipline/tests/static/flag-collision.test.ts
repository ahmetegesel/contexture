import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { awk } from '@support/awk';
import { exec, type Run } from '@support/exec';
import { sandbox } from '@support/sandbox';
import { SCRIPTS, TESTS } from '../support/corpus';

const CHECK = join(TESTS, 'flag-collision.awk');
const IO = join(SCRIPTS, 'docs-io.sh');
const VERBS = readdirSync(SCRIPTS)
  .sort()
  .filter((f) => /^docs_parse "/m.test(readFileSync(join(SCRIPTS, f), 'utf8')));

let sb: string;
beforeAll(() => {
  sb = sandbox('flag-collision');
});

const collide = (over: Record<string, string> = {}): Promise<Run> =>
  awk(sb, CHECK, { args: [over['docs-io.sh'] ?? IO, over['doc.grammar'] ?? join(SCRIPTS, 'doc.grammar'), ...VERBS.map((v) => over[v] ?? join(SCRIPTS, v))] });

function planted(name: string, from: string, edit: (text: string) => string): string {
  const dir = sandbox('flag-collision-plant');
  const text = readFileSync(join(SCRIPTS, from), 'utf8');
  const changed = edit(text);
  expect(changed).not.toBe(text);
  writeFileSync(join(dir, name), changed);
  return join(dir, name);
}

interface Settable { verb: string; field: string; flag: string; controls: string }

const settable = (r: Run): Settable[] =>
  [...r.stdout.matchAll(/^COLLISION (\S+) \S+\.(\S+) --(\S+) settable; \S+ takes: (.*)$/gm)].map(([, verb, field, flag, controls]) => ({ verb, field, flag, controls }));

const drive = (io: string, s: Settable): Promise<Run> =>
  exec('sh', ['-c', `. "$1"; shift; DOCS_VERB="ctx docs ${s.verb}"; docs_parse "${s.controls}" 1 "$@" && echo "act: $EDIT_A_1 $EDIT_F_1 [$EDIT_V_1]"`, 'sh', io, `--${s.flag}=probe`], { cwd: sb });

const FALLS_THROUGH = [
  '    case "$dp_ok" in',
  '      *" $dp_c "*) ;;',
  '      *) dp_c="" ;;',
  '    esac',
  '    if [ -n "$dp_c" ]; then',
  '',
].join('\n');
const REFUSES = [
  '    if [ -n "$dp_c" ]; then',
  '      case "$dp_ok" in',
  '        *" $dp_c "*) ;;',
  '        *) docs_bad_flag "$dp_a"; return 1 ;;',
  '      esac',
  '',
].join('\n');

describe('the flag collision check of the field verbs', { concurrent: true }, () => {
  it('reads the shipped collisions: the components kind settable through entry, the id pairs allowed', async () => {
    const r = await collide();
    expect(r.code, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^COLLISION entry components\.kind --kind settable; entry takes: after first remove id stdin dry-run$/m);
    for (const b of ['responsibilities', 'contract', 'pitfalls', 'caveats']) expect(r.stdout).toMatch(new RegExp(`^COLLISION entry ${b}\\.id --id allowed: `, 'm'));
    expect(r.stdout).toMatch(/^COLLISION pitfall pitfalls\.id --id allowed: /m);
    const summary = r.stdout.match(/^collision: verbs (\d+), fields (\d+), collisions (\d+) = settable (\d+) \+ allowed (\d+) \+ refused (\d+)$/m);
    expect(summary).not.toBeNull();
    const [verbs, fields, all, set, allowed, refused] = summary!.slice(1).map(Number);
    expect([verbs, refused]).toEqual([5, 0]);
    expect(fields).toBeGreaterThan(0);
    expect(set + allowed).toBe(all);
  });

  it('sets the field through docs_parse for every settable collision', async () => {
    const found = settable(await collide());
    expect(found.length).toBeGreaterThan(0);
    for (const s of found) {
      const r = await drive(IO, s);
      expect(r.code, r.stderr).toBe(0);
      expect(r.stdout).toBe(`act: set ${s.field} [probe]\n`);
    }
  });

  it('reads a planted grammar field named like a control the verb takes as REFUSED', async () => {
    const grammar = planted('doc.grammar', 'doc.grammar', (t) => t.replace('#% field components kind word required\n', '#% field components kind word required\n#% field components after text optional\n'));
    const r = await collide({ 'doc.grammar': grammar });
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/^COLLISION entry components\.after --after REFUSED: /m);
  });

  it('reads a planted entry that takes the kind control as REFUSED', async () => {
    const entry = planted('entry', 'entry', (t) => t.replace('docs_parse "after first remove id stdin dry-run" 1', 'docs_parse "after first remove id stdin dry-run kind" 1'));
    const r = await collide({ entry });
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/^COLLISION entry components\.kind --kind REFUSED: /m);
  });

  it('reads a planted entry without its blocks line as an empty reach', async () => {
    const entry = planted('entry', 'entry', (t) => t.replace(/^# help: blocks: .*\n/m, ''));
    const r = await collide({ entry });
    expect(r.code).toBe(1);
    expect(r.stdout).toMatch(/^REFUSED entry: no reach/m);
  });

  it('reads the pre-fix docs_parse as refusing the settable kind', async () => {
    const io = planted('docs-io.sh', 'docs-io.sh', (t) => t.replace(FALLS_THROUGH, REFUSES));
    const found = settable(await collide({ 'docs-io.sh': io }));
    expect(found.map((s) => `${s.verb} ${s.flag}`)).toContain('entry kind');
    const r = await drive(io, found.find((s) => s.flag === 'kind')!);
    expect(r.code).toBe(1);
    expect(r.stderr).toBe('ctx docs entry: unknown option: --kind=probe (flags: ) (ERR_INVALID_ARGUMENT)\n');
  });
});
