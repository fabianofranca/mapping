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
import { PanelWithShortcuts, openReviewHarness } from './reviewHarness';

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
      <PanelWithShortcuts />
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

  it('Esc com o foco em outro lugar (fora do canvas) não a fecha', async () => {
    const h = await mount();
    await openLegend();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    fireEvent.keyDown(outside, { key: 'Escape' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(true);
    outside.remove();
  });

  it('Esc com o foco no botão da legenda a fecha e o foco fica no botão', async () => {
    const h = await mount();
    const button = await openLegend();
    button.focus();
    fireEvent.keyDown(button, { key: 'Escape' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('aberta pelo L com o foco no canvas, o Esc fecha só a legenda e o seguinte limpa a seleção', async () => {
    const h = await mount();
    const canvas = document.createElement('main');
    canvas.setAttribute('data-canvas-area', '');
    canvas.tabIndex = -1;
    document.body.append(canvas);
    canvas.focus();
    fireEvent.keyDown(canvas, { key: 'l' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(true);
    expect(document.activeElement).toBe(canvas);
    h.ui.selection.value = { kind: 'image', id: 'qualquer' };
    fireEvent.keyDown(canvas, { key: 'Escape' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(false);
    expect(document.activeElement).toBe(canvas);
    expect(h.ui.selection.value).not.toBeNull();
    fireEvent.keyDown(canvas, { key: 'Escape' });
    await settle();
    expect(h.ui.selection.value).toBeNull();
    canvas.remove();
  });

  it('L com o foco dentro da legenda a fecha e o foco volta ao botão que abriu', async () => {
    const h = await mount();
    const button = await openLegend();
    const close = screen.getByRole('button', { name: t('review.legend.close') });
    close.focus();
    fireEvent.keyDown(close, { key: 'l' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('L com o foco fora da legenda a fecha sem mexer no foco', async () => {
    const h = await mount();
    await openLegend();
    const outside = document.createElement('button');
    document.body.append(outside);
    outside.focus();
    fireEvent.keyDown(outside, { key: 'l' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(false);
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});
