import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renameMarking, type DecisionState } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { showReviewPanel, type ReviewHarness } from './reviewHarness';

// Decidir no popover do campo (fase 9.6, HANDOFF-REVIEW-DETAILS 5.3, 6 e 7): Aceitar,
// Rejeitar e Limpar gravam na hora e o popover fica aberto; em conflito os botões dizem o
// efeito; focar o marcador seleciona a mudança, então A, R e Backspace decidem o campo.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

const stateOf = (h: ReviewHarness, changeId: string): DecisionState | null =>
  h.review.derived.proposal.value?.decisions[changeId]?.state ?? null;

const nameMark = () => screen.getByRole('button', { name: /^Nome: alterado/ });

describe('decisão no popover do campo', () => {
  it('Aceitar, Rejeitar e Limpar gravam na hora; o popover continua aberto e o marcador muda', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    fireEvent.click(nameMark());
    const pop = screen.getByRole('dialog');

    const accept = within(pop).getByRole('button', { name: 'Aceitar Nome' });
    expect(accept.getAttribute('aria-keyshortcuts')).toBe('A');
    expect(
      within(pop)
        .getByRole('button', { name: 'Rejeitar Nome' })
        .getAttribute('aria-keyshortcuts'),
    ).toBe('R');
    expect(within(pop).queryByRole('button', { name: 'Limpar' })).toBeNull();

    fireEvent.click(accept);
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('accepted'));
    // O mesmo popover, agora mostrando a decisão; o marcador mudou.
    expect(screen.getByRole('dialog')).toBe(pop);
    expect(within(pop).getByText('Decisão: Aceita')).toBeTruthy();
    expect(nameMark().getAttribute('data-state')).toBe('accepted');
    expect(nameMark().getAttribute('aria-label')).toMatch(/^Nome: alterado, aceito\./);
    expect(
      within(pop)
        .getByRole('button', { name: 'Aceita: Nome' })
        .getAttribute('aria-pressed'),
    ).toBe('true');
    // A região `status` anuncia a decisão.
    await waitFor(() =>
      expect(within(pop).getByRole('status').textContent).toBe('Nome: aceita'),
    );

    fireEvent.click(within(pop).getByRole('button', { name: 'Rejeitar Nome' }));
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    expect(nameMark().getAttribute('data-state')).toBe('rejected');
    await waitFor(() =>
      expect(within(pop).getByRole('status').textContent).toBe('Nome: rejeitada'),
    );

    // Limpar volta a "sem decisão" e o foco vai ao Aceitar (o Limpar sai do DOM).
    const clear = within(pop).getByRole('button', { name: 'Limpar' });
    clear.focus();
    fireEvent.click(clear);
    await waitFor(() => expect(stateOf(h, ids.name)).toBeNull());
    expect(nameMark().getAttribute('data-state')).toBe('undecided');
    expect(document.activeElement).toBe(
      within(pop).getByRole('button', { name: 'Aceitar Nome' }),
    );
  });

  it('em conflito os botões dizem o efeito: Sobrescrever e Manter atual', async () => {
    const { proposal, ids } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Topo');
    const h = await showReviewPanel(
      { project: edited, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    fireEvent.click(
      screen.getByRole('button', { name: /^Nome: alterado, pendente, em conflito/ }),
    );
    const pop = screen.getByRole('dialog');
    const overwrite = within(pop).getByRole('button', {
      name: 'Aceitar: sobrescreve Topo por Porta dianteira',
    });
    expect(overwrite.textContent).toBe('Sobrescrever');
    const keep = within(pop).getByRole('button', { name: 'Rejeitar: mantém Topo' });
    expect(keep.textContent).toBe('Manter atual');
    fireEvent.click(overwrite);
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('accepted'));
    // O conflito continua marcado depois de decidido.
    expect(
      screen
        .getByRole('button', { name: /^Nome: alterado, aceito, em conflito/ })
        .classList.contains('is-conflict'),
    ).toBe(true);
  });

  it('focar o marcador seleciona a mudança e A, R e Backspace decidem o campo focado', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const user = userEvent.setup();
    expect(nameMark().getAttribute('aria-keyshortcuts')).toBe('A R Backspace');
    act(() => nameMark().focus());
    expect(h.review.selected.value).toEqual({ level: 'change', id: ids.name });
    expect(nameMark().getAttribute('aria-current')).toBe('true');

    await user.keyboard('a');
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('accepted'));
    await user.keyboard('r');
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    await user.keyboard('{Backspace}');
    await waitFor(() => expect(stateOf(h, ids.name)).toBeNull());
    // Só a mudança do campo mudou: o resto da proposta ficou como estava.
    expect(Object.keys(h.review.derived.proposal.value?.decisions ?? {})).toEqual([]);
  });

  it('rejeitar com o mouse sugere a nota (vazia, com o foco; some se ficar vazia)', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const user = userEvent.setup();
    await user.click(nameMark());
    const pop = screen.getByRole('dialog');
    await user.click(within(pop).getByRole('button', { name: 'Rejeitar Nome' }));
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    const box = within(pop).getByRole('textbox', { name: 'Nota para o agente' });
    expect(document.activeElement).toBe(box);
    // Vazia, ao sair ela some.
    await user.tab();
    expect(screen.queryByRole('textbox', { name: 'Nota para o agente' })).toBeNull();
    expect(h.review.derived.notes.value.size).toBe(0);
  });

  it('a nota da mudança fica na proposta, aparece embaixo do campo e no nome do marcador', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const user = userEvent.setup();
    await user.click(nameMark());
    const pop = screen.getByRole('dialog');
    await user.click(within(pop).getByRole('button', { name: 'Rejeitar Nome' }));
    const box = within(pop).getByRole('textbox', { name: 'Nota para o agente' });
    await user.type(box, 'O nome antigo estava certo.');
    await user.tab();
    await waitFor(() =>
      expect(h.review.derived.notes.value.get(`change:${ids.name}`)?.[0]?.text).toBe(
        'O nome antigo estava certo.',
      ),
    );
    expect(nameMark().getAttribute('aria-label')).toMatch(/, com nota\./);
    // Uma linha embaixo do campo, no painel.
    const row = document.querySelector('.change-note-line') as HTMLElement;
    expect(row.textContent).toBe('O nome antigo estava certo.');
  });

  it('rejeitar pelo teclado não move o foco: a nota abre com Enter no botão de nota', async () => {
    const { proposal, ids } = richScenario();
    const h = await showReviewPanel(
      { proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const user = userEvent.setup();
    act(() => nameMark().focus());
    await user.tab();
    await user.tab();
    const reject = within(screen.getByRole('dialog')).getByRole('button', {
      name: 'Rejeitar Nome',
    });
    expect(document.activeElement).toBe(reject);
    await user.keyboard('{Enter}');
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    expect(document.activeElement).toBe(reject);
    expect(screen.queryByRole('textbox', { name: 'Nota para o agente' })).toBeNull();
    // A nota abre pelo botão de nota (depois do Limpar), com o foco no campo.
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Limpar' }));
    await user.tab();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Nota para o agente' }),
    );
  });

  it('na visão Atual o popover é o mesmo e decide igual', async () => {
    const base = sampleProject();
    const proposal = propose(base, renameMarking(base, 'M1', 'Porta dianteira'));
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    act(() => h.review.setView('current'));
    fireEvent.click(nameMark());
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Aceitar Nome' }),
    );
    const id = proposal.changes[0]?.id ?? '';
    await waitFor(() => expect(stateOf(h, id)).toBe('accepted'));
  });
});
