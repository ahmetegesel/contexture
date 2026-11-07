import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECORD_ROOT } from '../support/drawer';
import { DATE } from '../support/record';
import { put } from '../support/tree';
import { must, unit } from '../support/unit';
import { recordAndList, sqliteStage } from './smoke';

const BYPASS = [
  '#!/bin/sh',
  '# summary: record an append-only journal event with auto-injected date and anchor',
  '# usage: ctx unit record <unit> --what="..." [--slug=...]',
  'u=$1; shift',
  'for a; do case $a in --what=*) what=${a#--what=} ;; --slug=*) slug=${a#--slug=} ;; esac; done',
  `mkdir -p "$CTX_ROOT/${RECORD_ROOT}/$u"`,
  `printf '\\n@entry %s\\n  WHAT: "%s"\\n' "$slug" "$what" >> "$CTX_ROOT/${RECORD_ROOT}/$u/journal.md"`,
  `printf 'recorded: %s\\n' "$slug"`,
  '',
].join('\n');

describe('the SQLite smoke set: a planted record verb that bypasses the store reads red', () => {
  it('[the-record-r2, the-record-r10, plugins-p3] the bypassing verb answers rc0 with a receipt, yet the journal family lists nothing and finds a posix residue', async () => {
    const sb = sqliteStage('sq-plant');
    await must(unit(sb, 'bootstrap', 'sq-plant', 'the planted unit'));
    const record = join(sb, '.contexture/modules/unit/scripts/record');
    const real = readFileSync(record);
    put(record, BYPASS, 0o755);
    const slug = `${DATE}-sq-planted`;
    expect(await recordAndList(sb, 'sq-plant', slug, 'the planted entry')).toEqual({ code: 0, listed: false, residue: [RECORD_ROOT] });
    put(record, real, 0o755);
    expect(await recordAndList(sb, 'sq-plant', `${DATE}-sq-restored`, 'the restored entry')).toMatchObject({ code: 0, listed: true });
  });
});
