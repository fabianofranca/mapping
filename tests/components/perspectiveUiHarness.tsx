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
 * Like `createHarness`, but with the IndexedDB of the "Only me" perspectives (needs
 * `fake-indexeddb/auto` in the test).
 */
export async function createLocalHarness(project: Project): Promise<Harness> {
  const localStore = await openLocalPerspectives();
  const session = openSession({
    storage: createFolderStorage(new MemoryDirectory('project'), { copyId: 'harness' }),
    project,
    localPerspectives: { store: localStore, initial: [] },
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
  return {
    store: context.store,
    actions: context.actions,
    ui: context.ui,
    context,
    project() {
      const p = context.store.project.value;
      if (!p) throw new Error('no project');
      return p;
    },
  };
}
