import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CORE_SRC } from '../support/laws';
import { ROOT } from '../support/root';

const LOADER = join(ROOT, 'base/AGENTS.md');
const MODULE_OWNED = ['record', 'journal', 'backlog', 'query'];
const COMPOSER = ['module'];
const CORE_OWNED = ['laws', 'layout', 'module', 'boot', 'interact', 'rhythms', 'subagents', 'refresh', 'close', 'handoff', 'git', 'update'];
const SKELETON = 'laws layout boot record journal backlog query interact rhythms subagents refresh close handoff git update';

const coreBlocks = (core: string): string[] =>
  core.split('\n').filter((l) => /^@[A-Za-z0-9._-]+$/.test(l)).map((l) => l.slice(1));

const expectedSections = (core: string): string[] => {
  const names = coreBlocks(core).filter((n) => !MODULE_OWNED.includes(n));
  const at = names.indexOf('layout') + 1;
  return [...names.slice(0, at), ...COMPOSER, ...names.slice(at)];
};

const loaderSections = (text: string): string[] | null => {
  const m = text.match(/Its generic sections are ([^;]+);/);
  return m ? m[1].split(',').map((s) => s.trim().replace(/^@/, '')) : null;
};

const violations = (text: string, core: string): string[] => {
  const named = loaderSections(text);
  if (named === null) return ['the loader names no generic sections'];
  const expected = expectedSections(core);
  return [
    ...named.filter((n) => !expected.includes(n)).map((n) => `named but not generic: ${n}`),
    ...named.filter((n) => MODULE_OWNED.includes(n)).map((n) => `module-owned section named: ${n}`),
    ...expected.filter((n) => !named.includes(n)).map((n) => `generic section missing: ${n}`),
    ...(named.join(' ') === expected.join(' ') ? [] : [`order: ${named.join(' ')}`]),
  ];
};

describe.concurrent('the loader section census', () => {
  it('[modules-r-cqgw9] the loader names the core generic sections only, in the composed order', () => {
    const core = readFileSync(CORE_SRC, 'utf8');
    expect(coreBlocks(core).join(' ')).toBe(SKELETON);
    expect(expectedSections(core)).toEqual(CORE_OWNED);
    const text = readFileSync(LOADER, 'utf8');
    expect(loaderSections(text)).toEqual(CORE_OWNED);
    expect(violations(text, core)).toEqual([]);
  });

  it('[modules-r-cqgw9] a planted @record, a custom name, a missing @module, and an absent frame read red', () => {
    const core = readFileSync(CORE_SRC, 'utf8');
    const text = readFileSync(LOADER, 'utf8');
    const record = text.replace('@update;', '@update, @record;');
    expect(record).not.toBe(text);
    expect(violations(record, core)).toContain('named but not generic: record');
    expect(violations(record, core)).toContain('module-owned section named: record');
    const custom = text.replace('@update;', '@update, @custom;');
    expect(custom).not.toBe(text);
    expect(violations(custom, core)).toContain('named but not generic: custom');
    const missing = text.replace('@layout, @module, ', '@layout, ');
    expect(missing).not.toBe(text);
    expect(violations(missing, core)).toContain('generic section missing: module');
    const absent = '# contexture v0.72.0: the base loader\n@boot\n  1. FIRST: run .contexture/ctx compose\n';
    expect(loaderSections(absent)).toBeNull();
    expect(violations(absent, core)).toEqual(['the loader names no generic sections']);
    expect(violations(text, core)).toEqual([]);
  });
});
