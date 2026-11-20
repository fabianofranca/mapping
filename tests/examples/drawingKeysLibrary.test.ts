// Example library `drawing-keys` (FG1): the icons file in formatVersion 3 with `fillRule`
// (`evenodd`), drawn by the Icon holes component.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalog, drawEntry, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import type { SceneNode } from '../../src/model/components/scene';
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
        'components/flag.json',
        'components/icon-holes.json',
        'components/pressed-button.json',
        'components/tag.json',
        'docs/flag.md',
        'docs/icon-holes.md',
        'docs/pressed-button.md',
        'docs/tag.md',
      ].sort(),
    );
  });

  it('validates with no error or warning on the three levels', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 4, components: 4, docs: 4 });
  });

  it('the Tag reads its padding and height from tokens and draws its tracking in percent', () => {
    const tag = JSON.parse(
      files.find((f) => f.path === 'components/tag.json')?.text ?? '{}',
    );
    expect(tag.sizing.height).toEqual({ $token: 'tag-height' });
    expect(tag.template.layout.padding).toEqual([0, { $token: 'tag-padding' }]);
    expect(JSON.stringify(tag.template.children[0].font.letterSpacing)).toContain('"4%"');
  });

  it('the Pressed button scales its root by 0.96 when pressed, and the Flag inside scales along', () => {
    const entry = findEntry(buildCatalog(files), 'pressed-button')!;
    expect(entry).toBeDefined();
    const pressed = drawEntry(entry, { state: 'pressed' }, approximateMeasurer)!;
    expect(pressed.warnings).toEqual([]);
    expect(pressed.root.scale).toBe(0.96);
    const inner = pressed.root.children.find((c) => c.name === 'flag');
    expect(inner?.type).toBe('frame');
    // The inner drawing has no scale of its own: it scales through the root's.
    expect(inner?.scale).toBeUndefined();
    const rest = drawEntry(entry, { state: 'default' }, approximateMeasurer)!;
    expect(rest.root.scale).toBeUndefined();
    const spec = JSON.parse(
      files.find((f) => f.path === 'components/pressed-button.json')!.text,
    );
    expect(JSON.stringify(spec.template.children)).toContain('"type":"component"');
  });

  it('the disabled Flag draws gray (R = G = B) and the enabled one keeps its color', () => {
    const entry = findEntry(buildCatalog(files), 'flag')!;
    expect(entry).toBeDefined();
    const fillsOf = (disabled: boolean): string[] => {
      const drawing = drawEntry(
        entry,
        { disabled: String(disabled) },
        approximateMeasurer,
      )!;
      expect(drawing.warnings).toEqual([]);
      const out: string[] = [];
      const visit = (node: SceneNode): void => {
        if ('fills' in node)
          for (const paint of node.fills)
            if (paint.type === 'solid') out.push(paint.color);
        if ('children' in node) node.children.forEach(visit);
      };
      visit(drawing.root);
      return out;
    };
    const channels = (color: string): number[] => {
      const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(color);
      expect(m, color).not.toBeNull();
      return [1, 2, 3].map((i) => parseInt(m![i]!, 16));
    };
    const gray = fillsOf(true);
    expect(gray.length).toBeGreaterThan(0);
    for (const color of gray) {
      const [r, g, b] = channels(color);
      expect(Math.abs(r! - g!), color).toBeLessThanOrEqual(1);
      expect(Math.abs(g! - b!), color).toBeLessThanOrEqual(1);
    }
    expect(fillsOf(false).some((c) => new Set(channels(c)).size > 1)).toBe(true);
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
