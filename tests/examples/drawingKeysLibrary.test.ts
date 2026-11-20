// Example library `drawing-keys` (FG1): the icons file in formatVersion 3 with `fillRule`
// (`evenodd`), drawn by the Icon holes component.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseIconsText } from '../../src/model/components/icons';
import { svgToIcon } from '../../src/model/components/svgIcon';
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
        'components/tag.json',
        'docs/icon-holes.md',
        'docs/tag.md',
      ].sort(),
    );
  });

  it('validates with no error or warning on the three levels', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 2, components: 2, docs: 2 });
  });

  it('the Tag reads its padding and height from tokens and draws its tracking in percent', () => {
    const tag = JSON.parse(
      files.find((f) => f.path === 'components/tag.json')?.text ?? '{}',
    );
    expect(tag.sizing.height).toEqual({ $token: 'tag-height' });
    expect(tag.template.layout.padding).toEqual([0, { $token: 'tag-padding' }]);
    expect(JSON.stringify(tag.template.children[0].font.letterSpacing)).toContain('"4%"');
  });

  it('the icons file is formatVersion 3 and the hand-written icons have an evenodd path', () => {
    const text = files.find((f) => f.path === 'icons/icons.json')?.text ?? '';
    const parsed = parseIconsText(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(JSON.parse(text)).toMatchObject({ formatVersion: 3 });
    expect(Object.keys(parsed.set.icons).slice(0, 3)).toEqual([
      'ring',
      'square-hole',
      'star-evenodd',
    ]);
    for (const name of ['ring', 'square-hole', 'star-evenodd'])
      expect(parsed.set.icons[name]!.paths.some((p) => p.fillRule === 'evenodd')).toBe(
        true,
      );
  });

  it('the imported icons are what import_icons writes for the SVG fixtures', () => {
    // The file in the package is the tool's output over `tests/fixtures/svg-icons/` (the error
    // fixture, `icon-transform.svg`, goes to `errors` and is not written).
    const text = files.find((f) => f.path === 'icons/icons.json')?.text ?? '';
    const parsed = parseIconsText(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const imported = Object.keys(parsed.set.icons).slice(3);
    expect(imported).toEqual([
      'icon-current-color',
      'icon-figma-evenodd',
      'icon-flag',
      'icon-shapes',
      'icon-stroked',
    ]);
    for (const name of imported) {
      const source = readFileSync(
        join(__dirname, '../fixtures/svg-icons', `${name}.svg`),
        'utf8',
      );
      const result = svgToIcon(source, { file: `${name}.svg`, defaultViewBox: [24, 24] });
      expect(result.ok, name).toBe(true);
      if (result.ok) expect(parsed.set.icons[name], name).toEqual(result.icon);
    }
    expect(parsed.set.icons['icon-figma-evenodd']!.paths[0]!.fillRule).toBe('evenodd');
    expect(parsed.set.icons['icon-flag']!.viewBox).toEqual([24, 16]);
    expect(Object.keys(parsed.set.icons)).not.toContain('icon-transform');
  });
});
