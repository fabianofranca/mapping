import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hasParentSegment, isWithin } from '../../mcp/paths';

// Os testes do servidor rodam só no Linux (CI `ubuntu-latest`); as duas conferências de caminho
// que valem no Windows são testadas aqui com `path.win32` (fase 8.5, M14).

describe('isWithin', () => {
  it.each([
    ['C:\\proj', 'C:\\proj', true],
    ['C:\\proj', 'C:\\proj\\loja\\mapping.json', true],
    ['C:\\proj', 'c:\\PROJ\\loja', true],
    ['C:\\proj\\', 'C:\\proj\\loja', true],
    ['C:\\proj', 'C:\\projeto', false],
    ['C:\\proj', 'C:\\proj\\..\\fora', false],
    ['C:\\proj', 'C:\\', false],
    ['C:\\proj', 'D:\\proj\\loja', false],
    ['\\\\servidor\\design', '\\\\servidor\\design\\loja', true],
    ['\\\\servidor\\design', '\\\\servidor\\outra\\loja', false],
    ['\\\\servidor\\design', 'C:\\design\\loja', false],
  ])('win32: %s contém %s? %s', (parent, child, expected) => {
    expect(isWithin(parent, child, path.win32)).toBe(expected);
  });

  it.each([
    ['/raiz', '/raiz/loja', true],
    ['/raiz', '/raiz', true],
    ['/raiz', '/raiz-2/loja', false],
    ['/raiz', '/', false],
    ['/raiz', '/RAIZ/loja', false],
  ])('posix (padrão): %s contém %s? %s', (parent, child, expected) => {
    expect(isWithin(parent, child)).toBe(expected);
    expect(isWithin(parent, child, path.posix)).toBe(expected);
  });
});

describe('hasParentSegment', () => {
  it.each([
    ['..\\fora', true],
    ['loja\\..\\..\\fora', true],
    ['loja/..\\fora', true],
    ['C:\\proj\\..', true],
    ['loja\\a..b\\c', false],
    ['loja\\..x', false],
    ['..loja', false],
    ['loja\\imagens', false],
  ])('%s → %s', (input, expected) => {
    expect(hasParentSegment(input)).toBe(expected);
  });
});
