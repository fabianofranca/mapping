import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { createArrow, type Change, type JsonValue, type Proposal } from '../../src/model';
import { changeTitle, markingName } from '../../src/ui/review/changeText';
import { emptyProject, sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';
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

// Seta (ME4): o nome dela, senão "Origem → Destino" pelos nomes das marcações das pontas.
describe('changeTitle: seta', () => {
  const base = sampleProject();
  const named = createArrow(base, { id: 'R1', from: 'M1', to: 'M2', name: 'abre' });
  const plain = createArrow(base, { id: 'R2', from: 'M1', to: 'M2' });

  it('usa o nome da seta', () => {
    const proposal = propose(base, named);
    const c = proposal.changes[0]!;
    const title = changeTitle({ current: base, preview: named, proposal }, c);
    expect(title).toContain('abre');
    expect(title).toContain(t('review.entity.arrow'));
  });

  it('sem nome, usa as marcações das pontas, com a seta ainda só na proposta', () => {
    const proposal = propose(base, plain);
    const c = proposal.changes[0]!;
    // Sem a prévia, o nome sai do registro da criação (`to`) e dos nomes das marcações.
    const title = changeTitle({ current: base, preview: null, proposal }, c);
    expect(title).toContain('Porta → Maçaneta');
  });

  it('o item da revisão que é uma seta tem o nome dela', () => {
    const proposal = propose(base, plain);
    expect(markingName({ current: base, preview: plain, proposal }, 'R2')).toBe(
      'Porta → Maçaneta',
    );
    expect(markingName({ current: base, preview: null, proposal }, 'R2')).toBe(
      'Porta → Maçaneta',
    );
    // A marcação segue pelo nome dela.
    expect(markingName({ current: base, preview: null, proposal }, 'M1')).toBe('Porta');
  });

  it('a remoção da seta usa o registro de antes', () => {
    const proposal = propose(plain, base);
    const c = proposal.changes[0]!;
    expect(changeTitle({ current: plain, preview: base, proposal }, c)).toContain(
      'Porta → Maçaneta',
    );
  });
});
