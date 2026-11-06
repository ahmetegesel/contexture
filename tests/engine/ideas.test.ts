import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';
import { run } from '../support/unit';

const LIVE = join(ROOT, '.contexture/modules/ideas');

function ideasSandbox(label: string): { sb: string; env: Record<string, string> } {
  const sb = stage('posix', label);
  cpSync(LIVE, join(sb, '.contexture/modules/ideas'), { recursive: true });
  mkdirSync(join(sb, 'ideas-scratch'));
  cpSync(join(ROOT, 'tests/engine/fixtures/ideas/IDEAS.md'), join(sb, 'ideas-scratch/IDEAS.md'));
  return { sb, env: { IDEAS_FILE: join(sb, 'ideas-scratch/IDEAS.md') } };
}

describe.skipIf(!existsSync(LIVE))('the live ideas workspace module (needs the live drawer .contexture/modules/ideas, absent in a worktree)', { concurrent: true }, () => {
  it('CT-I [modules-r3]: ctx help lists ideas; the bare module prints its verb table rc 0', async () => {
    const { sb } = ideasSandbox('ideas-help');
    expect((await run(sb, ['help'])).stdout).toMatch(/^ {2}ideas /m);
    const bare = await run(sb, ['ideas']);
    expect(bare.code).toBe(0);
    expect(bare.stdout).toContain('list ideas by status');
  });

  it('CT-I: list answers the OPEN slugs alone, list all every status, show one block; an unknown slug rc 1', async () => {
    const { sb, env } = ideasSandbox('ideas-read');
    const open = (await run(sb, ['ideas', 'list'], { env })).stdout;
    expect(open).toBe('probe-open\n');
    expect(open).not.toContain('never reaches the open list');
    expect((await run(sb, ['ideas', 'list', 'all'], { env })).stdout).toContain('probe-picked');
    expect((await run(sb, ['ideas', 'show', 'probe-picked'], { env })).stdout).toMatch(/^@idea probe-picked/m);
    expect((await run(sb, ['ideas', 'show', 'no-such-idea'], { env })).code).toBe(1);
  });

  it('CT-I: add lands a new idea and refuses an empty stdin and a duplicate slug rc 1', async () => {
    const { sb, env } = ideasSandbox('ideas-add');
    expect((await run(sb, ['ideas', 'add'], { input: '@idea probe-new\n  WHAT: "probe idea"\n', env })).code).toBe(0);
    expect((await run(sb, ['ideas', 'add'], { env })).code).toBe(1);
    expect((await run(sb, ['ideas', 'add'], { input: '@idea probe-new\n  WHAT: "dup"\n', env })).code).toBe(1);
  });

  it('CT-I: pick with a dashed unit and drop with a parenthesized why move the slug between the lists', async () => {
    const { sb, env } = ideasSandbox('ideas-move');
    await run(sb, ['ideas', 'add'], { input: '@idea probe-new\n  WHAT: "probe idea"\n', env });
    expect((await run(sb, ['ideas', 'pick', 'probe-new', 'demo-unit'], { env })).code).toBe(0);
    expect((await run(sb, ['ideas', 'list', 'picked'], { env })).stdout.split('\n')).toContain('probe-new');
    expect((await run(sb, ['ideas', 'drop', 'probe-new', '(why with parens)'], { env })).code).toBe(0);
    expect((await run(sb, ['ideas', 'list', 'dropped'], { env })).stdout.split('\n')).toContain('probe-new');
    expect((await run(sb, ['ideas', 'list'], { env })).stdout).not.toContain('probe-new');
  });
});
