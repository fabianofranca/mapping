import { act, cleanup, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useReviewSync } from '../../../src/app/useReviewSync';
import { t } from '../../../src/i18n';
import { locale } from '../../../src/store/settings';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// Os Detalhes da revisão seguem a seleção: limpar a seleção (clicar no fundo do canvas ou
// da Árvore) leva a revisão ao nível da proposta, em vez de deixar o último item à vista
// com "Nada selecionado" na barra de status.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

function Wired() {
  useReviewSync();
  return <ReviewPanel onGoToAnnotation={() => {}} />;
}

describe('Detalhes da revisão sem seleção', () => {
  it('limpar a seleção troca o item pelo nível da proposta', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    renderInEditor(h, <Wired />);
    act(() => {
      h.ui.selection.value = { kind: 'marking', id: 'M1' };
    });
    expect(h.review.selected.value).toEqual({ level: 'item', id: 'M1' });
    expect(screen.getByRole('textbox', { name: 'Nome' })).toBeTruthy();
    act(() => {
      h.ui.selection.value = null;
    });
    expect(h.review.selected.value).toEqual({ level: 'proposal', id: null });
    expect(screen.queryByRole('textbox', { name: 'Nome' })).toBeNull();
    expect(
      screen.getByRole('region', { name: t('review.details.decision') }),
    ).toBeTruthy();
  });
});
