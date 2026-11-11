import { describe, expect, it } from 'vitest';
import {
  snapCoordinate,
  snapNearInteger,
  snapPlacement,
  snapScale,
  touchDelta,
} from '../../src/model';

// Ruído de ponto flutuante perto de um inteiro vira o inteiro; fração de verdade fica.
describe('snapNearInteger', () => {
  it('perto de um inteiro devolve o inteiro', () => {
    expect(snapNearInteger(211.99999999999977)).toBe(212);
    expect(snapNearInteger(100.00000000000023)).toBe(100);
    expect(snapNearInteger(7)).toBe(7);
  });

  it('fração de verdade fica como está', () => {
    expect(snapNearInteger(1868.13)).toBe(1868.13);
    expect(snapNearInteger(0.5)).toBe(0.5);
    expect(snapNearInteger(-3.25)).toBe(-3.25);
  });

  it('o negativo perto de zero dá 0, e não -0', () => {
    const v = snapNearInteger(-2.2737367544323206e-13);
    expect(Object.is(v, 0)).toBe(true);
    expect(JSON.stringify({ v })).toBe('{"v":0}');
    expect(Object.is(snapNearInteger(-0), 0)).toBe(true);
  });

  it('a tolerância é configurável e o limite é exclusivo', () => {
    expect(snapNearInteger(1.05, 0.1)).toBe(1);
    expect(snapNearInteger(1.2, 0.1)).toBe(1.2);
    expect(snapNearInteger(1 + 2e-6)).toBe(1 + 2e-6);
  });

  it('valor não finito passa como está', () => {
    expect(snapNearInteger(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(snapNearInteger(Number.NaN)).toBeNaN();
  });
});

// Política de arredondamento do `placement` (decisão 1 da etapa #1190): 6 casas em x/y, 12
// algarismos significativos na escala; o inteiro continua valendo.
describe('snapCoordinate', () => {
  it('corta a cauda de ponto flutuante a 6 casas', () => {
    expect(snapCoordinate(-188.75000000000006)).toBe(-188.75);
    expect(snapCoordinate(-739.6551724137931)).toBe(-739.655172);
    expect(snapCoordinate(1099.9999785087473)).toBe(1099.999979);
  });

  it('perto de um inteiro devolve o inteiro', () => {
    expect(snapCoordinate(274.9999999)).toBe(275);
  });

  it('nunca devolve -0', () => {
    for (const v of [-0.0000004, -0, -2.2737367544323206e-13]) {
      expect(Object.is(snapCoordinate(v), 0)).toBe(true);
    }
  });

  it('fração com até 6 casas fica como está', () => {
    expect(snapCoordinate(1868.13)).toBe(1868.13);
    expect(snapCoordinate(-0.000001)).toBe(-0.000001);
  });

  it('valor não finito passa como está', () => {
    expect(snapCoordinate(Number.NaN)).toBeNaN();
    expect(snapCoordinate(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(snapCoordinate(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('snapScale', () => {
  it('corta a escala a 12 algarismos significativos', () => {
    expect(snapScale(17.24137931034483)).toBe(17.2413793103);
    expect(snapScale(0.5000000000000001)).toBe(0.5);
  });

  it('perto de um inteiro >= 1 devolve o inteiro', () => {
    expect(snapScale(1.0000000000000002)).toBe(1);
    expect(snapScale(9.9999999)).toBe(10);
  });

  it('uma escala pequena nunca vira 0', () => {
    expect(snapScale(1e-9)).toBe(1e-9);
    expect(snapScale(0.4)).toBe(0.4);
    expect(snapScale(1.2345678901234e-9)).toBe(1.23456789012e-9);
  });

  it('valor não finito passa como está', () => {
    expect(snapScale(Number.NaN)).toBeNaN();
    expect(snapScale(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('snapPlacement: a política', () => {
  it('grava x e y com 6 casas e a escala com 12 algarismos', () => {
    expect(
      snapPlacement({
        x: -188.75000000000006,
        y: -739.6551724137931,
        scale: 17.24137931034483,
      }),
    ).toEqual({ x: -188.75, y: -739.655172, scale: 17.2413793103 });
  });
});

// Decisão 9 (#1187 itens 2 e 4): `touchDelta`; o teste de propriedade está em multiSelection.test.ts.
describe('touchDelta', () => {
  it('sem ninguém que ande devolve o pedido (arredondado e truncado com `whole`)', () => {
    expect(touchDelta([], [], 3.4, -2.6, false)).toEqual({ dx: 3.4, dy: -2.6 });
    expect(touchDelta([], [], 3.4, -2.6, true)).toEqual({ dx: 3, dy: -3 });
  });

  it('encosta e desliza como o slideToTouch', () => {
    const moving = [{ x: 0, y: 0, width: 100, height: 100 }];
    const fixed = [{ x: 150, y: 0, width: 100, height: 100 }];
    expect(touchDelta(moving, fixed, 200, 30, false)).toEqual({ dx: 50, dy: 30 });
  });
});
