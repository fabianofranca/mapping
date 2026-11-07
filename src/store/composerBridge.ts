import { computed, signal, type ReadonlySignal } from '@preact/signals';
import type { CitationTarget } from '../model';

// Ponte do compositor de conversas (etapa Comentários, CM5): quem tem um compositor aberto e
// gravável o registra aqui, e os menus "Citar na conversa" inserem o chip no mais recente. É
// estado só da UI: sem DOM nem projeto; o compositor decide como insere (cursor ou fim).

export interface ComposerHandle {
  /** Insere a citação do alvo no cursor (ou no fim, se o campo não tem o foco). */
  insert(target: CitationTarget): void;
}

const registered = signal<readonly ComposerHandle[]>([]);

/** Há ao menos um compositor aberto e gravável. */
export const composerOpen: ReadonlySignal<boolean> = computed(
  () => registered.value.length > 0,
);

/** Registra o compositor; a função devolvida o tira (pode ser chamada mais de uma vez). */
export function registerComposer(handle: ComposerHandle): () => void {
  registered.value = [...registered.peek(), handle];
  return () => {
    registered.value = registered.peek().filter((h) => h !== handle);
  };
}

/** Insere a citação no compositor registrado mais recente; `false` se não há nenhum. */
export function insertCitation(target: CitationTarget): boolean {
  const handle = registered.peek().at(-1);
  if (handle === undefined) return false;
  handle.insert(target);
  return true;
}
