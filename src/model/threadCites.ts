import type { CitationTarget } from './citations';
import type { Thread } from './thread';

// Ligações das conversas que a interface mostra (etapa Comentários, CM5): quais itens do canvas
// uma conversa cita (o filtro "só as que citam a seleção", decisão 34) e a conversa que ligou
// cada proposta (a linha "da conversa" da janela Propostas, decisão 36). Puro.

/**
 * Os ids que o filtro da seleção compara: o do item (marcação, container ou seta) ou o da
 * anotação que contém a parte citada (campo, par e linha). Camada, conversa e proposta não são
 * itens do canvas e ficam de fora. Mantém a ordem e não repete.
 */
export function citedItemIds(targets: readonly CitationTarget[]): string[] {
  const ids = new Set<string>();
  for (const target of targets) {
    switch (target.kind) {
      case 'marking':
      case 'container':
      case 'arrow':
      case 'annotation':
        ids.add(target.id);
        break;
      case 'field':
      case 'entry':
      case 'row':
        ids.add(target.annotationId);
        break;
      default:
        break;
    }
  }
  return [...ids];
}

/**
 * Para cada proposta ligada a alguma mensagem (`message.proposal`), a conversa que a ligou
 * primeiro: a da mensagem mais antiga.
 */
export function proposalThreads(threads: readonly Thread[]): ReadonlyMap<string, string> {
  const firstAt = new Map<string, string>();
  const result = new Map<string, string>();
  for (const thread of threads) {
    for (const m of thread.messages) {
      if (m.proposal === null) continue;
      const seen = firstAt.get(m.proposal);
      if (seen === undefined || m.at < seen) {
        firstAt.set(m.proposal, m.at);
        result.set(m.proposal, thread.id);
      }
    }
  }
  return result;
}
