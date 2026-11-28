// Example library `drawing-fidelity`: an expression in each `cornerRadius` item (the Corner card), in
// `image.fit` (the Photo) and in the shadow numbers (the Signal), partial `sides` that follow the
// radius (the Divider), `stroke.cornerRadius` (the Link) and `overlay` (the Scroll and the Block) and
// `backdropBlur` (the Header). Later phases of the stage add types.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { parseIconsText } from '../../src/model/components/icons';
import { parseComponent } from '../../src/model/components/parseComponent';
import { splitOverlay } from '../../src/model/components/overlay';
import { walk, type FrameNode, type SceneNode } from '../../src/model/components/scene';
import { sideStrokes } from '../../src/model/components/strokeSides';
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
  it('has the specialization, eight components, eight documents, the icon set and one image', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/block.json',
        'components/corner-card.json',
        'components/divider.json',
        'components/header.json',
        'components/link.json',
        'components/photo.json',
        'components/scroll.json',
        'components/signal.json',
        'docs/block.md',
        'docs/corner-card.md',
        'docs/divider.md',
        'docs/header.md',
        'docs/link.md',
        'docs/photo.md',
        'docs/scroll.md',
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
    expect(report.summary).toMatchObject({ types: 8, components: 8, docs: 8, images: 1 });
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

  it('draws the Divider bottom stroke as a band that follows the arcs and tapers', () => {
    const { root, warnings } = draw('divider', { elevated: 'true' });
    expect(warnings).toEqual([]);
    const { stroke, cornerRadius } = root as unknown as {
      stroke: Parameters<typeof sideStrokes>[0];
      cornerRadius: number;
    };
    expect(stroke.sides).toEqual(['bottom']);
    const { lines, bands } = sideStrokes(stroke, 200, 16, cornerRadius);
    expect(lines).toEqual([]);
    expect(bands).toHaveLength(1);
    // The band reaches the tangent points of the arcs, where it is 0 thick.
    expect(bands[0]!.some((p) => Math.hypot(p.x, p.y - 8) < 1e-6)).toBe(true);
    expect(bands[0]!.some((p) => Math.hypot(p.x - 200, p.y - 8) < 1e-6)).toBe(true);
  });

  it('draws the Divider without the stroke when elevated is false', () => {
    expect(draw('divider', { elevated: 'false' }).root.stroke).toBeUndefined();
  });

  it('gives the Link ring its own radius: 4 outside and 2 inside', () => {
    const { root, warnings } = draw('link', { focused: 'true' });
    expect(warnings).toEqual([]);
    const ring = root.children.find((c) => c.name === 'ring') as unknown as {
      cornerRadius: number;
      stroke: { cornerRadius: number; offset: number; width: number; align: string };
    };
    expect(ring.cornerRadius).toBe(0);
    expect(ring.stroke).toMatchObject({
      cornerRadius: 4,
      offset: 2,
      width: 2,
      align: 'inside',
    });
  });

  it('draws the Link without the ring when focused is false', () => {
    const { root } = draw('link', { focused: 'false' });
    expect(root.children.find((c) => c.name === 'ring')?.stroke).toBeUndefined();
  });

  it('flags the Scroll scrollbar as an overlay and keeps it out of the base', () => {
    const { root, warnings } = draw('scroll', {});
    expect(warnings).toEqual([]);
    const bar = [...walk(root)].find((n) => n.name === 'scrollbar');
    expect(bar).toMatchObject({ overlay: true, width: 4, height: 80 });
    const { base, overlay } = splitOverlay(root);
    expect([...walk(base)].map((n) => n.name)).not.toContain('scrollbar');
    expect([...walk(overlay as SceneNode)].map((n) => n.name)).toContain('scrollbar');
  });

  it('draws the Header bar as a translucent overlay with a backdrop blur', () => {
    const { root, warnings } = draw('header', {});
    expect(warnings).toEqual([]);
    const nodes = [...walk(root)];
    const bar = nodes.find((n) => n.name === 'bar');
    expect(bar).toMatchObject({
      type: 'frame',
      overlay: true,
      backdropBlur: 16,
      width: 200,
      height: 56,
    });
    // The bar sits at the top: its translate (e, f) is 0, 0.
    expect(bar!.transform.slice(4)).toEqual([0, 0]);
    const fill = (bar as unknown as { fills: { color: string }[] }).fills[0]!;
    expect(fill.color.toUpperCase()).toBe('#FFFFFFB3');
    expect(nodes.find((n) => n.name === 'chip')).toMatchObject({
      type: 'rect',
      backdropBlur: 4,
    });
    const template = JSON.parse(text('components/header.json')).template as {
      children: { type: string; name: string }[];
    };
    expect(template.children.some((c) => c.type === 'slot' && c.name === 'content')).toBe(
      true,
    );
  });

  it('draws the Block fill from the color field', () => {
    const fill = (color: string) => {
      const { root, warnings } = draw('block', { color });
      expect(warnings, color).toEqual([]);
      return (root.fills[0] as { color: string }).color;
    };
    expect(fill('blue')).toBe('#93C5FD');
    expect(fill('green')).toBe('#86EFAC');
    expect(fill('amber')).toBe('#FCD34D');
  });
});
