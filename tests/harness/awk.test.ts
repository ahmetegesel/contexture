import { describe, expect, it } from 'vitest';
import { awk } from '../support/awk';
import { stage } from '../support/stage';
import { esc, unesc } from '../support/wire';

describe('awk program', () => {
  it('the shipped json.awk alone flattens an answer into path lines in the payload escape', async () => {
    const sb = stage();
    const what = 'tab\there "quoted" back\\slash\nnext line ü';
    const answer = JSON.stringify({ unit: 'u1', what, refs: ['a', 'b'], n: 3, ok: true, none: null });
    const r = await awk(sb, '.contexture/modules/unit/lib/json.awk', { input: `${answer}\n` });
    expect(r.code, r.stderr).toBe(0);
    expect(r.stderr).toBe('');
    expect(r.stdout).toBe(['unit=u1', `what=${esc(what)}`, 'refs.1=a', 'refs.2=b', 'refs#2', 'n:3', 'ok:true', 'none:null', ''].join('\n'));
    const line = r.stdout.split('\n').find((l) => l.startsWith('what='));
    expect(unesc(line?.slice('what='.length) ?? '')).toBe(what);
  });
});
