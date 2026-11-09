import { act, cleanup, fireEvent } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { richScenario } from '../../store/proposalHarness';
import { showReviewPanel } from './reviewHarness';

// Etapa #954, fase 4 (item 65): trocar de item leva o foco ao contêiner dos Detalhes só se o
// foco estava dentro dele; clicar no fundo (focusout sem `relatedTarget`) zera isso.

beforeEach(() => {
  locale.value = 'pt-BR';
  localStorage.clear();
});
afterEach(cleanup);

const host = () => document.querySelector<HTMLElement>('.review-host') as HTMLElement;

async function mount() {
  const { base, proposal } = richScenario();
  const h = await showReviewPanel(
    { project: base, proposals: [proposal] },
    { level: 'item', id: 'M1' },
  );
  const button = host().querySelector<HTMLElement>('button, [tabindex]');
  if (!button) throw new Error('sem elemento focável nos Detalhes');
  return { h, button };
}

describe('ReviewPanel › foco ao trocar de item', () => {
  it('com o foco dentro, trocar de item mantém o foco no contêiner', async () => {
    const { h, button } = await mount();
    button.focus();
    expect(host().contains(document.activeElement)).toBe(true);
    // O elemento focado some ao trocar de item: o foco cai no `body` e volta ao contêiner.
    button.blur();
    act(() => h.review.select({ level: 'item', id: 'M4' }));
    expect(document.activeElement).toBe(host());
  });

  it('depois de clicar no fundo (relatedTarget nulo), trocar de item não puxa o foco', async () => {
    const { h, button } = await mount();
    button.focus();
    fireEvent.focusOut(button, { relatedTarget: null });
    button.blur();
    await act(async () => {
      await Promise.resolve();
    });
    act(() => h.review.select({ level: 'item', id: 'M4' }));
    expect(document.activeElement).not.toBe(host());
  });
});
