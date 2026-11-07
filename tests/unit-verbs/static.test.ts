import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FALLBACK_ROOT, RECORD_ROOT } from '../support/drawer';
import { ROOT } from '../support/root';

const MODULES = ['base/.contexture/modules/unit/scripts', 'base/.contexture/extensions/modules/lane/scripts'];
const MESSAGE_SCAN = [...MODULES, 'base/.contexture/extensions/modules/rhythm/scripts'];
const verbScripts = (): [string, string][] =>
  MODULES.flatMap((dir) => readdirSync(join(ROOT, dir)).map((f) => [`${dir}/${f}`, readFileSync(join(ROOT, dir, f), 'utf8')] as [string, string])).filter(([, text]) => /^# summary: /m.test(text));

describe('the unit and lane verb scripts, read statically', () => {
  it('UP-d [the-record-r14]: no unit, lane, or rhythm script prints either record root in a message (comments and the WRITE SCOPE line aside)', () => {
    const roots = [RECORD_ROOT, FALLBACK_ROOT].map((r) => r.replace(/^\./, ''));
    expect(readdirSync(join(ROOT, MESSAGE_SCAN[2]!)).sort()).toEqual(['current', 'list', 'resolve', 'show']);
    const lines = MESSAGE_SCAN.flatMap((dir) => readdirSync(join(ROOT, dir)).flatMap((f) => readFileSync(join(ROOT, dir, f), 'utf8').split('\n').map((line, i) => `${dir}/${f}:${i + 1}:${line}`)));
    expect(lines.length).toBeGreaterThan(100);
    const hits = lines.filter((l) => roots.some((root) => l.includes(root)) && !/:\d+:#/.test(l) && !l.includes('WRITE SCOPE'));
    expect(hits).toEqual([]);
  });

  it('[modules-r3] every unit and lane verb that reaches the record sources the shared verb library; refresh alone composes the board and audit verbs', () => {
    const verbs = verbScripts();
    expect(verbs).toHaveLength(25);
    const sources = (text: string): boolean => /^\. "\$\(CDPATH= cd -- "\$\(dirname -- "\$0"\)\/\.\.\/lib" && pwd\)\/verb\.sh"$/m.test(text) || (/^unit_lib=.*\/lib\/verb\.sh"$/m.test(text) && /^\. "\$unit_lib"$/m.test(text));
    expect(verbs.filter(([, text]) => !sources(text)).map(([path]) => path.split('/').pop())).toEqual(['refresh']);
    const text = Object.fromEntries(verbs.map(([path, t]) => [path.split('/').pop(), t]));
    expect(text.refresh).toMatch(/^sh "\$dir\/audit" "\$slug"/m);
    expect(text.refresh).not.toMatch(/scripts\/data|vb_call/);
  });
});
