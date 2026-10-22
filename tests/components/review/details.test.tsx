import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addAnnotation,
  addLayer,
  applySpecialization,
  removeAnnotation,
  removeEntry,
  removeLayer,
  removeMarking,
  renameLayer,
  renameMarking,
  setMarkingLocked,
  updateEntry,
  type Project,
  type Proposal,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ReviewDetails } from '../../../src/ui/review/ReviewDetails';
import { MarkingPanel } from '../../../src/ui/MarkingPanel';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { idGen, loadExample } from '../../model/specFixtures';
import { richScenario } from '../../store/proposalHarness';
import {
  firstImport,
  openReviewHarness,
  renderInEditor,
  type ReviewHarness,
} from './reviewHarness';

// Detalhes na revisão (fases 9.5 e 9.6, HANDOFF-REVIEW-DETAILS): imagem e item mostram o
// painel normal, somente leitura, sobre o projeto à vista, com um marcador em cada campo
// alterado e o popover com os valores e a decisão do campo; o cabeçalho do item decide o
// item. As decisões, a criação, a remoção, as notas, "Outras mudanças" e a navegação têm os
// arquivos deles nesta pasta; aqui ficam o painel, os valores e o teclado do marcador.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Abre a proposta, seleciona o nível e monta os Detalhes da revisão. */
async function showLevel(
  options: Parameters<typeof openReviewHarness>[0],
  target: Parameters<ReviewHarness['review']['select']>[0],
) {
  const h = await openReviewHarness(options);
  expect(h.review.open('P1').ok).toBe(true);
  act(() => h.review.select(target));
  renderInEditor(
    h,
    <ReviewPanel onGoToAnnotation={() => {}} onSelectMarking={() => {}} />,
  );
  return h;
}

/** O campo de texto (desabilitado) com o rótulo. */
const field = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement;

