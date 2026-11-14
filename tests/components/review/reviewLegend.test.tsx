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

// Stage #515 (FN1, #474): the mark legend is a non-modal panel; Esc with focus inside
// closes it, and closing (X or Esc) returns focus to the "Mark legend" button.

beforeEach(() => {
  locale.value = 'en-US';
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

describe('review mark legend', () => {
  it('the X is called "Close legend"', async () => {
    await mount();
    await openLegend();
    expect(t('review.legend.close')).toBe('Close legend');
    expect(screen.getByRole('button', { name: 'Close legend' })).toBeTruthy();
  });

  it('Esc with focus inside closes it and focus returns to the button that opened it', async () => {
    const h = await mount();
    const button = await openLegend();
    const close = screen.getByRole('button', { name: t('review.legend.close') });
    close.focus();
    fireEvent.keyDown(close, { key: 'Escape' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('closing with the X returns focus to the button that opened it', async () => {
    const h = await mount();
    const button = await openLegend();
    const close = screen.getByRole('button', { name: t('review.legend.close') });
    close.focus();
    close.click();
    await settle();
    expect(h.ui.reviewLegend.value).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('Esc with focus elsewhere (outside the canvas) does not close it', async () => {
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

  it('Esc with focus on the legend button closes it and focus stays on the button', async () => {
    const h = await mount();
    const button = await openLegend();
    button.focus();
    fireEvent.keyDown(button, { key: 'Escape' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('opened with L with focus on the canvas, Esc closes only the legend and the next one clears the selection', async () => {
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
    h.ui.selection.value = { kind: 'image', id: 'any' };
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

  it('L with focus inside the legend closes it and focus returns to the button that opened it', async () => {
    const h = await mount();
    const button = await openLegend();
    const close = screen.getByRole('button', { name: t('review.legend.close') });
    close.focus();
    fireEvent.keyDown(close, { key: 'l' });
    await settle();
    expect(h.ui.reviewLegend.value).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('L with focus outside the legend closes it without touching focus', async () => {
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
