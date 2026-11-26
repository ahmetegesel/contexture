import { appendFileSync, cpSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { between, logical, QUOTED, roots, TICK } from './shell-lines';
import { text } from './walk';

// A special builtin (:, ., break, continue, eval, exec, exit, export, readonly, return, set,
// shift, times, trap, unset) whose own redirection cannot open its file ends a POSIX shell such
// as dash then and there, so no || or && after it and no if or loop reading it ever runs: a guard
// of that form loses its refusal line (bash continues, so only dash shows it). A redirect is
// guarded when the || or && that reads it follows with nothing between but redirections, a
// group's close, and further && members, or when it is the condition of an if, elif, or loop
// before its then or do; a subshell's or a substitution's close between them reads it in the
// parent, which the exit never reaches, so it stands. A redirect into a null, std, or tty device
// or a descriptor dup never fails to open and is left out. Every guarded one is a remainder but
// the exact allow list's, whose guard gives the answer the exit gives.
const SPECIAL = String.raw`:|\.|break|continue|eval|exec|exit|export|readonly|return|set|shift|times|trap|unset`;
const POSITION = String.raw`(?:^|;|&&|\|\||\||\$\(|${TICK}|(?<!\$)\((?!\()|(?<!\$)\{(?=\s)|!(?=\s)|\b(?:then|do|else|if|elif|while|until)\b)\s*(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*`;
const BUILTIN = new RegExp(`${POSITION}(${SPECIAL})(?=[\\s;)${TICK}]|$)`, 'g');
const REDIRECT = /(?<![<>&0-9])[0-9]*(?:>>|>\||<>|>(?!&)|<(?![<&]))\s*(\S+)/g;
const DEVICE = /^\/dev\/(?:null|stdin|stdout|stderr|tty|fd\/[0-9]+)$/;
const KEYWORD = /(?:^|[\s;])(?:if|elif|while|until|!)\s/g;

const CONFIG_LIB = 'base/.contexture/config-lib';
const TTY_WHY = 'the answer seam\'s stdin switch inside the asking subshell: dash ends the subshell rc 2 at a failed open, the answer its silent || exit 2 gives under bash';
const ALLOW: readonly [file: string, line: string, why: string][] = [
  [CONFIG_LIB, '      exec < "$CTX_PACKAGE_TTY" || exit 2', TTY_WHY],
];
const allowed = new Set(ALLOW.map(([file, line]) => `${file}\n${line}`));

type Redirect = { file: string; line: string; at: number; builtin: string; verdict: 'unguarded' | 'listed' | 'guarded' };

// mask: quoted text kept at its length with its inside blanked, so offsets match the line
const mask = (s: string): string => s.replace(QUOTED, (q) => `${q[0]}${'x'.repeat(q.length - 2)}${q[q.length - 1]}`).replace(/(^|\s)#.*$/, '$1');

// end: where the command starting at <from> stops: a list separator, a pipe, a background, or a
// close at its own depth, a substitution inside it skipped whole
function end(s: string, from: number): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === TICK) {
      const close = s.indexOf(TICK, i + 1);
      if (close < 0) return s.length;
      i = close;
    } else if (c === '(') depth++;
    else if (c === ')') {
      if (depth === 0) return i;
      depth--;
    } else if (depth === 0 && (c === ';' || c === '&' || c === '|')) return i;
  }
  return s.length;
}

// own: the command's words with every substitution inside it blanked
function own(s: string): string {
  let out = '';
  let depth = 0;
  for (const c of s) {
    if (c === '(') depth++;
    out += depth > 0 ? ' ' : c;
    if (c === ')' && depth > 0) depth--;
  }
  return out.replace(new RegExp(`${TICK}[^${TICK}]*${TICK}`, 'g'), (t) => ' '.repeat(t.length));
}

const reads = (gap: string): boolean => !gap.includes(')') && between(gap);

function guarded(s: string, at: number, stop: number): boolean {
  const rest = s.slice(stop);
  const reader = rest.search(/\|\||&&/);
  if (reader >= 0 && reads(rest.slice(0, reader))) return true;
  const head = s.slice(0, at);
  const keyword = [...head.matchAll(KEYWORD)].pop();
  if (!keyword || /\b(?:then|do)\b/.test(head.slice(keyword.index! + keyword[0].length))) return false;
  const close = rest.search(/;\s*(?:then|do)\b/);
  return reads(close >= 0 ? rest.slice(0, close) : rest);
}

