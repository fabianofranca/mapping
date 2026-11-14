import { act, cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { ViewModeButton, ModeButtons } from '../../src/app/EditorTools';
import { t } from '../../src/i18n';
import { setViewMode } from '../../src/store/ui';
import { EditorContext } from '../../src/ui/EditorContext';
import { ViewModePanel } from '../../src/ui/ViewModePanel';
import { sampleProject } from '../model/fixtures';
import { createHarness, renderLive } from './harness';

afterEach(cleanup);

function setup() {
  const h = createHarness(sampleProject());
  renderLive(h, () => (
    <EditorContext.Provider value={h.context}>
      <ViewModeButton />
      <ViewModePanel />
      <ModeButtons />
    </EditorContext.Provider>
  ));
  return h;
}

describe('View mode: button', () => {
  it('turns view mode on and off, with aria-pressed, and disables Draw while on', () => {
    const h = setup();
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    const draw = screen.getByRole('button', { name: t('editor.modeDraw') });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    expect(draw.hasAttribute('disabled')).toBe(false);

    fireEvent.click(button);
    expect(h.ui.viewMode.value).toBe(true);
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(draw.hasAttribute('disabled')).toBe(true);

    fireEvent.click(button);
    expect(h.ui.viewMode.value).toBe(false);
    expect(button.getAttribute('aria-pressed')).toBe('false');
  });

  it('entering the mode opens the Show on canvas panel; leaving closes it', () => {
    setup();
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    expect(screen.queryByRole('dialog', { name: t('view.panelTitle') })).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: t('view.panelTitle') })).toBeTruthy();
    fireEvent.click(button);
    expect(screen.queryByRole('dialog', { name: t('view.panelTitle') })).toBeNull();
  });

  it('Show on canvas is only enabled in the mode and reopens the panel', () => {
    const h = setup();
    const open = screen.getByRole('button', { name: t('view.panelOpen') });
    expect(open.hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t('view.viewMode') }));
    expect(open.hasAttribute('disabled')).toBe(false);
    // Esc closes the panel and the mode stays.
    fireEvent.keyDown(screen.getByRole('dialog', { name: t('view.panelTitle') }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('dialog', { name: t('view.panelTitle') })).toBeNull();
    expect(h.ui.viewMode.value).toBe(true);
    fireEvent.click(open);
    expect(screen.getByRole('dialog', { name: t('view.panelTitle') })).toBeTruthy();
  });

  it('Alt+H or Esc to leave the mode leave focus on View, not on body', () => {
    const h = setup();
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    fireEvent.click(button);
    // Focus is inside the panel (first box); leaving with Alt+H moves focus to View.
    expect(document.activeElement).not.toBe(document.body);
    act(() => setViewMode(h.ui, false));
    expect(document.activeElement).toBe(button);
  });

  it('Esc in the panel opened when turning the mode on returns focus to View', () => {
    setup();
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    fireEvent.click(button);
    fireEvent.keyDown(screen.getByRole('dialog', { name: t('view.panelTitle') }), {
      key: 'Escape',
    });
    expect(document.activeElement).toBe(button);
  });

  it('panel opened by Show on canvas returns focus to it on close', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: t('view.viewMode') }));
    const dialog = () => screen.getByRole('dialog', { name: t('view.panelTitle') });
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    const open = screen.getByRole('button', { name: t('view.panelOpen') });
    fireEvent.click(open);
    fireEvent.keyDown(dialog(), { key: 'Escape' });
    expect(document.activeElement).toBe(open);
  });

  it('the View hint stays suppressed while the panel is open', () => {
    setup();
    const button = screen.getByRole('button', { name: t('view.viewMode') });
    const anchor = () => button.closest('.tooltip-anchor');
    expect(anchor()?.classList.contains('tooltip-dismissed')).toBe(false);
    fireEvent.click(button);
    expect(anchor()?.classList.contains('tooltip-dismissed')).toBe(true);
    fireEvent.keyDown(screen.getByRole('dialog', { name: t('view.panelTitle') }), {
      key: 'Escape',
    });
    expect(anchor()?.classList.contains('tooltip-dismissed')).toBe(false);
  });
});
