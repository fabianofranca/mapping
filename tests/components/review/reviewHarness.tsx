import { signal } from '@preact/signals';
import { act, render } from '@testing-library/preact';
import type { ComponentChildren } from 'preact';
import { expect } from 'vitest';
import type { EditorDialogs } from '../../../src/app/useEditorDialogs';
import type { ProjectCommands } from '../../../src/app/useProjectCommands';
import { useEditorShortcuts } from '../../../src/app/useEditorShortcuts';
import { ReviewPanel } from '../../../src/ui/review/ReviewPanel';
import {
  addAnnotation,
  addContainer,
  addLayer,
  createMarking,
  createProject,
} from '../../../src/model';
import { createDisplayImages } from '../../../src/store/displayImages';
import { EditorContext, createEditorContextValue } from '../../../src/ui/EditorContext';
import { AT, propose } from '../../model/proposalFixtures';
import { openHarness, type HarnessOptions } from '../../store/proposalHarness';

/**
 * Real session over an in-memory folder with proposals (the same as
 * `tests/store/proposalHarness.ts`) and the editor context mounted on top of it, with the
 * review (`context.review`) that the components read.
 */
export async function openReviewHarness(options: HarnessOptions = {}) {
  const harness = await openHarness(options);
  // The store harness review is not used here: the context creates its own.
  harness.review.dispose();
  const context = createEditorContextValue({
    kind: 'folder',
    session: harness.session,
    display: createDisplayImages<ImageBitmap>(() => Promise.resolve(null)),
    localId: null,
    unexported: signal(false),
  });
  return { ...harness, context, review: context.review, ui: context.ui };
}

export type ReviewHarness = Awaited<ReturnType<typeof openReviewHarness>>;

/**
 * New import: freshly created project (no images, only layer `L1`) and the proposal that
 * creates layer `L2` "Eventos", image `I1` (800×600, at (0, 0)) and in it marking `M1`
 * "Formulário" with an annotation on the new layer. None of this exists outside the preview.
 */
export function firstImport() {
  // pt-BR kept: shared fixture data asserted by tests/components and tests/canvas
  const base = createProject({
    name: 'Importação',
    now: AT,
    firstLayer: { id: 'L1', name: 'Camada 1', color: '#D32F2F' },
  });
  let after = addLayer(base, { id: 'L2', name: 'Eventos', color: '#1E88E5' });
  after = addContainer(after, {
    id: 'I1',
    file: 'images/cadastro.webp',
    width: 800,
    height: 600,
  });
  after = createMarking(after, {
    id: 'M1',
    containerId: 'I1',
    rect: { x: 10, y: 10, width: 200, height: 100 },
    name: 'Formulário',
  });
  after = addAnnotation(after, {
    id: 'A1',
    markingId: 'M1',
    layerId: 'L2',
    name: 'onClick',
  });
  return { base, proposal: propose(base, after, { id: 'P1', title: 'Importação' }) };
}

export function renderInEditor(h: ReviewHarness, children: ComponentChildren) {
  return render(
    <EditorContext.Provider value={h.context}>{children}</EditorContext.Provider>,
  );
}

/** The review Details (`ReviewPanel`) with the editor shortcuts on (A, R, N, C…). */
export function PanelWithShortcuts() {
  const dialogs = { current: null, show() {}, close() {} } as unknown as EditorDialogs;
  const commands = { exportProject: async () => {} } as unknown as ProjectCommands;
  useEditorShortcuts(dialogs, commands);
  return <ReviewPanel onGoToAnnotation={() => {}} />;
}

/** Opens proposal `P1`, selects the level and mounts the review Details with the shortcuts. */
export async function showReviewPanel(
  options: Parameters<typeof openReviewHarness>[0],
  target: Parameters<ReviewHarness['review']['select']>[0],
) {
  const h = await openReviewHarness(options);
  expect(h.review.open('P1').ok).toBe(true);
  act(() => h.review.select(target));
  renderInEditor(h, <PanelWithShortcuts />);
  return h;
}
