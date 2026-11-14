// TF1 (#895, stage #863): the "Em erro" (outlined with supporting text) example of the text-field and the secure-text-field
// ends inside the `size` height. Compose asks for 84 (8 of the label + 56 of the outline + 4 + 16 of the supporting text).
// pt-BR kept: 'Em erro' is the example name in the Portuguese data of libraries/material3-compose
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { multiply, IDENTITY } from '../../src/model/components/scene';
import type { Matrix, SceneNode } from '../../src/model/components/scene';
import { drawIn, files } from '../support/material3Library';

/** The catalog is built once, at collection: inside the test it took ~4.7 s (5 s limit) with coverage on in CI. */
const sharedCatalog = buildCatalog(files);

/** The largest `y` (px, in the root space) that any visible node occupies, by each node's box. */
function bottomOf(node: SceneNode, parent: Matrix = IDENTITY, isRoot = true): number {
  const m = isRoot ? IDENTITY : multiply(parent, node.transform);
  let bottom = node.visible && !isRoot ? m[5] + m[3] * node.height : 0;
  if ('children' in node) {
    for (const child of node.children)
      bottom = Math.max(bottom, bottomOf(child, m, false));
  }
  return bottom;
}

describe.each(['text-field', 'secure-text-field'])(
  '%s: the "Em erro" example fits the size',
  (id) => {
    it.each(['light', 'dark'] as const)('ends inside the height (%s)', (mode) => {
      const catalog = sharedCatalog;
      const entry = findEntry(catalog, id);
      const example = entry?.examples.find((e) => e.name === 'Em erro');
      expect(example?.values?.style).toBe('outlined');
      const drawing = drawIn(catalog, entry!, example?.values ?? {}, mode);
      expect(drawing.warnings).toEqual([]);
      const height = entry!.component!.size.height;
      expect(
        bottomOf(drawing.root),
        `content bottom (size ${height})`,
      ).toBeLessThanOrEqual(height);
      expect(height).toBe(84);
    });
  },
);
