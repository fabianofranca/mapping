// A `ref` to an annotation on another page shows its target and follows it (stage #883, CL1,
// finding 6.2): the Details resolve against the project with every page.
import { cleanup, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addContainer,
  addTypedAnnotation,
  createMarking,
  createPage,
  setFieldValue,
  type Project,
} from '../../src/model';
import { locale } from '../../src/store/settings';
import { AnnotationEditor } from '../../src/ui/AnnotationEditor';
import { EditorContext } from '../../src/ui/EditorContext';
import { world } from '../model/refAnnotationFixtures';
import { layerOf } from '../model/specFixtures';
import { annotationOf, createHarness } from './harness';

beforeEach(() => {
  locale.value = 'en-US';
});
afterEach(cleanup);

function pagesWorld(): Project {
  let p = world();
  p = createPage(p, { id: 'PG2', name: 'Flows' });
  p = addContainer(p, {
    id: 'I9',
    file: 'z.png',
    width: 500,
    height: 500,
    pageId: 'PG2',
  });
  p = createMarking(p, {
    id: 'M9',
    containerId: 'I9',
    rect: { x: 10, y: 10, width: 100, height: 100 },
  });
  p = addTypedAnnotation(p, {
    id: 'AT',
    markingId: 'M9',
    layerId: layerOf(p, 'rc', 'dados'),
    type: { specId: 'rc', typeId: 'modelo' },
  });
  p = setFieldValue(p, 'AT', 'titulo', 'Far');
  return setFieldValue(p, 'AL', 'item', { annotationId: 'AT' });
}

describe('Details: ref to another page', () => {
  it('does not show "(broken reference)" and shows the target', () => {
    const harness = createHarness(pagesWorld());
    const { session, review } = harness.context;
    expect(session.page.id.value).not.toBe('PG2');
    const shown = review.derived.shownProject.value!;
    render(
      <EditorContext.Provider value={harness.context}>
        <AnnotationEditor
          project={shown}
          annotation={annotationOf(shown, 'AL')}
          visibleLayerIds={new Set(shown.layers.map((l) => l.id))}
          onGoToAnnotation={vi.fn()}
          onShowLayer={vi.fn()}
          readOnly={false}
        />
      </EditorContext.Provider>,
    );
    expect(screen.queryAllByText(/broken reference/i)).toEqual([]);
    expect(screen.getAllByText(/Far/).length).toBeGreaterThan(0);
  });
});
