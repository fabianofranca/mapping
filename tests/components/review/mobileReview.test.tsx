import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorTopBar } from '../../../src/app/EditorTopBar';
import type { EditorDialogs } from '../../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../../src/app/useProjectCommands';
import { locale } from '../../../src/store/settings';
import {
  MobileReviewBottomBar,
  ReviewFiltersDialog,
  ReviewSheetDecision,
  useReviewSheetTitle,
} from '../../../src/ui/review/MobileReview';
import { ProposalsWindow } from '../../../src/ui/review/ProposalsWindow';
import { NEW_IMAGE_PATH, richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor, type ReviewHarness } from './reviewHarness';

// Revisão no celular (HANDOFF-PROPOSALS 5.5, passo 8 da seção 9). O jsdom não tem
// `matchMedia`, então os componentes ficam no layout do celular.

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

function SheetTitle() {
  return <h2>{useReviewSheetTitle() ?? '-'}</h2>;
}

describe('revisão no celular', () => {
  it('a barra de cima troca o menu do projeto por Sair e "Somente leitura"', async () => {
    const h = await openRich();
    const onExit = vi.fn();
    const dialogs = { show: vi.fn(), close: vi.fn() } as unknown as EditorDialogs;
    renderInEditor(
      h,
      <EditorTopBar
        dialogs={dialogs}
        commands={{} as ProjectCommands}
        busy={false}
        onExitReview={onExit}
      />,
    );
    expect(screen.queryByRole('button', { name: /Exportar/ })).toBeNull();
    expect(screen.getByText('Somente leitura')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(onExit).toHaveBeenCalled();
  });

  it('barra de baixo: filtros, próxima pendente e Aplicar aceitas · N', async () => {
    const h = await openRich();
    const onFilters = vi.fn();
    renderInEditor(
      h,
      <MobileReviewBottomBar onPanels={() => {}} onFilters={onFilters} />,
    );
    const apply = screen.getByRole('button', { name: /Aplicar aceitas/ });
    expect((apply as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Filtros da revisão' }));
    expect(onFilters).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima pendente' }));
    expect(h.review.selected.value).not.toBeNull();
    act(() => {
      h.review.decide({ level: 'item', id: 'M1' }, 'accepted');
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Aplicar aceitas · 1/ })).toBeTruthy(),
    );
  });

  it('a gaveta mostra o nível selecionado com Aceitar e Rejeitar', async () => {
    const h = await openRich();
    renderInEditor(
      h,
      <>
        <SheetTitle />
        <ReviewSheetDecision />
      </>,
    );
    act(() => h.review.select(null));
    expect(screen.getByText('Nada selecionado na proposta')).toBeTruthy();
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    expect(screen.getByRole('heading', { name: /Porta/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Aceitar / }));
    await waitFor(() => expect(h.review.derived.counts.value.accepted).toBe(1));
  });

  it('os níveis trazem a barra de baixo; os filtros abrem em tela cheia', async () => {
    const h = await openRich();
    renderInEditor(h, <ProposalsWindow onHelp={() => {}} />);
    // No celular os filtros não ficam no topo da janela.
    expect(screen.queryByRole('group', { name: 'Filtros da revisão' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Filtros da revisão' }));
    expect(h.ui.reviewFilters.value).toBe(true);
    cleanup();
    const onClose = vi.fn();
    renderInEditor(h, <ReviewFiltersDialog onClose={onClose} />);
    const total = h.review.derived.visibleIds.value.length;
    expect(screen.getByRole('group', { name: 'Filtros da revisão' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `Mostrar ${total} mudança(s)` }));
    expect(onClose).toHaveBeenCalled();
  });
});
