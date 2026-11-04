import { describe, expect, it } from 'vitest';
import { snapNearInteger } from '../../src/model';

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
