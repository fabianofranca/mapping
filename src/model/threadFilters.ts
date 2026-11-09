import { projectIndex } from './projectIndex';
import type { Thread, ThreadAnchor } from './thread';
import { userKey } from './threadUsers';
import { awaiting } from './threadView';
import type { Project } from './types';
import { fold } from './fold';

// Filtros da janela Comentários (decisões 21 e 34): status, usuário, texto e "cita a seleção".
// O padrão de status na interface é `open`, mas a função exige o status explícito.

export type ThreadStatusFilter =
  'all' | 'open' | 'awaitingAgent' | 'awaitingHuman' | 'resolved';

/**
 * "Só as que citam a seleção" (decisão 34): o item selecionado (marcação, container ou seta) e,
 * por conversa, os ids dos alvos que ela cita. O id citado é o do item ou o da anotação que
 * contém a parte citada (campo, par, linha); as citações vêm de quem as extrai das mensagens.
 */
export interface ThreadSelectionFilter {
  readonly itemId: string;
  readonly cites: ReadonlyMap<string, readonly string[]>;
}

export interface ThreadFilter {
  readonly status: ThreadStatusFilter;
  /** Chave de `userKey`: alguma mensagem da conversa é desse usuário. */
  readonly user?: string;
  /** Todas as palavras, sem diferença de caixa nem de acento, no texto das mensagens. */
  readonly text?: string;
  readonly selection?: ThreadSelectionFilter;
}

function matchesStatus(thread: Thread, status: ThreadStatusFilter): boolean {
  switch (status) {
    case 'all':
      return true;
    case 'resolved':
      return thread.resolved !== null;
    case 'open':
      return thread.resolved === null;
    case 'awaitingAgent':
      return awaiting(thread) === 'agent';
    default:
      return awaiting(thread) === 'human';
  }
}

function matchesText(thread: Thread, words: readonly string[]): boolean {
  if (words.length === 0) return true;
  const haystack = fold(thread.messages.map((m) => m.text).join('\n'));
  return words.every((w) => haystack.includes(w));
}

function anchoredIn(
  anchor: ThreadAnchor,
  itemId: string,
  annotationIds: ReadonlySet<string>,
): boolean {
  switch (anchor.kind) {
    case 'marking':
    case 'container':
    case 'arrow':
      return anchor.id === itemId;
    case 'annotation':
      return annotationIds.has(anchor.id);
    case 'field':
    case 'entry':
    case 'row':
      return annotationIds.has(anchor.annotationId);
    default:
      return false;
  }
}

/** O item e as anotações dele (as partes: campos, pares e linhas moram nelas). */
function selectionTargets(project: Project, itemId: string): ReadonlySet<string> {
  const owned = projectIndex(project).annotationsByMarking.get(itemId) ?? [];
  return new Set([itemId, ...owned.map((a) => a.id)]);
}

function selectionMatcher(
  project: Project,
  selection: ThreadSelectionFilter,
): (t: Thread) => boolean {
  const targets = selectionTargets(project, selection.itemId);
  return (t) =>
    anchoredIn(t.anchor, selection.itemId, targets) ||
    (selection.cites.get(t.id) ?? []).some((id) => targets.has(id));
}

/** Aplica os filtros em conjunto (E), mantendo a ordem da entrada. */
export function filterThreads(
  threads: readonly Thread[],
  project: Project,
  filter: ThreadFilter,
): readonly Thread[] {
  const words = fold(filter.text ?? '')
    .split(/\s+/)
    .filter(Boolean);
  const inSelection = filter.selection
    ? selectionMatcher(project, filter.selection)
    : null;
  return threads.filter(
    (t) =>
      matchesStatus(t, filter.status) &&
      (filter.user === undefined ||
        t.messages.some((m) => userKey(m.author) === filter.user)) &&
      matchesText(t, words) &&
      (inSelection === null || inSelection(t)),
  );
}
