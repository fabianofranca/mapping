import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearch } from '../../src/utils/search';

describe('busca', () => {
  it('ignora acentos e maiúsculas', () => {
    expect(normalizeSearch('Ação Ñandú')).toBe('acao nandu');
    expect(matchesSearch('Especialização de dados', 'ESPECIALIZACAO')).toBe(true);
  });

  it('exige todas as palavras, em qualquer ordem', () => {
    expect(matchesSearch('Carro vermelho', 'vermelho carro')).toBe(true);
    expect(matchesSearch('Carro vermelho', 'carro azul')).toBe(false);
  });

  it('consulta vazia casa com tudo', () => {
    expect(matchesSearch('qualquer coisa', '')).toBe(true);
    expect(matchesSearch('qualquer coisa', '   ')).toBe(true);
  });
});
