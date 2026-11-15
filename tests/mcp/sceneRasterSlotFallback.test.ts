// Decision 24 of #1080: the MCP's PNG paints the slot's own fill, and the `fallback` of an empty slot
// (a sibling after the slot's node) paints above it; the fill never covers the default content.
import { describe, expect, it } from 'vitest';
import { createRaster, type Raster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { instantiate } from '../../src/model/components/instantiate';
import { parseComponent } from '../../src/model/components/parseComponent';

const book = createFontBook();
const measure = measurerFor(book);

const parsed = parseComponent({
  format: 'mapping-component',
  formatVersion: 4,
  id: 'host',
  name: 'Host',
  size: { width: 100, height: 60 },
  template: {
    type: 'frame',
    fill: '#FFFFFF',
    layout: { type: 'none' },
    children: [
      {
        type: 'slot',
        id: 'content',
        name: 'content',
        fill: '#B0BEC5',
        anchors: { left: 10, top: 10 },
        width: 80,
        height: 40,
        layout: { type: 'none' },
        fallback: {
          type: 'frame',
          fill: '#E65100',
          layout: { type: 'none' },
          anchors: { left: 0, top: 0 },
          width: 30,
          height: 40,
          children: [],
        },
      },
    ],
  },
});
if (!parsed.ok) throw new Error(parsed.errors.join('; '));

function paint(filled: boolean): Raster {
  const { root } = instantiate(
    parsed.component,
    {},
    { x: 0, y: 0, width: 100, height: 60 },
    {
      measure,
      idPrefix: 'h',
      ...(filled ? { filledSlots: new Set(['content']) } : {}),
    },
  );
  const raster = createRaster(100, 60);
  raster.data.fill(255);
  paintScene(raster, [{ root }], measure, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, width: 100, height: 60 },
    fonts: book,
  });
  return raster;
}

const hex = (r: Raster, x: number, y: number): string => {
  const i = (y * r.width + x) * 4;
  return [0, 1, 2]
    .map((c) => r.data[i + c]!.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
};

describe('the slot fill and the fallback in the raster', () => {
  it('an empty slot: the fallback is above the slot fill, which shows around it', () => {
    const r = paint(false);
    expect(hex(r, 20, 30)).toBe('E65100');
    expect(hex(r, 70, 30)).toBe('B0BEC5');
  });

  it('a filled slot: no fallback, only the slot fill', () => {
    const r = paint(true);
    expect(hex(r, 20, 30)).toBe('B0BEC5');
    expect(hex(r, 70, 30)).toBe('B0BEC5');
  });
});
