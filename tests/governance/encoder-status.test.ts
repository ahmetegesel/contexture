import { appendFileSync, cpSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from '../support/root';
import { sandbox } from '../support/sandbox';
import { kids, text, walk } from './walk';

// A call is the encoder at a command position, after any assignment words and a command, env, or
// shell word. It reads its status as a direct command or the whole right side of an assignment
// with a || after it and nothing between but redirections, the substitution's or a group's close,
// and further && members, or as the condition of an if or a loop before its then or do; inside
// another command's argument or in backticks never.
const TICK = '`';
const POSITION = String.raw`(?:^|;|&&|\|\||\||\$\(|${TICK}|(?<!\$)\((?!\()|(?<!\$)\{(?=\s)|!(?=\s)|\b(?:then|do|else|exec|if|while|until)\b)\s*(?:(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^\s;|&()"'${TICK}])*|command|env|sh|dash|bash)\s+)*`;
const ASSIGNED = /(?:^|;|&&|\|\||(?<!\$)\(|(?<!\$)\{\s|!\s|\b(?:then|do|else|if|while|until)\s)\s*[A-Za-z_][A-Za-z0-9_]*=$/;
const CONDITION = /^\s*(?:if|while|until|!)\s/;
const COMMENT = /^[ \t]*(#|\/\/)/;
const QUOTED = /'[^']*'|"(?:[^"\\]|\\.)*"/g;

const UNIT = 'base/.contexture/modules/unit';
const STORE = 'base/.contexture/modules/store/scripts/store';
const POSIX = 'base/.contexture/storage/drivers/posix/driver';
const DOCS_IO = 'plugins/docs-discipline/.contexture/extensions/modules/docs/scripts/docs-io.sh';

const ALLOW: readonly [file: string, line: string, why: string][] = [
  [POSIX, "  (set -f; IFS='\t'; CDPATH=\"\" cd \"$STORE_WS\" && exec od -An -v -tx1 $1) 2>/dev/null \\", 'the one pass scan: SC_ENC counts the stream against the run\'s sizes, read before and after, and a short or failed od fails the run, which is read again key by key through store-b64'],
  [STORE, "    mi_r=$(od -An -N5 -tu1 /dev/urandom 2>/dev/null | awk -v s=\"$$$mi_n\" 'BEGIN { c = \"abcdefghijklmnopqrstuvwxyz0123456789\" }", 'random bytes for a generated id, never a stored value: the id is checked free before it is written'],
  [DOCS_IO, "  di_seed=$(od -An -N4 -tu4 /dev/urandom 2> /dev/null | tr -dc '0-9')", 'random bytes for a seed, never a stored value'],
];

const allowed = new Set(ALLOW.map(([file, line]) => `${file}\n${line}`));

type Call = { file: string; line: string; at: number; verdict: 'read' | 'listed' | 'embedded' | 'unread' };

function roots(root: string): string[] {
  const plugins = kids(join(root, 'plugins'));
  const files = [
    ...walk(join(root, 'base/.contexture')),
    ...plugins.flatMap((p) => [...walk(join(p, '.contexture')), ...walk(join(p, 'hooks'))]),
    ...(existsSync(join(root, 'install.sh')) && statSync(join(root, 'install.sh')).isFile() ? [join(root, 'install.sh')] : []),
  ];
  return files.filter((f) => !f.endsWith('.md'));
}

function logical(body: string): { first: string; at: number; text: string }[] {
  const out: { first: string; at: number; text: string }[] = [];
  let open: { first: string; at: number; text: string } | null = null;
  body.split('\n').forEach((line, i) => {
    if (!open && COMMENT.test(line)) return;
    if (open) open.text += ` ${line.replace(/\\$/, '')}`;
    else open = { first: line, at: i + 1, text: line.replace(/\\$/, '') };
    if (!/\\$/.test(line)) {
      out.push(open);
      open = null;
    }
  });
  if (open) out.push(open);
  return out;
}

function encoderNames(lines: readonly string[]): string[] {
  const names = new Set<string>();
  const holds = (rhs: string) => !rhs.startsWith('$(') && (rhs.includes('store-b64') || [...names].some((n) => new RegExp(String.raw`\$\{?${n}\b`).test(rhs)));
  for (let grew = true; grew; ) {
    grew = false;
    for (const l of lines) {
      for (const m of l.matchAll(/(?:^|[\s;&|(])([A-Za-z_][A-Za-z0-9_]*)=([^\s;]*)/g)) {
        if (!names.has(m[1]!) && holds(m[2]!)) { names.add(m[1]!); grew = true; }
      }
      for (const m of l.matchAll(/\bfor\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+([^;]*)/g)) {
        if (!names.has(m[1]!) && holds(m[2]!)) { names.add(m[1]!); grew = true; }
      }
    }
  }
  return [...names];
}

function openSubstitution(s: string, at: number): number {
  const stack: number[] = [];
  for (let i = 0; i < at; i++) {
    if (s[i] === '$' && s[i + 1] === '(') { stack.push(i); i++; }
    else if (s[i] === '(') stack.push(-2);
    else if (s[i] === ')') stack.pop();
  }
  for (let i = stack.length - 1; i >= 0; i--) if (stack[i]! >= 0) return stack[i]!;
  return -1;
}

// the text between a call and what reads its status holds no list separator but a group's close,
// no pipe, no background, and no backtick
function between(t: string): boolean {
  const bare = t.replace(QUOTED, '""').replace(/[0-9]*(?:[<>]&[0-9-]+|&>)/g, ' ').replace(/;\s*\}/g, ' }').replace(/&&/g, ' ');
  return !new RegExp(`[;|&${TICK}]`).test(bare);
}

function verdict(s: string, at: number, end: number): 'read' | 'embedded' | 'unread' {
  const head = s.slice(0, at);
  if ((head.replace(/'[^']*'/g, '').split(TICK).length - 1) % 2 === 1) return 'embedded';
  const sub = openSubstitution(s, at);
  if (sub >= 0 && !ASSIGNED.test(s.slice(0, sub))) return 'embedded';
  const rest = s.slice(end);
  const or = rest.indexOf('||');
  if (or >= 0 && between(rest.slice(0, or))) return 'read';
  if (CONDITION.test(s) && !/\b(?:then|do)\b/.test(head.replace(QUOTED, '""')) && between(rest.split(/;\s*(?:then|do)\b/)[0]!)) return 'read';
  return 'unread';
}

function census(root: string) {
  const files = roots(root);
  const calls: Call[] = [];
  for (const file of files) {
    const body = text(file);
    if (!body.includes('store-b64') && !/\bod\s+-/.test(body)) continue;
    const rel = relative(root, file);
    const lines = logical(body);
    const names = encoderNames(lines.map((l) => l.text));
    const word = [String.raw`"?[^\s"=;|&()]*store-b64"?`, ...names.map((n) => String.raw`"?\$\{?${n}\}?"?`), String.raw`(?:/[^\s"'=;|&()]*/)?od(?=\s+-)`].join('|');
    const call = new RegExp(`${POSITION}(${word})(?=[\\s)"]|$)`, 'g');
    for (const l of lines) {
      for (const m of l.text.matchAll(call)) {
        const end = m.index! + m[0].length;
        let v: Call['verdict'] = verdict(l.text, end - m[1]!.length, end);
        if (v === 'unread' && allowed.has(`${rel}\n${l.first}`)) v = 'listed';
        calls.push({ file: rel, line: l.first, at: l.at, verdict: v });
      }
    }
  }
  return { files: files.length, calls };
}

const remainder = (calls: readonly Call[]) => calls.filter((c) => c.verdict === 'embedded' || c.verdict === 'unread').map((c) => `${c.file}:${c.at}: ${c.verdict}: ${c.line.trim()}`);

function plantedTree(lines: readonly string[]): string {
  const tree = sandbox('encoder-plant');
  cpSync(join(ROOT, 'base/.contexture/modules/store'), join(tree, 'base/.contexture/modules/store'), { recursive: true });
  appendFileSync(join(tree, STORE), `${lines.join('\n')}\n`);
  return tree;
}

describe.concurrent('the encoder census: every value encoder call in the shipped code reads its status', () => {
  it('[the-record-r10, store-r4] every call reads its status or stands on the allow list, the flagged count equal to read plus listed, no listed entry dead', () => {
    const r = census(ROOT);
    expect(r.files).toBeGreaterThan(100);
    const read = r.calls.filter((c) => c.verdict === 'read');
    const listed = r.calls.filter((c) => c.verdict === 'listed');
    expect(remainder(r.calls).join('\n')).toBe('');
    expect(read.length).toBeGreaterThan(5);
    expect(read.length + listed.length).toBe(r.calls.length);
    expect(listed.map((c) => `${c.file}\n${c.line}`).sort()).toEqual([...allowed].sort());
  });

  it('[the-record-r10] the census names the calls through a variable assigned from the encoder', () => {
    const r = census(ROOT);
    expect(r.calls.filter((c) => c.file === POSIX && c.line.includes('"$sc_b64"')).map((c) => c.verdict)).toEqual(['read']);
    expect(r.calls.filter((c) => c.file === `${UNIT}/scripts/data` && c.line.includes('"$U_B64"')).map((c) => c.verdict)).toEqual(['read', 'read']);
  });

  it.each([
    ['an encoding embedded in a printf argument', ['printf \'value_b64=%s\\n\' "$("$CORE/store-b64" "$SCR/d.new")"'], 'embedded'],
    ['an assignment whose status nothing reads', ['v=$("$CORE/store-b64" "$SCR/d.new")'], 'unread'],
    ['a piped encoding before its ||', ['v=$("$CORE/store-b64" "$SCR/d.new" | tr -d =) || die 2 ERR_STORAGE_READ x'], 'unread'],
    ['an inline od encoding', ['od -An -v -tu1 "$SCR/d.new" | awk \'{ print }\''], 'unread'],
    ['a call through a variable assigned from the encoder', ['ENC=$CORE/store-b64', '"$ENC" "$SCR/d.new" > "$SCR/out"'], 'unread'],
    ['a status a later command in the substitution hides', ['v=$("$CORE/store-b64" "$SCR/d.new"; true) || die 2 ERR_STORAGE_READ x'], 'unread'],
    ['a || after a later command', ['v=$("$CORE/store-b64" "$SCR/d.new"); [ -n "$v" ] || die 2 ERR_STORAGE_READ x'], 'unread'],
    ['a call in the then body of a condition on something else', ['if [ -s "$SCR/d.new" ]; then v=$("$CORE/store-b64" "$SCR/d.new"); fi'], 'unread'],
    ['a call in the do body of a loop', ['while read -r k; do v=$("$CORE/store-b64" "$k"); done < "$SCR/keys"'], 'unread'],
    ['a call in backticks', ['v=`"$CORE/store-b64" "$SCR/d.new"` || die 2 ERR_STORAGE_READ x'], 'embedded'],
    ['a call after an assignment word', ['v=$(LC_ALL=C "$CORE/store-b64" "$SCR/d.new")'], 'unread'],
    ['a call through command', ['v=$(command "$CORE/store-b64" "$SCR/d.new")'], 'unread'],
    ['a call run by sh', ['v=$(sh "$CORE/store-b64" "$SCR/d.new")'], 'unread'],
    ['an od named by its path', ['/usr/bin/od -An -v -tu1 "$SCR/d.new" | awk \'{ print }\''], 'unread'],
  ])('[the-record-r10] %s planted in a module reads red', (_name, lines, kind) => {
    const r = census(plantedTree(lines));
    const rest = remainder(r.calls);
    expect(rest).toHaveLength(1);
    expect(rest[0]).toContain(`${kind}: ${lines[lines.length - 1]!.trim()}`);
  });

  it.each([
    ['an assignment with its ||', 'v=$("$CORE/store-b64" "$SCR/d.new" 2>/dev/null) || die 2 ERR_STORAGE_READ x', ['read']],
    ['the condition of an if', 'if v=$("$CORE/store-b64" "$SCR/d.new" 2>/dev/null); then printf x; fi', ['read']],
    ['a group whose || reads its last command', '{ "$CORE/store-b64" "$SCR/d.new" > "$SCR/out"; } 2>/dev/null || die 2 ERR_STORAGE_READ x', ['read']],
    ['an and list read by one ||', 'a=$("$CORE/store-b64" "$SCR/a") && b=$("$CORE/store-b64" "$SCR/b") || die 2 ERR_STORAGE_READ x', ['read', 'read']],
  ])('[the-record-r10] a planted call that reads its status adds no remainder: %s', (_name, line, verdicts) => {
    const r = census(plantedTree([line]));
    expect(remainder(r.calls)).toEqual([]);
    expect(r.calls.filter((c) => c.line === line).map((c) => c.verdict)).toEqual(verdicts);
  });
});
