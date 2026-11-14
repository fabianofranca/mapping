import { beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import {
  addBackgroundContainer,
  changeType,
  createArrow,
  createMarking,
  setContainerDensity,
  setMarkingAnchor,
  snapToAnchor,
  setContainerDirection,
  setProjectDirection,
  setProjectDrawingMode,
  type Change,
  type JsonValue,
  type Proposal,
} from '../../src/model';
import {
  changeSummary,
  changeTitle,
  droppedChangeSummary,
  markingName,
} from '../../src/ui/review/changeText';
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

describe('droppedChangeSummary: resumo da mudança retirada', () => {
  it('mostra o tipo da anotação criada, que já não está na proposta', () => {
    const button = created({ name: null, type: { specId: 'sdui', typeId: 'button' } });
    // A mudança foi retirada: a proposta já não a tem em `changes`.
    const names = { current: cadastroProject(), preview: null, proposal: proposalOf([]) };
    const summary = droppedChangeSummary(names, button);
    expect(summary).toContain('Button');
    expect(summary).not.toContain(t('annotation.unnamed'));
  });
});

describe('changeTitle: o ajuste ao conteúdo (MC3, decisão 18 da #898)', () => {
  it('a mudança de retângulo que o fit_marking gera é a Posição de sempre, do tipo movida', () => {
    const rect: Change = {
      id: 'C1',
      kind: 'update',
      entity: 'marking',
      entityId: 'M1',
      imageId: 'I1',
      markingId: 'M1',
      field: 'rect',
      from: { x: 20, y: 20, width: 120, height: 40 },
      to: { x: 20, y: 20, width: 120, height: 96 },
    };
    const names = {
      current: sampleProject(),
      preview: null,
      proposal: proposalOf([rect]),
    };
    expect(changeType(rect)).toBe('moved');
    expect(changeTitle(names, rect)).toBe(t('review.field.rect'));
  });
});

describe('changeTitle e changeSummary: a densidade do container (D2, decisão 7 da #1085)', () => {
  beforeEach(() => {
    locale.value = 'pt-BR';
  });
  const base = addBackgroundContainer(emptyProject(), {
    id: 'c1',
    width: 1080,
    height: 2400,
    background: '#FFFFFF',
  });
  const summaryOf = (before: typeof base, after: typeof base) => {
    const proposal = propose(before, after);
    const change = proposal.changes.find((c) => c.field === 'density');
    if (!change) throw new Error('sem mudança de densidade');
    const names = { current: before, preview: null, proposal };
    return `${changeTitle(names, change)}: ${changeSummary(names, change)}`;
  };

  it('uma proposta com update_container density mostra "Densidade: 1 → 3"', () => {
    expect(summaryOf(base, setContainerDensity(base, 'c1', 3))).toBe('Densidade: 1 → 3');
  });

  it('voltar a 1 (null) mostra "3 → 1", e valor fracionário usa o separador do idioma', () => {
    const fixed = setContainerDensity(base, 'c1', 3);
    expect(summaryOf(fixed, base)).toBe('Densidade: 3 → 1');
    expect(summaryOf(base, setContainerDensity(base, 'c1', 2.5))).toBe(
      'Densidade: 1 → 2,5',
    );
  });
});

describe('changeTitle e changeSummary: a direção de leitura (R2 da etapa #1096)', () => {
  beforeEach(() => {
    locale.value = 'pt-BR';
  });
  const base = addBackgroundContainer(emptyProject(), {
    id: 'c1',
    width: 1080,
    height: 2400,
    background: '#FFFFFF',
  });
  const summaryOf = (before: typeof base, after: typeof base, entity: string) => {
    const proposal = propose(before, after);
    const change = proposal.changes.find(
      (c) => c.entity === entity && (entity === 'project' || c.field === 'direction'),
    );
    if (!change) throw new Error('sem mudança de direção');
    const names = { current: before, preview: null, proposal };
    const summary = changeSummary(names, change);
    return entity === 'project' ? summary : `${changeTitle(names, change)}: ${summary}`;
  };

  it('o container que fixa rtl mostra "Direção: Segue o projeto → direita para a esquerda"', () => {
    expect(summaryOf(base, setContainerDirection(base, 'c1', 'rtl'), 'image')).toBe(
      'Direção: Segue o projeto → direita para a esquerda',
    );
  });

  it('voltar a seguir o projeto mostra o texto de "Segue o projeto"', () => {
    const fixed = setContainerDirection(base, 'c1', 'rtl');
    expect(summaryOf(fixed, base, 'image')).toBe(
      'Direção: direita para a esquerda → Segue o projeto',
    );
  });

  it('a direção do projeto aparece na mudança do projeto, com o campo "Direção"', () => {
    const empty = t('review.value.empty');
    expect(summaryOf(base, setProjectDirection(base, 'rtl'), 'project')).toBe(
      `${empty} → Direção: direita para a esquerda`,
    );
  });

  it('trocar só o modo num projeto rtl mantém a direção nos dois lados', () => {
    const rtl = setProjectDirection(base, 'rtl');
    expect(summaryOf(rtl, setProjectDrawingMode(rtl, 'dark'), 'project')).toBe(
      'Direção: direita para a esquerda → dark · Direção: direita para a esquerda',
    );
  });

  it('em en-US o campo e os valores também vêm de t()', () => {
    locale.value = 'en-US';
    expect(summaryOf(base, setContainerDirection(base, 'c1', 'rtl'), 'image')).toBe(
      'Direction: Follows the project → right to left',
    );
  });
});

describe('changeTitle e changeSummary: a âncora da marcação (R3 da etapa #1096)', () => {
  beforeEach(() => {
    locale.value = 'pt-BR';
  });
  const base = createMarking(
    createMarking(
      addBackgroundContainer(emptyProject(), {
        id: 'c1',
        width: 400,
        height: 400,
        background: '#FFFFFF',
      }),
      {
        id: 'T',
        containerId: 'c1',
        name: 'Botão',
        rect: { x: 100, y: 100, width: 80, height: 30 },
      },
    ),
    {
      id: 'B',
      containerId: 'c1',
      name: 'Dica',
      rect: { x: 300, y: 10, width: 60, height: 20 },
    },
  );
  const summaryOf = (before: typeof base, after: typeof base, field = 'anchor') => {
    const proposal = propose(before, after);
    const change = proposal.changes.find((c) => c.field === field);
    if (!change) throw new Error(`sem mudança de ${field}`);
    const names = { current: before, preview: null, proposal };
    return `${changeTitle(names, change)}: ${changeSummary(names, change)}`;
  };

  it('ancorar mostra "Âncora: … → lado/alinhamento de <nome da âncora>"', () => {
    const anchored = setMarkingAnchor(base, 'B', {
      to: 'T',
      side: 'top',
      align: 'start',
    });
    expect(summaryOf(base, anchored)).toBe(
      `Âncora: ${t('review.value.empty')} → acima/início de Botão`,
    );
  });

  it('o que a âncora não diz aparece como "padrão" e tirar a âncora volta a vazio', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T' });
    expect(summaryOf(base, anchored)).toBe(
      `Âncora: ${t('review.value.empty')} → padrão/padrão de Botão`,
    );
    expect(summaryOf(anchored, base)).toBe(
      `Âncora: padrão/padrão de Botão → ${t('review.value.empty')}`,
    );
  });

  it('em en-US o campo e os valores vêm de t()', () => {
    locale.value = 'en-US';
    const anchored = setMarkingAnchor(base, 'B', {
      to: 'T',
      side: 'end',
      align: 'center',
    });
    expect(summaryOf(base, anchored)).toBe(
      `Anchor: ${t('review.value.empty')} → end/center of Botão`,
    );
  });

  it('o snap_to_anchor é a Posição de sempre, do tipo movida', () => {
    const anchored = setMarkingAnchor(base, 'B', { to: 'T', side: 'bottom' });
    const proposal = propose(anchored, snapToAnchor(anchored, 'B').project);
    const rect = proposal.changes.find((c) => c.field === 'rect')!;
    expect(changeType(rect)).toBe('moved');
    expect(changeTitle({ current: anchored, preview: null, proposal }, rect)).toBe(
      t('review.field.rect'),
    );
  });
});
