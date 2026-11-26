import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newPkg } from './packages';
import { put } from './tree';

export interface TwinOptions {
  name?: string;
  driver?: string;
  version?: string;
  format?: number;
  root?: string;
  hooks?: boolean;
  scanFlip?: string;
  config?: string;
  probe?: string;
}

// SEAMS: files under the sandbox's drawer that steer the twin's wrapper and hooks; the
// behavior test runs the twin from its own scratch workspaces, where no seam exists
export const SEAMS = '.contexture/twin-seams';

// twinPkg: a driver package whose driver is the sandbox's own core posix driver with its roots
// rebased under one drawer folder (.contexture/<root>) and its card naming the twin, so it
// stores apart from posix and answers the behavior test as posix does. A wrapper in front
// reads the seams: fail-batch refuses every batch, slow-batch holds a batch (its pid noted in
// the drawer's scratch), flip-scan changes the values of a namespace's second scan on, and
// scanFlip names a namespace whose every scan this version changes. Its hooks keep that one
// folder: prepare refuses a folder that holds a file (and the prepare-refuse and slow-prepare
// seams), cleanup removes it, finish out moves it into the backup folder or deletes it, each
// noting its environment in the drawer's scratch.
export function twinPkg(sb: string, o: TwinOptions = {}): string {
  const name = o.name ?? 'twin-pkg';
  const driver = o.driver ?? 'twin';
  const root = o.root ?? 'twin';
  const p = newPkg(sb, name);
  const part = join(p, '.contexture/extensions/storage/drivers', driver);
  const posix = readFileSync(join(sb, '.contexture/storage/drivers/posix/driver'), 'utf8');
  const body = posix
    .split('\n')
    .flatMap((l) => (l === '  STORE_WS=$sd_ws' ? [l, `  SD_ROOT=.contexture/${root}/$SD_ROOT`, `  [ -z "$SD_FALLBACK" ] || SD_FALLBACK=.contexture/${root}/$SD_FALLBACK`] : [l]))
    .join('\n')
    .replaceAll('{"driver":"posix"', `{"driver":"${driver}"`);
  if (!body.includes(`.contexture/${root}/$SD_ROOT`)) throw new Error('twinPkg: the posix driver no longer assigns STORE_WS=$sd_ws');
  put(join(part, 'body'), body, 0o644);
  const flip = o.scanFlip ? `\n    [ "$2" != ${o.scanFlip} ] || { sh "$(dirname "$0")/body" "$@" | sed 's/"value_b64":"/"value_b64":"QUFB/'; exit 0; }` : '';
  put(join(part, 'driver'), [
    '#!/bin/sh',
    `s=${SEAMS}`,
    'case "${1:-}" in',
    '  store.batch)',
    '    [ ! -f "$s/fail-batch" ] || { printf \'store.batch: error: the twin refuses this batch (ERR_STORAGE_WRITE)\\n\' >&2; exit 2; }',
    '    if [ -f "$s/slow-batch" ]; then printf \'%s\\n\' "$$" > .contexture/tmp/twin-batch.pid; exec sleep 60; fi',
    '    ;;',
    `  store.scan)${flip}`,
    '    if [ -f "$s/flip-scan" ]; then',
    '      f=.contexture/tmp/twin-scans.$2',
    '      n=$(( $(cat "$f" 2>/dev/null || echo 0) + 1 ))',
    '      echo "$n" > "$f"',
    '      [ "$n" -lt 2 ] || { sh "$(dirname "$0")/body" "$@" | sed \'s/"value_b64":"/"value_b64":"QUFB/\'; exit 0; }',
    '    fi',
    '    ;;',
    'esac',
    'exec sh "$(dirname "$0")/body" "$@"',
    '',
  ].join('\n'), 0o755);
  if (o.config) put(join(part, 'config'), o.config);
  if (o.hooks ?? true) {
    const note = (hook: string) => `env | grep -E '^CTX_' | LC_ALL=C sort > .contexture/tmp/twin-${hook}.env`;
    put(join(part, 'hooks/prepare'), [
      '#!/bin/sh',
      note('prepare'),
      `[ -z "$(find .contexture/${root} -type f 2>/dev/null | head -n 1)" ] || { echo 'the twin store already holds records' >&2; exit 1; }`,
      `[ ! -f ${SEAMS}/prepare-refuse ] || { echo 'the twin refuses to prepare' >&2; exit 1; }`,
      `if [ -f ${SEAMS}/slow-prepare ]; then echo $$ > .contexture/tmp/twin-prepare.pid; exec sleep 60; fi`,
      'exit 0',
      '',
    ].join('\n'), 0o755);
    put(join(part, 'hooks/cleanup'), ['#!/bin/sh', note('cleanup'), `rm -rf .contexture/${root}`, ''].join('\n'), 0o755);
    put(join(part, 'hooks/finish'), [
      '#!/bin/sh',
      `${note('finish')}.$CTX_DRIVER_DIRECTION`,
      '[ "$CTX_DRIVER_DIRECTION" = out ] || exit 0',
      `[ ! -f ${SEAMS}/finish-fail ] || { echo 'the twin cannot finish' >&2; exit 2; }`,
      'case "$CTX_DRIVER_OLD_COPY" in',
      `  backup) [ ! -d .contexture/${root} ] || mv .contexture/${root} "$CTX_DRIVER_BACKUP/store" || exit 2 ;;`,
      `  delete) rm -rf .contexture/${root} ;;`,
      '  *) exit 2 ;;',
      'esac',
      '',
    ].join('\n'), 0o755);
  }
  if (o.probe) put(join(p, 'hooks/probe'), `#!/bin/sh\n${o.probe}\n`, 0o755);
  const parts = [`# part: driver storage/drivers/${driver}`];
  put(join(p, 'manifest'), [
    `# summary: a posix twin for tests`,
    `# version: ${o.version ?? '1.0.0'}`,
    '# kind: driver',
    `# driver: ${driver}`,
    `# format: ${o.format ?? 1}`,
    ...parts,
    '',
  ].join('\n'));
  return p;
}

export const seam = (sb: string, name: string): string => put(join(sb, SEAMS, name), '');

export function hookEnv(sb: string, file: string): Record<string, string> {
  const path = join(sb, '.contexture/tmp', file);
  if (!existsSync(path)) return {};
  return Object.fromEntries(readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
}
