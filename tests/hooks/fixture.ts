import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../support/root';
import { stage } from '../support/stage';

export const FIXTURES = join(ROOT, 'tests/hooks/fixtures/modules');

export function hookSandbox(label: string): string {
  const sb = stage('posix', label);
  cpSync(FIXTURES, join(sb, '.contexture/modules'), { recursive: true });
  return sb;
}

export function marker(sb: string): string[] {
  const path = join(sb, 'marker.log');
  return existsSync(path) ? readFileSync(path, 'utf8').split('\n').filter((l) => l !== '') : [];
}

export function clearMarker(sb: string): void {
  writeFileSync(join(sb, 'marker.log'), '');
}

export const ctxLine = (label: string, point: string, extra: Partial<Record<'unit' | 'anchor' | 'act' | 'slugs' | 'form' | 'page', string>> = {}): string => {
  const v = { unit: 'zz-unit', anchor: 'none', act: 'none', slugs: 'none', form: 'none', page: 'none', ...extra };
  return `${label} point=${point} unit=${v.unit} anchor=${v.anchor} act=${v.act} slugs=${v.slugs} form=${v.form} page=${v.page}`;
};
