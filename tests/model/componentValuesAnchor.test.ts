// R3 (#1096, decisão 11): `anchorValues` põe a âncora de uma marcação no que a instância lê
// (`$anchor.*`): centro e tamanho em unidades, relativos à caixa da instância; o lado é o lógico.
import { describe, expect, it } from 'vitest';
import { anchorValues } from '../../src/model/componentValues';

const rect = { x: 100, y: 200, width: 80, height: 40 };
const target = { x: 110, y: 100, width: 60, height: 20 };

describe('anchorValues', () => {
  it('densidade 1: o centro da âncora relativo ao canto da marcação, em pixels', () => {
    expect(
      anchorValues({
        rect,
        anchorRect: target,
        side: 'top',
        defaults: { side: 'bottom' },
        density: 1,
      }),
    ).toEqual({ side: 'top', centerX: 40, centerY: -90, width: 60, height: 20 });
  });

  it('a densidade converte tudo para unidades do componente', () => {
    expect(
      anchorValues({
        rect,
        anchorRect: target,
        side: 'top',
        defaults: { side: 'bottom' },
        density: 2,
      }),
    ).toEqual({ side: 'top', centerX: 20, centerY: -45, width: 30, height: 10 });
  });

  it('o centro pode passar da caixa (x maior que a largura, y negativo)', () => {
    const far = { x: 500, y: 0, width: 20, height: 20 };
    const v = anchorValues({
      rect,
      anchorRect: far,
      side: 'start',
      defaults: { side: 'top' },
      density: 1,
    });
    expect(v.centerX).toBe(410);
    expect(v.centerY).toBe(-190);
  });

  it('sem side declarado, vale o padrão do componente; o lado é lógico, não físico', () => {
    const v = anchorValues({
      rect,
      anchorRect: target,
      side: undefined,
      defaults: { side: 'end' },
      density: 1,
    });
    expect(v.side).toBe('end');
  });
});
