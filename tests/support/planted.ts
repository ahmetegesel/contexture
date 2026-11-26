import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { driverPath } from './driver';
import type { Driver } from './stage';

// the planted drivers the move engine's verify meets: each a workspace custom driver (the
// resolver's first tier) wrapping a real driver of the sandbox, sabotaging one namespace's
// calls and passing every other call through, the handshake included
export type Plant =
  | 'blind'
  | 'dropping'
  | 'corrupting'
  | 'adding'
  | 'scanblind'
  | 'allblind'
  | 'listing'
  | 'counting'
  | 'refusing'
  | 'hanging';

const BODIES: Record<Plant, string> = {
  // a batch answers its action count and writes nothing
  blind: [
    'if [ "${1:-}" = store.batch ] && [ "${2:-}" = "$NS" ]; then',
    '  n=$(grep -c "^action=" || true)',
    '  printf \'{"namespace":"%s","actions":%s}\\n\' "$2" "$n"',
    '  exit 0',
    'fi',
  ].join('\n'),
  // the first action of every batch never lands, its count still claimed
  dropping: [
    'if [ "${1:-}" = store.batch ] && [ "${2:-}" = "$NS" ]; then',
    '  cat > "$DIR/stage.$$"',
    '  n=$(grep -c "^action=" "$DIR/stage.$$")',
    '  awk \'/^action=/ { c++ } c != 1\' "$DIR/stage.$$" | "$REAL" "$@" > /dev/null',
    '  rc=$?',
    '  rm -f "$DIR/stage.$$"',
    '  [ "$rc" -eq 0 ] || exit "$rc"',
    '  printf \'{"namespace":"%s","actions":%s}\\n\' "$2" "$n"',
    '  exit 0',
    'fi',
  ].join('\n'),
  // the first put of every batch lands as the one byte X
  corrupting: [
    'if [ "${1:-}" = store.batch ] && [ "${2:-}" = "$NS" ]; then',
    '  awk \'/^value_b64=/ && !d { d = 1; print "value_b64=WA=="; next } { print }\' | "$REAL" "$@"',
    '  exit $?',
    'fi',
  ].join('\n'),
  // every batch lands one put more, of the key zz/extra
  adding: [
    'if [ "${1:-}" = store.batch ] && [ "${2:-}" = "$NS" ]; then',
    '  { cat; printf \'action=put\\nkey=zz/extra\\nvalue_b64=\\n\'; } | "$REAL" "$@"',
    '  exit $?',
    'fi',
  ].join('\n'),
  // the scan answers no item while the list still holds the keys
  scanblind: [
    'if [ "${1:-}" = store.scan ] && [ "${2:-}" = "$NS" ]; then',
    '  printf \'{"namespace":"%s","items":[]}\\n\' "$2"',
    '  exit 0',
    'fi',
  ].join('\n'),
  // the list and the scan answer nothing while the health still reads the store
  allblind: [
    'if [ "${1:-}" = store.scan ] && [ "${2:-}" = "$NS" ]; then',
    '  printf \'{"namespace":"%s","items":[]}\\n\' "$2"',
    '  exit 0',
    'fi',
    'if [ "${1:-}" = store.list ] && [ "${2:-}" = "$NS" ]; then',
    '  printf \'{"namespace":"%s","keys":[]}\\n\' "$2"',
    '  exit 0',
    'fi',
  ].join('\n'),
  // the list names one key more, outside the core key rule
  listing: [
    'if [ "${1:-}" = store.list ] && [ "${2:-}" = "$NS" ]; then',
    '  "$REAL" "$@" | sed \'s/]}$/,"zz\\/Bad Key"]}/; s/\\[,/[/\'',
    '  exit 0',
    'fi',
  ].join('\n'),
  // a batch logs its action count and decoded value bytes, then answers as blind does
  counting: [
    'if [ "${1:-}" = store.batch ] && [ "${2:-}" = "$NS" ]; then',
    '  awk \'/^action=/ { n++ } /^value_b64=/ { v = substr($0, 11); L = length(v); d = int(L / 4) * 3; if (L > 0 && substr(v, L, 1) == "=") d--; if (L > 1 && substr(v, L - 1, 1) == "=") d--; b += d } END { print n + 0, b + 0 }\' > "$DIR/line.$$"',
    '  cat "$DIR/line.$$" >> "$DIR/log"',
    '  n=$(cut -d " " -f 1 "$DIR/line.$$")',
    '  rm -f "$DIR/line.$$"',
    '  printf \'{"namespace":"%s","actions":%s}\\n\' "$2" "$n"',
    '  exit 0',
    'fi',
  ].join('\n'),
  // the second batch holding a put refuses; deletes pass
  refusing: [
    'if [ "${1:-}" = store.batch ] && [ "${2:-}" = "$NS" ]; then',
    '  cat > "$DIR/stage.$$"',
    '  if grep -q "^action=put" "$DIR/stage.$$"; then',
    '    printf x >> "$DIR/puts"',
    '    if [ "$(wc -c < "$DIR/puts")" -ge 2 ]; then',
    '      rm -f "$DIR/stage.$$"',
    '      printf \'store.batch: error: the planted refusal (ERR_STORAGE_WRITE)\\n\' >&2',
    '      exit 2',
    '    fi',
    '  fi',
    '  "$REAL" "$@" < "$DIR/stage.$$"',
    '  rc=$?',
    '  rm -f "$DIR/stage.$$"',
    '  exit "$rc"',
    'fi',
  ].join('\n'),
  // a batch hangs, its pid named, until a signal stops it
  hanging: [
    'if [ "${1:-}" = store.batch ] && [ "${2:-}" = "$NS" ]; then',
    '  printf \'%s\\n\' "$$" > "$DIR/pid"',
    '  exec sleep 300',
    'fi',
  ].join('\n'),
};

// plantDriver <sandbox> <name> <plant> <base driver> <namespace>: the planted driver named
// <name>, its folder (where its log, pid, and staging files lie) returned
export function plantDriver(sb: string, name: string, plant: Plant, base: Driver, ns: string): string {
  const dir = join(sb, '.contexture/drivers', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'driver'), [
    '#!/bin/sh',
    `REAL='${driverPath(sb, base)}'`,
    `DIR='${dir}'`,
    `NS='${ns}'`,
    BODIES[plant],
    'exec "$REAL" "$@"',
    '',
  ].join('\n'), { mode: 0o755 });
  return dir;
}
