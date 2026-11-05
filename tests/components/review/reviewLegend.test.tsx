import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { t } from '../../../src/i18n';
import { locale } from '../../../src/store/settings';
import { EditorContext } from '../../../src/ui/EditorContext';
import {
  ReviewCanvasControls,
  ReviewLegend,
} from '../../../src/ui/review/ReviewCanvasControls';
import { richScenario } from '../../store/proposalHarness';
import { openReviewHarness } from './reviewHarness';

// Etapa #515 (FN1, #474): a legenda das marcas é um painel não modal; Esc com o foco
// dentro fecha, e fechar (X ou Esc) devolve o foco ao botão "Legenda das marcas".

beforeEach(() => {
  locale.value = 'pt-BR';
});
afterEach(cleanup);

async function mount() {
  const { proposal } = richScenario();
  const h = await openReviewHarness({ proposals: [proposal] });
  h.review.open('P1');
  render(
    <EditorContext.Provider value={h.context}>
      <ReviewCanvasControls />
      <ReviewLegend />
    </EditorContext.Provider>,
  );
  return h;
}

const opener = () => screen.getByRole('button', { name: t('review.legend.open') });
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

async function openLegend() {
  const button = opener();
  button.focus();
  button.click();
  await settle();
  return button;
}

describe('legenda das marcas da revisão', () => {
  it('o X se chama "Fechar legenda"', async () => {
    await mount();
    await openLegend();
    expect(t('review.legend.close')).toBe('Fechar legenda');
    expect(screen.getByRole('button', { name: 'Fechar legenda' })).toBeTruthy();
  });

  it('Esc com o foco dentro fecha e o foco volta ao botão que abriu', async () => {
    const h = await mount();
    const button = await openLegend();
    const close = screen.getByRole('button', { name: t('review.legend.close') });
    close.focus();
    fireEvent.keyDown(close, { key: 'Escape' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('fechar pelo X devolve o foco ao botão que abriu', async () => {
    const h = await mount();
    const button = await openLegend();
    const close = screen.getByRole('button', { name: t('review.legend.close') });
    close.focus();
    close.click();
    await settle();
    expect(h.ui.reviewLegend.value).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('Esc com o foco fora da legenda não a fecha', async () => {
    const h = await mount();
    const button = await openLegend();
    button.focus();
    fireEvent.keyDown(button, { key: 'Escape' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(true);
  });
});
