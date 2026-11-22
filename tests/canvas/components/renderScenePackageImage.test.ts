// DX5 (stage #1903, decisions 16 and 18): a package image (the `image` paint's `asset`) is drawn
// by `renderScene` through the `packageImage` resolver the host injects, bound to the drawing's
// specialization (`specId`). Until the bitmap is ready it is the placeholder (no warning); once
// ready, a `KonvaImage` with the `fit` and the corner radius; a failure is the placeholder with the
// `image-decode-failed` warning. The resolver is the only door: no URL, no consent.
import Konva from 'konva';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas } from '../harness';
import {
  renderScene,
  type PackageImageResult,
} from '../../../src/canvas/components/renderScene';
import {
  approximateMeasurer,
  loadSpecComponents,
  parseSpec,
  type ComponentFile,
} from '../../../src/model';
import { RENDER_WARNING_CODES } from '../../../src/canvas/components/renderWarnings';
import { catalogEnUS, catalogPtBR } from '../../../src/i18n/catalog';
import { instantiate } from '../../../src/model/components/instantiate';
import {
  baseNode,
  type Scene,
  type SceneNode,
} from '../../../src/model/components/scene';

beforeEach(() => installFakeCanvas());
afterEach(() => vi.restoreAllMocks());

const ROOT = join(__dirname, '../../../examples/libraries/drawing-extras');
const SPEC_ID = 'drawing-extras';

/** The `logo` component of the example library, instantiated at its own size. */
function logoScene(values: Record<string, string>): Scene {
  const parsed = parseSpec(
    JSON.parse(readFileSync(join(ROOT, 'drawing-extras.spec.json'), 'utf8')),
  );
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const specFile = `specs/${SPEC_ID}/drawing-extras.spec.json`;
  const loaded = loadSpecComponents(parsed.spec, specFile, 1, (path) => {
    try {
      return readFileSync(join(ROOT, path.slice(`specs/${SPEC_ID}/`.length)), 'utf8');
    } catch {
      return undefined;
    }
  });
  const component = loaded.byType.get('logo') as ComponentFile;
  const { root } = instantiate(
    component,
    values,
    { x: 0, y: 0, width: 360, height: 160 },
    { measure: approximateMeasurer },
  );
  return { root, warnings: [] };
}

const bitmap = (width: number, height: number) =>
  ({ width, height }) as unknown as CanvasImageSource;
const ready = (width = 8, height = 4): PackageImageResult => ({
  state: 'ready',
  image: bitmap(width, height),
  width,
  height,
});

const imagesOf = (root: Konva.Group): Konva.Image[] => root.find('Image');
/** A placeholder is the shape plus the crossed line. */
const crossesOf = (root: Konva.Group): Konva.Line[] =>
  (root.find('Line') as Konva.Line[]).filter((line) => line.points().length === 8);

const VALUES = { variant: 'png', source: 'images/pattern.webp' };

