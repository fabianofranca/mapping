import { afterEach, describe, expect, it } from 'vitest';
import { ancestorsOf } from '../../src/model';
import { locale } from '../../src/store/settings';
import { markingErrorMessage, markingLabel, markingPath } from '../../src/ui/labels';
import { marking, sampleProject } from '../model/fixtures';

describe('rótulos de marcações', () => {
  afterEach(() => {
    locale.value = 'pt-BR';
  });

  it('ancestrais do pai até a raiz', () => {
    const p = sampleProject();
    expect(ancestorsOf(p, 'M3').map((m) => m.id)).toEqual(['M2', 'M1']);
    expect(ancestorsOf(p, 'M1')).toEqual([]);
  });

  it('caminho completo e nome padrão', () => {
    locale.value = 'pt-BR';
    const p = sampleProject();
    expect(markingPath(p, marking(p, 'M3'))).toBe('Porta › Maçaneta › Fechadura');
    expect(markingLabel(marking(p, 'M4'))).toBe('Marcação sem nome');
    locale.value = 'en-US';
    expect(markingLabel(marking(p, 'M4'))).toBe('Unnamed marking');
  });

  it('mensagens de erro do retângulo', () => {
    locale.value = 'pt-BR';
    expect(markingErrorMessage('rect-too-small')).toBe(
      'Cada lado precisa ter pelo menos 8 px.',
    );
    expect(markingErrorMessage('no-project')).toBe(
      'Não foi possível alterar a marcação.',
    );
  });
});
