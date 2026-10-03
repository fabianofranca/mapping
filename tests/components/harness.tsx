import type { ComponentChildren } from 'preact';
import { render } from '@testing-library/preact';
import { signal } from '@preact/signals';
import type { Project } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { createDisplayImages } from '../../src/store/displayImages';
import type { ProjectStore } from '../../src/store/history';
import type { ProjectActions } from '../../src/store/project';
import { openSession } from '../../src/store/session';
import type { EditorUi } from '../../src/store/ui';
import { EditorContext, createEditorContextValue } from '../../src/ui/EditorContext';
import { MemoryDirectory } from '../storage/memoryFs';

export interface Harness {
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly ui: EditorUi;
  /** Contexto que os componentes do editor leem (`useEditor`). */
  readonly context: ReturnType<typeof createEditorContextValue>;
  /** Projeto atual do store (falha se não houver). */
  project(): Project;
}

/**
 * Sessão, store, actions e UI reais (pasta em memória), com o projeto carregado: os
 * componentes mexem no modelo de verdade, lendo tudo do `EditorContext`.
 */
export function createHarness(project: Project, readOnly = false): Harness {
  const session = openSession({
    storage: createFolderStorage(new MemoryDirectory('projeto')),
    project,
    readOnly,
    prepareImage: () => Promise.reject(new Error('imagens não são usadas aqui')),
    now: () => '2026-10-02T12:00:00.000Z',
  });
  const context = createEditorContextValue({
    kind: 'folder',
    session,
    display: createDisplayImages<ImageBitmap>(() => Promise.resolve(null)),
    localId: null,
    unexported: signal(false),
  });
  const { store, actions, ui } = context;
  return {
    store,
    actions,
    ui,
    context,
    project() {
      const p = store.project.value;
      if (!p) throw new Error('sem projeto');
      return p;
    },
  };
}

function Live({
  harness,
  children,
}: {
  readonly harness: Harness;
  readonly children: (project: Project) => ComponentChildren;
}) {
  // Ler o signal aqui re-renderiza o componente a cada mudança do projeto, como no Editor.
  return <>{children(harness.project())}</>;
}

/** Renderiza `children` com o projeto sempre atualizado a partir do store. */
export function renderLive(
  harness: Harness,
  children: (project: Project) => ComponentChildren,
) {
  return render(
    <EditorContext.Provider value={harness.context}>
      <Live harness={harness}>{children}</Live>
    </EditorContext.Provider>,
  );
}

export function annotationOf(project: Project, id: string) {
  const found = project.annotations.find((a) => a.id === id);
  if (!found) throw new Error(`anotação ${id} não encontrada`);
  return found;
}