describe('the logo example drawn with the package image resolver', () => {
  it('asks for (specId, asset) of each cited file and records the keys the drawing uses', () => {
    const calls: string[] = [];
    const result = renderScene(logoScene(VALUES), {
      specId: SPEC_ID,
      packageImage: (spec, asset) => {
        calls.push(`${spec}:${asset}`);
        return { state: 'loading' };
      },
    });
    expect(calls).toEqual([
      `${SPEC_ID}:images/logo.png`,
      `${SPEC_ID}:images/logo.png`,
      `${SPEC_ID}:images/pattern.webp`,
    ]);
    expect(result.packageImages).toEqual([
      `${SPEC_ID}\0images/logo.png`,
      `${SPEC_ID}\0images/pattern.webp`,
    ]);
    // No remote URL: nothing for the consent flow or Diagnostics.
    expect(result.imageUrls).toEqual([]);
  });

  it('shows the placeholder, without a warning, while the bitmaps are decoding', () => {
    const result = renderScene(logoScene(VALUES), {
      specId: SPEC_ID,
      packageImage: () => ({ state: 'loading' }),
    });
    expect(imagesOf(result.root)).toHaveLength(0);
    expect(crossesOf(result.root)).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it('draws the image once decoded: cover crops, contain centers, the corner radius applies', () => {
    const result = renderScene(logoScene(VALUES), {
      specId: SPEC_ID,
      packageImage: () => ready(8, 4),
    });
    expect(result.warnings).toEqual([]);
    expect(crossesOf(result.root)).toHaveLength(0);
    const [fixed, byVariant, bySource] = imagesOf(result.root);
    expect(imagesOf(result.root)).toHaveLength(3);
    // `cover` of an 8 x 4 source in an 80 x 80 box: the center square (4 x 4) is cropped.
    expect([fixed?.width(), fixed?.height()]).toEqual([80, 80]);
    expect(fixed?.crop()).toEqual({ x: 2, y: 0, width: 4, height: 4 });
    expect(fixed?.cornerRadius()).toBe(8);
    // `contain` fits the whole source: 80 x 40, centered vertically.
    expect([byVariant?.x(), byVariant?.y()]).toEqual([0, 20]);
    expect([byVariant?.width(), byVariant?.height()]).toEqual([80, 40]);
    expect(byVariant?.cornerRadius()).toBe(40);
    expect(bySource?.cornerRadius()).toBe(8);
  });

  it('a decode failure is the placeholder with the image-decode-failed warning', () => {
    const result = renderScene(logoScene(VALUES), {
      specId: SPEC_ID,
      packageImage: () => ({ state: 'failed', reason: 'decode' }),
    });
    expect(imagesOf(result.root)).toHaveLength(0);
    expect(crossesOf(result.root)).toHaveLength(3);
    expect(result.warnings.map((w) => w.code)).toContain('image-decode-failed');
  });

  it('a refused image is the placeholder with package-image-refused, not the decode warning', () => {
    const result = renderScene(logoScene(VALUES), {
      specId: SPEC_ID,
      packageImage: () => ({ state: 'failed', reason: 'refused' }),
    });
    expect(imagesOf(result.root)).toHaveLength(0);
    expect(crossesOf(result.root)).toHaveLength(3);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).toContain('package-image-refused');
    expect(codes).not.toContain('image-decode-failed');
  });

  it('a missing image is the placeholder with no drawing warning', () => {
    const result = renderScene(logoScene(VALUES), {
      specId: SPEC_ID,
      packageImage: () => ({ state: 'failed', reason: 'missing' }),
    });
    expect(imagesOf(result.root)).toHaveLength(0);
    expect(crossesOf(result.root)).toHaveLength(3);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).not.toContain('package-image-refused');
    expect(codes).not.toContain('image-decode-failed');
  });

  it('package-image-refused is in the list of codes and has text in both locales', () => {
    expect(RENDER_WARNING_CODES).toContain('package-image-refused');
    const key = 'catalog.drawWarning.package-image-refused' as const;
    expect(catalogEnUS[key]).toMatch(/limits/i);
    expect(catalogPtBR[key]).toMatch(/limites/i);
  });

  it('draws each image from the bitmap the resolver gives for its own asset', () => {
    const logo = bitmap(8, 4);
    const pattern = bitmap(4, 8);
    const result = renderScene(logoScene(VALUES), {
      specId: SPEC_ID,
      packageImage: (_spec, asset) =>
        asset === 'images/pattern.webp'
          ? { state: 'ready', image: pattern, width: 4, height: 8 }
          : { state: 'ready', image: logo, width: 8, height: 4 },
    });
    const drawn = imagesOf(result.root).map((image) => image.image());
    expect(drawn).toEqual([logo, logo, pattern]);
  });
});

describe('package image edge cases', () => {
  const nodeWith = (type: 'rect' | 'ellipse'): Scene => {
    const node = {
      ...baseNode({
        id: 'img',
        name: 'img',
        width: 40,
        height: 40,
        fills: [{ type: 'image', asset: 'images/logo.png' }],
      }),
      type,
      ...(type === 'rect' ? { cornerRadius: 0 } : {}),
    } as SceneNode;
    return { root: node, warnings: [] };
  };

  it('without the resolver it stays the placeholder with no warning, and the key is recorded', () => {
    const result = renderScene(nodeWith('rect'), { specId: SPEC_ID });
    expect(imagesOf(result.root)).toHaveLength(0);
    expect(result.warnings).toEqual([]);
    expect(result.packageImages).toEqual([`${SPEC_ID}\0images/logo.png`]);
  });

  it('without a specialization (no specId) nothing is asked and the placeholder stays', () => {
    const packageImage = vi.fn(() => ready());
    const result = renderScene(nodeWith('rect'), { packageImage });
    expect(packageImage).not.toHaveBeenCalled();
    expect(imagesOf(result.root)).toHaveLength(0);
    expect(result.packageImages).toEqual([]);
  });

  it('a resolver that throws is the placeholder, not a broken drawing', () => {
    const result = renderScene(nodeWith('rect'), {
      specId: SPEC_ID,
      packageImage: () => {
        throw new Error('boom');
      },
    });
    expect(imagesOf(result.root)).toHaveLength(0);
    expect(crossesOf(result.root)).toHaveLength(1);
  });

  it('a ready image with no size is the placeholder', () => {
    const result = renderScene(nodeWith('rect'), {
      specId: SPEC_ID,
      packageImage: () => ({ state: 'ready', image: bitmap(0, 0), width: 0, height: 0 }),
    });
    expect(imagesOf(result.root)).toHaveLength(0);
  });

  it('only a rect draws it: an ellipse keeps the placeholder', () => {
    const result = renderScene(nodeWith('ellipse'), {
      specId: SPEC_ID,
      packageImage: () => ready(),
    });
    expect(imagesOf(result.root)).toHaveLength(0);
  });
});
