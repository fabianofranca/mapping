// R25.75 to R25.78: the component that `scripts/testing/rot.mjs` writes is valid and draws what
// the script steps expect (the bar by `$size`/`$mul` and the rectangle rotated 45°).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { parseComponent } from '../../src/model/components/parseComponent';

function drawCard(width: number, height: number, scale = 1) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mapping-rot-'));
  try {
    mkdirSync(path.join(dir, 'components'));
    execFileSync('node', [path.resolve('scripts/testing/rot.mjs'), dir]);
    const parsed = parseComponent(
      JSON.parse(readFileSync(path.join(dir, 'components/card.json'), 'utf8')),
    );
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const { root } = instantiate(
      parsed.component,
      {},
      { x: 0, y: 0, width, height },
      { measure: approximateMeasurer },
    );
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const raster = createRaster(w, h);
    raster.data.fill(255);
    paintScene(raster, [{ root }], approximateMeasurer, {
      scaleX: scale,
      scaleY: scale,
      clip: { x: 0, y: 0, width: w, height: h },
    });
    const at = (x: number, y: number) => {
      const i = (Math.round(y * scale) * w + Math.round(x * scale)) * 4;
      return [...raster.data.subarray(i, i + 3)];
    };
    // Width and height, in units, of the ink of `color` (like the `tinta` of TESTING.md, with
    // `FUZZ` as a fraction of 255).
    const inkSize = (color: number[], fuzz: number) => {
      let x0 = w,
        y0 = h,
        x1 = -1,
        y1 = -1;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (
            color.every((v, k) => Math.abs((raster.data[i + k] ?? 0) - v) <= 255 * fuzz)
          ) {
            x0 = Math.min(x0, x);
            x1 = Math.max(x1, x);
            y0 = Math.min(y0, y);
            y1 = Math.max(y1, y);
          }
        }
      return { width: (x1 - x0 + 1) / scale, height: (y1 - y0 + 1) / scale };
    };
    return Object.assign(at, { inkSize });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const BLUE = [0x19, 0x76, 0xd2];
const RED = [0xd3, 0x2f, 0x2f];
const WHITE = [255, 255, 255];

describe('rot.mjs (R25.75 to R25.78)', () => {
  it('the bar is half the instance width and the rectangle rotates around the center', () => {
    const at = drawCard(300, 120);
    expect(at(100, 25)).toEqual(BLUE);
    expect(at(168, 25)).toEqual(BLUE);
    expect(at(172, 25)).toEqual(WHITE);
    expect(at(230, 70)).toEqual(RED);
    expect(at(244, 84)).toEqual(RED); // inside only when rotated
    expect(at(201, 61)).toEqual(WHITE); // corner of the unrotated rectangle, outside the rotated one
    expect(at(258, 62)).toEqual(WHITE);
  });

  it('the bar follows the instance width', () => {
    const at = drawCard(200, 120);
    expect(at(118, 25)).toEqual(BLUE);
    expect(at(122, 25)).toEqual(WHITE);
  });

  it('R25.78: in the app (non-integer scale) the rotated red measures 55 to 58 with FUZZ=15', () => {
    for (const scale of [1.76, 2.08, 2.8, 4.2]) {
      const { width, height } = drawCard(300, 120, scale).inkSize(RED, 0.15);
      expect(width).toBeGreaterThanOrEqual(55);
      expect(width).toBeLessThanOrEqual(58);
      expect(height).toBeGreaterThanOrEqual(55);
      expect(height).toBeLessThanOrEqual(58);
    }
  });
});
