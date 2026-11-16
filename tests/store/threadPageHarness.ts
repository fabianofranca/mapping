import { signal, type ReadonlySignal } from '@preact/signals';
import type { Thread } from '../../src/model';
import { createEditorDerived } from '../../src/store/derived';
import { createProjectStore } from '../../src/store/history';
import { projectInPerspective } from '../../src/store/perspectiveShown';
import { createEditorUi } from '../../src/store/ui';
import { computed } from '@preact/signals';
import { pagesProject } from './pageHarness';

// Derived thread state over the pages world, with the open page as a signal.
export function derivedFor(threads: readonly Thread[], page: ReadonlySignal<string>) {
  const store = createProjectStore();
  store.load(pagesProject(), { readOnly: false });
  const ui = createEditorUi();
  ui.commentPins.value = true;
  const shown = computed(() =>
    projectInPerspective(store.committed.value, null, page.value),
  );
  const derived = createEditorDerived(store, ui, shown, undefined, {
    threads: signal(threads),
    copyId: null,
    identity: signal(null),
    pageId: page,
  } as never);
  return { store, ui, derived };
}
