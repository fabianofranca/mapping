import type { ComponentChildren } from 'preact';
import { render } from '@testing-library/preact';
import type { Project } from '../../src/model';
import { createProjectStore, type ProjectStore } from '../../src/store/history';
import { createProjectActions, type ProjectActions } from '../../src/store/project';
import { createEditorUi, type EditorUi } from '../../src/store/ui';

export interface Harness {
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly ui: EditorUi;
  /** Projeto atual do store (falha se não houver). */
  project(): Project;
}

/** Store, actions e UI reais, com o projeto carregado: os componentes mexem no modelo de verdade. */
export function createHarness(project: Project, readOnly = false): Harness {
  const store = createProjectStore({ now: () => '2026-10-02T12:00:00.000Z' });
  store.load(project, { readOnly });
  return {
    store,
    actions: createProjectActions(store),
    ui: createEditorUi(),
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
  return render(<Live harness={harness}>{children}</Live>);
}

export function annotationOf(project: Project, id: string) {
  const found = project.annotations.find((a) => a.id === id);
  if (!found) throw new Error(`anotação ${id} não encontrada`);
  return found;
}
