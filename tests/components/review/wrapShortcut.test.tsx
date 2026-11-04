import { act, cleanup } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { selectItems } from '../../../src/store/ui';
import { richScenario } from '../../store/proposalHarness';
import { PanelWithShortcuts, openReviewHarness, renderInEditor } from './reviewHarness';

// Ctrl/Cmd+G (Envolver) não vale na revisão de propostas: o projeto é só leitura e o evento
// segue para o navegador (EV1, decisão 2).

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

describe('Ctrl+G na revisão', () => {
  it('não envolve nem chama preventDefault', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    expect(h.review.open('P1').ok).toBe(true);
    renderInEditor(h, <PanelWithShortcuts />);
    const confirmed = h.context.store.project.value?.markings.length;
    const before = h.review.derived.shownProject.value?.markings.length;
    act(() => selectItems(h.ui, [{ kind: 'marking', id: 'M1' }]));
    const event = new KeyboardEvent('keydown', {
      key: 'g',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(h.review.derived.shownProject.value?.markings.length).toBe(before);
    expect(h.context.store.project.value?.markings.length).toBe(confirmed);
  });
});
