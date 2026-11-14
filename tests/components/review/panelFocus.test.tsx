import { act, cleanup, fireEvent } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locale } from '../../../src/store/settings';
import { richScenario } from '../../store/proposalHarness';
import { showReviewPanel } from './reviewHarness';

// Stage #954, phase 4 (item 65): switching item moves focus to the Details container only if
// focus was inside it; clicking the background (focusout without `relatedTarget`) resets that.

beforeEach(() => {
  locale.value = 'en-US';
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
  if (!button) throw new Error('no focusable element in the Details');
  return { h, button };
}

describe('ReviewPanel › focus on switching item', () => {
  it('with focus inside, switching item keeps focus on the container', async () => {
    const { h, button } = await mount();
    button.focus();
    expect(host().contains(document.activeElement)).toBe(true);
    // The focused element disappears on switching item: focus falls to the `body` and returns to the container.
    button.blur();
    act(() => h.review.select({ level: 'item', id: 'M4' }));
    expect(document.activeElement).toBe(host());
  });

  it('after clicking the background (null relatedTarget), switching item does not pull focus', async () => {
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
