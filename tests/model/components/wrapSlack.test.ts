// A folga única de 0,5 px antes de quebrar a linha (FX4, decisão 20 da #896).
import { describe, expect, it } from 'vitest';
import { WRAP_SLACK } from '../../../src/model/components/textWrap';
import { measureLines } from '../../../src/model/components/instantiate';
import { breakLines } from '../../../mcp/image/textBars';
import { baseNode, type TextNode } from '../../../src/model/components/scene';

const font = {
  family: 'x',
  size: 10,
  weight: 400,
  italic: false,
  lineHeight: 12,
  letterSpacing: 0,
};
// "aa bb" mede 50 px (10 por caractere, o espaço conta).
const widthOf = (text: string): number => text.length * 10;

describe('folga da quebra', () => {
  it('a constante é 0,5 px', () => {
    expect(WRAP_SLACK).toBe(0.5);
  });

  it('o medidor não quebra a linha que passa menos que a folga da largura', () => {
    expect(measureLines('aa bb', font, 49.6, widthOf).lines).toEqual(['aa bb']);
    expect(measureLines('aa bb', font, 49.4, widthOf).lines).toEqual(['aa', 'bb']);
  });

  it('o ellipsis também só corta além da folga', () => {
    const e = { ...font, wrap: 'none' as const, ellipsis: true };
    expect(measureLines('aaaaa', e, 49.6, widthOf).lines).toEqual(['aaaaa']);
    expect(measureLines('aaaaa', e, 49.4, widthOf).lines).not.toEqual(['aaaaa']);
  });

  it('o desenho das barras do servidor quebra no mesmo ponto', () => {
    const node = (width: number): TextNode => ({
      ...baseNode({ id: 't', name: 't', width, height: 20 }),
      type: 'text',
      text: 'aa bb',
      style: {
        fontFamily: 'x',
        fontSize: 10,
        fontWeight: 400,
        italic: false,
        align: 'left',
        verticalAlign: 'top',
      },
    });
    expect(breakLines(node(49.6), widthOf)).toEqual(['aa bb']);
    expect(breakLines(node(49.4), widthOf)).toEqual(['aa', 'bb']);
  });
});
