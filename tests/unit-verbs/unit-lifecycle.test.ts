import { appendFileSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { artifactPath } from '../support/record';
import { stage } from '../support/stage';
import { lane, must, run, seedUnit, unit } from '../support/unit';

const anchor = async (sb: string, u: string): Promise<string | undefined> => (await unit(sb, 'load', u)).stdout.split('\n').find((l) => l.startsWith('current_anchor: '));

describe.concurrent('the unit lifecycle verbs: bootstrap, stamp, close, reopen, refs', () => {
  it('R-a: bootstrap refuses no argument, an existing slug, and a malformed slug rc 1', async () => {
    const sb = stage('posix', 'life-boot');
    expect((await unit(sb, 'bootstrap')).code).toBe(1);
    expect((await unit(sb, 'bootstrap', 'u1', 'refusal unit')).code).toBe(0);
    expect((await unit(sb, 'bootstrap', 'u1', 'again')).code).toBe(1);
    expect((await unit(sb, 'bootstrap', 'bad slug', 'x')).code).toBe(1);
  });

  it('R-h: refs refuses the unit itself and a missing unit rc 1', async () => {
    const sb = stage('posix', 'life-refs');
    await seedUnit(sb, 'u1');
    expect((await unit(sb, 'refs', 'u1', 'u1')).code).toBe(1);
    expect((await unit(sb, 'refs', 'u1', 'nosuch')).code).toBe(1);
  });

  it('S1-a: stamp and task start keep a state and a task holding sed metacharacters whole, with no next_action', async () => {
    const sb = stage('posix', 'life-sed');
    await seedUnit(sb, 'rw-unit', 'rewrite / & unit');
    expect((await unit(sb, 'stamp', 'rw-unit')).code).toBe(0);
    let page = (await unit(sb, 'load', 'rw-unit', '1')).stdout;
    expect(page).toMatch(/^objective: "rewrite \/ & unit"/m);
    expect(page).toMatch(/^status: ACTIVE/m);
    await must(unit(sb, 'task', 'add', 'rw-unit', 'rw-task', '--objective=rewrite / & task'));
    expect((await unit(sb, 'task', 'start', 'rw-unit', 'rw-task')).code).toBe(0);
    page = (await unit(sb, 'load', 'rw-unit', '1')).stdout;
    expect(page).toMatch(/^objective: "rewrite \/ & unit"/m);
    expect(page).not.toContain('next_action:');
    expect((await unit(sb, 'task', 'show', 'rw-unit', 'rw-task')).stdout).toContain('OBJECTIVE: "rewrite / & task"');
  });

  it('S1-b: reopen refuses an ACTIVE or missing unit; close then reopen flips the status back and lists the unit again', async () => {
    const sb = stage('posix', 'life-reopen');
    await seedUnit(sb, 'rw-unit');
    expect((await unit(sb, 'reopen', 'rw-unit')).code).toBe(1);
    expect((await unit(sb, 'reopen', 'nosuch')).code).toBe(1);
    expect((await unit(sb, 'close', 'rw-unit')).code).toBe(0);
    expect((await unit(sb, 'active')).stdout).not.toMatch(/^rw-unit$/m);
    const r = await unit(sb, 'reopen', 'rw-unit');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('REOPENED: rw-unit');
    expect((await unit(sb, 'load', 'rw-unit', '1')).stdout).toMatch(/^status: ACTIVE/m);
    expect((await unit(sb, 'active')).stdout).toMatch(/^rw-unit$/m);
  });

  it('E3-f: stamp takes the unit alone; a receipt text refuses and leaves the anchor; the anchor carries its number and date only', async () => {
    const sb = stage('posix', 'life-stamp');
    await seedUnit(sb, 'e3-unit', 'input checks unit');
    const before = await anchor(sb, 'e3-unit');
    const refusal = await unit(sb, 'stamp', 'e3-unit', 'a receipt text');
    expect(refusal.code).toBe(1);
    expect(refusal.stderr).toContain('ctx unit stamp <unit>');
    expect(refusal.stderr).toMatch(/\(ERR_INVALID_ARGUMENT\)$/m);
    expect(await anchor(sb, 'e3-unit')).toBe(before);
    const stamped = await unit(sb, 'stamp', 'e3-unit');
    expect(stamped.code).toBe(0);
    expect(stamped.stdout + stamped.stderr).toBe('transition: A1 -> A2\n');
    expect((await unit(sb, 'search', 'e3-unit', '@anchor A2', '--mode=exact', '--json')).stdout).toMatch(/"snippet":"@anchor A2 \d{4}-\d{2}-\d{2}"/);
    expect((await unit(sb, 'search', 'e3-unit', 'attention', '--mode=exact', '--entity=session')).stdout).not.toContain('@anchor A2');
    const journal = artifactPath(sb, 'e3-unit', 'journal');
    expect(readFileSync(journal, 'utf8').split('\n').filter((l) => /^@anchor A2 \d{4}-\d{2}-\d{2}$/.test(l))).toHaveLength(1);
    appendFileSync(journal, '@anchor A3 ("continues A2", attention: a legacy receipt kept)\n');
    expect((await unit(sb, 'search', 'e3-unit', 'a legacy receipt kept', '--mode=exact', '--json')).stdout).toContain('"snippet":"@anchor A3 (\\"continues A2\\", attention: a legacy receipt kept)"');
  });

  it('X-o: a CLOSED unit refuses typed writes through the verbs and nothing lands', async () => {
    const sb = stage('posix', 'life-closed');
    await seedUnit(sb, 'x-closed', 'closed unit');
    await must(run(sb, ['lane', 'create', 'x-closed', 'x-cl'], { input: '# recipe grammar\n' }));
    await must(unit(sb, 'close', 'x-closed'));
    expect((await unit(sb, 'task', 'add', 'x-closed', 'x-late', '--objective=Added while closed')).code).toBe(1);
    expect((await unit(sb, 'task', 'show', 'x-closed', 'x-late')).code).toBe(1);
    expect((await unit(sb, 'finding', 'add', 'x-closed', 'X_LATE', '--summary=Added while closed')).code).toBe(1);
    expect((await lane(sb, 'record', 'x-closed', 'x-cl', '--what=Lane event while closed', '--slug=2026-09-27-x-late')).code).toBe(1);
    const shown = await lane(sb, 'show', 'x-closed', 'x-cl', 'journal');
    expect(shown.stdout + shown.stderr).not.toContain('while closed');
  });
});
