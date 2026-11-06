import { describe, expect, it } from 'vitest';
import { data } from '../support/data';
import { DATE, ok } from '../support/record';
import { answer, payload } from '../support/wire';
import { at, TUNIT } from './chain';

describe('concurrent writers of one unit', () => {
  it('TC22: five entry.record calls at once land five entries with distinct suffixed slugs, no writer refused and none retried', async () => {
    const sb = await at('T0');
    const X = '2026-09-27-event-1790000030';
    const write = payload().kv('what', 'concurrent writer').kv('thread', 'none').kv('date', DATE).kv('epoch', '1790000030').toString();
    const runs = await Promise.all(Array.from({ length: 5 }, () => data(sb, 'entry.record', [TUNIT], write)));
    const slugs = runs.map((r, i) => answer(r, `entry.record writer ${i + 1}`).entry.slug as string);
    expect(slugs.sort()).toEqual([X, `${X}-1`, `${X}-1-1`, `${X}-1-1-1`, `${X}-1-1-1-1`]);
    const listed = (await ok(sb, 'entry.list', [TUNIT])).entries.filter((e: { slug: string }) => e.slug.startsWith(X));
    expect(listed.length).toBe(5);
  });
});
