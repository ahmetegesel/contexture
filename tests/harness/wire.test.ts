import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { driverOp } from '../support/driver';
import { stage } from '../support/stage';
import { answer, b64, compact, esc, payload, unb64, unesc } from '../support/wire';

describe('wire round trip', () => {
  it('esc and unesc are inverse over every escaped character', () => {
    const text = 'back\\slash \\n literal tab\there cr\rhere nl\nhere ü trailing\\';
    expect(esc(text)).toBe('back\\\\slash \\\\n literal tab\\there cr\\rhere nl\\nhere ü trailing\\\\');
    expect(unesc(esc(text))).toBe(text);
  });

  it('compact reads whitespace between tokens and a raw control byte as not compact, and string contents as data', () => {
    expect(compact('{"a":"x y\\"z","b":[1,2],"c":{"d":null}}')).toBe(true);
    expect(compact('{"a": 1}')).toBe(false);
    expect(compact('{"a":[1, 2]}')).toBe(false);
    expect(compact('{"a":"tab\there"}')).toBe(false);
  });

  it('a payload value travels to the unit data script and back in its JSON answer unchanged', async () => {
    const sb = stage();
    const objective = 'back\\slash \\n literal "quoted" ü ✓ trailing\\';
    const created = answer(
      await data(sb, 'session.create', ['wire-unit'], payload().kv('objective', objective).kl('repos', 'alpha', 'beta').kv('attention', 'wire').toString()),
      'session.create',
    );
    expect(created.state.objective).toBe(objective);
    expect(created.state.repos).toEqual(['alpha', 'beta']);
  });

  it('raw bytes travel in base64 through store.batch and back through store.get and store.scan', async () => {
    const sb = stage();
    const bytes = Buffer.from([0x61, 0x00, 0xff, 0x0a, 0x5c, 0x6e, 0xc3, 0xbc]);
    const batch = payload().kv('action', 'put').kv('key', 'wire-unit/blob').kv('head', 'none').kv('value_b64', b64(bytes)).toString();
    expect(answer(await driverOp(sb, 'posix', 'store.batch', ['unit'], batch), 'store.batch')).toEqual({ namespace: 'unit', actions: 1 });
    const got = await driverOp(sb, 'posix', 'store.get', ['unit', 'wire-unit/blob']);
    expect(got.code, got.stderr).toBe(0);
    expect(got.bytes.equals(bytes)).toBe(true);
    const scan = answer(await driverOp(sb, 'posix', 'store.scan', ['unit']), 'store.scan');
    expect(scan.items.map((i: { key: string }) => i.key)).toEqual(['wire-unit/blob']);
    expect(unb64(scan.items[0].value_b64).equals(bytes)).toBe(true);
  });
});
