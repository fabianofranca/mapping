import { act, cleanup, screen } from '@testing-library/preact';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasController } from '../../src/canvas/CanvasController';
import type { CitationTarget } from '../../src/model';
import { locale } from '../../src/store/settings';
import { selectedThreadId } from '../../src/store/threadUi';
import { hideToolWindow } from '../../src/store/toolWindows';
import { goToAnnotationOnAnyPage } from '../../src/ui/annotationNav';
import { goToCitation } from '../../src/ui/comments/citationNav';
import { CommentsWindow } from '../../src/ui/comments/CommentsWindow';
import { sampleThread } from '../model/threadFixtures';
import { pagesProject } from '../store/pageHarness';
import { createHarness, renderLive, type Harness } from './harness';

// Going to an item on another page (stage #883, PG2, decision 12): the page switches (and the
// Completa opens when the perspective does not show the item), then the item is selected and framed.
// pt-BR kept: shared fixture data (pagesProject extends the model's sampleProject)

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
});
afterEach(() => {
  cleanup();
  hideToolWindow('proposals');
  hideToolWindow('details');
});

/** The harness with the canvas replaced by a spy for `centerSelection`. */
function start(): { h: Harness; center: ReturnType<typeof vi.fn> } {
  const h = createHarness(pagesProject());
  const center = vi.fn();
  h.context.canvas.current = { centerSelection: center } as unknown as CanvasController;
  return { h, center };
}

const go = (h: Harness, target: CitationTarget) => goToCitation(h.context, target);
const pageOf = (h: Harness) => h.context.session.page.id.value;

describe('goToCitation across pages', () => {
  it('a marking on another page: switches the page, selects it and frames it', () => {
    const { h, center } = start();
    expect(pageOf(h)).toBe('PG1');
    go(h, { kind: 'marking', id: 'M5' });
    expect(pageOf(h)).toBe('PG2');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M5' });
    expect(center).toHaveBeenCalledTimes(1);
  });

  it('a container and a canvas marking on another page', () => {
    const { h } = start();
    go(h, { kind: 'container', id: 'I3' });
    expect(pageOf(h)).toBe('PG2');
    expect(h.ui.selection.value).toEqual({ kind: 'image', id: 'I3' });
    h.context.session.page.open('PG1');
    go(h, { kind: 'marking', id: 'K' });
    expect(pageOf(h)).toBe('PG2');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'K' });
  });

  it('an annotation and its field on another page', () => {
    const { h, center } = start();
    h.context.session.page.open('PG3');
    go(h, { kind: 'annotation', id: 'A4' });
    expect(pageOf(h)).toBe('PG1');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M4' });
    expect(h.ui.focusAnnotation.value).toBe('A4');
    expect(center).toHaveBeenCalledTimes(1);

    h.context.session.page.open('PG3');
    go(h, { kind: 'field', annotationId: 'A4', key: 'tipo' });
    expect(pageOf(h)).toBe('PG1');
    expect(h.ui.focusField.value).toBe('tipo');
  });

  it('a thread anchored on another page: switches and selects the thread and its item', async () => {
    const { h } = start();
    await h.context.session.threads.create(
      sampleThread({ id: 'cx5', anchor: { kind: 'marking', id: 'M5' } }),
    );
    go(h, { kind: 'thread', id: 'cx5' });
    expect(pageOf(h)).toBe('PG2');
    expect(selectedThreadId(h.ui)).toBe('cx5');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M5' });
  });

  it('on the open page nothing switches and the framing stays as it was', () => {
    const { h, center } = start();
    go(h, { kind: 'marking', id: 'M2' });
    expect(pageOf(h)).toBe('PG1');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    expect(center).not.toHaveBeenCalled();
  });

  it('when the open perspective does not show the item on its page, the Completa opens with the notice', () => {
    const { h, center } = start();
    const { session } = h.context;
    session.perspective.open('W');
    go(h, { kind: 'marking', id: 'M5' });
    expect(pageOf(h)).toBe('PG2');
    expect(session.perspective.id.value).toBeNull();
    expect(session.perspective.notice.value).toEqual({ kind: 'outside', name: 'Only I2' });
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M5' });
    expect(center).toHaveBeenCalledTimes(1);
  });

  it('keeps the perspective that shows the item on the other page', () => {
    const { h } = start();
    const { session } = h.context;
    session.perspective.open('V');
    go(h, { kind: 'container', id: 'I3' });
    expect(pageOf(h)).toBe('PG2');
    expect(session.perspective.id.value).toBe('V');
    expect(h.ui.selection.value).toEqual({ kind: 'image', id: 'I3' });
  });

  it('with the review locking the perspective, the page switches and the Completa stays', () => {
    const { h } = start();
    const { session } = h.context;
    session.perspective.setLocked(true);
    go(h, { kind: 'marking', id: 'M5' });
    expect(pageOf(h)).toBe('PG2');
    expect(session.perspective.id.value).toBeNull();
    expect(session.perspective.notice.value).not.toEqual(
      expect.objectContaining({ kind: 'outside' }),
    );
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M5' });
  });
});

describe('goToAnnotationOnAnyPage (backlinks, references, "Go to target", Incomplete)', () => {
  it('switches to the page of the annotation, selects the marking and frames it', () => {
    const { h, center } = start();
    h.context.session.page.open('PG2');
    const annotation = h.project().annotations.find((a) => a.id === 'A4');
    if (!annotation) throw new Error('fixture without A4');
    goToAnnotationOnAnyPage(h.context, annotation);
    expect(pageOf(h)).toBe('PG1');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M4' });
    expect(h.ui.focusAnnotation.value).toBe('A4');
    expect(center).toHaveBeenCalledTimes(1);
  });

  it('on the open page it selects and frames without switching', () => {
    const { h, center } = start();
    const annotation = h.project().annotations.find((a) => a.id === 'A1');
    if (!annotation) throw new Error('fixture without A1');
    goToAnnotationOnAnyPage(h.context, annotation);
    expect(pageOf(h)).toBe('PG1');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(center).toHaveBeenCalledTimes(1);
  });
});

describe('conversations on other pages', () => {
  it('a conversation on another page is not an orphan', async () => {
    const { h } = start();
    await h.context.session.threads.create(
      sampleThread({ id: 'cx5', anchor: { kind: 'marking', id: 'M5' } }),
    );
    const entry = h.context.derived.threads.entries.value.find(
      (e) => e.thread.id === 'cx5',
    );
    expect(entry?.resolution.orphan).toBe(false);
  });

  it('the Comments window row of a conversation on another page goes to its page', async () => {
    const { h, center } = start();
    await h.context.session.threads.create(
      sampleThread({ id: 'cx5', anchor: { kind: 'marking', id: 'M5' } }),
    );
    const user = userEvent.setup();
    renderLive(h, () => <CommentsWindow />);
    const row = (await screen.findAllByRole('row')).find((r) => /M5|Marking/i.test(r.textContent ?? ''));
    const target = row ?? (await screen.findAllByRole('row'))[1];
    if (!target) throw new Error('no row');
    await act(() => user.click(target));
    expect(pageOf(h)).toBe('PG2');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M5' });
    expect(selectedThreadId(h.ui)).toBe('cx5');
    expect(center).toHaveBeenCalledTimes(1);
  });
});
