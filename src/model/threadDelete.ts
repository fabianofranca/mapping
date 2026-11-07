import type { Thread, ThreadAuthorKind } from './thread';
import { normalizeEmail, userKey, userLabel } from './threadUsers';
import { lastMessage, type ThreadViewer } from './threadView';

// Apagar conversas (decisão 23): o que vai embora e de quem. Só a pessoa apaga; o diálogo diz as
// mensagens de cada autor, e a conversa só sai direto quando é toda da própria pessoa.

export interface DeleteAuthorCount {
  readonly key: string;
  readonly label: string;
  readonly kind: ThreadAuthorKind;
  readonly count: number;
}

export interface MessageSummary {
  readonly messages: number;
  /** Mais mensagens primeiro; no empate, pelo nome. */
  readonly authors: readonly DeleteAuthorCount[];
}

export interface DeleteImpact extends MessageSummary {
  /** Quantas conversas vão embora. */
  readonly threads: number;
  /** Todas as mensagens são de pessoa e do e-mail de `me`: apaga sem diálogo. */
  readonly direct: boolean;
}

function summarize(threads: readonly Thread[]): MessageSummary {
  const authors = new Map<string, DeleteAuthorCount>();
  let messages = 0;
  for (const t of threads) {
    for (const m of t.messages) {
      messages += 1;
      const key = userKey(m.author);
      const prev = authors.get(key);
      authors.set(key, {
        key,
        label: userLabel(m.author),
        kind: m.author.kind,
        count: (prev?.count ?? 0) + 1,
      });
    }
  }
  const sorted = [...authors.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label),
  );
  return { messages, authors: sorted };
}

/** O que se perde ao apagar uma conversa ou várias, e se dá para apagar direto. */
export function deleteImpact(
  threads: Thread | readonly Thread[],
  me: ThreadViewer | null,
): DeleteImpact {
  const list: readonly Thread[] = Array.isArray(threads) ? threads : [threads as Thread];
  const summary = summarize(list);
  const mine = normalizeEmail(me?.email);
  const direct =
    mine !== '' &&
    summary.messages > 0 &&
    list.every((t) =>
      t.messages.every(
        (m) => m.author.kind === 'human' && normalizeEmail(m.author.email) === mine,
      ),
    );
  return { ...summary, threads: list.length, direct };
}

export interface BulkDeleteCriteria {
  /** "Só as resolvidas" (marcado por padrão na interface). */
  readonly onlyResolved: boolean;
  /** "Com a última mensagem antes de": ISO 8601 ou data (`2026-11-01`). Inválida: nenhuma. */
  readonly lastMessageBefore?: string;
}

export interface BulkDeleteCandidates extends MessageSummary {
  readonly threads: readonly Thread[];
}

function isBefore(thread: Thread, limit: number): boolean {
  const last = lastMessage(thread);
  return last !== null && Date.parse(last.at) < limit;
}

/**
 * As conversas que "Apagar conversas…" levaria, com o impacto agregado (autores e contagens).
 * Os critérios são só estes dois; o filtro da janela não entra. Data inválida não apaga nada.
 */
export function bulkDeleteCandidates(
  threads: readonly Thread[],
  criteria: BulkDeleteCriteria,
): BulkDeleteCandidates {
  const limit =
    criteria.lastMessageBefore === undefined
      ? null
      : Date.parse(criteria.lastMessageBefore);
  const picked = threads.filter(
    (t) =>
      (!criteria.onlyResolved || t.resolved !== null) &&
      (limit === null || isBefore(t, limit)),
  );
  return { threads: picked, ...summarize(picked) };
}
