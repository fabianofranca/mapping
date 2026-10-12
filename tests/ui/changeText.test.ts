import { describe, expect, it } from 'vitest';
import type { Change, JsonValue, Proposal } from '../../src/model';
import { changeTitle } from '../../src/ui/review/changeText';
import { emptyProject } from '../model/fixtures';
import { cadastroProject, loadExample } from '../model/specFixtures';

// Etapa 6 (6.4), achado 6: o nome do tipo de uma anotação criada tem a mesma caixa na
// lista ("Anotação Button criada") e em Detalhes, mesmo quando a anotação não está no
// "como ficaria" (rejeitada) e o título sai da própria mudança.

function created(to: JsonValue): Change {
  return {
    id: 'C1',
    kind: 'create',
    entity: 'annotation',
    entityId: 'NOVA',
    imageId: null,
    markingId: null,
    field: null,
    from: null,
    to,
  };
}

const proposalOf = (changes: readonly Change[]) => ({ changes }) as unknown as Proposal;

describe('changeTitle: nome do tipo', () => {
  const button = created({ name: null, type: { specId: 'sdui', typeId: 'button' } });

  it('usa o nome do tipo da especialização do projeto, não o id', () => {
    const names = {
      current: cadastroProject(),
      preview: null,
      proposal: proposalOf([button]),
    };
    expect(changeTitle(names, button)).toContain('Button');
    expect(changeTitle(names, button)).not.toContain('button');
  });

  it('numa importação nova, acha o nome na especialização que a proposta aplica', () => {
    const spec: Change = {
      ...created({
        id: 'sdui',
        version: 2,
        spec: loadExample('sdui') as unknown as JsonValue,
      }),
      id: 'C0',
      entity: 'specialization',
      entityId: 'sdui',
    };
    const names = {
      current: emptyProject(),
      preview: null,
      proposal: proposalOf([spec, button]),
    };
    expect(changeTitle(names, button)).toContain('Button');
    expect(changeTitle(names, button)).not.toContain('button');
  });
});
