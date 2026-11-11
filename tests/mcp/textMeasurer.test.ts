import { readFileSync } from 'node:fs';
import { parse } from 'opentype.js';
import { describe, expect, it } from 'vitest';
import { createMeasurer } from '../../mcp/image/textMeasurer';
import type { MeasureFont } from '../../src/model/components/instantiate';

// CF9 (decisão 31): o medidor do servidor mede com o opentype.js e a fonte livre embutida.

const sans = parse(
  new Uint8Array(readFileSync('mcp/fonts/MappingSans-Regular.ttf')).buffer as ArrayBuffer,
);

const font: MeasureFont = {
  family: 'sans-serif',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 20,
  letterSpacing: 0,
};

describe('medidor com opentype.js', () => {
  const measure = createMeasurer();

  it('"Pagar fatura" em sans 14 px mede a largura do glifo (±0,5 px)', () => {
    const expected = sans.getAdvanceWidth('Pagar fatura', 14, { kerning: true });
    expect(expected).toBeGreaterThan(50);
    expect(Math.abs(measure('Pagar fatura', font).width - expected)).toBeLessThan(0.5);
  });

  it('uma caixa de 60 px quebra "Pagar fatura" em 2 linhas', () => {
    const result = measure('Pagar fatura', font, 60);
    expect(result.lines).toEqual(['Pagar', 'fatura']);
    expect(result.height).toBe(40);
  });

  it('wrap: none + ellipsis termina em … dentro da largura', () => {
    const result = measure(
      'Pagar fatura do cartão de crédito',
      { ...font, wrap: 'none', ellipsis: true },
      90,
    );
    expect(result.lines).toHaveLength(1);
    const line = result.lines![0]!;
    expect(line.endsWith('…')).toBe(true);
    expect(result.width).toBeLessThanOrEqual(90 + 1e-6);
  });

  it('peso ≥ 600 usa a fonte negrito (mais larga); mono mede mais que sans nos mesmos caracteres', () => {
    const regular = measure('Salvar alterações', font).width;
    expect(measure('Salvar alterações', { ...font, weight: 700 }).width).toBeGreaterThan(
      regular,
    );
    const mono = measure('iiiiiiii', { ...font, family: 'monospace' }).width;
    expect(mono).toBeGreaterThan(measure('iiiiiiii', font).width);
  });

  it('fonte da biblioteca vale no lugar da embutida', () => {
    const bold = new Uint8Array(readFileSync('mcp/fonts/MappingMono-Bold.ttf'));
    const custom = createMeasurer([
      {
        family: 'Acme',
        weight: '400',
        style: 'normal',
        path: 'fonts/Acme.ttf',
        bytes: bold.buffer.slice(
          bold.byteOffset,
          bold.byteOffset + bold.byteLength,
        ) as ArrayBuffer,
      },
    ]);
    const withAcme = custom('iiiiiiii', { ...font, family: 'Acme, sans-serif' }).width;
    expect(withAcme).not.toBeCloseTo(measure('iiiiiiii', font).width, 1);
    expect(withAcme).toBeCloseTo(
      measure('iiiiiiii', { ...font, family: 'monospace', weight: 700 }).width,
      3,
    );
  });
});

describe('medidor com opentype.js: linha de base (MC1, decisão 2)', () => {
  const measure = createMeasurer();

  it('a primeira linha de base é a do lineInk: centro da linha + (ascent − descent) / 2', () => {
    const k = 14 / sans.unitsPerEm;
    const ascent = sans.ascender * k;
    const descent = -sans.descender * k;
    const m = measure('Pagar', font);
    expect(m.firstBaseline).toBeCloseTo(10 + (ascent - descent) / 2, 6);
    expect(m.lastBaseline).toBeCloseTo(m.firstBaseline ?? 0, 6);
    expect(m.lineCount).toBe(1);
  });

  it('com duas linhas a última está uma altura de linha abaixo da primeira', () => {
    const m = measure('Pagar fatura', font, 60);
    expect(m.lineCount).toBe(2);
    expect((m.lastBaseline ?? 0) - (m.firstBaseline ?? 0)).toBeCloseTo(20, 6);
  });
});
