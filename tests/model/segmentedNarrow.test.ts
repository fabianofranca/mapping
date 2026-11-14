// CL2 (1.4 do reteste): o `fit_marking` de um segmented-button perto da borda do container recebe
// só a largura que sobra (209 de 360, a marcação em x = 151) e as trilhas iguais (70) ficam menores
// que o "check + rótulo" do selecionado. O rótulo (`ellipsis`) encolhe dentro da trilha em vez de
// passar do segmento vizinho, e a linha não acusa "content larger than the box".
import { describe, expect, it } from 'vitest';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import { drawFitted } from '../support/material3Fitted';

const VALUES = {
  options: ['A', 'Semana inteira', 'Mes'].map((label, i) => ({
    label,
    icon: '',
    selected: i === 1 ? 'true' : 'false',
  })),
};

function rows(width: number, mode: 'light' | 'dark') {
  const { drawing } = drawFitted('segmented-button', VALUES, mode, { width, height: 40 });
  const boxes = absoluteBoxes(drawing.root);
  const nodes = [...walk(drawing.root)];
  const texts = nodes.filter((n) => n.name === 'rótulo' && n.type === 'text');
  const cells = nodes.filter((n) => n.name === 'segmento');
  return {
    messages: drawing.messages.map((m) => m.text),
    rows: cells.map((cell, i) => ({
      cell: boxes.get(cell.id)!,
      text: boxes.get(texts[i]!.id)!,
    })),
  };
}

describe('segmented-button em largura menor que o conteúdo (1.4 do reteste)', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`209 de largura (${mode}): cada rótulo fica dentro da sua trilha e não há aviso`, () => {
      const { rows: found, messages } = rows(209, mode);
      expect(found).toHaveLength(3);
      for (const { cell, text } of found) {
        expect(text.x).toBeGreaterThanOrEqual(cell.x - 0.5);
        expect(text.x + text.width).toBeLessThanOrEqual(cell.x + cell.width + 0.5);
      }
      expect(messages.filter((m) => m.includes('larger than the box'))).toEqual([]);
    });
  }
});
