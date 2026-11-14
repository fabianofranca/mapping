// Example people library (`tests/fixtures/pessoas/`, RI1): the package validates with no
// error and the Avatar draws the remote image (reserved without a URL, with the URL when the photo exists).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { buildCatalog, drawEntry, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import type { SceneNode } from '../../src/model/components/scene';

const ROOT = join(__dirname, '../../tests/fixtures/pessoas');
const SPEC_FILE = 'pessoas.spec.json';

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

function flatten(node: SceneNode, out: SceneNode[] = []): SceneNode[] {
  out.push(node);
  if (node.type === 'frame') node.children.forEach((c) => flatten(c, out));
  return out;
}

describe('people example library', () => {
  it('has the specialization, the component and the document of the Avatar', () => {
    expect(files.map((f) => f.path)).toEqual(
      [SPEC_FILE, 'components/avatar.json', 'docs/avatar.md'].sort(),
    );
  });

  it('validates with no error on the three levels and no warning', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 1, components: 1, docs: 1 });
  });

  it('the component is formatVersion 3', () => {
    const catalog = buildCatalog(files);
    expect(catalog.report.errors).toEqual([]);
    expect(findEntry(catalog, 'avatar')?.component?.formatVersion).toBe(3);
  });

  const imagePaint = (
    node: SceneNode | undefined,
  ): Record<string, unknown> | undefined =>
    node?.type === 'rect'
      ? (node.fills.find((f) => f.type === 'image') as
          Record<string, unknown> | undefined)
      : undefined;

  it('without a photo in the preview, the Avatar draws the image paint without url and the name', () => {
    const catalog = buildCatalog(files);
    const entry = findEntry(catalog, 'avatar');
    const drawing = drawEntry(entry!, entry!.previewValues ?? {}, approximateMeasurer);
    expect(drawing?.warnings).toEqual([]);
    const nodes = drawing ? flatten(drawing.root) : [];
    const paint = imagePaint(nodes.find((n) => n.type === 'rect'));
    expect(paint).toMatchObject({ type: 'image', fit: 'cover' });
    expect(paint?.url).toBeUndefined();
    expect(nodes.flatMap((n) => (n.type === 'text' ? [n.text] : []))).toEqual([
      'Ana Souza',
    ]);
  });

  it('with the photo filled in, the image paint carries the url', () => {
    const catalog = buildCatalog(files);
    const entry = findEntry(catalog, 'avatar');
    const drawing = drawEntry(
      entry!,
      { nome: 'Ana Souza', foto: 'https://exemplo.invalid/a.png' },
      approximateMeasurer,
    );
    const rect = drawing
      ? flatten(drawing.root).find((n) => n.type === 'rect')
      : undefined;
    expect(imagePaint(rect)).toMatchObject({
      type: 'image',
      fit: 'cover',
      url: 'https://exemplo.invalid/a.png',
    });
  });
});
