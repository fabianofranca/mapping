import { describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { diffRasters, sideBySide } from '../../mcp/image/rasterDiff';

const unit = { zoom: 1, origin: { x: 0, y: 0 } };

function filled(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Raster {
  const r = createRaster(width, height);
  for (let i = 0; i < r.data.length; i += 4) r.data.set(rgba, i);
  return r;
}

function setPixel(
  r: Raster,
  x: number,
  y: number,
  rgba: [number, number, number, number],
) {
  r.data.set(rgba, (y * r.width + x) * 4);
}

const white: [number, number, number, number] = [255, 255, 255, 255];
const black: [number, number, number, number] = [0, 0, 0, 255];

describe('diffRasters', () => {
  it('two equal rasters have no different pixel and no box', () => {
    const diff = diffRasters(filled(64, 64, white), filled(64, 64, white), unit);
    expect(diff).toMatchObject({ pixels: 0, boxes: [], omitted: 0, sizeChanged: false });
  });

  it('one changed pixel is one box of one cell, in container pixels (zoom 2, origin 100,200)', () => {
    const before = filled(64, 64, white);
    const after = filled(64, 64, white);
    setPixel(after, 20, 20, black);
    const diff = diffRasters(before, after, { zoom: 2, origin: { x: 100, y: 200 } });
    expect(diff.pixels).toBe(1);
    // cell 16..32 output px → 8..16 container px, plus the origin
    expect(diff.boxes).toEqual([{ x: 108, y: 208, width: 8, height: 8 }]);
  });

  it('rounds the box outward when the cell edges are not whole container pixels', () => {
    const before = filled(64, 64, white);
    const after = filled(64, 64, white);
    setPixel(after, 20, 20, black);
    const diff = diffRasters(before, after, { zoom: 3, origin: { x: 0, y: 0 } });
    // 16/3 = 5.33 → 5, 32/3 = 10.67 → 11
    expect(diff.boxes).toEqual([{ x: 5, y: 5, width: 6, height: 6 }]);
  });

  it('neighbor cells (15 px apart) form one box; 100 px apart form two', () => {
    const before = filled(200, 40, white);
    const near = filled(200, 40, white);
    setPixel(near, 0, 0, black);
    setPixel(near, 15, 0, black);
    expect(diffRasters(before, near, unit).boxes).toHaveLength(1);
    const far = filled(200, 40, white);
    setPixel(far, 0, 0, black);
    setPixel(far, 100, 0, black);
    expect(diffRasters(before, far, unit).boxes).toHaveLength(2);
  });

  it('diagonal cells are 8-connected', () => {
    const before = filled(64, 64, white);
    const after = filled(64, 64, white);
    setPixel(after, 5, 5, black);
    setPixel(after, 20, 20, black);
    expect(diffRasters(before, after, unit).boxes).toHaveLength(1);
  });

  it('30 separate changes give 20 boxes, largest area first, and 10 omitted', () => {
    const before = filled(30 * 160, 16, white);
    const after = filled(30 * 160, 16, white);
    for (let i = 0; i < 30; i++) {
      // the i-th change spans (i % 5) + 1 neighbor cells, so the areas differ
      for (let k = 0; k <= i % 5; k++) setPixel(after, i * 160 + k * 16, 0, black);
    }
    const diff = diffRasters(before, after, unit);
    expect(diff.boxes).toHaveLength(20);
    expect(diff.omitted).toBe(10);
    const areas = diff.boxes.map((b) => b.width * b.height);
    expect(areas).toEqual([...areas].sort((x, y) => y - x));
    expect(areas[0]).toBeGreaterThan(areas[19]!);
  });

  it('sides of different sizes: the area outside the smaller one is different', () => {
    const diff = diffRasters(filled(20, 20, white), filled(40, 20, white), unit);
    expect(diff.sizeChanged).toBe(true);
    expect(diff.area).toEqual({ width: 40, height: 20 });
    expect(diff.pixels).toBe(20 * 20);
  });

  it('only an alpha change counts', () => {
    const before = filled(16, 16, [10, 20, 30, 255]);
    const after = filled(16, 16, [10, 20, 30, 255]);
    setPixel(after, 3, 3, [10, 20, 30, 254]);
    expect(diffRasters(before, after, unit).pixels).toBe(1);
  });
});

describe('sideBySide', () => {
  function changed() {
    const before = filled(100, 100, white);
    const after = filled(100, 100, white);
    setPixel(after, 56, 56, black);
    const diff = diffRasters(before, after, unit);
    return { before, after, diff };
  }

  it('is null without boxes', () => {
    const a = filled(8, 8, white);
    expect(sideBySide(a, a, diffRasters(a, a, unit), unit)).toBeNull();
  });

  it('is 2 × crop + 8 wide with a transparent gap, before left and after right, boxes outlined', () => {
    const { before, after, diff } = changed();
    const out = sideBySide(before, after, diff, unit)!;
    const cropW = (out.raster.width - 8) / 2;
    expect(out.raster.width).toBe(2 * cropW + 8);
    expect(out.raster.height).toBe(out.region.height);
    const px = (x: number, y: number) =>
      Array.from(
        out.raster.data.subarray(
          (y * out.raster.width + x) * 4,
          (y * out.raster.width + x) * 4 + 4,
        ),
      );
    const mid = Math.floor(out.raster.height / 2);
    expect(px(cropW + 3, mid)).toEqual([0, 0, 0, 0]);
    // the box outline (magenta) appears on both halves
    const magenta = (from: number, to: number) => {
      for (let x = from; x < to; x++)
        for (let y = 0; y < out.raster.height; y++) {
          if (px(x, y).join() === '255,0,255,255') return true;
        }
      return false;
    };
    expect(magenta(0, cropW)).toBe(true);
    expect(magenta(cropW + 8, out.raster.width)).toBe(true);
    // the changed pixel only exists on the right half (inside its outline), so left is untouched there
    const changedX = 56 - out.region.x;
    const changedY = 56 - out.region.y;
    expect(px(changedX, changedY)).toEqual([255, 255, 255, 255]);
    expect(px(cropW + 8 + changedX, changedY)).toEqual([0, 0, 0, 255]);
  });

  it('the gap is white for an opaque output', () => {
    const { before, after, diff } = changed();
    const out = sideBySide(before, after, diff, unit, true)!;
    const cropW = (out.raster.width - 8) / 2;
    const at = (cropW + 3) * 4;
    expect(Array.from(out.raster.data.subarray(at, at + 4))).toEqual([
      255, 255, 255, 255,
    ]);
  });

  it('the union crop has an 8 px margin clamped to the area', () => {
    const { before, after, diff } = changed();
    // cell 48..64 → box 48..64, plus the margin
    expect(sideBySide(before, after, diff, unit)!.region).toEqual({
      x: 40,
      y: 40,
      width: 32,
      height: 32,
    });
    const corner = filled(100, 100, white);
    const cornerAfter = filled(100, 100, white);
    setPixel(cornerAfter, 0, 0, black);
    const d = diffRasters(corner, cornerAfter, unit);
    expect(sideBySide(corner, cornerAfter, d, unit)!.region).toEqual({
      x: 0,
      y: 0,
      width: 24,
      height: 24,
    });
  });
});
