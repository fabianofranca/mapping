// Example library `drawing-keys` (FG1): the icons file in formatVersion 3 with `fillRule`
// (`evenodd`), drawn by the Icon holes component.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIconsText } from '../../src/model/components/icons';
import { validateLibrary } from '../../src/model/library';

const ROOT = join(__dirname, '../../examples/libraries/drawing-keys');
const SPEC_FILE = 'drawing-keys.spec.json';

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));

describe('example library drawing-keys', () => {
  it('has the specialization, the icons file, the component and its document', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'icons/icons.json',
        'components/icon-holes.json',
        'docs/icon-holes.md',
      ].sort(),
    );
  });

  it('validates with no error or warning on the three levels', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 1, components: 1, docs: 1 });
  });

  it('the icons file is formatVersion 3 and every icon has an evenodd path', () => {
    const text = files.find((f) => f.path === 'icons/icons.json')?.text ?? '';
    const parsed = parseIconsText(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(JSON.parse(text)).toMatchObject({ formatVersion: 3 });
    expect(Object.keys(parsed.set.icons)).toEqual([
      'ring',
      'square-hole',
      'star-evenodd',
    ]);
    for (const def of Object.values(parsed.set.icons))
      expect(def.paths.some((p) => p.fillRule === 'evenodd')).toBe(true);
  });
});
