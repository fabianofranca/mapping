// Example library `drawing-extras`: radial and angular gradients in a node's `fill`, the inner shadow
// and the package images cited by an `image` node's `src` (the Logo type).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
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
  it('has the specialization, three components, three documents and three images', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/gradients.json',
        'components/inner-shadow.json',
        'components/logo.json',
        'docs/gradients.md',
        'docs/inner-shadow.md',
        'docs/logo.md',
        ...IMAGES,
      ].sort(),
    );
  });

  it('validates without errors and without warnings', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ types: 3, components: 3, docs: 3, images: 3 });
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
