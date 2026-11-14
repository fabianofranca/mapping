import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { CitationTarget } from '../model';

// Thread composer bridge (Comments stage, CM5): whoever has an open, writable composer
// registers it here, and the "Cite in the conversation" menus insert the chip in the most
// recent one. It is UI-only state: no DOM or project; the composer decides how it inserts
// (cursor or end).

export interface ComposerHandle {
  /** Inserts the target's citation at the cursor (or at the end, if the field is not focused). */
  insert(target: CitationTarget): void;
}

const registered = signal<readonly ComposerHandle[]>([]);

/** There is at least one open, writable composer. */
export const composerOpen: ReadonlySignal<boolean> = computed(
  () => registered.value.length > 0,
);

/** Registers the composer; the returned function removes it (it can be called more than once). */
export function registerComposer(handle: ComposerHandle): () => void {
  registered.value = [...registered.peek(), handle];
  return () => {
    registered.value = registered.peek().filter((h) => h !== handle);
  };
}

/** Inserts the citation in the most recently registered composer; `false` if there is none. */
export function insertCitation(target: CitationTarget): boolean {
  const handle = registered.peek().at(-1);
  if (handle === undefined) return false;
  handle.insert(target);
  return true;
}
