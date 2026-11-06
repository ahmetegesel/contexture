import { constants, cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { inject } from 'vitest';
import { sandbox } from './sandbox';
import { stage, type Driver } from './stage';

export async function seed(build: (sb: string) => Promise<void>, driver: Driver = 'posix', label = 'seed'): Promise<string> {
  const sb = stage(driver, label);
  await build(sb);
  return sb;
}

function copy(src: string, label: string): string {
  const sb = sandbox(label);
  cpSync(src, sb, { recursive: true, mode: constants.COPYFILE_FICLONE, preserveTimestamps: true });
  return sb;
}

export function fresh(snapshot: string): string {
  return copy(snapshot, `${basename(snapshot)}-copy`);
}

export interface Step {
  name: string;
  from?: string;
  build: (sb: string) => Promise<void>;
}

async function published(path: string): Promise<string> {
  for (;;) {
    if (existsSync(path)) return path;
    if (existsSync(`${path}.failed`)) throw new Error(`the snapshot ${basename(path)} failed in another worker: ${readFileSync(`${path}.failed`, 'utf8')}`);
    await new Promise((done) => setTimeout(done, 50));
  }
}

async function publish(path: string, build: () => Promise<string>): Promise<string> {
  if (existsSync(path)) return path;
  try {
    mkdirSync(`${path}.lock`);
  } catch {
    return published(path);
  }
  try {
    renameSync(await build(), path);
    return path;
  } catch (e) {
    writeFileSync(`${path}.failed`, String(e));
    throw e;
  }
}

export function seedSteps(id: string, steps: readonly Step[], driver: Driver = 'posix'): (name: string) => Promise<string> {
  const parent = new Map(steps.map((s, i) => [s.name, s.from ?? steps[i - 1]?.name]));
  const build = new Map(steps.map((s) => [s.name, s.build]));
  const memo = new Map<string, Promise<string>>();
  const snap = (name: string): Promise<string> => {
    const known = memo.get(name);
    if (known) return known;
    const make = build.get(name);
    if (!make) throw new Error(`no snapshot step '${name}'`);
    const from = parent.get(name);
    const label = `${id}-${name}`;
    const made = publish(join(inject('sandboxRoot'), label), async () => {
      const sb = from === undefined ? stage(driver, `${label}-build`) : copy(await snap(from), `${label}-build`);
      await make(sb);
      return sb;
    });
    memo.set(name, made);
    return made;
  };
  return snap;
}