function census(root: string) {
  const files = roots(root);
  const redirects: Redirect[] = [];
  for (const file of files) {
    const body = text(file);
    if (!file.endsWith('.sh') && !/^#!.*\b(?:sh|dash|bash)\b/.test(body.split('\n', 1)[0]!)) continue;
    const rel = relative(root, file);
    for (const l of logical(body)) {
      const s = mask(l.text);
      for (const m of s.matchAll(BUILTIN)) {
        const at = m.index! + m[0].length - m[1]!.length;
        const stop = end(s, at + m[1]!.length);
        const words = own(s.slice(at + m[1]!.length, stop));
        const base = at + m[1]!.length;
        for (const r of words.matchAll(REDIRECT)) {
          const target = l.text.slice(base + r.index! + r[0].length - r[1]!.length, base + r.index! + r[0].length).replace(/^["']|["']$/g, '');
          if (DEVICE.test(target)) continue;
          let verdict: Redirect['verdict'] = guarded(s, at, stop) ? 'guarded' : 'unguarded';
          if (verdict === 'guarded' && allowed.has(`${rel}\n${l.first}`)) verdict = 'listed';
          redirects.push({ file: rel, line: l.first, at: l.at, builtin: m[1]!, verdict });
          break;
        }
      }
    }
  }
  return { files: files.length, redirects };
}

const remainder = (redirects: readonly Redirect[]) => redirects.filter((r) => r.verdict === 'guarded').map((r) => `${r.file}:${r.at}: ${r.builtin}: ${r.line.trim()}`);

const STORE = 'base/.contexture/modules/store/scripts/store';

function plantedTree(lines: readonly string[]): string {
  const tree = sandbox('builtin-guard-plant');
  cpSync(join(ROOT, 'base/.contexture/modules/store'), join(tree, 'base/.contexture/modules/store'), { recursive: true });
  appendFileSync(join(tree, STORE), `${lines.join('\n')}\n`);
  return tree;
}

describe.concurrent('the special builtin guard census: no guard reads the redirect of a special builtin', () => {
  it('[the-record-r10, store-r4] every guarded scratch truncation and redirect in the shipped shell runs on a non special builtin, the flagged count equal to unguarded plus listed, no listed entry dead', () => {
    const r = census(ROOT);
    expect(r.files).toBeGreaterThan(100);
    expect(remainder(r.redirects).join('\n')).toBe('');
    const unguarded = r.redirects.filter((x) => x.verdict === 'unguarded');
    const listed = r.redirects.filter((x) => x.verdict === 'listed');
    expect(unguarded.length).toBeGreaterThan(20);
    expect(unguarded.length + listed.length).toBe(r.redirects.length);
    expect([...new Set(listed.map((x) => `${x.file}\n${x.line}`))].sort()).toEqual([...allowed].sort());
  });

  it.each([
    ['a colon truncation in a silent group read by ||', '{ : > "$SCR/x"; } 2>/dev/null || die 2 ERR_STORAGE_WRITE x'],
    ['a colon truncation with a trailing null redirect read by ||', ': > "$SCR/x" 2>/dev/null || die 2 ERR_STORAGE_WRITE x'],
    ['the first colon of an and list read by ||', ': > "$SCR/a" && true > "$SCR/b" || return 1'],
    ['a colon truncation read by && alone', ': > "$SCR/x" && printf x'],
    ['a colon truncation after an assignment word', 'X=1 : > "$SCR/x" || die 2 ERR_STORAGE_WRITE x'],
    ['a colon append as the condition of an if', 'if : >> "$SCR/x"; then printf x; fi'],
    ['a colon truncation as the condition of an elif', 'if [ -n "$X" ]; then printf x; elif : > "$SCR/x"; then printf y; fi'],
    ['an eval redirect read by ||', 'eval "printf x" > "$SCR/x" || die 2 ERR_STORAGE_WRITE x'],
    ['an exec redirect read by ||', 'exec 3> "$SCR/x" || die 2 ERR_STORAGE_WRITE x'],
    ['a guard inside a substitution', 'v=$( { : > "$SCR/x"; } 2>/dev/null || die 2 ERR_STORAGE_WRITE x)'],
  ])('[the-record-r10] %s planted in a module reads red', (_name, line) => {
    const rest = remainder(census(plantedTree([line])).redirects);
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain(line.trim());
  });

  it.each([
    ['a true truncation in a silent group read by ||', '{ true > "$SCR/x"; } 2>/dev/null || die 2 ERR_STORAGE_WRITE x'],
    ['an unguarded colon truncation', ': > "$SCR/x"'],
    ['a colon truncation as the fallback of an ||', 'cmd > "$SCR/x" 2>/dev/null || : > "$SCR/x"'],
    ['a colon whose redirect is a null device', ': 2>/dev/null || die 2 ERR_STORAGE_WRITE x'],
    ['a colon truncation in a subshell read by ||', '( : > "$SCR/x" ) 2>/dev/null || die 2 ERR_STORAGE_WRITE x'],
    ['a colon truncation in a substitution read by ||', 'v=$(: > "$SCR/x") || die 2 ERR_STORAGE_WRITE x'],
    ['a descriptor close', 'exec 3>&- || die 2 ERR_STORAGE_WRITE x'],
    ['a colon expanding a default', ': "${X:=y}" || die 2 ERR_STORAGE_WRITE x'],
    ['a set whose argument holds a redirect in a substitution', 'set -- $(printf x > "$SCR/x") || die 2 ERR_STORAGE_WRITE x'],
  ])('[the-record-r10] a planted line that guards no special builtin redirect adds no remainder: %s', (_name, line) => {
    const r = census(plantedTree([line]));
    expect(remainder(r.redirects)).toEqual([]);
  });
});
