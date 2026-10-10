import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { locale } from '../../../src/store/settings';
import { ReviewBar } from '../../../src/ui/review/ReviewBar';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import {
  openReviewHarness,
  renderInEditor,
  stubDesktop,
  type ReviewHarness,
} from './reviewHarness';

// Modo revisão (HANDOFF-PROPOSALS 5.2, passo 4 da seção 9): a faixa com as quatro ações,
// os níveis com a decisão de três estados, os filtros e o teclado da lista.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function openRich(): Promise<ReviewHarness> {
  const { proposal } = richScenario();
  const h = await openReviewHarness({
    proposals: [{ ...proposal, title: 'Checkout' }],
    files: { [NEW_IMAGE_PATH]: 'imagem' },
  });
  expect(h.review.open('P1').ok).toBe(true);
  return h;
}

const rowOf = (name: string | RegExp) => screen.getByRole('treeitem', { name });

describe('níveis da proposta', () => {
  it('Proposta → Imagem → Item → Mudança, com a decisão em cada nível', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    const proposal = rowOf('Checkout');
    expect(proposal.getAttribute('aria-level')).toBe('1');
    // A imagem nova e o item criado nela, com o selo do tipo.
    const image = rowOf('images/nova.webp');
    expect(image.getAttribute('aria-level')).toBe('2');
    expect(within(image).getByRole('img', { name: 'Criada' })).toBeTruthy();
    expect(rowOf('Botão').getAttribute('aria-level')).toBe('3');
    // A mudança de posição de M4 com o resumo "antes → depois".
    const moved = rowOf('Posição');
    expect(within(moved).getByRole('img', { name: 'Movida' })).toBeTruthy();
    expect(moved.textContent).toContain('→');
    expect(within(proposal).getByRole('img', { name: 'Sem decisão' })).toBeTruthy();
  });

  it('decidir uma imagem decide tudo abaixo e a proposta fica parcial', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    fireEvent.click(
      within(rowOf('images/nova.webp')).getByRole('button', {
        name: 'Aceitar images/nova.webp',
      }),
    );
    await waitFor(() =>
      expect(
        within(rowOf('Checkout')).getByRole('img', { name: /^Parcial: 3 aceitas/ }),
      ).toBeTruthy(),
    );
    expect(
      within(rowOf('Botão')).getByRole('button', { name: 'Aceita: Botão' }),
    ).toBeTruthy();
    // Apertar o marcado limpa a decisão.
    fireEvent.click(
      within(rowOf('images/nova.webp')).getByRole('button', {
        name: 'Aceita: images/nova.webp',
      }),
    );
    await waitFor(() =>
      expect(
        within(rowOf('Checkout')).getByRole('img', { name: 'Sem decisão' }),
      ).toBeTruthy(),
    );
  });

  it('filtro por tipo mostra só as mudanças dele; Aceitar tudo vira "visíveis"', async () => {
    stubDesktop();
    const h = await openRich();
    renderInEditor(
      h,
      <>
        <ReviewBar onExit={() => {}} />
        <ProposalsWindow onHelp={() => {}} />
      </>,
    );
    expect(screen.getByRole('button', { name: /Aceitar tudo/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Movida/ }));
    expect(screen.queryByRole('treeitem', { name: 'images/nova.webp' })).toBeNull();
    expect(rowOf('Posição')).toBeTruthy();
    expect(screen.getByText('Filtros ativos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Aceitar 1 visíveis/ }));
    await waitFor(() => expect(h.review.derived.counts.value.accepted).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(rowOf('images/nova.webp')).toBeTruthy();
  });

  it('teclado: setas andam nos níveis; ← e → recolhem e expandem', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    const tree = screen.getByRole('tree', { name: 'Níveis da proposta' });
    act(() => h.review.select({ level: 'image', id: 'I3' }));
    fireEvent.keyDown(tree, { key: 'ArrowLeft' });
    expect(screen.queryByRole('treeitem', { name: 'Botão' })).toBeNull();
    fireEvent.keyDown(tree, { key: 'ArrowRight' });
    expect(rowOf('Botão')).toBeTruthy();
    fireEvent.keyDown(tree, { key: 'ArrowDown' });
    expect(h.review.selected.value?.level).not.toBe('image');
  });
});

describe('faixa de revisão', () => {
  it('Aplicar aceitas · N: desabilitado sem aceitas; aplicar efetiva só as aceitas', async () => {
    const h = await openRich();
    renderInEditor(
      h,
      <>
        <ReviewBar onExit={() => {}} />
        <ProposalsWindow onHelp={() => {}} />
      </>,
    );
    const bar = screen.getByRole('region', { name: 'Revisão da proposta' });
    expect(within(bar).getByText('Checkout')).toBeTruthy();
    const apply = within(bar).getByRole('button', { name: /Aplicar aceitas · 0/ });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    expect(apply.getAttribute('title')).toBe('Nada aceito ainda  Ctrl+Enter');

    fireEvent.click(
      within(rowOf('Posição')).getByRole('button', { name: 'Aceitar Posição' }),
    );
    const ready = await within(bar).findByRole('button', { name: /Aplicar aceitas · 1/ });
    await waitFor(() => expect((ready as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(ready);
    await waitFor(() =>
      expect(
        h.session.store.committed.value?.markings.find((m) => m.id === 'M4')?.rect,
      ).toEqual({
        x: 10,
        y: 10,
        width: 100,
        height: 100,
      }),
    );
    // O que não foi decidido continua pendente na mesma proposta.
    expect(h.review.derived.counts.value.undecided).toBeGreaterThan(0);
  });
});
