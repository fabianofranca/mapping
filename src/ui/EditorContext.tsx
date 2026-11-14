import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo } from 'preact/hooks';
import type { OpenProject } from '../app/controller';
import type { CanvasController } from '../canvas/CanvasController';
import { createCanvasViewState, type CanvasViewState } from '../canvas/viewState';
import { createEditorDerived, type EditorDerived } from '../store/derived';
import type { DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import { identity } from '../store/identity';
import { createLayerVisibility, type LayerVisibility } from '../store/layerVisibility';
import { createOpenPerspective } from '../store/perspectiveShown';
import { createReviewState, type ReviewState } from '../store/review';
import type { ProjectSession } from '../store/session';
import { createEditorUi, type EditorUi } from '../store/ui';
import { attachViewShowPersistence } from '../store/viewMode';

/** Everything the editor components share, without going through props. */
export interface EditorContextValue {
  readonly open: OpenProject;
  readonly session: ProjectSession;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly display: DisplayImages<ImageBitmap>;
  readonly ui: EditorUi;
  readonly derived: EditorDerived;
  /** Visibility of the layers known to the open perspective (the UI's only write path). */
  readonly layers: LayerVisibility;
  /** Proposal review (stage 4): open proposal, filters, decisions and its derived state. */
  readonly review: ReviewState;
  /** Mounted canvas controller (`CanvasHost` fills it in); `null` outside the editor. */
  readonly canvas: { current: CanvasController | null };
  /** Zoom, cursor and image area, written by the canvas and read by the interface. */
  readonly view: CanvasViewState;
  /** Stops storing the view mode choice (when closing the editor). */
  readonly stopViewShow: () => void;
}

/** Builds the context of an open project. `ui` can be injected (tests). */
export function createEditorContextValue(
  open: OpenProject,
  ui: EditorUi = createEditorUi(),
): EditorContextValue {
  const { session, display } = open;
  const { store, actions } = session;
  // The review comes before the editor's derived state: it reads the shown project (`shownProject`),
  // so Layers, List, Incomplete and the canvas follow the Current/Proposed view (phase 8.2).
  const review = createReviewState(session);
  // The open perspective: the shown project already comes cropped by it, and the derived state's
  // hidden layers become its own.
  const perspective = createOpenPerspective(store, session.perspective.id);
  return {
    open,
    session,
    store,
    actions,
    display,
    ui,
    derived: createEditorDerived(
      store,
      ui,
      review.derived.shownProject,
      review.components,
      {
        threads: session.threads.list,
        copyId: session.storage.copyId ?? null,
        identity,
        proposals: session.proposals.list,
      },
      perspective,
    ),
    layers: createLayerVisibility({
      ui,
      perspective,
      perspectiveActions: session.perspectiveActions,
    }),
    review,
    canvas: { current: null },
    view: createCanvasViewState(),
    // What the view mode shows is restored, from a copy of the project, in this browser.
    stopViewShow: attachViewShowPersistence(ui, session.storage.copyId),
  };
}

export const EditorContext = createContext<EditorContextValue | null>(null);

/** One context (and a new UI state) per open project. */
export function EditorProvider({
  open,
  children,
}: {
  readonly open: OpenProject;
  readonly children: ComponentChildren;
}) {
  const value = useMemo(() => createEditorContextValue(open), [open]);
  useEffect(
    () => () => {
      value.review.dispose();
      value.stopViewShow();
    },
    [value],
  );
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error('useEditor outside the EditorProvider');
  return value;
}
