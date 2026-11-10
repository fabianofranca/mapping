// MF1: o `align: "justify"` quebra igual na app (Konva) e no raster do MCP (textBars): num parágrafo
// de 3 linhas, as duas primeiras ocupam a largura da caixa e a última fica à esquerda, no tamanho
// natural, como o `TextAlign.Justify`. O `\n` abre outro parágrafo, com a última linha própria.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { textBars } from '../../../mcp/image/textBars';
import { renderScene } from '../../../src/canvas/components/renderScene';
import { baseNode, type TextNode } from '../../../src/model/components/scene';

beforeAll(() => installFakeCanvas());

// Mesma medida do contexto falso do Konva: 6 px por letra.
const measure = (text: string) => ({ width: text.length * 6, height: 14 });

function node(text: string): TextNode {
  return {
    ...baseNode({
      id: 't',
      name: 't',
      width: 60,
      height: 80,
      fills: [{ type: 'solid', color: '#000000' }],
    }),
    type: 'text',
    text,
    style: {
      fontFamily: 'sans-serif',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 14,
      align: 'justify',
      verticalAlign: 'top',
    },
  };
}

function konvaText(n: TextNode): Konva.Text {
  const { root } = renderScene({ root: n, warnings: [] });
  const found = (root.find('Text') as Konva.Text[])[0];
  if (!found) throw new Error('sem texto');
  return found;
}

describe('justify: paridade entre o Konva e o raster', () => {
  const paragraph = node('aaaa bbbb cccc dddd eeee ffff');

  it('um parágrafo de 3 linhas: as duas primeiras justificadas, a última à esquerda', () => {
    const text = konvaText(paragraph);
    expect(text.align()).toBe('justify');
    expect(text.textArr.map((l) => l.text)).toEqual([
      'aaaa bbbb',
      'cccc dddd',
      'eeee ffff',
    ]);
    expect(text.textArr.map((l) => l.lastInParagraph)).toEqual([false, false, true]);

    const bars = textBars(paragraph, measure);
    expect(bars.map((b) => [b.x, b.width])).toEqual([
      [0, 60],
      [0, 60],
      [0, 54],
    ]);
  });

  it('cada parágrafo (\\n) tem a sua última linha à esquerda, como no Konva', () => {
    const two = node('aaaa bbbb cccc dddd\neeee');
    const text = konvaText(two);
    expect(text.textArr.map((l) => l.lastInParagraph)).toEqual([false, true, true]);
    const bars = textBars(two, measure);
    expect(bars.map((b) => b.width)).toEqual([60, 54, 24]);
  });
});
