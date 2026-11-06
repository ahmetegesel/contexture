import { join } from 'node:path';
import { put } from './tree';

export type Root = 'modules' | 'extensions';

export function moduleRoot(sb: string, root: Root): string {
  return join(sb, root === 'modules' ? '.contexture/modules' : '.contexture/extensions/modules');
}

export interface ModuleSpec {
  manifest?: string;
  files?: Record<string, string>;
}

export function writeModule(sb: string, root: Root, name: string, { manifest, files = {} }: ModuleSpec): string {
  const dir = join(moduleRoot(sb, root), name);
  if (manifest !== undefined) put(join(dir, 'module'), manifest);
  for (const [rel, text] of Object.entries(files)) put(join(dir, rel), text, 0o755);
  return dir;
}

export const shVerb = (summary: string, body: string, ...detail: string[]): string =>
  ['#!/bin/sh', `# summary: ${summary}`, ...detail, body, ''].join('\n');

export const filter = (headers: Record<string, string>, program: string): string =>
  ['#!/usr/bin/awk -f', ...Object.entries(headers).map(([k, v]) => `# ${k}: ${v}`), program, ''].join('\n');

export const hook = (point: string, body: string, block = false): string =>
  ['#!/bin/sh', `# ctx-hook: ${point}`, ...(block ? ['# ctx-hook-mode: block'] : []), body, ''].join('\n');
