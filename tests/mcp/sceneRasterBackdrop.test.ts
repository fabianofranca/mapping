// DG6 (#2915): `backdropBlur` in the MCP PNG: a gaussian blur (sigma = backdropBlur × scale) of what is
// already painted under the node's outline, clipped to that outline and drawn before the node's fill.
import {
  mkdtempSync,
  rmSync,
  cpSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applySpecialization,
  approximateMeasurer,
  createProject,
  parseSpecText,
  serialize,
} from '../../src/model';
import { baseNode, type SceneNode } from '../../src/model/components/scene';
import { runBatch } from '../../mcp/batch';
import { decodeImage } from '../../mcp/image/codecs';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { Refs } from '../../mcp/items';
import type { Operation } from '../../mcp/operations';
import { Roots } from '../../mcp/paths';
import { findProject, loadProject } from '../../mcp/projects';
import { renderContainer } from '../../mcp/renderImage';
import { NOW } from '../model/fixtures';

const RED = [255, 0, 0, 255];
const BLUE = [0, 0, 255, 255];

const pixel = (r: Raster, x: number, y: number): number[] => {
  const i = (y * r.width + x) * 4;
  return [...r.data.subarray(i, i + 4)];
};

function paint(raster: Raster, root: SceneNode): void {
  paintScene(raster, [{ root }], approximateMeasurer, {
    clip: { x: 0, y: 0, width: raster.width, height: raster.height },
    scaleX: 1,
    scaleY: 1,
  });
}

/** 100×60: red on the left half, blue on the right half, border at x = 50. */
function split(): Raster {
  const raster = createRaster(100, 60);
  for (let y = 0; y < 60; y++) {
    for (let x = 0; x < 100; x++) {
      const i = (y * 100 + x) * 4;
      raster.data.set(x < 50 ? RED : BLUE, i);
    }
  }
  return raster;
}

/** A 60×40 rect at (20,10) with no fill: only the backdrop blur shows. */
const glass = (blur: number | undefined, radius = 0): SceneNode => ({
  ...baseNode({ id: 'g', name: 'g', width: 60, height: 40 }),
  type: 'rect',
  cornerRadius: radius,
  transform: [1, 0, 0, 1, 20, 10],
  ...(blur === undefined ? {} : { backdropBlur: blur }),
});

describe('backdropBlur in the raster (hand-built scene)', () => {
  it('mixes the colors at the border inside the outline only', () => {
    const raster = split();
    paint(raster, glass(8));
    const [r, , b] = pixel(raster, 50, 30);
    expect(r).toBeGreaterThan(60);
    expect(r).toBeLessThan(195);
    expect(b).toBeGreaterThan(60);
    expect(b).toBeLessThan(195);
  });

  it('mixes the blurred copy in at the node opacity', () => {
    const sharp = split();
    const full = split();
    const half = split();
    paint(full, glass(8));
    paint(half, { ...glass(8), opacity: 0.5 });
    const r = (raster: Raster): number => pixel(raster, 50, 30)[0]!;
    // Red channel at the border: sharp blue pixel (0) < half-mixed < fully blurred.
    expect(r(sharp)).toBe(0);
    expect(r(full)).toBeGreaterThan(60);
    expect(r(half)).toBeGreaterThan(r(sharp));
    expect(r(half)).toBeLessThan(r(full));
    expect(r(half)).toBeCloseTo(r(full) / 2, -1);
  });

  it('leaves the pixels outside the outline exactly sharp', () => {
    const raster = split();
    paint(raster, glass(8));
    expect(pixel(raster, 50, 5)).toEqual(BLUE);
    expect(pixel(raster, 49, 5)).toEqual(RED);
    expect(pixel(raster, 50, 55)).toEqual(BLUE);
    expect(pixel(raster, 15, 30)).toEqual(RED);
  });

  it('keeps the pure color far (> 3 sigma) from the border inside the outline', () => {
    const raster = split();
    paint(raster, glass(8));
    expect(pixel(raster, 24, 30)).toEqual(RED);
    expect(pixel(raster, 76, 30)).toEqual(BLUE);
  });

  it('a pixel just outside a rounded corner stays sharp', () => {
    const raster = split();
    paint(raster, { ...glass(8, 16), transform: [1, 0, 0, 1, 40, 10] });
    // The rect spans x 40..100, y 10..50; its top-left corner pixel (40,10) is outside the arc.
    expect(pixel(raster, 40, 10)).toEqual(RED);
    expect(pixel(raster, 51, 30)).not.toEqual(BLUE);
  });

  it('without backdropBlur everything stays sharp', () => {
    const raster = split();
    paint(raster, glass(undefined));
    expect(pixel(raster, 50, 30)).toEqual(BLUE);
    expect(pixel(raster, 49, 30)).toEqual(RED);
  });
});

