import { describe, expect, it } from 'vitest';
import { shFunction } from '../support/sh';
import { stage } from '../support/stage';
import { esc } from '../support/wire';

const LIBRARY = '.contexture/storage/scripts/library';

describe('sh function', () => {
  it('the sourced library escape alone equals the TypeScript wire escape', async () => {
    const sb = stage();
    const value = 'back\\slash "quoted" tab\there cr\rhere\nnext line ü\\';
    const r = await shFunction(sb, LIBRARY, 'store_lib_escape', [value]);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toBe(esc(value));
  });

  it('a sourced function answers by its return code: data_lib_ref_ok takes unit#x and refuses a blank', async () => {
    const sb = stage();
    expect((await shFunction(sb, LIBRARY, 'data_lib_ref_ok', ['unit#x'])).code).toBe(0);
    expect((await shFunction(sb, LIBRARY, 'data_lib_ref_ok', ['unit# x'])).code).toBe(1);
  });
});
