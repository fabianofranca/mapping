// Formato 4, fase CF3: `font.wrap`, `font.ellipsis`, `font.maxLines`, o aviso de texto que não
// cabe na altura e a tolerância de 1 px por nó de texto.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkSchema } from '../../support/jsonSchema';
import type {
  ComponentFile,
  FrameTemplate,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { validateComponent } from '../../../src/model/components/parseComponent';
import { baseNode, type TextNode } from '../../../src/model/components/scene';
import { textBars } from '../../../mcp/image/textBars';
import {
  cutLineLeft,
  konvaLineHeight,
  visibleLineCount,
} from '../../../src/model/components/textWrap';

const V4 = 'only allowed with formatVersion 4';
const LONG = 'Texto longo demais para a caixa';
type MeasureFont = Parameters<TextMeasurer>[1];

/** 10 px, 5,5 px por caractere (aproximado), linha de 12 px. */
const FONT: MeasureFont = {
  family: 'Inter',
  size: 10,
  weight: 400,
  italic: false,
  lineHeight: 12,
  letterSpacing: 0,
};

describe('approximateMeasurer: wrap, ellipsis e maxLines', () => {
  it('wrap "none" mede uma linha só, mesmo numa caixa de 80 px', () => {
    const wrapped = approximateMeasurer(LONG, FONT, 80);
    expect(wrapped.height).toBeGreaterThan(12);
    const single = approximateMeasurer(LONG, { ...FONT, wrap: 'none' }, 80);
    expect(single.height).toBe(12);
  });

  it('ellipsis + wrap "none": o texto que não cabe termina em … e a largura não passa de 80', () => {
    const result = approximateMeasurer(
      LONG,
      { ...FONT, wrap: 'none', ellipsis: true },
      80,
    );
    expect(result.width).toBeLessThanOrEqual(80);
    expect(result.height).toBe(12);
    expect(result.lines).toHaveLength(1);
    expect(result.lines?.[0]?.endsWith('…')).toBe(true);
  });

  it('wrap "none" sem ellipsis não corta o texto', () => {
    const result = approximateMeasurer(LONG, { ...FONT, wrap: 'none' }, 80);
    expect(result.lines?.[0]).toBe(LONG);
  });

  it('maxLines 2 + ellipsis: a segunda linha termina em …; sem ellipsis, é cortada', () => {
    const text = 'aaaa bbbb cccc dddd eeee';
    const full = approximateMeasurer(text, FONT, 40);
    expect(full.lines).toHaveLength(5);
    const withDots = approximateMeasurer(
      text,
      { ...FONT, maxLines: 2, ellipsis: true },
      40,
    );
    expect(withDots.lines).toHaveLength(2);
    expect(withDots.lines?.[1]?.endsWith('…')).toBe(true);
    expect(withDots.height).toBe(24);
    const cut = approximateMeasurer(text, { ...FONT, maxLines: 2 }, 40);
    expect(cut.lines).toEqual(['aaaa', 'bbbb']);
    expect(cut.height).toBe(24);
  });

  it('texto que cabe em maxLines não muda', () => {
    const result = approximateMeasurer(
      'aaaa bbbb',
      { ...FONT, maxLines: 3, ellipsis: true },
      40,
    );
    expect(result.lines).toEqual(['aaaa', 'bbbb']);
  });
});

describe('textBars (medidor do raster): wrap, ellipsis e maxLines', () => {
  const text = (extra: Partial<TextNode['style']>, width = 80): TextNode => ({
    ...baseNode({ id: 't', name: 't', width, height: 40, fills: [] }),
    type: 'text',
    text: LONG,
    style: {
      fontFamily: 'Roboto',
      fontSize: 10,
      fontWeight: 400,
      italic: false,
      lineHeight: 12,
      align: 'left',
      verticalAlign: 'top',
      ...extra,
    },
  });

  it('wrap "none" desenha uma barra só', () => {
    expect(textBars(text({}), approximateMeasurer).length).toBeGreaterThan(1);
    const bars = textBars(text({ wrap: 'none' }), approximateMeasurer);
    expect(bars).toHaveLength(1);
  });

  it('ellipsis + wrap "none": a barra não passa da largura do nó', () => {
    const bars = textBars(text({ wrap: 'none', ellipsis: true }), approximateMeasurer);
    expect(bars).toHaveLength(1);
    expect(bars[0]!.width).toBeLessThanOrEqual(80);
  });

  it('maxLines limita o número de barras', () => {
    expect(textBars(text({ maxLines: 2 }, 40), approximateMeasurer)).toHaveLength(2);
  });
});

function component(
  child: Record<string, unknown>,
  version = 4,
  size = { width: 100, height: 40 },
): Record<string, unknown> {
  return {
    format: 'mapping-component',
    formatVersion: version,
    id: 'c',
    name: 'C',
    size,
    template: { type: 'frame', children: [child] },
  };
}

const textNode = (font: Record<string, unknown>): Record<string, unknown> => ({
  type: 'text',
  text: LONG,
  font,
});

describe('validação de font.wrap, font.ellipsis e font.maxLines', () => {
  it('valem na formatVersion 4, com literal ou expressão', () => {
    expect(
      validateComponent(
        component(
          textNode({
            wrap: 'none',
            ellipsis: true,
            maxLines: 2,
          }),
        ),
      ),
    ).toEqual([]);
    expect(
      validateComponent(
        component(
          textNode({
            wrap: { $field: 'wrap', default: 'word' },
            ellipsis: { $field: 'dots', default: true },
            maxLines: { $field: 'lines', default: 2 },
          }),
        ),
      ),
    ).toEqual([]);
  });

  it.each(['wrap', 'ellipsis', 'maxLines'])(
    '%s na formatVersion 3 é erro no caminho da chave',
    (key) => {
      const value = { wrap: 'none', ellipsis: true, maxLines: 2 }[key];
      const errors = validateComponent(component(textNode({ [key]: value }), 3));
      expect(errors).toEqual([`template.children[0].font.${key}: ${V4}`]);
    },
  );

  it('expressão na formatVersion 3 também é erro', () => {
    const errors = validateComponent(
      component(textNode({ maxLines: { $field: 'lines', default: 2 } }), 3),
    );
    expect(errors).toEqual([`template.children[0].font.maxLines: ${V4}`]);
  });

  it('maxLines 0, negativo ou fracionário é erro', () => {
    for (const bad of [0, -1, 1.5]) {
      const errors = validateComponent(component(textNode({ maxLines: bad })));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain('template.children[0].font.maxLines');
    }
  });

  it('wrap fora de word/none e ellipsis que não é booleano são erro', () => {
    expect(validateComponent(component(textNode({ wrap: 'char' })))).toHaveLength(1);
    expect(validateComponent(component(textNode({ ellipsis: 'sim' })))).toHaveLength(1);
  });
});

function drawn(
  font: Record<string, unknown>,
  node: Record<string, unknown> = {},
  box = { x: 0, y: 0, width: 100, height: 40 },
) {
  const tpl = {
    type: 'frame',
    layout: { type: 'none' },
    children: [{ type: 'text', name: 'rotulo', text: LONG, font, ...node }],
  } as unknown as FrameTemplate;
  const file: ComponentFile = {
    format: 'mapping-component',
    formatVersion: 4,
    id: 't',
    name: 'T',
    size: { width: box.width, height: box.height },
    template: tpl,
  };
  return instantiate(file, {}, box, { measure: approximateMeasurer });
}

describe('aviso texto maior que a caixa', () => {
  const OVERFLOW = 'texto maior que a caixa: rotulo';

  it('3 linhas numa caixa que comporta 2, sem maxLines nem ellipsis: aviso', () => {
    // largura 80: "Texto longo demais para a caixa" quebra em 3 linhas de 12 px = 36 > 24.
    const { warnings } = drawn({ size: 10, lineHeight: 12 }, { width: 80, height: 24 });
    expect(warnings).toContain(OVERFLOW);
  });

  it('com maxLines ou ellipsis o texto é cortado de propósito: sem aviso', () => {
    const node = { width: 80, height: 24 };
    expect(drawn({ size: 10, lineHeight: 12, maxLines: 2 }, node).warnings).not.toContain(
      OVERFLOW,
    );
    expect(
      drawn({ size: 10, lineHeight: 12, ellipsis: true }, node).warnings,
    ).not.toContain(OVERFLOW);
  });

  it('cabendo na altura não avisa', () => {
    const { warnings } = drawn({ size: 10, lineHeight: 12 }, { width: 80, height: 48 });
    expect(warnings).not.toContain(OVERFLOW);
  });

  it('excesso de 0,6 px vindo de texto não avisa; de 2 px, avisa', () => {
    const short = { text: 'curto', width: 100 };
    // linha de 12,6 px numa caixa de 12 px.
    expect(
      drawn({ size: 10, lineHeight: 12.6 }, { ...short, height: 12 }).warnings,
    ).not.toContain(OVERFLOW);
    // linha de 14 px numa caixa de 12 px.
    expect(
      drawn({ size: 10, lineHeight: 14 }, { ...short, height: 12 }).warnings,
    ).toContain(OVERFLOW);
  });
});

describe('tolerância de 1 px no "conteúdo maior que a caixa" vindo de texto', () => {
  const column = (lineHeight: number): ComponentFile => ({
    format: 'mapping-component',
    formatVersion: 4,
    id: 'col',
    name: 'Col',
    size: { width: 100, height: 40 },
    template: {
      type: 'frame',
      name: 'col',
      layout: { type: 'column' },
      children: [{ type: 'text', name: 'a', text: 'curto', font: { lineHeight } }],
    },
  });
  const warnings = (lineHeight: number, height: number) =>
    instantiate(
      column(lineHeight),
      {},
      { x: 0, y: 0, width: 100, height },
      { measure: approximateMeasurer },
    ).warnings;

  it('0,6 px de texto a mais não avisa', () => {
    expect(warnings(12.6, 12)).not.toContain('conteúdo maior que a caixa: col');
  });

  it('2 px de texto a mais avisa', () => {
    expect(warnings(14, 12).some((w) => w.startsWith('conteúdo maior que a caixa'))).toBe(
      true,
    );
  });
});

describe('component.schema.json: wrap, ellipsis e maxLines', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../../../docs/component.schema.json', import.meta.url), 'utf8'),
  ) as Record<string, unknown>;

  it('aceita as três chaves, com literal ou expressão, e recusa maxLines 0', () => {
    const ok = component(
      textNode({
        wrap: 'none',
        ellipsis: true,
        maxLines: { $field: 'lines', default: 2 },
      }),
    );
    expect(checkSchema(schema, ok)).toEqual([]);
    expect(
      checkSchema(schema, component(textNode({ maxLines: 0 }))).length,
    ).toBeGreaterThan(0);
    expect(
      checkSchema(schema, component(textNode({ wrap: 'char' }))).length,
    ).toBeGreaterThan(0);
  });
});

