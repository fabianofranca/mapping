// CL1 (1.4): segmented-button com rótulos de larguras diferentes: nenhum rótulo passa da trilha, nem
// quando o ajuste (`fit_marking`) tem um limite de largura menor que a soma das trilhas. O limite só
// aperta o que quebra: o rótulo é `wrap: none`, então a trilha não encolhe abaixo da maior palavra
// inquebrável (o min-content) e o componente passa do limite em vez de invadir o vizinho.
import { describe, expect, it } from 'vitest';
import { fitComponentSize } from '../../src/model/components/sizing';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import { defaultValues } from '../../src/model/libraryDrawing';
import { catalog, drawFitted, entryOf, fittedSize } from '../support/material3Fitted';
import { instantiateOptions } from '../support/material3Library';

const options = (...labels: string[]) =>
  labels.map((label, i) => ({ label, icon: '', selected: i === 1 ? 'true' : 'false' }));

const VALUES = { options: options('A', 'Semana inteira', 'Mes') };

/** Cada segmento com o retângulo do rótulo dentro dele, desenhado na largura dada. */
function segments(width: number, height: number) {
  const { drawing } = drawFitted('segmented-button', VALUES, 'light', { width, height });
  const boxes = absoluteBoxes(drawing.root);
  const nodes = [...walk(drawing.root)];
  const texts = nodes.filter((n) => n.name === 'rótulo' && n.type === 'text');
  return nodes
    .filter((n) => n.name === 'segmento')
    .map((cell, i) => ({
      cell: boxes.get(cell.id)!,
      text: boxes.get(texts[i]!.id)!,
    }));
}

const expectInside = (rows: ReturnType<typeof segments>) =>
  rows.forEach(({ cell, text }) => {
    expect(text.x).toBeGreaterThanOrEqual(cell.x - 0.5);
    expect(text.x + text.width).toBeLessThanOrEqual(cell.x + cell.width + 0.5);
  });

describe('segmented-button hug: a trilha cobre o rótulo mais largo', () => {
  it('sem limite: três trilhas iguais pelo maior segmento e cada rótulo dentro da sua', () => {
    const fitted = fittedSize('segmented-button', VALUES);
    const rows = segments(fitted.width, fitted.height);
    expect(rows).toHaveLength(3);
    expectInside(rows);
    const widths = rows.map((r) => r.cell.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(fitted.width + 1);
  });

  it('com o limite de 340 do ajuste: a largura não encolhe abaixo do rótulo mais largo', () => {
    const entry = entryOf('segmented-button');
    const all = { ...defaultValues(entry.type), ...VALUES } as never;
    const fit = fitComponentSize(
      entry.component!,
      all,
      instantiateOptions(catalog, 'light'),
      { maxWidth: 340 },
    );
    expect(fit!.width).toBeGreaterThan(340);
    expectInside(segments(fit!.width, fit!.height));
  });
});
