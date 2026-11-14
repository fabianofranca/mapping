import type { ComponentChildren } from 'preact';
import { render } from '@testing-library/preact';
import { signal } from '@preact/signals';
import type { Project } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { createDisplayImages } from '../../src/store/displayImages';
import type { ProjectStore } from '../../src/store/history';
import type { ProjectActions } from '../../src/store/project';
import type { LibraryIssues } from '../../src/storage/specPackage';
import { openSession } from '../../src/store/session';
import type { EditorUi } from '../../src/store/ui';
import { EditorContext, createEditorContextValue } from '../../src/ui/EditorContext';
import { MemoryDirectory } from '../storage/memoryFs';

export interface Harness {
  readonly store: ProjectStore;
  readonly actions: ProjectActions;
  readonly ui: EditorUi;
  /** Context that the editor components read (`useEditor`). */
  readonly context: ReturnType<typeof createEditorContextValue>;
  /** Current project of the store (fails if there is none). */
  project(): Project;
}

/**
 * Real session, store, actions and UI (in-memory folder), with the project loaded: the
 * components change the real model, reading everything from the `EditorContext`.
 */
export function createHarness(
  project: Project,
  readOnly = false,
  extra: { readonly libraryIssues?: LibraryIssues } = {},
): Harness {
  const session = openSession({
    // `copyId`: every session receives the copy (8.4); without it the review logs in the Diagnostics.
    // pt-BR kept: shared fixture data asserted by tests/components (folder name 'projeto')
    storage: createFolderStorage(new MemoryDirectory('projeto'), { copyId: 'harness' }),
    project,
    readOnly,
    ...extra,
    prepareImage: () => Promise.reject(new Error('images are not used here')),
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
      if (!p) throw new Error('no project');
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
  // Reading the signal here re-renders the component on every project change, as in the Editor.
  return <>{children(harness.project())}</>;
}

/** Renders `children` with the project always up to date from the store. */
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
  if (!found) throw new Error(`annotation ${id} not found`);
  return found;
}
