import { signal } from '@preact/signals';
import type { Project } from '../../src/model';
import { createFolderStorage } from '../../src/storage/folder';
import { openLocalPerspectives } from '../../src/storage/localPerspectives';
import { createDisplayImages } from '../../src/store/displayImages';
import { openSession } from '../../src/store/session';
import { createEditorContextValue } from '../../src/ui/EditorContext';
import { MemoryDirectory } from '../storage/memoryFs';
import type { Harness } from './harness';

/**
 * Como `createHarness`, mas com o IndexedDB das perspectivas "Só eu" (precisa de
 * `fake-indexeddb/auto` no teste).
 */
export async function createLocalHarness(project: Project): Promise<Harness> {
  const localStore = await openLocalPerspectives();
  const session = openSession({
    storage: createFolderStorage(new MemoryDirectory('projeto'), { copyId: 'harness' }),
    project,
    localPerspectives: { store: localStore, initial: [] },
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
  return {
    store: context.store,
    actions: context.actions,
    ui: context.ui,
    context,
    project() {
      const p = context.store.project.value;
      if (!p) throw new Error('sem projeto');
      return p;
    },
  };
}