describe('Detalhes na revisão: o painel normal com os marcadores', () => {
  it('alteração: o campo mostra o proposto, o marcador diz atual e proposto, e o popover abre', async () => {
    const { proposal } = richScenario();
    const h = await showLevel({ proposals: [proposal] }, { level: 'item', id: 'M1' });
    // O painel normal, somente leitura, com o valor da visão Proposto.
    expect(field('Nome').value).toBe('Porta dianteira');
    expect(field('Nome').disabled).toBe(true);
    const mark = screen.getByRole('button', {
      name: 'Nome: alterado, pendente. Atual: Porta. Proposto: Porta dianteira',
    });
    expect(mark.getAttribute('aria-expanded')).toBe('false');
    // Só o campo alterado tem marcador; o conteúdo do popover só existe aberto.
    expect(screen.queryAllByRole('button', { name: /: alterado, / })).toHaveLength(1);
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(mark);
    const pop = screen.getByRole('dialog', { name: 'Nome · alterado' });
    expect(mark.getAttribute('aria-expanded')).toBe('true');
    expect(mark.getAttribute('aria-controls')).toBe(pop.id);
    // Na visão Proposto, o outro lado (Atual) primeiro.
    expect([...pop.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Atual',
      'Proposto',
    ]);
    expect(within(pop).getByText('Porta')).toBeTruthy();
    expect(within(pop).getByText('Decisão: Sem decisão')).toBeTruthy();

    // Visão Atual: o painel acompanha e o popover põe o proposto primeiro.
    act(() => h.review.setView('current'));
    expect(field('Nome').value).toBe('Porta');
    expect(
      [...screen.getByRole('dialog').querySelectorAll('dt')].map((dt) => dt.textContent),
    ).toEqual(['Proposto', 'Atual']);
  });

  it('o cabeçalho do item decide o item e o marcador mostra a decisão', async () => {
    const { proposal } = richScenario();
    const h = await showLevel({ proposals: [proposal] }, { level: 'item', id: 'M4' });
    // Posição e tamanho: um marcador só, com a ajuda e só o número que muda em negrito.
    const mark = screen.getByRole('button', { name: /^Posição: movido, pendente\./ });
    fireEvent.click(mark);
    const pop = screen.getByRole('dialog', { name: 'Posição · movido' });
    expect([...pop.querySelectorAll('b')].map((b) => b.textContent)).toEqual([
      'x 0',
      'y 0',
      'x 10',
      'y 10',
    ]);
    expect(within(pop).getByText('Posição e tamanho são decididos juntos.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Aceitar Marcação sem nome$/ }));
    await waitFor(() =>
      expect(h.review.derived.levels.value.get('item:M4')?.state).toBe('accepted'),
    );
    expect(
      screen.getByRole('button', { name: /^Posição: movido, aceito\./ }),
    ).toBeTruthy();
  });

  it('tudo novo: na visão Proposto, os campos com o marcador "novo"; na Atual, o aviso', async () => {
    const { base, proposal } = firstImport();
    const h = await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    expect(field('Nome').value).toBe('Formulário');
    expect(screen.getByText('Criada pela proposta')).toBeTruthy();
    // Parte da criação: o tipo só, sem decisão própria; o popover diz onde decidir.
    const name = screen.getByRole('button', {
      name: 'Nome: novo, parte da criação de Formulário. Proposto: Formulário',
    });
    expect(name.querySelector('.decision-mark')).toBeNull();
    expect(
      screen.getByRole('button', { name: /^Posição: novo, parte da criação/ }),
    ).toBeTruthy();
    fireEvent.click(name);
    const pop = screen.getByRole('dialog');
    expect(within(pop).getByText('(não existe)')).toBeTruthy();
    expect(
      within(pop).getByText(
        'Faz parte da criação da marcação: decida no cabeçalho, acima.',
      ),
    ).toBeTruthy();
    // A anotação criada, na camada criada, com o marcador da criação no cabeçalho.
    expect(
      screen.getByRole('button', { name: /^Anotação onClick criada: novo, pendente\./ }),
    ).toBeTruthy();

    // Na visão Atual o item ainda não existe: o painel mostra como ficaria, com o aviso.
    act(() => h.review.setView('current'));
    expect(
      screen.getByText(
        'Ainda não existe no projeto atual. O painel mostra como ficaria.',
      ),
    ).toBeTruthy();
    expect(field('Nome').value).toBe('Formulário');
    fireEvent.click(screen.getByRole('button', { name: 'Ver em Proposto' }));
    expect(h.review.view.value).toBe('proposed');
  });

  it('criação rejeitada: o painel ainda mostra o que a proposta criaria', async () => {
    const { base, proposal } = firstImport();
    const h = await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    await act(async () => {
      await h.review.decide({ level: 'item', id: 'M1' }, 'rejected');
    });
    expect(
      screen.getByText(
        'A criação foi rejeitada: o painel mostra o que a proposta criaria.',
      ),
    ).toBeTruthy();
    expect(field('Nome').value).toBe('Formulário');
  });

  it('remoção: na visão Proposto, o projeto atual com "Será removida"; na Atual, sem aviso', async () => {
    const base = sampleProject();
    const proposal = propose(base, removeMarking(base, 'M3'));
    const h = await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M3' },
    );
    expect(
      screen.getByText(
        'Na visão Proposto este item não existe. O painel mostra o projeto atual.',
      ),
    ).toBeTruthy();
    expect(screen.getAllByText('Será removida').length).toBeGreaterThan(0);
    expect(document.querySelector('del.identity-name')?.textContent).toBe('Fechadura');
    expect(field('Nome').value).toBe('Fechadura');
    expect(
      screen.getByRole('button', {
        name: 'Nome: será removido com Fechadura. Atual: Fechadura',
      }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver na visão Atual' }));
    expect(h.review.view.value).toBe('current');
    expect(
      screen.queryByText(
        'Na visão Proposto este item não existe. O painel mostra o projeto atual.',
      ),
    ).toBeNull();
  });

  it('fantasmas: par e anotação removidos aparecem riscados no lugar, na visão Proposto', async () => {
    const base = sampleProject();
    let after = removeEntry(base, 'A1', 'E2');
    after = updateEntry(after, 'A1', 'E1', { key: 'tipo', value: 'risco' });
    after = removeAnnotation(after, 'A2');
    const h = await showLevel(
      { project: base, proposals: [propose(base, after)] },
      { level: 'item', id: 'M1' },
    );
    // O par que sai: riscado, com o marcador na coluna de ações.
    const pairs = screen.getByRole('table', { name: 'Pares da anotação' });
    const rows = within(pairs).getAllByRole('row');
    expect(rows.map((r) => r.classList.contains('is-removed'))).toEqual([
      false,
      false,
      true,
    ]);
    expect(rows[2]?.querySelector('del')?.textContent).toBe('gravidade');
    expect(
      within(rows[2] as HTMLElement).getByRole('button', {
        name: /^gravidade · Amassado: removido, pendente\. Atual: gravidade: média\. Proposto: \(não existe\)$/,
      }),
    ).toBeTruthy();
    // O par alterado mostra o proposto, com o marcador no lugar do menu ⋯.
    expect(
      within(rows[1] as HTMLElement).getByRole('button', {
        name: /^tipo · Amassado: alterado/,
      }),
    ).toBeTruthy();
    expect(within(pairs).queryByRole('button', { name: /Ações/ })).toBeNull();
    // A anotação que sai: cabeçalho riscado, "Será removida" e "Ver na visão Atual".
    const ghost = document.querySelector('[data-annotation="A2"]') as HTMLElement;
    expect(ghost.classList.contains('annotation-removed')).toBe(true);
    expect(within(ghost).getByText('Será removida')).toBeTruthy();

    // Na visão Atual, o par e a anotação existem: sem fantasma, com o marcador "removido".
    act(() => h.review.setView('current'));
    expect(document.querySelector('.is-removed')).toBeNull();
    expect(document.querySelector('.annotation-removed')).toBeNull();
    expect(
      screen.getByRole('button', { name: /^Anotação .* removida: removido, pendente\./ }),
    ).toBeTruthy();
  });

  it('conflito: o marcador âmbar e o popover com Atual, Antes e Depois', async () => {
    const { proposal, ids } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Porta traseira');
    await showLevel(
      { project: edited, proposals: [proposal] },
      { level: 'change', id: ids.name },
    );
    const mark = screen.getByRole('button', {
      name: /^Nome: alterado, pendente, em conflito\./,
    });
    expect(mark.classList.contains('is-conflict')).toBe(true);
    fireEvent.click(mark);
    const pop = screen.getByRole('dialog');
    expect([...pop.querySelectorAll('dt')].map((dt) => dt.textContent)).toEqual([
      'Atual',
      'Antes',
      'Depois',
    ]);
    expect(within(pop).getByText('Conflito')).toBeTruthy();
    expect(
      within(pop).getByText(/Aceitar troca Porta traseira por Porta dianteira/),
    ).toBeTruthy();
    // A decisão do campo é no popover, e os botões dizem o efeito.
    expect(
      within(pop).getByRole('button', {
        name: 'Aceitar: sobrescreve Porta traseira por Porta dianteira',
      }),
    ).toBeTruthy();
    expect(
      within(pop).getByRole('button', { name: 'Rejeitar: mantém Porta traseira' }),
    ).toBeTruthy();
  });

  it('teclado: Tab chega ao marcador e abre; Esc fecha e devolve o foco ao marcador', async () => {
    const base = sampleProject();
    const long = 'Porta '.repeat(60).trim();
    const user = userEvent.setup();
    await showLevel(
      { project: base, proposals: [propose(base, renameMarking(base, 'M1', long))] },
      { level: 'item', id: 'M1' },
    );
    const mark = screen.getByRole('button', { name: /^Nome: alterado, pendente\./ });
    for (let i = 0; i < 60 && document.activeElement !== mark; i++) await user.tab();
    expect(document.activeElement).toBe(mark);
    // O foco abre na hora; o valor longo vem por "Ver tudo", dentro do popover.
    const pop = screen.getByRole('dialog', { name: 'Nome · alterado' });
    await user.tab();
    const showAll = within(pop).getByRole('button', { name: 'Ver tudo' });
    expect(document.activeElement).toBe(showAll);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(mark);
    // Enter fixa aberto; Tab percorre Ver tudo, Aceitar, Rejeitar e Nota, e depois do
    // último o popover fecha e o foco segue para o próximo controle.
    await user.keyboard('{Enter}');
    expect(screen.getByRole('dialog')).toBeTruthy();
    for (const name of ['Ver tudo', /^Aceitar /, /^Rejeitar /, 'Adicionar nota']) {
      await user.tab();
      expect(document.activeElement).toBe(
        within(screen.getByRole('dialog')).getByRole('button', { name }),
      );
    }
    await user.tab();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('hover: abre depois do atraso de intenção e fecha ao sair; um aberto por vez', async () => {
    const { proposal } = richScenario();
    await showLevel({ proposals: [proposal] }, { level: 'item', id: 'M4' });
    vi.useFakeTimers();
    const mark = screen.getByRole('button', { name: /^Posição: movido/ });
    const host = mark.closest('.change-mark-host') as HTMLElement;
    fireEvent.mouseEnter(host);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.mouseLeave(host);
    act(() => {
      vi.advanceTimersByTime(160);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('seções com mudanças abrem; recolhida, a seção diz quantas mudanças tem', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    h.ui.collapsed.value = new Set(['marking', 'annotations']);
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(
      h,
      <ReviewPanel onGoToAnnotation={() => {}} onSelectMarking={() => {}} />,
    );
    // A seção Marcação (com a mudança) abriu; as Anotações (sem mudanças) ficaram.
    expect(h.ui.collapsed.value.has('marking')).toBe(false);
    expect(h.ui.collapsed.value.has('annotations')).toBe(true);
    act(() => {
      h.ui.collapsed.value = new Set(['marking']);
    });
    const head = screen.getByRole('button', { name: /^Marcação/ });
    expect(within(head).getByText('1 mudança(s)')).toBeTruthy();
  });

  it('camada escondida: o aviso conta as mudanças e "Mostrar aqui" mostra a camada só no painel', async () => {
    const base = sampleProject();
    const after = updateEntry(base, 'A2', 'E3', { key: 'tipo', value: 'quebra' });
    const h = await openReviewHarness({
      project: base,
      proposals: [propose(base, after)],
    });
    h.ui.hiddenLayers.value = new Set(['L2']);
    h.ui.activeLayer.value = 'L1';
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(
      h,
      <ReviewPanel onGoToAnnotation={() => {}} onSelectMarking={() => {}} />,
    );
    expect(screen.getByText('1 mudança(s) em camada escondida: Vidros')).toBeTruthy();
    expect(document.querySelector('[data-layer="L2"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar aqui' }));
    const group = document.querySelector('[data-layer="L2"]') as HTMLElement;
    expect(within(group).getByText('escondida')).toBeTruthy();
    // Só no painel: a camada continua escondida no editor.
    expect(h.ui.hiddenLayers.value.has('L2')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar de novo' }));
    expect(document.querySelector('[data-layer="L2"]')).toBeNull();
  });

  it('item grande: camada com mais de 8 anotações começa recolhida, com as contagens', async () => {
    const base = sampleProject();
    let after = base;
    for (let i = 1; i <= 9; i++) {
      after = addAnnotation(after, {
        id: `N${i}`,
        markingId: 'M4',
        layerId: 'L1',
        name: `n${i}`,
      });
    }
    const h = await showLevel(
      { project: base, proposals: [propose(base, after)] },
      { level: 'item', id: 'M4' },
    );
    expect(h.ui.collapsed.value.has('layer:L1')).toBe(true);
    expect(h.ui.collapsed.value.has('annotation:N1')).toBe(true);
    const group = document.querySelector('[data-layer="L1"]') as HTMLElement;
    expect(within(group).getByText('9 mudança(s)')).toBeTruthy();
  });

  it('o que não tem campo no painel continua decidível em "Outras mudanças", pelo marcador', async () => {
    const base = sampleProject();
    const proposal = propose(base, setMarkingLocked(base, 'M4', true));
    const h = await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M4' },
    );
    const others = screen.getByRole('region', { name: 'Outras mudanças' });
    fireEvent.click(
      within(others).getByRole('button', { name: /^Trava: alterado, pendente\./ }),
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: /^Aceitar Trava$/ }),
    );
    await waitFor(() =>
      expect(h.review.derived.levels.value.get('item:M4')?.state).toBe('accepted'),
    );
  });

  it('item trancado: aviso acima do painel; aceitar continua permitido', async () => {
    const base = setMarkingLocked(sampleProject(), 'M4', true);
    const { proposal } = richScenario();
    await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M4' },
    );
    expect(screen.getByText('Item trancado')).toBeTruthy();
    const accept = screen.getByRole('button', { name: /^Aceitar Marcação sem nome$/ });
    expect((accept as HTMLButtonElement).disabled).toBe(false);
  });

  it('nota do item: o botão do cabeçalho abre o campo, que grava ao sair dele', async () => {
    const { proposal } = richScenario();
    const h = await showLevel({ proposals: [proposal] }, { level: 'item', id: 'M1' });
    expect(screen.queryByRole('textbox', { name: 'Nota para o agente' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar nota' }));
    const box = screen.getByRole('textbox', { name: 'Nota para o agente' });
    expect(document.activeElement).toBe(box);
    fireEvent.input(box, { target: { value: 'O nome antigo estava certo.' } });
    fireEvent.blur(box);
    await waitFor(() =>
      expect(h.review.derived.notes.value.get('item:M1')?.[0]?.text).toBe(
        'O nome antigo estava certo.',
      ),
    );
    // Texto vazio apaga a nota.
    const saved = await screen.findByRole('textbox', { name: 'Nota para o agente' });
    fireEvent.input(saved, { target: { value: '  ' } });
    fireEvent.blur(saved);
    await waitFor(() => expect(h.review.derived.notes.value.has('item:M1')).toBe(false));
  });

  // Fase 8.2 (P8, O9 da rodada 4): "sugerida numa rejeição" só com uma rejeição no nível;
  // "parcial" por aceitas e pendentes não é rejeição.
  it('a nota só é "sugerida numa rejeição" quando o nível tem alguma mudança rejeitada', async () => {
    const { proposal, ids } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    h.review.open('P1');
    // A imagem I3 fica parcial: a marcação (e, junto, a imagem) aceita, a anotação pendente.
    await h.review.decide({ level: 'change', id: ids.marking }, 'accepted');
    act(() => h.review.select({ level: 'image', id: 'I3' }));
    renderInEditor(
      h,
      <ReviewPanel onGoToAnnotation={() => {}} onSelectMarking={() => {}} />,
    );
    expect(h.review.derived.levels.value.get('image:I3')?.state).toBe('partial');
    // O painel da imagem nova, com o arquivo marcado como parte da criação.
    expect(
      screen.getByRole('button', { name: /^Arquivo da imagem: novo, parte da criação/ }),
    ).toBeTruthy();
    expect(screen.queryByText(/sugerida numa rejeição/)).toBeNull();
    // Uma rejeição no nível: a nota passa a ser sugerida.
    await act(async () => {
      await h.review.decide({ level: 'change', id: ids.annotation }, 'rejected');
    });
    expect(
      screen.getByText('sugerida numa rejeição: o agente lê na próxima rodada'),
    ).toBeTruthy();
  });

  it('fora da revisão o painel é o de sempre: sem marcadores, com o menu dos pares', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    const project = h.session.store.committed.value as Project;
    const marking = project.markings.find((m) => m.id === 'M1');
    const image = project.containers.find((i) => i.id === 'I1');
    if (!marking || !image) throw new Error('fixture');
    renderInEditor(
      h,
      <MarkingPanel
        project={project}
        marking={marking}
        image={image}
        readOnly={false}
        onDelete={() => {}}
        onSelectMarking={() => {}}
        onGoToAnnotation={() => {}}
      />,
    );
    expect(document.querySelector('.change-mark, .props-label-cell')).toBeNull();
    expect(field('Nome').disabled).toBe(false);
    expect(screen.getAllByRole('button', { name: /^Ações do par/ }).length).toBe(3);
  });

  it('a proposta tem identidade, Aceitar tudo, "Outras mudanças" do grupo Projeto e as imagens com Abrir', async () => {
    const { base, proposal } = firstImport();
    const h = await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'proposal', id: null },
    );
    expect(screen.getByText('Importação', { selector: 'strong' })).toBeTruthy();
    expect(screen.getByText('Proposta')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Aceitar Importação' }).textContent).toBe(
      'Aceitar tudo',
    );
    // O grupo Projeto: a criação da camada, com marcador e popover.
    const others = screen.getByRole('region', { name: 'Outras mudanças' });
    expect(within(others).getAllByRole('listitem')).toHaveLength(1);
    expect(
      within(others).getByRole('button', {
        name: /^Camada Eventos criada: novo, pendente/,
      }),
    ).toBeTruthy();
    // As imagens: uma linha por imagem com mudanças e Abrir.
    const images = screen.getByRole('region', { name: 'Imagens' });
    fireEvent.click(within(images).getByRole('button', { name: /^Abrir / }));
    expect(h.review.selected.value).toEqual({ level: 'image', id: 'I1' });
  });

  it('o grupo Projeto é o mesmo painel, só com "Outras mudanças"', async () => {
    const { base, proposal } = firstImport();
    await showLevel(
      { project: base, proposals: [proposal] },
      { level: 'project', id: null },
    );
    expect(screen.getByText('Grupo Projeto')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Outras mudanças' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Imagens' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Aceitar Projeto' }).textContent).toBe(
      'Aceitar o grupo Projeto',
    );
  });
});

// Devolução do portão da 8.2: o "Aplicar bloqueado" nomeia camada, especialização e
// anotação (antes só marcação e imagem; o resto saía com o id cru), e diz quando o alvo
// da mudança não existe mais.
describe('Aplicar bloqueado: o nome do alvo, nunca o id', () => {
  /** Abre a proposta, aceita tudo e mostra o nível da proposta (todos os problemas). */
  async function blocked(project: Project, proposal: Proposal) {
    const h = await openReviewHarness({ project, proposals: [proposal] });
    expect(h.review.open(proposal.id).ok).toBe(true);
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    expect(h.review.derived.validation.value?.ok).toBe(false);
    act(() => h.review.select({ level: 'proposal', id: null }));
    renderInEditor(h, <ReviewDetails />);
    return h;
  }

  it('camada: a criação de uma camada que já existe cita o nome dela', async () => {
    const { base, proposal } = firstImport();
    await blocked(
      addLayer(base, { id: 'L2', name: 'Eventos', color: '#1E88E5' }),
      proposal,
    );
    expect(
      screen.getByText('A mudança em Eventos não cabe mais no projeto atual.'),
    ).toBeTruthy();
    expect(screen.queryByText(/A mudança em L2 /)).toBeNull();
  });

  it('especialização: a aplicação de uma especialização que já está no projeto cita o nome dela', async () => {
    const base = sampleProject();
    const sdui = loadExample('sdui');
    const proposal = propose(
      base,
      applySpecialization(base, sdui, { newId: idGen('LS') }),
    );
    await blocked(applySpecialization(base, sdui, { newId: idGen('LX') }), proposal);
    expect(
      screen.getByText('A mudança em SDUI não cabe mais no projeto atual.'),
    ).toBeTruthy();
    expect(screen.queryByText(/A mudança em sdui /)).toBeNull();
  });

  it('anotação: a criação de uma anotação que já existe cita o título dela', async () => {
    const base = sampleProject();
    const proposal = propose(
      base,
      addAnnotation(base, { id: 'A9', markingId: 'M1', layerId: 'L1', name: 'onClick' }),
    );
    await blocked(
      addAnnotation(base, { id: 'A9', markingId: 'M1', layerId: 'L1', name: 'onClick' }),
      proposal,
    );
    expect(
      screen.getByText('A mudança em onClick não cabe mais no projeto atual.'),
    ).toBeTruthy();
    expect(screen.queryByText(/A mudança em A9 /)).toBeNull();
  });

  it('alvo que não existe mais: diz que o alvo (camada) saiu do projeto, sem o id', async () => {
    const base = sampleProject();
    const proposal = propose(base, renameLayer(base, 'L2', 'Janelas'));
    await blocked(removeLayer(base, 'L2'), proposal);
    expect(
      screen.getByText('O alvo desta mudança (camada) não existe mais no projeto atual.'),
    ).toBeTruthy();
    expect(screen.queryByText(/L2/)).toBeNull();
  });
});
