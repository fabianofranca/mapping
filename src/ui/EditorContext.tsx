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

/** Tudo o que os componentes do editor compartilham, sem passar por props. */
export interface EditorContextValue {
  readonly open: OpenProject;
  readonly session: ProjectSession;
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly display: DisplayImages<ImageBitmap>;
  readonly ui: EditorUi;
  readonly derived: EditorDerived;
  /** Visibilidade das camadas que conhece a perspectiva aberta (única via de escrita da UI). */
  readonly layers: LayerVisibility;
  /** Revisão de propostas (etapa 4): proposta aberta, filtros, decisões e o estado derivado dela. */
  readonly review: ReviewState;
  /** Controller do canvas montado (`CanvasHost` o preenche); `null` fora do editor. */
  readonly canvas: { current: CanvasController | null };
  /** Zoom, cursor e área das imagens, escritos pelo canvas e lidos pela interface. */
  readonly view: CanvasViewState;
  /** Para de guardar a escolha do modo visualização (ao fechar o editor). */
  readonly stopViewShow: () => void;
}

/** Monta o contexto de um projeto aberto. `ui` pode ser injetado (testes). */
export function createEditorContextValue(
  open: OpenProject,
  ui: EditorUi = createEditorUi(),
): EditorContextValue {
  const { session, display } = open;
  const { store, actions } = session;
  // A revisão vem antes do derivado do editor: ele lê o projeto à vista (`shownProject`),
  // para Camadas, Lista, Incompletas e o canvas seguirem a visão Atual/Proposto (fase 8.2).
  const review = createReviewState(session);
  // A perspectiva aberta: o projeto à vista já vem recortado por ela, e as camadas escondidas
  // do derivado passam a ser as dela.
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
    // O que o modo visualização mostra volta, por cópia do projeto, neste navegador.
    stopViewShow: attachViewShowPersistence(ui, session.storage.copyId),
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
  if (!value) throw new Error('useEditor fora do EditorProvider');
  return value;
}
