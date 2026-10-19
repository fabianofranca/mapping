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
import { renameMarking, type DecisionState } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { sampleProject } from '../../model/fixtures';
import { changeOf, propose } from '../../model/proposalFixtures';
import { richScenario } from '../../store/proposalHarness';
import { firstImport, showReviewPanel, type ReviewHarness } from './reviewHarness';

// Decidir no popover do campo (fase 9.6, HANDOFF-REVIEW-DETAILS 5.3, 6 e 7): Aceitar,
// Rejeitar e Limpar gravam na hora e o popover fica aberto; em conflito os botões dizem o
// efeito; focar o marcador seleciona a mudança, então A, R e Backspace decidem o campo.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

const stateOf = (h: ReviewHarness, changeId: string): DecisionState | null =>
  h.review.derived.proposal.value?.decisions[changeId]?.state ?? null;

/**
 * O Chrome dispara `blur` no elemento focado quando ele sai do DOM; o jsdom não. Rejeitar a
 * criação troca o cartão da anotação (com o popover e o campo de nota dentro), então a
 * nota sugerida precisa sobreviver a esse `blur` (defeito das rodadas manuais do R5.3), e o
 * foco, que cai no body, volta ao controle equivalente do cartão novo (decisão pelo teclado).
 */
function blurOnRemoval(): void {
  const original = Node.prototype.removeChild;
  vi.spyOn(Node.prototype, 'removeChild').mockImplementation(function <T extends Node>(
    this: Node,
    child: T,
  ): T {
    const active = document.activeElement;
    if (active instanceof HTMLElement && child.contains(active)) {
      // `blur()` dispara o evento e leva o foco ao body, como o Chrome na remoção.
      active.blur();
    }
    return original.call(this, child) as T;
  });
}

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

  it('rejeitar com o mouse a anotação criada (o cartão vira "Criação rejeitada") abre a nota com o foco', async () => {
    blurOnRemoval();
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const created = changeOf(proposal, 'annotation', 'A1');
    const card = () => document.querySelector('[data-annotation="A1"]') as HTMLElement;
    const user = userEvent.setup();
    await user.click(
      within(card()).getByRole('button', { name: /^Anotação onClick criada: novo/ }),
    );
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Rejeitar Anotação onClick criada',
      }),
    );
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    expect(within(card()).getByText('Criação rejeitada')).toBeTruthy();
    const box = await screen.findByRole('textbox', { name: 'Nota para o agente' });
    await waitFor(() => expect(document.activeElement).toBe(box));
    // Vazia, ao sair ela some e o foco não cai no body.
    await user.tab();
    expect(screen.queryByRole('textbox', { name: 'Nota para o agente' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('rejeitar com o mouse pelo ✕ do cartão da anotação criada abre a nota com o foco; pelo teclado não', async () => {
    blurOnRemoval();
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const created = changeOf(proposal, 'annotation', 'A1');
    const card = () => document.querySelector('[data-annotation="A1"]') as HTMLElement;
    const user = userEvent.setup();
    // Pelo teclado (Enter no ✕): a rejeição não move o foco nem abre a nota.
    const reject = () =>
      within(card()).getByRole('button', { name: /^Rejeitar Anotação onClick criada$/ });
    act(() => reject().focus());
    await user.keyboard('{Enter}');
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    expect(screen.queryByRole('textbox', { name: 'Nota para o agente' })).toBeNull();
    // O cartão foi trocado e o ✕ focado saiu do DOM: o foco volta ao ✕ do cartão novo
    // (agora pressionado), nunca ao body, e Enter de novo limpa a decisão.
    const pressed = () =>
      within(card()).getByRole('button', {
        name: /^Rejeitada: Anotação onClick criada$/,
      });
    await waitFor(() => expect(document.activeElement).toBe(pressed()));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(stateOf(h, created.id)).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(reject()));
    await user.keyboard('{Enter}');
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    await user.click(
      within(card()).getByRole('button', { name: /^Aceitar Anotação onClick criada$/ }),
    );
    await waitFor(() => expect(stateOf(h, created.id)).toBe('accepted'));
    // Com o mouse: o cartão vira "Criação rejeitada" e a nota vazia recebe o foco.
    await user.click(reject());
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    expect(within(card()).getByText('Criação rejeitada')).toBeTruthy();
    const box = await screen.findByRole('textbox', { name: 'Nota para o agente' });
    await waitFor(() => expect(document.activeElement).toBe(box));
    // Vazia, ao sair ela some e o foco não cai no body.
    await user.tab();
    expect(screen.queryByRole('textbox', { name: 'Nota para o agente' })).toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('um clique sem `detail` (extensão do navegador, element.click()) conta como mouse: abre a nota nos dois caminhos', async () => {
    blurOnRemoval();
    const { base, proposal } = firstImport();
    const h = await showReviewPanel(
      { project: base, proposals: [proposal] },
      { level: 'item', id: 'M1' },
    );
    const created = changeOf(proposal, 'annotation', 'A1');
    const card = () => document.querySelector('[data-annotation="A1"]') as HTMLElement;
    const box = () => screen.queryByRole('textbox', { name: 'Nota para o agente' });
    // Pelo ✕ do cartão: `fireEvent.click` vem com `detail === 0`, como o clique sintético.
    fireEvent.click(
      within(card()).getByRole('button', { name: /^Rejeitar Anotação onClick criada$/ }),
    );
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    await waitFor(() => expect(document.activeElement).toBe(box()));
    expect(box()).not.toBeNull();
    // Vazia, ao sair ela some; desfaz a decisão e repete pelo Rejeitar do popover.
    act(() => (document.activeElement as HTMLElement).blur());
    await waitFor(() => expect(box()).toBeNull());
    fireEvent.click(
      within(card().querySelector('.decision-control') as HTMLElement).getByRole(
        'button',
        { name: 'Aceitar Anotação onClick criada' },
      ),
    );
    await waitFor(() => expect(stateOf(h, created.id)).toBe('accepted'));
    fireEvent.click(
      within(card()).getByRole('button', { name: /^Anotação onClick criada: novo/ }),
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Rejeitar Anotação onClick criada',
      }),
    );
    await waitFor(() => expect(stateOf(h, created.id)).toBe('rejected'));
    await waitFor(() => expect(document.activeElement).toBe(box()));
    expect(box()).not.toBeNull();
  });

  it('Enter e Espaço no Rejeitar do popover são teclado: não abrem a nota', async () => {
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
    await user.keyboard(' ');
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    expect(document.activeElement).toBe(reject);
    expect(screen.queryByRole('textbox', { name: 'Nota para o agente' })).toBeNull();
    // Um clique de mouse depois do teclado volta a contar como mouse (a marca vale um clique).
    await user.keyboard(' ');
    await waitFor(() => expect(stateOf(h, ids.name)).toBeNull());
    await user.click(reject);
    await waitFor(() => expect(stateOf(h, ids.name)).toBe('rejected'));
    expect(screen.getByRole('textbox', { name: 'Nota para o agente' })).toBeTruthy();
  });

  it('rejeitar com o mouse um campo alterado leva o foco à nota e, vazia, de volta ao marcador', async () => {
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
    // Escrever e sair com o primeiro Tab grava a nota e tira o foco do campo.
    await user.type(box, 'Fica o nome antigo.');
    await user.tab();
    expect(document.activeElement).not.toBe(box);
    await waitFor(() =>
      expect(h.review.derived.notes.value.get(`change:${ids.name}`)?.[0]?.text).toBe(
        'Fica o nome antigo.',
      ),
    );
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
