import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  removeLayer,
  removeMarking,
  renameLayer,
  setMarkingLocked,
  type DecisionState,
} from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { changeOf, propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { firstImport, showReviewPanel, type ReviewHarness } from './reviewHarness';

// O cabeçalho do item (fase 9.6, HANDOFF-REVIEW-DETAILS 5.4): a decisão de três estados com
// o texto de cada tipo de item, a criação ("+ N anotações criadas"), a remoção (o que sai
// junto), o "junto" com Desfazer, o item trancado e o conjunto inválido com as duas saídas.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

const stateOf = (h: ReviewHarness, changeId: string): DecisionState | null =>
  h.review.derived.proposal.value?.decisions[changeId]?.state ?? null;

const header = () => screen.getByRole('region', { name: 'Decisão' });

describe('cabeçalho do item', () => {
  it('marcação alterada: decide o item inteiro, com o texto "Aceitar marcação" e as contagens', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    expect(within(header()).getByText('Marcação alterada')).toBeTruthy();
    const accept = within(header()).getByRole('button', { name: 'Aceitar Porta' });
    expect(accept.textContent).toBe('Aceitar marcação');
    expect(
      within(header()).getByRole('button', { name: 'Rejeitar Porta' }).textContent,
    ).toBe('Rejeitar marcação');
    expect(
      within(header()).getByText('0 aceitas, 0 rejeitadas, 1 sem decisão'),
    ).toBeTruthy();
    fireEvent.click(accept);
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('accepted'));
    expect(
      within(header()).getByText('1 aceitas, 0 rejeitadas, 0 sem decisão'),
    ).toBeTruthy();
    // O marcador do campo acompanha.
    expect(
      screen.getByRole('button', { name: /^Nome: alterado, aceito\./ }),
    ).toBeTruthy();
    // Apertar de novo o botão marcado volta a "sem decisão".
    fireEvent.click(within(header()).getByRole('button', { name: /^Aceita: / }));
    await waitFor(() => expect(stateOf(h, ids.name)).toBeNull());
  });

  it('item parcial: mostra o estado e as contagens', async () => {
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const annotation = changeOf(proposal, 'annotation', 'A1');
    await h.review.decide({ level: 'change', id: annotation.id }, 'rejected');
    await waitFor(() =>
      expect(h.review.derived.levels.value.get('item:M1')?.state).toBe('partial'),
    );
    expect(
      within(header()).getByText('0 aceitas, 1 rejeitadas, 1 sem decisão'),
    ).toBeTruthy();
    // Parcial: nenhum dos dois botões do item fica marcado.
    expect(
      within(header())
        .getByRole('button', { name: 'Aceitar Formulário' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
    expect(
      within(header())
        .getByRole('button', { name: 'Rejeitar Formulário' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('criação: "+ N anotações criadas", a ajuda e o selo "Criada pela proposta"', async () => {
    const { base, proposal } = firstImport();
    await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    expect(within(header()).getByText('Marcação criada')).toBeTruthy();
    expect(within(header()).getByText('+ 1 anotação(ões) criada(s)')).toBeTruthy();
    expect(
      within(header()).getByText(
        'A criação é uma mudança só: os campos marcados com + entram juntos.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Criada pela proposta')).toBeTruthy();
    expect(
      within(header()).getByRole('button', { name: 'Aceitar Formulário' }).textContent,
    ).toBe('Aceitar marcação');
  });

  it('a anotação criada tem ✓ ✕ no cabeçalho dela; rejeitada, volta como cartão com a decisão ali', async () => {
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const annotation = changeOf(proposal, 'annotation', 'A1');
    const card = () => document.querySelector('[data-annotation="A1"]') as HTMLElement;
    fireEvent.click(
      within(card()).getByRole('button', { name: /^Rejeitar Anotação onClick criada$/ }),
    );
    await waitFor(() => expect(stateOf(h, annotation.id)).toBe('rejected'));
    // A visão Proposto não tem a anotação rejeitada: o cartão fica no lugar dela.
    expect(within(card()).getByText('Criação rejeitada')).toBeTruthy();
    expect(
      within(card()).getByRole('button', {
        name: /^Anotação onClick criada: novo, rejeitado/,
      }),
    ).toBeTruthy();
    // A marcação não foi decidida junto: a anotação só depende dela, não o contrário.
    expect(stateOf(h, changeOf(proposal, 'marking', 'M1').id)).toBeNull();
    // E a decisão volta a ser dela.
    fireEvent.click(
      within(card()).getByRole('button', { name: /^Aceitar Anotação onClick criada$/ }),
    );
    await waitFor(() => expect(stateOf(h, annotation.id)).toBe('accepted'));
    expect(within(card()).queryByText('Criação rejeitada')).toBeNull();
  });

  it('rejeitar uma criação leva as dependentes junto: "junto" no marcador e o aviso com Desfazer', async () => {
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const marking = changeOf(proposal, 'marking', 'M1');
    const annotation = changeOf(proposal, 'annotation', 'A1');
    await act(async () => {
      await h.review.decide({ level: 'change', id: marking.id }, 'rejected');
    });
    expect(stateOf(h, annotation.id)).toBe('rejected');
    const notice = screen.getByText(/^1 mudança\(s\) rejeitada\(s\) junto: /);
    expect(notice.textContent).toContain('Anotação onClick criada');
    expect(
      screen.getByRole('button', {
        name: /^Anotação onClick criada: novo, rejeitado, decidido junto/,
      }),
    ).toBeTruthy();
    fireEvent.click(
      within(notice.closest('.notice-box') as HTMLElement).getByRole('button', {
        name: 'Desfazer',
      }),
    );
    await waitFor(() => expect(stateOf(h, annotation.id)).toBeNull());
    expect(stateOf(h, marking.id)).toBeNull();
    expect(screen.queryByText(/rejeitada\(s\) junto/)).toBeNull();
  });

  it('remoção: o nome sai riscado, o cabeçalho lista o que sai junto e rejeitar volta o nome', async () => {
    const base = sampleProject();
    const proposal = propose(base, removeMarking(base, 'M1'));
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    expect(within(header()).getByText('Marcação removida')).toBeTruthy();
    expect(document.querySelector('del.identity-name')?.textContent).toBe('Porta');
    expect(screen.getAllByText('Será removida').length).toBeGreaterThan(0);
    // O que sai junto: as filhas (com link) e as anotações por camada.
    expect(within(header()).getByText('Aceitar remove junto:')).toBeTruthy();
    fireEvent.click(within(header()).getByRole('button', { name: 'Maçaneta' }));
    expect(h.review.selected.value).toEqual({ level: 'item', id: 'M2' });
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    expect(within(header()).getByText(/Vidros/)).toBeTruthy();
    expect(
      within(header()).getByRole('button', { name: 'Rejeitar Porta' }).textContent,
    ).toBe('Rejeitar remoção');

    // Rejeitada, a remoção não vale: o nome deixa de ser riscado.
    fireEvent.click(within(header()).getByRole('button', { name: 'Rejeitar Porta' }));
    await waitFor(() => expect(document.querySelector('del.identity-name')).toBeNull());
    expect(document.querySelector('strong.identity-name')?.textContent).toBe('Porta');
  });

  it('item trancado: o selo, o aviso e o aceitar continua permitido', async () => {
    const base = setMarkingLocked(sampleProject(), 'M4', true);
    const { proposal } = richScenario();
    await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M4' },
    );
    expect(within(header()).getByText('Item trancado')).toBeTruthy();
    expect(
      within(document.querySelector('.identity-flags') as HTMLElement).getByText(
        'Trancado',
      ),
    ).toBeTruthy();
    expect(
      (
        within(header()).getByRole('button', {
          name: 'Aceitar Marcação sem nome',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it('conjunto inválido: o aviso tem as duas saídas, a identidade o selo "Bloqueia aplicar" e o marcador o anel', async () => {
    const base = sampleProject();
    const proposal = propose(base, renameLayer(base, 'L2', 'Janelas'));
    const h = await showReviewPanel(
      { project: removeLayer(base, 'L2'), proposals: [proposal] },
      { level: 'proposal', id: null },
    );
    await h.review.decide({ level: 'proposal', id: null }, 'accepted');
    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(
        'O alvo desta mudança (camada) não existe mais no projeto atual.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Bloqueia aplicar')).toBeTruthy();
    // Uma mudança só de cada lado: as saídas dizem qual.
    const reject = within(alert).getByRole('button', { name: /^Rejeitar: / });
    fireEvent.click(reject);
    await waitFor(() => expect(h.review.derived.validation.value?.ok).toBe(true));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('o marcador de um campo envolvido no conjunto inválido tem o anel e o diz no nome', async () => {
    const base = sampleProject();
    const proposal = propose(base, renameLayer(base, 'L2', 'Janelas'));
    const h = await showReviewPanel(
      { project: removeLayer(base, 'L2'), proposals: [proposal] },
      { level: 'project', id: null },
    );
    await h.review.decide({ level: 'project', id: null }, 'accepted');
    const mark = await screen.findByRole('button', {
      name: /envolvido no conjunto inválido/,
    });
    expect(mark.classList.contains('is-invalid')).toBe(true);
  });
});
