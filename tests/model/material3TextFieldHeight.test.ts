// TF1 (#895, etapa #863): o "Em erro" (outlined com texto de apoio) do text-field e do secure-text-field
// termina dentro da altura do `size`. O Compose pede 84 (8 do rótulo + 56 do contorno + 4 + 16 do apoio).
import { describe, expect, it } from 'vitest';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { multiply, IDENTITY } from '../../src/model/components/scene';
import type { Matrix, SceneNode } from '../../src/model/components/scene';
import { drawIn, files } from '../support/material3Library';

/** O catálogo se monta uma vez, na coleta: dentro do teste ele levava ~4,7 s (limite de 5 s) com a cobertura ligada no CI. */
const sharedCatalog = buildCatalog(files);

/** Maior `y` (px, no espaço da raiz) que algum nó visível ocupa, pela caixa de cada nó. */
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
  '%s: o "Em erro" cabe no size',
  (id) => {
    it.each(['light', 'dark'] as const)('termina dentro da altura (%s)', (mode) => {
      const catalog = sharedCatalog;
      const entry = findEntry(catalog, id);
      const example = entry?.examples.find((e) => e.name === 'Em erro');
      expect(example?.values?.style).toBe('outlined');
      const drawing = drawIn(catalog, entry!, example?.values ?? {}, mode);
      expect(drawing.warnings).toEqual([]);
      const height = entry!.component!.size.height;
      expect(
        bottomOf(drawing.root),
        `fundo do conteúdo (size ${height})`,
      ).toBeLessThanOrEqual(height);
      expect(height).toBe(84);
    });
  },
);
