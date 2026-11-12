// A palavra mais larga que a caixa fica inteira na linha (como no modelo e no PNG do MCP): o
// medidor e o desenho alargam o `Text` do Konva até ela, e o Konva só quebra entre palavras.
import { beforeEach, describe, expect, it, vi } from 'vitest';

// 6 px por letra: o canvas só de medida do `wordSafeWidth` (o jsdom não tem 2D).
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
  () => ({ font: '', measureText: (t: string) => ({ width: t.length * 6 }) }) as never,
);

const configs: Array<{ text?: string; width?: number; wrap?: string }> = [];
vi.mock('konva/lib/shapes/Text', () => ({
  Text: class {
    private readonly config: { text?: string; width?: number };
    constructor(config: { text?: string; width?: number }) {
      this.config = config;
      configs.push(config);
    }
    // 6 px por letra (o texto sem `width`: a largura natural).
    getTextWidth = () => (this.config.text ?? '').length * 6;
    width = () => this.config.width ?? 0;
    height = () => 20;
    textArr: { text: string }[] = [{ text: 'x' }];
    fontSize = () => 14;
    measureSize = () => ({
      width: 0,
      fontBoundingBoxAscent: 12 * 32,
      fontBoundingBoxDescent: 4 * 32,
      actualBoundingBoxAscent: 10 * 32,
      actualBoundingBoxDescent: 0,
    });
    destroy = () => undefined;
  },
}));

import { konvaMeasurer } from '../../../src/canvas/components/konvaMeasurer';
import { wordSafeWidth } from '../../../src/canvas/components/wordWidth';

const face = {
  fontFamily: 'Roboto',
  fontSize: 14,
  fontStyle: 'normal',
  letterSpacing: 0,
};
const font = {
  family: 'Roboto',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 20,
  letterSpacing: 0,
};

beforeEach(() => {
  configs.length = 0;
});

describe('wordSafeWidth', () => {
  it('devolve a largura da palavra mais larga quando ela passa da caixa', () => {
    expect(wordSafeWidth('Confirmar compra', face, 10)).toBe(54);
    expect(wordSafeWidth('Salvar', face, 10)).toBe(36);
  });

  it('devolve a largura pedida quando toda palavra cabe', () => {
    expect(wordSafeWidth('Salvar', face, 100)).toBe(100);
    expect(wordSafeWidth('', face, 40)).toBe(40);
  });
});

describe('konvaMeasurer: palavra mais larga que a caixa', () => {
  it('o Text leva a largura da palavra mais larga (mais a folga), não a da caixa', () => {
    konvaMeasurer('Salvar', { ...font }, 10);
    expect(configs.at(-1)?.width).toBe(36.5);
  });

  it('com a palavra cabendo, a largura é a da caixa mais a folga', () => {
    konvaMeasurer('Salvar', { ...font }, 100);
    expect(configs.at(-1)?.width).toBe(100.5);
  });

  it('com reticências, o corte é da caixa: a largura não se alarga', () => {
    konvaMeasurer('Salvar', { ...font, ellipsis: true }, 10);
    expect(configs.at(-1)?.width).toBe(10.5);
  });
});
