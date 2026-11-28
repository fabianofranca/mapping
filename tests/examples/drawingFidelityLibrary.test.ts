// Example library `drawing-fidelity`: an expression in each `cornerRadius` item (the Corner card), in
// `image.fit` (the Photo) and in the shadow numbers (the Signal). Later phases of the stage add types.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { parseIconsText } from '../../src/model/components/icons';
import { parseComponent } from '../../src/model/components/parseComponent';
import type { FrameNode, SceneNode } from '../../src/model/components/scene';
import { detectFormat, readSize } from '../../src/model/imageHeader';
import { validateLibrary, type LibraryFile } from '../../src/model/library';

const ROOT = join(__dirname, '../../examples/libraries/drawing-fidelity');
const SPEC_FILE = 'drawing-fidelity.spec.json';

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const IMAGE = /\.(png|jpe?g|webp)$/i;

const files: LibraryFile[] = listDisk(ROOT)
  .sort()
  .map((path) =>
    IMAGE.test(path)
      ? { path, binary: true, bytes: new Uint8Array(readFileSync(join(ROOT, path))) }
      : { path, text: readFileSync(join(ROOT, path), 'utf8') },
  );
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';

/** Draws a component of the package with the given values and returns its first child and the warnings. */
function draw(id: string, values: Record<string, string>) {
  const parsed = parseComponent(JSON.parse(text(`components/${id}.json`)));
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const { size } = parsed.component;
  const icons = parseIconsText(text('icons/icons.json'));
  if (!icons.ok) throw new Error(icons.errors.join('\n'));
  const result = instantiate(
    parsed.component,
    values,
    { x: 0, y: 0, ...size },
    { measure: approximateMeasurer, icons: icons.set },
  );
  return { root: result.root as FrameNode, warnings: result.warnings };
}

describe('example library drawing-fidelity', () => {
  it('has the specialization, three components, three documents, the icon set and one image', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/corner-card.json',
        'components/photo.json',
        'components/signal.json',
        'docs/corner-card.md',
        'docs/photo.md',
        'docs/signal.md',
        'icons/icons.json',
        'images/photo.png',
      ].sort(),
    );
  });

  it('validates without errors and without warnings', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ types: 3, components: 3, docs: 3, images: 1 });
  });

  it('has a 96 × 48 PNG image', () => {
    const data =
      files.find((f) => f.path === 'images/photo.png')?.bytes ?? new Uint8Array();
    expect(detectFormat(data)).toBe('png');
    expect(readSize(data, 'png')).toEqual({ width: 96, height: 48 });
  });

  it('draws the Corner card corners from the top and bottom fields', () => {
    const radius = (top: string, bottom: string) =>
      (
        draw('corner-card', { top, bottom }).root as SceneNode & {
          cornerRadius?: unknown;
        }
      ).cornerRadius;
    expect(radius('round', 'square')).toEqual([16, 16, 0, 0]);
    expect(radius('square', 'round')).toEqual([0, 0, 16, 16]);
    expect(radius('round', 'round')).toEqual([16, 16, 16, 16]);
    expect(draw('corner-card', { top: 'round', bottom: 'square' }).warnings).toEqual([]);
  });

  it('draws the Photo with each fit of the fit field', () => {
    for (const fit of ['cover', 'contain', 'fill', 'none']) {
      const { root, warnings } = draw('photo', { fit });
      const fills = (
        root.children[0] as unknown as { fills: { type: string; fit?: string }[] }
      ).fills;
      expect(fills.find((f) => f.type === 'image')?.fit, fit).toBe(fit);
      expect(warnings, fit).toEqual([]);
    }
  });

  it('draws the Signal shadow with the y and blur of the size field', () => {
    const shadow = (size: string) => {
      const { root, warnings } = draw('signal', { size });
      expect(warnings, size).toEqual([]);
      return (
        root.children[0] as unknown as {
          effects: { offset: { y: number }; blur: number }[];
        }
      ).effects[0];
    };
    expect(shadow('s')).toMatchObject({ offset: { y: 2 }, blur: 4 });
    expect(shadow('m')).toMatchObject({ offset: { y: 4 }, blur: 8 });
    expect(shadow('l')).toMatchObject({ offset: { y: 8 }, blur: 16 });
  });

  it('puts the icon of the set on top of the Signal base', () => {
    const { root } = draw('signal', { size: 'm' });
    expect(root.children.map((c) => c.name)).toEqual(['base', 'signal']);
  });

  it('gives the Signal icon an outer shadow and an inner one', () => {
    const { root, warnings } = draw('signal', { size: 'm' });
    expect(warnings).toEqual([]);
    const icon = root.children[1] as unknown as { effects: { inner?: boolean }[] };
    expect(icon.effects.map((e) => e.inner === true)).toEqual([false, true]);
  });
});
