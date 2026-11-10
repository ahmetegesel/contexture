import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { CORE_SRC, versionOf } from '../support/laws';

const LOADER = join(ROOT, 'base/AGENTS.md');

function loaderOk(text: string): boolean {
  return [
    /FIRST: run \.contexture\/ctx compose/,
    /composes the generated law layer AGENTS\.generated\.md/,
    /read AGENTS\.generated\.md WHOLE: the composed law layer\./,
    /Its generic sections are @laws, @layout, @module, @boot, @interact, @rhythms, @subagents, @refresh, @close, @handoff, @update;/,
    /every module adds its own sections, clauses, and duties/,
    /follow each duty as steps in the framed order, gates included/,
    /Laws bind\./,
    /read AGENTS\.workspace\.md then AGENTS\.local\.md/,
    /When \.contexture\/ctx is absent or not executable, or the compose exits non-zero/,
    /missing or refused payload path/,
    /never edit this file/,
  ].every((re) => re.test(text));
}

describe.concurrent('the loader (base/AGENTS.md)', () => {
  it('[modules-r19] stays the few-line loader whose first instruction runs or verifies the compose and names its stops', () => {
    expect(existsSync(LOADER)).toBe(true);
    expect(statSync(LOADER).size).toBeLessThan(2048);
    const text = readFileSync(LOADER, 'utf8');
    expect(text).toMatch(/^ {2}1\. FIRST: run \.contexture\/ctx compose from the workspace root/m);
    expect(text).toMatch(/composes the generated law layer AGENTS\.generated\.md or verifies it current/);
    expect(text).toMatch(/read AGENTS\.generated\.md WHOLE/);
    expect(text).toMatch(/read AGENTS\.workspace\.md then AGENTS\.local\.md/);
    expect(text).toMatch(/When \.contexture\/ctx is absent or not executable, or the compose exits non-zero/);
    expect(text).toMatch(/stop and report its error line/);
    expect(text).not.toMatch(/laws\/compose/);
    expect(text).not.toContain('source-of-truth:');
    expect(versionOf(text)).toBe(versionOf(readFileSync(CORE_SRC, 'utf8')));
  });

  it('[modules-r19] pins the frame instruction at @boot step 2 and leaves step 3 byte for byte', () => {
    const lines = readFileSync(LOADER, 'utf8').split('\n');
    expect(lines[3]).toBe('  2. read AGENTS.generated.md WHOLE: the composed law layer. Its generic sections are @laws, @layout, @module, @boot, @interact, @rhythms, @subagents, @refresh, @close, @handoff, @update; every module adds its own sections, clauses, and duties, so expect more than this list, and follow each duty as steps in the framed order, gates included. Laws bind. Never edit it.');
    expect(lines[4]).toBe("  3. read AGENTS.workspace.md then AGENTS.local.md: the shared overlay and the local amendments; they amend the generated layer by section, never contradict it; where they conflict, the workspace wins. Then run the generated layer's @boot.");
  });

  it('[modules-r19] passes the validating probe, which reads a wrong first instruction and a reversed overlay order red', () => {
    const text = readFileSync(LOADER, 'utf8');
    expect(loaderOk(text)).toBe(true);
    expect(loaderOk('# contexture v0.0.0: the loader\n@boot\n  1. read AGENTS.md whole\n')).toBe(false);
    const reversed = text.replace('read AGENTS.workspace.md then AGENTS.local.md', 'read AGENTS.local.md then AGENTS.workspace.md');
    expect(reversed).not.toBe(text);
    expect(loaderOk(reversed)).toBe(false);
  });
});
