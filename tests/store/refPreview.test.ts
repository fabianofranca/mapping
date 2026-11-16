import { describe, expect, it, vi } from 'vitest';
import { addAnnotation, createArrow, type Project } from '../../src/model';
import {
  closeRefPreview,
  createEditorUi,
  followReference,
  openRefPreview,
} from '../../src/store/ui';
import { pagesProject } from './pageHarness';

// Following a reference to another page opens a read-only preview instead of switching page
// (stage #883, PG3, decision 13); on the same page nothing changes.

function world(): Project {
  let p = pagesProject();
  p = addAnnotation(p, { id: 'A5', markingId: 'M5', layerId: 'L1', name: 'Far' });
  p = createArrow(p, { id: 'R1', from: 'M5', to: 'K' });
  return addAnnotation(p, { id: 'AR', markingId: 'R1', layerId: 'L1', name: 'Route' });
}

const loc = (p: Project, id: string) => {
  const a = p.annotations.find((x) => x.id === id);
  if (!a) throw new Error(id);
  return { id: a.id, markingId: a.markingId, layerId: a.layerId };
};

describe('followReference', () => {
  it('a target on another page opens the preview and leaves the selection and the fallback alone', () => {
    const ui = createEditorUi();
    const p = world();
    const fallback = vi.fn();
    const opener = document.createElement('button');
    const outcome = followReference(ui, p, 'PG1', loc(p, 'A5'), fallback, opener);
    expect(outcome).toBe('previewed');
    expect(ui.refPreview.value).toEqual({
      annotationId: 'A5',
      itemId: 'M5',
      opener,
    });
    expect(ui.selection.value).toBeNull();
    expect(fallback).not.toHaveBeenCalled();
  });

  it('an annotation on an arrow of another page previews the arrow', () => {
    const ui = createEditorUi();
    const p = world();
    followReference(ui, p, 'PG1', loc(p, 'AR'), vi.fn(), null);
    expect(ui.refPreview.value).toEqual({
      annotationId: 'AR',
      itemId: 'R1',
      opener: null,
    });
  });

  it('a target on the open page calls the fallback and opens no preview', () => {
    const ui = createEditorUi();
    const p = world();
    const fallback = vi.fn();
    const outcome = followReference(ui, p, 'PG1', loc(p, 'A1'), fallback, null);
    expect(outcome).toBe('navigated');
    expect(fallback).toHaveBeenCalledWith(loc(p, 'A1'));
    expect(ui.refPreview.value).toBeNull();
  });

  it('openRefPreview and closeRefPreview set and clear the signal', () => {
    const ui = createEditorUi();
    openRefPreview(ui, { annotationId: 'A5', itemId: 'M5', opener: null });
    expect(ui.refPreview.value?.annotationId).toBe('A5');
    closeRefPreview(ui);
    expect(ui.refPreview.value).toBeNull();
  });
});
