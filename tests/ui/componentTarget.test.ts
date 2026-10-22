import { afterEach, describe, expect, it } from 'vitest';
import type { MarkingComponent } from '../../src/model';
import { locale } from '../../src/store/settings';
import { addLabel, slotTargetName } from '../../src/ui/componentTarget';

// Rótulo do Adicionar com destino num componente com slot (rodada do Cowork da ME2, R12.12).
const card = { type: { name: 'Card' } } as Pick<MarkingComponent, 'type'>;

describe('rótulo do Adicionar dentro de um componente com slot', () => {
  afterEach(() => {
    locale.value = 'pt-BR';
  });

  it('usa o nome da marcação quando ela tem nome', () => {
    expect(slotTargetName({ name: 'Lista de produtos' }, card)).toBe('Lista de produtos');
  });

  it('sem nome, usa o nome do tipo que a instância desenha', () => {
    locale.value = 'pt-BR';
    const name = slotTargetName({ name: null }, card);
    expect(name).toBe('Card');
    expect(
      addLabel({ containerId: 'A', parentId: 'M', destination: { kind: 'slot', name } }),
    ).toBe('Adicionar dentro de Card');
    locale.value = 'en-US';
    expect(
      addLabel({ containerId: 'A', parentId: 'M', destination: { kind: 'slot', name } }),
    ).toBe('Add inside Card');
  });

  it('sem nome e sem componente, mantém o nome padrão', () => {
    locale.value = 'pt-BR';
    expect(slotTargetName({ name: null }, null)).toBe('Marcação sem nome');
  });
});
