// Pilha de fonte do componente: a família que vai ao canvas e a validade do valor (CSS).
import { describe, expect, it } from 'vitest';
import {
  canvasFontFamily,
  isValidFontFamily,
} from '../../../src/model/components/fontFamily';

const STACK =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';

describe('canvasFontFamily', () => {
  it('pilha passa como veio', () => {
    expect(canvasFontFamily(STACK)).toBe(STACK);
    expect(canvasFontFamily('Roboto, serif')).toBe('Roboto, serif');
  });

  it('nome entre aspas passa como veio, com sans-serif no fim', () => {
    expect(canvasFontFamily('"Segoe UI"')).toBe('"Segoe UI", sans-serif');
    expect(canvasFontFamily("'Segoe UI'")).toBe("'Segoe UI', sans-serif");
  });

  it('nome genérico sozinho fica sem aspas, em qualquer caixa', () => {
    expect(canvasFontFamily('system-ui')).toBe('system-ui');
    expect(canvasFontFamily('MONOSPACE')).toBe('MONOSPACE');
    expect(canvasFontFamily('ui-rounded')).toBe('ui-rounded');
  });

  it('nome simples vira nome entre aspas, como antes', () => {
    expect(canvasFontFamily('Roboto')).toBe('"Roboto", sans-serif');
    expect(canvasFontFamily('Segoe UI')).toBe('"Segoe UI", sans-serif');
  });

  it('valor inválido cai em sans-serif', () => {
    expect(canvasFontFamily('"Segoe UI, Roboto')).toBe('sans-serif');
    expect(canvasFontFamily('')).toBe('sans-serif');
  });
});

describe('isValidFontFamily', () => {
  it('aceita nome, nome com aspas, genérico e pilha', () => {
    expect(isValidFontFamily('Roboto')).toBe(true);
    expect(isValidFontFamily('"Segoe UI"')).toBe(true);
    expect(isValidFontFamily("'Segoe UI'")).toBe(true);
    expect(isValidFontFamily('system-ui')).toBe(true);
    expect(isValidFontFamily(STACK)).toBe(true);
  });

  it('recusa aspas sem fechar, item vazio, aspas no meio do nome e vazio', () => {
    expect(isValidFontFamily('"Segoe UI, Roboto')).toBe(false);
    expect(isValidFontFamily('Roboto, , serif')).toBe(false);
    expect(isValidFontFamily('Seg"oe')).toBe(false);
    expect(isValidFontFamily('')).toBe(false);
    expect(isValidFontFamily('   ')).toBe(false);
    expect(isValidFontFamily('Roboto,')).toBe(false);
  });
});
