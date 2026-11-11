// Cache de medida de texto (#1078, decisão 19): o medidor memoizado (`cachedMeasurer`, LRU por
// texto, fonte e limite) e o `textMemo` do motor, que não pede ao medidor a mesma medida duas vezes.
import { describe, expect, it } from 'vitest';
import type {
  ComponentFile,
  FrameTemplate,
  TextTemplate,
} from '../../../src/model/components/componentFormat';
import {
  approximateMeasurer,
  instantiate,
  type MeasureFont,
  type TextMeasurer,
} from '../../../src/model/components/instantiate';
import { cachedMeasurer } from '../../../src/model/components/measureCache';

const FONT: MeasureFont = {
  family: 'Inter',
  size: 14,
  weight: 400,
  italic: false,
  lineHeight: 16.8,
  letterSpacing: 0,
};

/** Um medidor que conta as chamadas e devolve um objeto novo a cada uma. */
function counting(): { measure: TextMeasurer; calls: () => number } {
  let count = 0;
  return {
    measure: (text, font, maxWidth) => {
      count++;
      return { ...approximateMeasurer(text, font, maxWidth) };
    },
    calls: () => count,
  };
}

describe('cachedMeasurer', () => {
  it('devolve o mesmo TextMetrics para a mesma chave, sem chamar o medidor de novo', () => {
    const spy = counting();
    const measure = cachedMeasurer(spy.measure, { limit: 8 });
    const first = measure('Olá mundo', FONT, 120);
    const again = measure('Olá mundo', { ...FONT }, 120);
    expect(again).toBe(first);
    expect(spy.calls()).toBe(1);
  });

  it('outro maxWidth, texto ou campo da fonte é outra chave', () => {
    const spy = counting();
    const measure = cachedMeasurer(spy.measure, { limit: 8 });
    const base = measure('Olá mundo', FONT, 120);
    expect(measure('Olá mundo', FONT, 60)).not.toBe(base);
    expect(measure('Olá mundo', FONT)).not.toBe(base);
    expect(measure('Outro', FONT, 120)).not.toBe(base);
    expect(measure('Olá mundo', { ...FONT, weight: 700 }, 120)).not.toBe(base);
    expect(measure('Olá mundo', { ...FONT, wrap: 'none' }, 120)).not.toBe(base);
    expect(measure('Olá mundo', { ...FONT, maxLines: 1 }, 120)).not.toBe(base);
    expect(spy.calls()).toBe(7);
  });

  it('maxWidth que difere menos de 1/64 px é a mesma chave', () => {
    const spy = counting();
    const measure = cachedMeasurer(spy.measure, { limit: 8 });
    const first = measure('Olá mundo', FONT, 100);
    expect(measure('Olá mundo', FONT, 100.001)).toBe(first);
    expect(measure('Olá mundo', FONT, 100.5)).not.toBe(first);
    expect(spy.calls()).toBe(2);
  });

  it('esquece pelo LRU: sai a entrada menos usada', () => {
    const spy = counting();
    const measure = cachedMeasurer(spy.measure, { limit: 2 });
    const a = measure('a', FONT);
    measure('b', FONT);
    measure('a', FONT); // 'a' vira a mais recente; 'b' é a menos usada.
    measure('c', FONT); // Entra e expulsa 'b'.
    expect(measure('a', FONT)).toBe(a);
    expect(spy.calls()).toBe(3);
    measure('b', FONT); // Foi esquecida: o medidor é chamado de novo.
    expect(spy.calls()).toBe(4);
  });
});

// --- o motor: a mesma medida não chega duas vezes ao medidor -------------------------------------

function text(content: string, extra: Partial<TextTemplate> = {}): TextTemplate {
  return { type: 'text', text: content, width: 'hug', height: 'hug', ...extra };
}

function frame(children: FrameTemplate['children'], extra: Partial<FrameTemplate> = {}) {
  const node: FrameTemplate = {
    type: 'frame',
    width: 'hug',
    height: 'hug',
    layout: { type: 'column' },
    children,
    ...extra,
  };
  return node;
}

function component(template: FrameTemplate): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id: 'memo',
    name: 'Memo',
    size: { width: 200, height: 120 },
    template,
  };
}

/** As chamadas ao medidor por (texto, fonte, limite): cada chave deve aparecer uma vez. */
function callsByKey(template: FrameTemplate): Map<string, number> {
  const byKey = new Map<string, number>();
  const measure: TextMeasurer = (value, font, maxWidth) => {
    const key = JSON.stringify([value, font, maxWidth ?? null]);
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
    return approximateMeasurer(value, font, maxWidth);
  };
  instantiate(
    component(template),
    {},
    { x: 0, y: 0, width: 200, height: 120 },
    { measure },
  );
  return byKey;
}

describe('textMemo do motor', () => {
  it('quadro hug de 3 níveis com o mesmo texto 4 vezes: uma chamada por (texto, limite)', () => {
    const same = 'Mesmo texto repetido';
    const tpl = frame([
      frame([text(same), text(same)], { layout: { type: 'row', gap: 4 } }),
      frame([frame([text(same), text(same)])]),
    ]);
    const byKey = callsByKey(tpl);
    expect(byKey.size).toBeGreaterThan(0);
    expect(Math.max(...byKey.values())).toBe(1);
  });

  it('um texto hug com limite de largura (fill) mede cada limite uma vez só', () => {
    const tpl = frame(
      [
        text('uma frase com várias palavras para quebrar', { width: 'fill' }),
        frame([text('rótulo curto'), text('rótulo curto', { width: 'fill' })], {
          layout: { type: 'row', gap: 4 },
          width: 'fill',
        }),
      ],
      { width: 'fill' },
    );
    const byKey = callsByKey(tpl);
    expect(Math.max(...byKey.values())).toBe(1);
  });
});
