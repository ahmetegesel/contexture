import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { CORE_SRC, versionOf } from '../support/laws';

const LOADER = join(ROOT, 'base/AGENTS.md');

function loaderOk(text: string): boolean {
  return [
    /FIRST: run \.contexture\/laws\/compose/,
    /composes the generated law layer AGENTS\.generated\.md/,
    /read AGENTS\.generated\.md WHOLE/,
    /read AGENTS\.workspace\.md then AGENTS\.local\.md/,
    /absent or not executable/,
    /missing payload path/,
    /never edit this file/,
  ].every((re) => re.test(text));
}

describe.concurrent('the loader (base/AGENTS.md)', () => {
  it('[modules-r19] stays the few-line loader whose first instruction runs or verifies the compose and names its stops', () => {
    expect(existsSync(LOADER)).toBe(true);
    expect(statSync(LOADER).size).toBeLessThan(2048);
    const text = readFileSync(LOADER, 'utf8');
    expect(text).toMatch(/^ {2}1\. FIRST: run \.contexture\/laws\/compose/m);
    expect(text).toMatch(/composes the generated law layer AGENTS\.generated\.md or verifies it current/);
    expect(text).toMatch(/read AGENTS\.generated\.md WHOLE/);
    expect(text).toMatch(/read AGENTS\.workspace\.md then AGENTS\.local\.md/);
    expect(text).toMatch(/absent or not executable/);
    expect(text).toMatch(/core source \.contexture\/laws\/core\.md is absent or unreadable/);
    expect(text).toMatch(/stop and report the missing payload path/);
    expect(text).not.toContain('source-of-truth:');
    expect(versionOf(text)).toBe(versionOf(readFileSync(CORE_SRC, 'utf8')));
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
