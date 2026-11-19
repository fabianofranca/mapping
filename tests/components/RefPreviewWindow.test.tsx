import { cleanup, fireEvent, screen, within } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addContainer,
  addTypedAnnotation,
  createMarking,
  createPage,
  moveRootsToPage,
  setFieldValue,
  type Project,
} from '../../src/model';
import { t } from '../../src/i18n';
import { locale } from '../../src/store/settings';
import { RefPreviewWindow } from '../../src/ui/RefPreviewWindow';
import { world } from '../model/refAnnotationFixtures';
import { layerOf } from '../model/specFixtures';
import { createHarness, renderLive, type Harness } from './harness';

// The floating, read-only preview of a reference to another page (stage #883, PG3, decision 13).

vi.mock('../../src/canvas/PreviewHost', () => ({
  PreviewHost: (props: { itemId: string }) => (
    <div data-testid="preview-host" data-item={props.itemId} />
  ),
}));

beforeEach(() => {
  locale.value = 'en-US';
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

/** AM lives on marking M1, moved to page PG2 ("Second"); the open page stays PG1. */
function setup() {
  let p = world();
  p = createPage(p, { id: 'PG2', name: 'Second' });
  p = moveRootsToPage(p, ['I1'], 'PG2');
  const h = createHarness(p);
  const centerSelection = vi.fn();
  h.context.canvas.current = { centerSelection } as never;
  const opener = document.createElement('button');
  opener.textContent = 'opener';
  document.body.append(opener);
  renderLive(h, () => <RefPreviewWindow />);
  return { h, opener, centerSelection, user: userEvent.setup() };
}

function open(h: Harness, opener: HTMLElement | null) {
  h.ui.refPreview.value = { annotationId: 'AM', itemId: 'M1', opener };
}

const dialog = () => screen.getByRole('dialog');

describe('RefPreviewWindow', () => {
  it('renders nothing while no preview is open', () => {
    setup();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is found by the documented name "Reference preview" and keeps its heading (finding 6.2)', async () => {
    const { h, opener } = setup();
    open(h, opener);
    const win = await screen.findByRole('dialog', { name: 'Reference preview' });
    expect(within(win).getByRole('heading').textContent).toContain('Second');
  });

  it('shows the page name and the item path in the title, with Go to the page and Close', async () => {
    const { h, opener } = setup();
    open(h, opener);
    const win = await screen.findByRole('dialog');
    expect(win.getAttribute('aria-modal')).toBe('false');
    expect(within(win).getByRole('heading').textContent).toContain('Second');
    expect(within(win).getByRole('heading').textContent).toContain(
      h.project().markings.find((m) => m.id === 'M1')!.name ?? '',
    );
    expect(within(win).getByTestId('preview-host').getAttribute('data-item')).toBe('M1');
    expect(within(win).getByRole('button', { name: 'Go to the page' })).toBeTruthy();
    expect(within(win).getByRole('button', { name: 'Close' })).toBeTruthy();
  });

  it('Details are read-only: fields are disabled and editing actions are absent', async () => {
    const { h, opener } = setup();
    open(h, opener);
    const win = await screen.findByRole('dialog');
    const fields = win.querySelectorAll('input, select, textarea');
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) expect((f as HTMLInputElement).disabled).toBe(true);
    const details = within(win).getByRole('region', { name: t('refPreview.details') });
    const buttons = Array.from(details.querySelectorAll('button'));
    // Nothing that edits is offered, not even disabled: only read and navigation controls remain.
    const editing =
      /^(lock marking|move (backward|forward)|add annotation|\+ row|delete |send to perspective|link to)/i;
    const names = buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '');
    expect(names.filter((n) => editing.test(n))).toEqual([]);
    for (const f of details.querySelectorAll('input, select, textarea, button')) {
      const el = f as HTMLButtonElement;
      if (
        el.closest('[aria-expanded], .action-menu') ||
        /^(Copy|About|Collapse)/.test(
          el.getAttribute('aria-label') ?? el.textContent ?? '',
        )
      )
        continue;
      if (el.tagName !== 'BUTTON') expect(el.disabled).toBe(true);
    }
  });

  it('Go to the page switches page, selects the item, frames it and closes the preview', async () => {
    const { h, opener, centerSelection, user } = setup();
    open(h, opener);
    await user.click(await screen.findByRole('button', { name: 'Go to the page' }));
    expect(h.context.session.page.openId()).toBe('PG2');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(centerSelection).toHaveBeenCalled();
    expect(h.ui.refPreview.value).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Close returns focus to the opener', async () => {
    const { h, opener, user } = setup();
    open(h, opener);
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(h.ui.refPreview.value).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.activeElement).not.toBe(document.body);
  });

  it('Esc closes and returns focus to the opener; modified Esc does not close', async () => {
    const { h, opener } = setup();
    open(h, opener);
    const win = await screen.findByRole('dialog');
    fireEvent.keyDown(win, { key: 'Escape', ctrlKey: true });
    expect(h.ui.refPreview.value).not.toBeNull();
    const ev = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    win.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(h.ui.refPreview.value).toBeNull();
    await vi.waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('with a detached opener, focus lands on the canvas area', async () => {
    const { h, opener, user } = setup();
    const area = document.createElement('main');
    area.setAttribute('data-canvas-area', '');
    area.tabIndex = -1;
    document.body.append(area);
    open(h, opener);
    await screen.findByRole('dialog');
    opener.remove();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(area);
  });

  it('moves focus into the window on open', async () => {
    const { h, opener } = setup();
    opener.focus();
    open(h, opener);
    const win = await screen.findByRole('dialog');
    expect(win.contains(document.activeElement)).toBe(true);
  });

  it('opening and closing changes neither selection, page nor project', async () => {
    const { h, opener, user } = setup();
    const before = h.store.committed.value;
    const openBefore = h.context.session.page.openId();
    expect(openBefore).toBe('PG1');
    open(h, opener);
    await screen.findByRole('dialog');
    expect(h.ui.selection.value).toBeNull();
    expect(h.context.session.page.openId()).toBe(openBefore);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(h.ui.selection.value).toBeNull();
    expect(h.ui.focusAnnotation.value).toBeNull();
    expect(h.context.session.page.openId()).toBe('PG1');
    expect(h.store.committed.value).toBe(before);
  });

  it('disappears when the target item is removed from the project', async () => {
    const { h, opener } = setup();
    open(h, opener);
    await screen.findByRole('dialog');
    h.actions.removeMarking('M1');
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(h.ui.refPreview.value).toBeNull();
    expect(dialog).toThrow();
  });
});

/**
 * AM (marking M1) lives on PG2; AL9 (marking M9 in container I9) points to AM and lives on `PG3`
 * (a third page) or stays on the open page PG1.
 */
function linkedSetup(alPage: 'PG3' | 'PG1') {
  let p: Project = world();
  p = createPage(p, { id: 'PG2', name: 'Second' });
  p = moveRootsToPage(p, ['I1'], 'PG2');
  p = addContainer(p, { id: 'I9', file: 'images/z.png', width: 500, height: 500 });
  p = createMarking(p, {
    id: 'M9',
    containerId: 'I9',
    rect: { x: 10, y: 10, width: 50, height: 50 },
  });
  if (alPage === 'PG3') {
    p = createPage(p, { id: 'PG3', name: 'Third' });
    p = moveRootsToPage(p, ['I9'], 'PG3');
  }
  p = addTypedAnnotation(p, {
    id: 'AL9',
    markingId: 'M9',
    layerId: layerOf(p, 'rc', 'telas'),
    type: { specId: 'rc', typeId: 'lista' },
  });
  p = setFieldValue(p, 'AL9', 'item', { annotationId: 'AM' });
  const h = createHarness(p);
  h.context.canvas.current = { centerSelection: vi.fn() } as never;
  const opener = document.createElement('button');
  document.body.append(opener);
  renderLive(h, () => <RefPreviewWindow />);
  h.ui.refPreview.value = { annotationId: 'AM', itemId: 'M1', opener };
  return { h, opener, user: userEvent.setup() };
}

describe('RefPreviewWindow links inside the preview', () => {
  it('a "Referenced by" link to a third page replaces the real preview target', async () => {
    const { h, opener, user } = linkedSetup('PG3');
    const win = await screen.findByRole('dialog');
    await user.click(win.querySelector('.referenced-item')!);
    expect(h.ui.refPreview.value?.annotationId).toBe('AL9');
    expect(h.ui.refPreview.value?.itemId).toBe('M9');
    expect(h.ui.refPreview.value?.opener).toBe(opener);
    expect(h.context.session.page.openId()).toBe('PG1');
    expect(h.ui.selection.value).toBeNull();
  });

  it('a link to the open page navigates (real selection) and closes the preview', async () => {
    const { h, user } = linkedSetup('PG1');
    const win = await screen.findByRole('dialog');
    await user.click(win.querySelector('.referenced-item')!);
    expect(h.ui.refPreview.value).toBeNull();
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M9' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('merely opening leaves the real selection and focus request untouched', async () => {
    const { h } = linkedSetup('PG3');
    await screen.findByRole('dialog');
    expect(h.ui.selection.value).toBeNull();
    expect(h.ui.focusAnnotation.value).toBeNull();
  });

  it('Close with no opener focuses the canvas area, never the body', async () => {
    const { h, user } = setup();
    const area = document.createElement('main');
    area.setAttribute('data-canvas-area', '');
    area.tabIndex = -1;
    document.body.append(area);
    open(h, null);
    await user.click(await screen.findByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(area);
  });
});
