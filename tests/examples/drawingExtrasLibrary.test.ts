// Example library `drawing-extras`: radial and angular gradients in a node's `fill`, the inner shadow
// the package images cited by an `image` node's `src` (the Logo type) and the grid with uneven tracks
// (the Uneven grid type).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import { detectFormat, readSize } from '../../src/model/imageHeader';
import { validateLibrary, type LibraryFile } from '../../src/model/library';

const ROOT = join(__dirname, '../../examples/libraries/drawing-extras');
const SPEC_FILE = 'drawing-extras.spec.json';

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const IMAGE = /\.(png|jpe?g|webp)$/i;
const IMAGES = ['images/logo.png', 'images/photo.jpg', 'images/pattern.webp'];
const IMAGE_SIDE = 96;

// Images are read as bytes (the validator checks format, size and dimensions); the rest as text.
const files: LibraryFile[] = listDisk(ROOT)
  .sort()
  .map((path) =>
    IMAGE.test(path)
      ? { path, binary: true, bytes: new Uint8Array(readFileSync(join(ROOT, path))) }
      : { path, text: readFileSync(join(ROOT, path), 'utf8') },
  );
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';
const bytes = (path: string): Uint8Array =>
  files.find((f) => f.path === path)?.bytes ?? new Uint8Array();

describe('example library drawing-extras', () => {
  it('has the specialization, four components, four documents and three images', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/gradients.json',
        'components/inner-shadow.json',
        'components/logo.json',
        'components/uneven-grid.json',
        'docs/gradients.md',
        'docs/inner-shadow.md',
        'docs/logo.md',
        'docs/uneven-grid.md',
        ...IMAGES,
      ].sort(),
    );
  });

  it('validates without errors and without warnings', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ types: 4, components: 4, docs: 4, images: 3 });
  });

  it('draws the three gradient types, one of them from a $switch', () => {
    const json = text('components/gradients.json');
    for (const type of ['radial', 'angular', 'linear']) {
      expect(json).toContain(`"type": "${type}"`);
    }
    expect(json).toContain('"$switch": "kind"');
  });

  it('draws a sunken field, a pressed button with two inner shadows and a raised one', () => {
    const json = text('components/inner-shadow.json');
    expect(json.match(/"inner": true/g)).toHaveLength(3);
    expect(json).toContain('"name": "field"');
    expect(json).toContain('"name": "pressed"');
    expect(json).toContain('"name": "raised"');
  });

  it('draws the Logo with a literal path, a $switch over variant and a $field source', () => {
    const json = text('components/logo.json');
    expect(json).toContain('"src": "images/logo.png"');
    expect(json).toContain('"$switch": "variant"');
    expect(json).toContain('"png": "images/logo.png"');
    expect(json).toContain('"jpeg": "images/photo.jpg"');
    expect(json).toContain('"webp": "images/pattern.webp"');
    expect(json).toContain('"$field": "source"');
  });

  it('draws the Uneven grid with a px, a 1fr and a hug column and a 12-column grid with spans', () => {
    const component = JSON.parse(text('components/uneven-grid.json')) as {
      template: {
        children: { name: string; layout: { columns: unknown }; children: unknown[] }[];
      };
    };
    const [row, twelve] = component.template.children;
    expect(row?.name).toBe('list-row');
    expect(row?.layout.columns).toEqual([56, '1fr', 'hug']);
    expect(twelve?.name).toBe('twelve-columns');
    expect(twelve?.layout.columns).toEqual(Array.from({ length: 12 }, () => '1fr'));
    const spans = (twelve?.children as { span: number }[]).map((child) => child.span);
    expect(spans).toEqual([8, 4, 4, 4, 4, 3, 3, 3, 3]);
  });

  it('lays the Uneven grid out: 56 px, then 1fr, then the width of the hug text', () => {
    const file = JSON.parse(text('components/uneven-grid.json')) as { preview: object };
    const box = { x: 0, y: 0, width: 360, height: 176 };
    const result = instantiate(file as never, file.preview as never, box, {
      measure: approximateMeasurer,
    });
    const boxes = absoluteBoxes(result.root);
    const nodes = [...walk(result.root)];
    const at = (name: string) => {
      const node = nodes.find((n) => n.name === name);
      if (node === undefined) throw new Error(`no node ${name}`);
      return { x: boxes.get(node.id)?.x ?? 0, width: node.width };
    };
    expect(result.warnings).toEqual([]);
    // content 336 wide, gap 12: the leading column is 56 and the trailing one hugs its text.
    expect(at('leading')).toEqual({ x: 12, width: 56 });
    const trailing = at('trailing');
    expect(trailing.x + trailing.width).toBeCloseTo(348, 5);
    expect(at('texts').x).toBe(12 + 56 + 12);
    expect(at('texts').width).toBeCloseTo(trailing.x - 12 - (12 + 56 + 12), 5);
    // twelve tracks of (336 − 11 × 4) / 12: span 8 covers eight of them and seven gaps.
    const track = (336 - 44) / 12;
    expect(at('wide').width).toBeCloseTo(8 * track + 7 * 4, 5);
    expect(at('narrow').width).toBeCloseTo(4 * track + 3 * 4, 5);
  });

  it('has package images of the format of their extension, square and under 1 MB', () => {
    const expected = { png: 'png', jpg: 'jpeg', webp: 'webp' } as const;
    for (const path of IMAGES) {
      const data = bytes(path);
      const format = detectFormat(data);
      expect(format, path).toBe(expected[path.split('.').pop() as keyof typeof expected]);
      expect(readSize(data, format!), path).toEqual({
        width: IMAGE_SIDE,
        height: IMAGE_SIDE,
      });
      expect(data.length, path).toBeLessThan(1024 * 1024);
    }
  });

  it('reports a cited image that is missing or whose content is of another format', () => {
    const missing = validateLibrary({
      files: files.filter((f) => f.path !== 'images/photo.jpg'),
      specPath: SPEC_FILE,
    });
    expect(missing.errors.map((e) => e.message)).toContain(
      'file not found: images/photo.jpg',
    );

    const swapped = validateLibrary({
      files: files.map((f) =>
        f.path === 'images/logo.png' ? { ...f, bytes: bytes('images/photo.jpg') } : f,
      ),
      specPath: SPEC_FILE,
    });
    expect(swapped.errors.map((e) => e.message)).toContain(
      'image is not PNG, JPEG or WebP: images/logo.png',
    );
  });
});
