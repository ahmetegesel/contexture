import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { kids, walk } from './walk';

// The shared line reader of the shell censuses (the encoder census, the special builtin guard
// census): the shipped files they walk, logical lines with continuations joined, and the test of
// what may stand between a command and the || or condition that reads its status.
export const TICK = '`';
export const QUOTED = /'[^']*'|"(?:[^"\\]|\\.)*"/g;
export const COMMENT = /^[ \t]*(#|\/\/)/;
export const CONDITION = /^\s*(?:if|while|until|!)\s/;

export type Logical = { first: string; at: number; text: string };

// roots: every shipped file but the guides: the base drawer, each plugin's drawer tree and hooks,
// and the installer script
export function roots(root: string): string[] {
  const plugins = kids(join(root, 'plugins'));
  const files = [
    ...walk(join(root, 'base/.contexture')),
    ...plugins.flatMap((p) => [...walk(join(p, '.contexture')), ...walk(join(p, 'hooks'))]),
    ...(existsSync(join(root, 'install.sh')) && statSync(join(root, 'install.sh')).isFile() ? [join(root, 'install.sh')] : []),
  ];
  return files.filter((f) => !f.endsWith('.md'));
}

export function logical(body: string): Logical[] {
  const out: Logical[] = [];
  let open: Logical | null = null;
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

// between: the text between a command and what reads its status holds no list separator but a
// group's close, no pipe, no background, and no backtick
export function between(t: string): boolean {
  const bare = t.replace(QUOTED, '""').replace(/[0-9]*(?:[<>]&[0-9-]+|&>)/g, ' ').replace(/;\s*\}/g, ' }').replace(/&&/g, ' ');
  return !new RegExp(`[;|&${TICK}]`).test(bare);
}
