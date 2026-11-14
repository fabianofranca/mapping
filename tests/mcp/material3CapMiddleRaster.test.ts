// FX6 (#1013, decision 23 of #896): the ink center of a `button` label is within 1 px of the center
// of the box in the MCP raster, at zoom 1 and 4.2.
import { describe, expect, it } from 'vitest';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import {
  baseNode,
  type FrameNode,
  type SceneNode,
  type TextNode,
} from '../../src/model/components/scene';
import { files } from '../support/material3Library';

const book = createFontBook();
const measure = measurerFor(book);

/** Instantiates the component in light mode, with the MCP's embedded font, and returns the text and the frame. */
function labelOf(id: string, values: Record<string, string>) {
  const catalog = buildCatalog(files);
  const entry = findEntry(catalog, id);
  const library = catalog.library;
  if (entry === undefined || entry.component === null || library === null)
    throw new Error(`no component ${id}`);
  const box = { x: 0, y: 0, ...entry.component.size };
  const drawing = instantiate(
    entry.component,
    { ...defaultValues(entry.type), ...values },
    box,
    {
      measure,
      tokens: resolveTokens(library.tokens, {}, 'light'),
      ...(library.icons === undefined ? {} : { icons: library.icons }),
    },
  );
  let found: { node: TextNode; y: number } | undefined;
  const walk = (node: SceneNode, y: number): void => {
    const here = y + node.transform[5];
    if (found === undefined && node.type === 'text' && node.visible)
      found = { node, y: here };
    if ('children' in node) for (const child of node.children) walk(child, here);
  };
  walk(drawing.root, 0);
  if (found === undefined) throw new Error(`${id} has no visible text`);
  return { ...found, height: drawing.root.height };
}

/** Paints only the text, in black on white, and returns the vertical center of the ink (component px). */
function inkCenter(node: TextNode, top: number, height: number, scale: number): number {
  const pad = 4;
  const width = Math.ceil((node.width + node.transform[4] + pad) * scale);
  const rows = Math.ceil((height + pad) * scale);
  const raster = createRaster(width, rows);
  raster.data.fill(255);
  const black = { ...node, fills: [{ type: 'solid' as const, color: '#000000' }] };
  const root: FrameNode = {
    ...baseNode({
      id: 'root',
      name: 'root',
      width: node.width + node.transform[4],
      height,
    }),
    type: 'frame',
    clip: false,
    cornerRadius: 0,
    children: [{ ...black, transform: [1, 0, 0, 1, node.transform[4], top] }],
  };
  paintScene(raster, [{ root }], measure, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width, height: rows },
    fonts: book,
  });
  const ink: number[] = [];
  for (let y = 0; y < rows; y++) {
    let total = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      total += 255 - (raster.data[i]! + raster.data[i + 1]! + raster.data[i + 2]!) / 3;
    }
    ink.push(total / 255);
  }
  const sorted = ink.filter((r) => r > 0).sort((a, b) => a - b);
  const full = sorted[Math.floor(sorted.length / 2)]!;
  const first = ink.findIndex((r) => r > full * 0.02);
  const last = ink.length - 1 - [...ink].reverse().findIndex((r) => r > full * 0.02);
  const topEdge = first + (1 - Math.min(1, ink[first]! / full));
  const bottomEdge = last + Math.min(1, ink[last]! / full);
  return (topEdge + bottomEdge) / 2 / scale;
}

describe('ink center of a button label in the MCP raster (decision 23)', () => {
  for (const scale of [1, 4.2]) {
    for (const style of ['filled', 'text']) {
      it(`${style}, zoom ${scale}: within 1 px of the box center`, () => {
        const { node, y, height } = labelOf('button', { label: 'HHHH', style });
        expect(node.style.verticalAlign).toBe('cap-middle');
        const center = inkCenter(node, y, height, scale);
        expect(Math.abs(center - height / 2)).toBeLessThanOrEqual(1);
      });
    }
  }
});
