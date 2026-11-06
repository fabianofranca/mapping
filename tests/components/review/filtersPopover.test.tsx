import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor, type ReviewHarness } from './reviewHarness';

// Filtros da revisão recolhidos no botão "Filtros" (#598, decisão 4): os controles só
// existem dentro do popover; a contagem do botão é de grupos, não de valores.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

async function openRich(): Promise<ReviewHarness> {
  const { proposal } = richScenario();
  const h = await openReviewHarness({
    proposals: [{ ...proposal, title: 'Checkout' }],
    files: { [NEW_IMAGE_PATH]: 'imagem' },
  });
  expect(h.review.open('P1').ok).toBe(true);
  return h;
}

const trigger = () => screen.getByRole('button', { name: /^Filtros/ });

describe('filtros recolhidos', () => {
  it('os controles só aparecem depois de apertar Filtros', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    expect(screen.queryByRole('group', { name: 'Tipo de mudança' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Filtros da revisão' })).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger());
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    const pop = screen.getByRole('dialog', { name: 'Filtros da revisão' });
    expect(pop.contains(screen.getByRole('group', { name: 'Tipo de mudança' }))).toBe(
      true,
    );
  });

  it('escolher decisão e tipo não fecha o popover; o botão conta grupos', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    expect(trigger().textContent).toBe('Filtros');
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).toBeNull();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByRole('button', { name: /^Sem decisão/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Movida/ }));
    // Os dois filtros ligados, e o popover continua aberto.
    expect(screen.getByRole('dialog', { name: 'Filtros da revisão' })).toBeTruthy();
    expect(trigger().textContent).toBe('Filtros · 2');
    // Dois tipos continuam sendo um grupo só.
    fireEvent.click(screen.getByRole('button', { name: /^Criada/ }));
    expect(trigger().textContent).toBe('Filtros · 2');
    expect(screen.getByText(/^Mostrando \d+ de \d+$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(trigger().textContent).toBe('Filtros');
  });

  it('Esc fecha e devolve o foco ao botão', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    fireEvent.click(trigger());
    const radio = screen.getByRole('button', { name: /^Sem decisão/ });
    radio.focus();
    fireEvent.keyDown(radio, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Filtros da revisão' })).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('o aviso de conflitos novos liga Só conflitos sem abrir o popover', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    act(() => h.review.setFilters({ onlyConflicts: true }));
    expect(screen.queryByRole('dialog', { name: 'Filtros da revisão' })).toBeNull();
    expect(trigger().textContent).toBe('Filtros · 1');
  });
});
