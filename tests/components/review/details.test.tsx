import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renameMarking, setMarkingLocked } from '../../../src/model';
import { locale } from '../../../src/store/settings';
import { ReviewDetails } from '../../../src/ui/review/ReviewDetails';
import { sampleProject } from '../../model/fixtures';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Detalhes na revisão (HANDOFF-PROPOSALS 5.2, passo 6 da seção 9): DiffValue e
// ChangeCard, decisão do nível, conflito com três linhas, item trancado e notas.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

describe('Detalhes da revisão', () => {
  it('item: decisão do nível e um cartão por mudança com antes e depois', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    h.review.open('P1');
    act(() => h.review.select({ level: 'item', id: 'M4' }));
    renderInEditor(h, <ReviewDetails />);
    const card = screen.getByRole('article', { name: 'Posição' });
    expect(within(card).getByText('Antes')).toBeTruthy();
    expect(within(card).getByText('Depois')).toBeTruthy();
    // Só o número que muda vai em negrito.
    expect([...card.querySelectorAll('b')].map((b) => b.textContent)).toEqual([
      'x 0',
      'y 0',
      'x 10',
      'y 10',
    ]);
    fireEvent.click(screen.getByRole('button', { name: /^Aceitar Marcação sem nome$/ }));
    await waitFor(() =>
      expect(h.review.derived.levels.value.get('item:M4')?.state).toBe('accepted'),
    );
  });

  it('conflito: Atual, Antes e Depois, e os botões dizem o efeito', async () => {
    const { proposal, ids } = richScenario();
    const edited = renameMarking(sampleProject(), 'M1', 'Porta traseira');
    const h = await openReviewHarness({ project: edited, proposals: [proposal] });
    h.review.open('P1');
    act(() => h.review.select({ level: 'change', id: ids.name }));
    renderInEditor(h, <ReviewDetails />);
    const card = screen.getByRole('article', { name: 'Nome' });
    expect(within(card).getByText('Conflito')).toBeTruthy();
    expect(within(card).getByText('Atual')).toBeTruthy();
    expect(within(card).getByText('Porta traseira')).toBeTruthy();
    expect(
      within(card).getByRole('button', {
        name: 'Aceitar Nome: sobrescreve o valor atual',
      }),
    ).toBeTruthy();
    expect(
      within(card).getByText(/Aceitar troca Porta traseira por Porta dianteira/),
    ).toBeTruthy();
  });

  it('item trancado: aviso acima dos cartões; aceitar continua permitido', async () => {
    const base = setMarkingLocked(sampleProject(), 'M4', true);
    const { proposal } = richScenario();
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    h.review.open('P1');
    act(() => h.review.select({ level: 'item', id: 'M4' }));
    renderInEditor(h, <ReviewDetails />);
    expect(screen.getByText('Item trancado')).toBeTruthy();
    const accept = screen.getByRole('button', { name: /^Aceitar Marcação sem nome$/ });
    expect((accept as HTMLButtonElement).disabled).toBe(false);
  });

  it('nota em qualquer nível, gravada na proposta', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    h.review.open('P1');
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <ReviewDetails />);
    fireEvent.input(screen.getByRole('textbox', { name: 'Nova nota para o agente' }), {
      target: { value: 'O nome antigo estava certo.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar nota' }));
    await waitFor(() =>
      expect(h.review.derived.notes.value.get('item:M1')?.[0]?.text).toBe(
        'O nome antigo estava certo.',
      ),
    );
    expect(
      await screen.findByRole('textbox', { name: 'Nota para o agente' }),
    ).toBeTruthy();
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
    renderInEditor(h, <ReviewDetails />);
    expect(h.review.derived.levels.value.get('image:I3')?.state).toBe('partial');
    expect(screen.getByText('opcional, o agente lê na próxima rodada')).toBeTruthy();
    // Uma rejeição no nível: a nota passa a ser sugerida.
    await act(async () => {
      await h.review.decide({ level: 'change', id: ids.annotation }, 'rejected');
    });
    expect(
      screen.getByText('sugerida numa rejeição: o agente lê na próxima rodada'),
    ).toBeTruthy();
  });
});