// ---------------------------------------------------------------------------
// The Header of the drawing-fidelity package: a 56-high bar (overlay, backdropBlur 16, #FFFFFFB3).

const LAYER = 'dddddddd-0000-4000-8000-000000000001';
const PACKAGE = join(__dirname, '../../examples/libraries/drawing-fidelity');
let base: string;
let roots: Roots;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mapping-backdrop-'));
  const dir = join(base, 'p');
  const lib = join(dir, 'specs', 'drawing-fidelity');
  mkdirSync(join(dir, 'images'), { recursive: true });
  cpSync(PACKAGE, lib, { recursive: true });
  const parsed = parseSpecText(
    readFileSync(join(lib, 'drawing-fidelity.spec.json'), 'utf8'),
  );
  if (!parsed.ok) throw new Error(`invalid spec: ${JSON.stringify(parsed)}`);
  let p = createProject({
    name: 'p',
    now: NOW,
    firstLayer: { id: LAYER, name: 'Layer 1', color: '#D32F2F' },
  });
  p = applySpecialization(p, parsed.spec, {
    packageSpecName: 'drawing-fidelity.spec.json',
  });
  writeFileSync(join(dir, 'mapping.json'), serialize(p));
  roots = new Roots([base]);
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true });
});

const io = {
  readSource: () => Promise.reject(new Error('no files')),
  readSpecInput: () => Promise.reject(new Error('no files')),
  takenImageFiles: new Set<string>(),
  now: () => new Date(NOW),
};

// Two 48-high Blocks stacked in the Header's slot: amber (y 0..48) over blue (y 48..96); the
// bar covers y 0..56, so the color border (y = 48) is under it.
const ops: Operation[] = [
  { op: 'add_container', as: '$c', width: 220, height: 260, background: '#FFFFFF' },
  {
    op: 'create_marking',
    as: '$h',
    container: '$c',
    rect: { x: 10, y: 10, width: 200, height: 240 },
    annotation: { type: 'drawing-fidelity/header', values: {} },
  },
  {
    op: 'create_marking',
    as: '$a',
    container: '$c',
    inside: '$h',
    rect: { x: 0, y: 0, width: 200, height: 48 },
    annotation: { type: 'drawing-fidelity/block', values: { color: 'amber' } },
  },
  {
    op: 'create_marking',
    as: '$b',
    container: '$c',
    inside: '$h',
    rect: { x: 0, y: 48, width: 200, height: 48 },
    annotation: { type: 'drawing-fidelity/block', values: { color: 'blue' } },
  },
];

describe('backdropBlur of the Header package in render_container', () => {
  it('blurs the Block border under the bar and leaves the Blocks below it sharp', async () => {
    const loaded = await loadProject(roots, await findProject(roots, 'p'));
    const result = await runBatch(loaded, ops, io);
    expect(result.errors).toEqual([]);
    const refs = new Refs({ ...loaded, project: result.project });
    const out = await renderContainer(roots, refs, result.project.containers[0]!, {
      background: 'none',
    });
    const raster = (await decodeImage(out.image.bytes)).raster;
    // Below the bar (bar ends at y = 10 + 56 = 66): not blurred, the pure blue Block.
    expect(pixel(raster, 160, 10 + 70)).toEqual([0x93, 0xc5, 0xfd, 255]);
    // Inside the bar at the border (y = 10 + 48): the amber/blue mix, tinted white.
    const [r, , b] = pixel(raster, 160, 10 + 48);
    const sharpAbove = pixel(raster, 160, 10 + 30);
    const sharpBelow = pixel(raster, 160, 10 + 54);
    // The two colors are within the blur reach of 16 px, so they both change.
    expect(sharpAbove).not.toEqual(sharpBelow);
    expect(r).toBeGreaterThan(0x93);
    expect(r).toBeLessThan(0xfd);
    expect(b).toBeGreaterThan(0x80);
  });
});
