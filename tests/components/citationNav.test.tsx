import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createArrow, type CitationTarget } from '../../src/model';
import { locale } from '../../src/store/settings';
import { selectedThreadId } from '../../src/store/threadUi';
import { hideToolWindow, isToolWindowOpen } from '../../src/store/toolWindows';
import { goToCitation } from '../../src/ui/comments/citationNav';
import { sampleProject } from '../model/fixtures';
import { sampleThread } from '../model/threadFixtures';
import { richScenario } from '../store/proposalHarness';
import { createHarness } from './harness';
import { openReviewHarness } from './review/reviewHarness';

// Navigation on clicking a citation chip (Comments stage, CM5): reuses the store functions
// (selection, go to the annotation, select the thread, open the review).
// pt-BR kept: shared fixture data asserted by tests/model (sampleProject field keys 'tipo' and 'itens')

beforeEach(() => {
  localStorage.clear();
  locale.value = 'en-US';
});
afterEach(() => {
  hideToolWindow('proposals');
});

const withArrow = () =>
  createHarness(
    createArrow(sampleProject(), { id: 'R1', from: 'M1', to: 'M2', name: 'Flow' }),
  );

const go = (h: ReturnType<typeof createHarness>, target: CitationTarget) =>
  goToCitation(h.context, target);

describe('goToCitation', () => {
  it('marking, container and arrow: selects the item', () => {
    const h = withArrow();
    go(h, { kind: 'marking', id: 'M2' });
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    go(h, { kind: 'container', id: 'I2' });
    expect(h.ui.selection.value).toEqual({ kind: 'image', id: 'I2' });
    go(h, { kind: 'arrow', id: 'R1' });
    expect(h.ui.selection.value).toEqual({ kind: 'arrow', id: 'R1' });
  });

  it('marking on a hidden layer shows the layer', () => {
    const h = withArrow();
    h.ui.hiddenLayers.value = new Set(['L1']);
    go(h, { kind: 'annotation', id: 'A1' });
    expect(h.ui.hiddenLayers.value.has('L1')).toBe(false);
  });

  it('annotation: selects the owner marking and focuses the annotation', () => {
    const h = withArrow();
    go(h, { kind: 'annotation', id: 'A3' });
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M2' });
    expect(h.ui.focusAnnotation.value).toBe('A3');
    expect(h.ui.focusField.value).toBeNull();
  });

  it('field and row: select the annotation owner and focus the field', () => {
    const h = withArrow();
    go(h, { kind: 'field', annotationId: 'A1', key: 'tipo' });
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(h.ui.focusAnnotation.value).toBe('A1');
    expect(h.ui.focusField.value).toBe('tipo');
    h.ui.focusField.value = null;
    go(h, { kind: 'row', annotationId: 'A1', key: 'itens', rowId: 'W1' });
    expect(h.ui.focusAnnotation.value).toBe('A1');
    expect(h.ui.focusField.value).toBe('itens');
  });

  it('pair: selects the annotation owner and focuses the annotation, no field', () => {
    const h = withArrow();
    h.ui.focusField.value = 'old';
    go(h, { kind: 'entry', annotationId: 'A2', entryId: 'E3' });
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M1' });
    expect(h.ui.focusAnnotation.value).toBe('A2');
    expect(h.ui.focusField.value).toBeNull();
  });

  it('layer: shows the hidden layer and opens the Layers window', () => {
    const h = withArrow();
    h.ui.hiddenLayers.value = new Set(['L2']);
    hideToolWindow('layers');
    go(h, { kind: 'layer', id: 'L2' });
    expect(h.ui.hiddenLayers.value.has('L2')).toBe(false);
    expect(isToolWindowOpen('layers')).toBe(true);
  });

  it('layer hidden by the open perspective: leaves its hidden ones, with undo', () => {
    const h = withArrow();
    const { session } = h.context;
    const created = session.perspectiveActions.createPerspective({
      name: 'Flow A',
      startFrom: null,
      local: false,
    });
    if (!created.ok) throw new Error('perspective not created');
    session.perspectiveActions.setPerspectiveHiddenLayers(created.value, ['L2']);
    session.perspective.open(created.value);
    const hiddenOf = () =>
      h.project().perspectives.find((x) => x.id === created.value)?.hiddenLayers;
    go(h, { kind: 'layer', id: 'L2' });
    expect(hiddenOf()).toEqual([]);
    expect(h.ui.hiddenLayers.value.size).toBe(0);
    h.store.undo();
    expect(hiddenOf()).toEqual(['L2']);
  });

  it('layer already visible in the open perspective: does not write to the history', () => {
    const h = withArrow();
    const { session } = h.context;
    const created = session.perspectiveActions.createPerspective({
      name: 'Flow A',
      startFrom: null,
      local: false,
    });
    if (!created.ok) throw new Error('perspective not created');
    session.perspective.open(created.value);
    const before = h.store.canUndo.value;
    go(h, { kind: 'layer', id: 'L2' });
    go(h, { kind: 'annotation', id: 'A1' });
    expect(h.store.canUndo.value).toBe(before);
  });

  it('thread: selects the thread and its item', async () => {
    const h = withArrow();
    await h.context.session.threads.create(
      sampleThread({ id: 'cx1', anchor: { kind: 'marking', id: 'M3' } }),
    );
    go(h, { kind: 'thread', id: 'cx1' });
    expect(selectedThreadId(h.ui)).toBe('cx1');
    expect(h.ui.selection.value).toEqual({ kind: 'marking', id: 'M3' });
  });

  it('thread that no longer exists: does not change the selection', () => {
    const h = withArrow();
    go(h, { kind: 'thread', id: 'gone' });
    expect(h.ui.selection.value).toBeNull();
  });

  it('proposal: opens the review and the Details and Proposals windows', async () => {
    const { proposal } = richScenario();
    const h = await openReviewHarness({ proposals: [proposal] });
    hideToolWindow('proposals');
    goToCitation(h.context, { kind: 'proposal', id: 'P1' });
    expect(h.review.proposalId.value).toBe('P1');
    expect(isToolWindowOpen('proposals')).toBe(true);
    expect(isToolWindowOpen('details')).toBe(true);
  });

  it('proposal that does not exist: warns in a toast and does not open the review', async () => {
    const h = await openReviewHarness({ proposals: [] });
    goToCitation(h.context, { kind: 'proposal', id: 'none' });
    expect(h.review.proposalId.value).toBeNull();
    expect(h.ui.toast.value).not.toBeNull();
  });
});
