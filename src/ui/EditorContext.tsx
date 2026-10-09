import { createContext, type ComponentChildren } from 'preact';
import { useContext, useEffect, useMemo } from 'preact/hooks';
import type { OpenProject } from '../app/controller';
import type { CanvasController } from '../canvas/CanvasController';
import { createCanvasViewState, type CanvasViewState } from '../canvas/viewState';
import { createEditorDerived, type EditorDerived } from '../store/derived';
import type { DisplayImages } from '../store/displayImages';
import type { ProjectStore } from '../store/history';
import type { ProjectActions } from '../store/project';
import { createReviewState, type ReviewState } from '../store/review';
import type { ProjectSession } from '../store/session';
import { createEditorUi, type EditorUi } from '../store/ui';

/** Tudo o que os componentes do editor compartilham, sem passar por props. */
export interface EditorContextValue {
  readonly open: OpenProject;
  readonly session: ProjectSession;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly display: DisplayImages<ImageBitmap>;
  readonly ui: EditorUi;
  readonly derived: EditorDerived;
  /** Revisão de propostas (etapa 4): proposta aberta, filtros, decisões e o estado derivado dela. */
  readonly review: ReviewState;
  /** Controller do canvas montado (`CanvasHost` o preenche); `null` fora do editor. */
  readonly canvas: { current: CanvasController | null };
  /** Zoom, cursor e área das imagens, escritos pelo canvas e lidos pela interface. */
  readonly view: CanvasViewState;
}

/** Monta o contexto de um projeto aberto. `ui` pode ser injetado (testes). */
export function createEditorContextValue(
  open: OpenProject,
  ui: EditorUi = createEditorUi(),
): EditorContextValue {
  const { session, display } = open;
  const { store, actions } = session;
  return {
    open,
    session,
    store,
    actions,
    display,
    ui,
    derived: createEditorDerived(store, ui),
    review: createReviewState(session),
    canvas: { current: null },
    view: createCanvasViewState(),
  };
}

export const EditorContext = createContext<EditorContextValue | null>(null);

/** Um contexto (e um estado de UI novo) por projeto aberto. */
export function EditorProvider({
  open,
  children,
}: {
  readonly open: OpenProject;
  readonly children: ComponentChildren;
}) {
  const value = useMemo(() => createEditorContextValue(open), [open]);
  useEffect(() => () => value.review.dispose(), [value]);
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error('useEditor fora do EditorProvider');
  return value;
}
