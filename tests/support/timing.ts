import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Reporter, ReportedHookContext, TestModule, Vitest } from 'vitest/node';

interface Timed {
  project: string;
  name: string;
  ms: number;
}

interface Span {
  project: string;
  files: number;
  tests: number;
  start: number;
  end: number;
}

const s = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;
const top = (items: readonly Timed[], n = 10): Timed[] => [...items].sort((a, b) => b.ms - a.ms).slice(0, n);

export default class Timing implements Reporter {
  private file = '';
  private readonly modules = new Map<string, number>();
  private readonly spans = new Map<string, Span>();
  private readonly hooks = new Map<string, number>();
  private readonly hookTimes: Timed[] = [];

  onInit(vitest: Vitest): void {
    this.file = join(vitest.config.root, '.reports', 'timing.json');
  }

  onTestModuleStart(m: TestModule): void {
    this.modules.set(m.moduleId, Date.now());
  }

  onTestModuleEnd(m: TestModule): void {
    const start = this.modules.get(m.moduleId) ?? Date.now();
    const span = this.spans.get(m.project.name) ?? { project: m.project.name, files: 0, tests: 0, start, end: start };
    span.files += 1;
    span.tests += [...m.children.allTests()].filter((t) => t.diagnostic() !== undefined).length;
    span.start = Math.min(span.start, start);
    span.end = Math.max(span.end, Date.now());
    this.spans.set(m.project.name, span);
  }

  onHookStart(hook: ReportedHookContext): void {
    if (hook.name === 'beforeAll') this.hooks.set(hook.entity.id, Date.now());
  }

  onHookEnd(hook: ReportedHookContext): void {
    const start = this.hooks.get(hook.entity.id);
    if (hook.name !== 'beforeAll' || start === undefined) return;
    const where = hook.entity.type === 'module' ? hook.entity.relativeModuleId : `${hook.entity.module.relativeModuleId} > ${hook.entity.fullName}`;
    this.hookTimes.push({ project: hook.entity.project.name, name: where, ms: Date.now() - start });
  }

  onTestRunEnd(modules: ReadonlyArray<TestModule>): void {
    const tests: Timed[] = modules.flatMap((m) =>
      [...m.children.allTests()].flatMap((t) => {
        const d = t.diagnostic();
        return d ? [{ project: m.project.name, name: `${m.relativeModuleId} > ${t.fullName}`, ms: d.duration }] : [];
      }),
    );
    const spans = [...this.spans.values()].filter((p) => p.tests > 0).sort((a, b) => a.start - b.start);
    if (spans.length === 0) return;
    const t0 = spans[0].start;
    const wall = Math.max(...spans.map((p) => p.end)) - t0;
    const lines = [
      `timing: ${tests.length} tests in ${spans.length} projects, ${s(wall)} from the first file start to the last file end`,
      'timing: per project (wall, its window in the run, files, tests):',
      ...spans.map((p) => `  ${p.project} ${s(p.end - p.start)} (${s(p.start - t0)} to ${s(p.end - t0)}) ${p.files} files ${p.tests} tests`),
      'timing: slowest tests:',
      ...top(tests).map((t) => `  ${s(t.ms)} ${t.project} ${t.name}`),
      'timing: slowest beforeAll hooks:',
      ...top(this.hookTimes, 5).map((t) => `  ${s(t.ms)} ${t.project} ${t.name}`),
      `timing: written to ${this.file}`,
    ];
    mkdirSync(join(this.file, '..'), { recursive: true });
    const record = {
      wallMs: wall,
      projects: spans.map((p) => ({ project: p.project, wallMs: p.end - p.start, fromMs: p.start - t0, toMs: p.end - t0, files: p.files, tests: p.tests })),
      tests: top(tests, tests.length),
      beforeAll: top(this.hookTimes, this.hookTimes.length),
    };
    writeFileSync(this.file, `${JSON.stringify(record, null, 1)}\n`);
    process.stdout.write(`\n${lines.join('\n')}\n`);
  }
}
