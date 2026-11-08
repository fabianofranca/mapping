// Achado 1 do relato da #838: a Galeria e o Experimentar do Catálogo desenham os exemplos com os
// tokens e o conjunto de ícones da especialização (cores do tema, ícone `Add`), como o canvas.
import { describe, expect, it } from 'vitest';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { drawEntry, exampleDrawing, findEntry } from '../../src/model/catalog';
import { buildCatalog } from '../../src/model/catalog';
import type { SceneNode } from '../../src/model/components/scene';
import { files, solid } from '../support/material3Library';

const catalog = buildCatalog(files);
const button = findEntry(catalog, 'button')!;

function warningsAndFills(root: SceneNode): string[] {
  const out: string[] = [];
  const visit = (node: SceneNode): void => {
    if ('fills' in node) {
      const c = solid(node.fills);
      if (c !== undefined) out.push(c.toUpperCase());
    }
    if ('children' in node) node.children.forEach(visit);
  };
  visit(root);
  return out;
}

describe('Catálogo: Galeria e Experimentar com o tema da especialização', () => {
  it('o preview do Button usa a cor primary (#6750A4) e não o cinza padrão', () => {
    const drawing = exampleDrawing(catalog, button, undefined, approximateMeasurer)!;
    expect(warningsAndFills(drawing.root)).toContain('#6750A4');
  });

  it('o exemplo "Com ícone" não avisa "ícone desconhecido"', () => {
    const example = button.examples.find((e) => /ícone/i.test(e.name))!;
    expect(example).toBeDefined();
    const drawing = exampleDrawing(catalog, button, example, approximateMeasurer)!;
    expect(drawing.warnings.filter((w) => /ícone desconhecido/.test(w))).toEqual([]);
  });

  it('o Experimentar (drawEntry) também usa o tema', () => {
    const drawing = drawEntry(button, button.previewValues ?? {}, approximateMeasurer)!;
    expect(warningsAndFills(drawing.root)).toContain('#6750A4');
  });
});
