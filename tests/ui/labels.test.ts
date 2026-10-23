import { afterEach, describe, expect, it } from 'vitest';
import { ancestorsOf } from '../../src/model';
import { locale } from '../../src/store/settings';
import { t } from '../../src/i18n';
import {
  arrowEnds,
  arrowText,
  markingErrorMessage,
  markingLabel,
  markingPath,
} from '../../src/ui/labels';
import { createArrow } from '../../src/model';
import { marking, sampleProject } from '../model/fixtures';
import { withNoteInstance } from '../model/notesFixtures';

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
    expect(markingLabel(p, marking(p, 'M4'))).toBe('Marcação sem nome');
    locale.value = 'en-US';
    expect(markingLabel(p, marking(p, 'M4'))).toBe('Unnamed marking');
  });

  it('instância de componente sem nome: o rótulo é o nome do tipo; o nome próprio vence', () => {
    locale.value = 'pt-BR';
    const p = withNoteInstance(sampleProject());
    const note = marking(p, 'N1');
    expect(markingLabel(p, note)).toBe('Nota');
    expect(markingLabel(p, { id: note.id, name: 'Minha nota' })).toBe('Minha nota');
    // Marcação comum sem nome continua com o texto padrão.
    expect(markingLabel(p, marking(p, 'M4'))).toBe('Marcação sem nome');
  });

  it('a seta e o caminho usam o nome do tipo nas pontas sem nome', () => {
    const p = createArrow(withNoteInstance(sampleProject()), {
      id: 'S1',
      from: 'N1',
      to: 'M1',
    });
    const arrow = p.arrows[0]!;
    expect(arrowEnds(p, arrow)).toMatchObject({ from: 'Nota', to: 'Porta' });
    expect(arrowText(p, arrow)).toBe('Nota → Porta');
    expect(markingPath(p, marking(p, 'N1'))).toBe('Nota');
  });

  it('mensagens de erro do retângulo', () => {
    locale.value = 'pt-BR';
    expect(markingErrorMessage('rect-too-small')).toBe(
      'Cada lado precisa ter pelo menos 8 px.',
    );
    expect(markingErrorMessage('locked')).toBe(t('marking.error.locked'));
    expect(markingErrorMessage('no-project')).toBe(
      'Não foi possível alterar a marcação.',
    );
  });
});
