import { afterEach, describe, expect, it } from 'vitest';
import type { Project } from '../../src/model';
import { locale } from '../../src/store/settings';
import { addLabel, slotTargetName } from '../../src/ui/componentTarget';
import { marking, sampleProject } from '../model/fixtures';
import { withNoteInstance } from '../model/notesFixtures';

// Rótulo do Adicionar com destino num componente com slot (rodada do Cowork da ME2, R12.12):
// reaproveita o rótulo da marcação (nome; sem nome, o do tipo que ela desenha).
function project(): Project {
  return withNoteInstance(sampleProject());
}

describe('rótulo do Adicionar dentro de um componente com slot', () => {
  afterEach(() => {
    locale.value = 'pt-BR';
  });

  it('usa o nome da marcação quando ela tem nome', () => {
    const p = project();
    expect(slotTargetName(p, { id: 'N1', name: 'Lista de produtos' })).toBe(
      'Lista de produtos',
    );
  });

  it('sem nome, usa o nome do tipo que a instância desenha', () => {
    locale.value = 'pt-BR';
    const p = project();
    const name = slotTargetName(p, marking(p, 'N1'));
    expect(name).toBe('Nota');
    expect(
      addLabel({ containerId: 'A', parentId: 'M', destination: { kind: 'slot', name } }),
    ).toBe('Adicionar dentro de Nota');
    locale.value = 'en-US';
    expect(
      addLabel({ containerId: 'A', parentId: 'M', destination: { kind: 'slot', name } }),
    ).toBe('Add inside Nota');
  });

  it('sem nome e sem tipo de componente, mantém o nome padrão', () => {
    locale.value = 'pt-BR';
    const p = project();
    expect(slotTargetName(p, marking(p, 'M4'))).toBe('Marcação sem nome');
  });
});
