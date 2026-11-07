import { act, cleanup, screen, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createArrow, renameMarking } from '../../../src/model';
import { t } from '../../../src/i18n';
import { locale } from '../../../src/store/settings';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import { sampleProject } from '../../model/fixtures';
import { propose } from '../../model/proposalFixtures';
import { openReviewHarness, renderInEditor } from './reviewHarness';

// "Ligado por seta" na revisão (etapa #658, decisão 7): os Detalhes da revisão montam o mesmo
// MarkingPanel, e a seção lê o projeto à vista (Atual ou Proposto), sem marcas de revisão.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

describe('Detalhes da revisão — seção "Ligado por seta"', () => {
  it('aparece e lê o projeto à vista, sem marcadores de revisão dentro dela', async () => {
    const base = createArrow(sampleProject(), { id: 'R1', from: 'M1', to: 'M4' });
    const after = renameMarking(base, 'M4', 'Tela de destino');
    const proposal = propose(base, after, { id: 'P1' });
    const h = await openReviewHarness({ project: base, proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    act(() => h.review.select({ level: 'item', id: 'M1' }));
    renderInEditor(h, <ReviewPanel onGoToAnnotation={() => {}} />);

    const section = () => screen.getByRole('region', { name: t('arrowLinks.section') });
    // Proposto (padrão): a outra ponta já tem o nome novo.
    expect(
      within(section()).getByRole('button', {
        name: t('arrow.select', { name: 'Tela de destino' }),
      }),
    ).toBeTruthy();
    expect(within(section()).queryAllByRole('button', { name: /: alterado, / })).toEqual(
      [],
    );

    act(() => h.review.setView('current'));
    expect(
      within(section()).getByRole('button', {
        name: t('arrow.select', { name: t('marking.unnamed') }),
      }),
    ).toBeTruthy();
    expect(within(section()).queryAllByRole('button', { name: /: alterado, / })).toEqual(
      [],
    );
  });
});