describe('cutLineLeft (MC0, decisão 30): onde começa a linha do texto cortado', () => {
  // Caixa de 100; o bloco é a linha mais larga.
  it.each([
    ['left', 0, 0],
    ['justify', 0, 0],
    ['center', 20, 20],
    ['right', 40, 40],
  ] as const)('%s: a linha mais larga (60) começa em %i', (align, _x, expected) => {
    expect(cutLineLeft(align, 100, 60, 60)).toBe(expected);
  });

  it.each([
    ['left', 0],
    ['justify', 0],
    ['center', 20 + 10],
    ['right', 40 + 20],
  ] as const)(
    '%s: a linha curta (40) dentro do bloco de 60 começa em %i',
    (align, expected) => {
      expect(cutLineLeft(align, 100, 60, 40)).toBe(expected);
    },
  );

  it.each(['left', 'justify', 'center', 'right'] as const)(
    '%s: o bloco mais largo que a caixa começa na borda esquerda',
    (align) => {
      expect(cutLineLeft(align, 100, 160, 160)).toBe(0);
    },
  );

  it('o bloco mais largo que a caixa alinha a linha curta dentro do bloco, não da caixa', () => {
    expect(cutLineLeft('center', 100, 160, 100)).toBe(30);
    expect(cutLineLeft('right', 100, 160, 100)).toBe(60);
    expect(cutLineLeft('left', 100, 160, 100)).toBe(0);
  });

  it('o bloco do tamanho da caixa começa em 0', () => {
    expect(cutLineLeft('right', 100, 100, 100)).toBe(0);
    expect(cutLineLeft('center', 100, 100, 100)).toBe(0);
  });
});

