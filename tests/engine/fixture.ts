import { join } from 'node:path';
import { filter, hook, shVerb, writeModule } from '../support/modules';
import { stage } from '../support/stage';
import { put } from '../support/tree';

export function engineSandbox(label: string): string {
  const sb = stage('posix', label);
  writeModule(sb, 'modules', 'good', {
    manifest: '# summary: a good fixture module\n',
    files: {
      'scripts/hi': shVerb('say hi', 'echo "hi ${1:-world}"', '# usage: ctx good hi [<name>]', '# help: prints hi, optionally to a name'),
      'scripts/env': shVerb(
        'print the dispatch environment',
        [
          'printf "pwd=%s\\n" "$PWD"',
          'printf "CTX_ROOT=%s\\n" "$CTX_ROOT"',
          'printf "CTX_MODULE_DIR=%s\\n" "$CTX_MODULE_DIR"',
          'printf "CTX_BIN=%s\\n" "$CTX_BIN"',
          'printf "CTX_SCRATCH_ROOT=%s\\n" "$CTX_SCRATCH_ROOT"',
          'printf "LC_ALL=%s\\n" "$LC_ALL"',
          'printf "argv=%s\\n" "$*"',
        ].join('\n'),
        '# usage: ctx good env [args...]',
        '# help: prints pwd and the exported dispatch variables',
      ),
      'scripts/help': shVerb('should never be a verb', 'echo shadow-help'),
    },
  });
  writeModule(sb, 'modules', 'nosummary', { manifest: '# no summary here\n', files: { 'scripts/x': '#!/bin/sh\necho nope\n' } });
  writeModule(sb, 'modules', 'scriptsonly', { files: { 'scripts/orphan': shVerb('orphan verb', 'echo orphan') } });
  writeModule(sb, 'modules', 'filteronly', {
    files: { 'filters/probe.awk': filter({ filter: 'probe', match: '^ZZMARK', 'format-only': 'probe' }, '/ZZMARK/ { print "P" }') },
  });
  writeModule(sb, 'modules', 'load', { manifest: '# summary: should never list\n', files: { 'scripts/y': '#!/bin/sh\necho shadow\n' } });
  writeModule(sb, 'modules', 'hookonly', { files: { 'hooks/10-emit.sh': hook('load-pre', 'echo "HOOK hookonly" >> marker.log') } });
  writeModule(sb, 'extensions', 'aaaext', {
    manifest: '# summary: an extension fixture module\n',
    files: { 'scripts/hi': shVerb('say hi from the extension root', 'echo "ext hi"\nprintf "module-dir=%s\\n" "$CTX_MODULE_DIR"') },
  });
  writeModule(sb, 'extensions', 'good', {
    manifest: '# summary: the extension good that must not shadow\n',
    files: { 'scripts/hi': shVerb('the shadowing extension verb', 'echo "ext shadow"') },
  });
  writeModule(sb, 'extensions', 'load', { manifest: '# summary: a reserved extension module\n' });
  writeModule(sb, 'extensions', 'unit', { manifest: '# summary: a builtin collision\n' });
  writeModule(sb, 'extensions', 'hookext', {
    manifest: '# summary: the extension hook fixture\n',
    files: { 'hooks/10-ext.sh': hook('load-pre', 'echo "HOOK ext" >> marker.log') },
  });
  writeModule(sb, 'extensions', 'filterext', {
    manifest: '# summary: the extension filter fixture\n',
    files: { 'filters/ext.awk': filter({ filter: 'extprobe', match: '^EXTMARK', 'format-only': 'extprobe' }, '/EXTMARK/ { print "EXTFILTER" }') },
  });
  put(join(sb, 'bin/famcmd'), '#!/bin/sh\necho "hi there famcmd output line"\n', 0o755);
  return sb;
}

export const MANIFESTS: Record<string, string> = {
  fullmod: '# summary: a full manifest\n# version: 1.2.3\n# description:\n# The corpus preamble.\n#\n# A second paragraph.\n',
  sumonly: '# summary: a summary-only manifest\n',
  reqmod: '# summary: a requires manifest\n# requires: base>=1.0.0\n',
  dupmod: '# summary: the first\n# summary: the second\n',
  unkmod: '# summary: an unknown field\n# parts: module\n',
  badvermod: '# summary: a bad version\n# version: 1.0 beta\n',
  baddescmod: '# summary: a description not last\n# description:\n# text\nnot-a-comment\n',
};

export function writeManifests(sb: string): void {
  for (const [name, manifest] of Object.entries(MANIFESTS)) writeModule(sb, 'modules', name, { manifest });
}

export const withBin =(sb: string, env: Record<string, string> = {}): Record<string, string> => ({
  PATH: `${join(sb, 'bin')}:${process.env.PATH ?? ''}`,
  ...env,
});

export const listed = (help: string): string[] => {
  const out: string[] = [];
  let on = false;
  for (const l of help.split('\n')) {
    if (/^modules:/.test(l)) on = true;
    else if (on && /^ {2}[a-z]/.test(l)) out.push(l.trim().split(/\s+/)[0]!);
    else if (on && l === '') on = false;
  }
  return out;
};

export const verbs = (help: string): string[] =>
  (help.split(/^verbs:$/m)[1] ?? '')
    .split(/\n\n/)[0]!
    .split('\n')
    .filter((l) => /^ {2}\S/.test(l))
    .map((l) => l.trim().split(/\s+/)[0]!);
