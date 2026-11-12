import { describe, expect, it } from 'vitest';
import { measureFontOf, plainLines } from '../../mcp/image/textBars';
import { textInk } from '../../mcp/image/textLayout';
import { createFontBook, measurerFor } from '../../mcp/image/textMeasurer';
import { baseNode, type TextNode } from '../../src/model/components/scene';

// CL1 / D1: o PNG justifica o texto como a app (a linha que não fecha parágrafo vai até a largura do nó).

const book = createFontBook();
const measure = measurerFor(book);

function node(align: TextNode['style']['align'], text: string, width: number): TextNode {
  return {
    ...baseNode({ id: 't', name: 't', width, height: 60, transform: [1, 0, 0, 1, 0, 0] }),
    type: 'text',
    text,
    style: {
      fontFamily: 'sans-serif',
      fontSize: 14,
      fontWeight: 400,
      italic: false,
      lineHeight: 20,
      align,
      verticalAlign: 'top',
    },
  };
}

const maxX = (n: TextNode): number =>
  Math.max(
    ...textInk(n, measure, book).glyphs.flatMap((g) => g.polygons.flat().map((p) => p.x)),
  );

describe('textInk justificado', () => {
  const text = 'um dois tres quatro cinco seis sete oito nove dez';
  it('a primeira linha vai até a largura do nó', () => {
    const justified = maxX(node('justify', text, 150));
    const left = maxX(node('left', text, 150));
    expect(justified).toBeGreaterThan(left + 1);
    expect(justified).toBeGreaterThan(148);
    expect(justified).toBeLessThanOrEqual(150.5);
  });
  it('a última linha do parágrafo fica à esquerda', () => {
    const short = node('justify', 'curto aqui', 200);
    expect(maxX(short)).toBeLessThan(150);
  });
});

// Decisão 10 da #1631: o `customEnds` conta as palavras pelo espaço, como o `wrapWords` quebra; a
// palavra mais larga que a caixa fica inteira numa linha, então nunca se parte em várias.
describe('fins de parágrafo com maxLines e palavra mais larga que a caixa', () => {
  it('só a última linha de cada parágrafo fecha, com a palavra larga inteira', () => {
    const n: TextNode = {
      ...node(
        'justify',
        'um dois\nsupercalifragilisticoexpialidoso tres quatro\ncinco',
        60,
      ),
      height: 200,
    };
    const withMax: TextNode = { ...n, style: { ...n.style, maxLines: 8 } };
    const widthOf = (text: string) => measure(text, measureFontOf(n.style)).width;
    const { lines, ends } = plainLines(withMax, measure, widthOf);
    // A palavra larga continua inteira, numa linha só dela.
    expect(lines).toContain('supercalifragilisticoexpialidoso');
    // Uma entrada por linha; fecha a última linha de cada `\n` e mais nenhuma.
    const closing = lines.flatMap((line, i) => (ends[i] ? [line] : []));
    expect(closing).toEqual(['um dois', 'quatro', 'cinco']);
  });
});