describe('visibleLineCount (MC0, decisão 31): as linhas que o Konva guarda', () => {
  it('a primeira linha sempre fica, mesmo numa caixa menor que a linha', () => {
    expect(visibleLineCount(3, 5, 12)).toBe(1);
  });

  it('caixa de 1 linha: 1; de 2: 2; de 2,5: 2; de 3: 3', () => {
    expect(visibleLineCount(5, 12, 12)).toBe(1);
    expect(visibleLineCount(5, 24, 12)).toBe(2);
    expect(visibleLineCount(5, 30, 12)).toBe(2);
    expect(visibleLineCount(5, 36, 12)).toBe(3);
  });

  it('bloco menor que a caixa: todas as linhas', () => {
    expect(visibleLineCount(2, 100, 12)).toBe(2);
    expect(visibleLineCount(0, 100, 12)).toBe(0);
  });

  it('sem altura (0), todas as linhas', () => {
    expect(visibleLineCount(4, 0, 12)).toBe(4);
  });

  it('sem total (Infinity) devolve quantas linhas cabem', () => {
    expect(visibleLineCount(Number.POSITIVE_INFINITY, 30, 12)).toBe(2);
  });

  it('a mesma aritmética do Konva: lineHeight / fontSize × fontSize, somado linha a linha', () => {
    // 14,3 / 11 × 11 não é exatamente 14,3; a soma de 3 linhas na caixa de 3 × 14,3 decide.
    const lh = konvaLineHeight(14.3, 11);
    expect(visibleLineCount(9, lh * 3, lh)).toBe(3);
  });
});
