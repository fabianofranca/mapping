import type { Thread, ThreadAuthor, ThreadAuthorKind } from './thread';

// Usuários das conversas (decisão 13): pessoas agrupadas pelo e-mail, agentes pelo nome.
// Puro: serve ao filtro Usuário, às iniciais do pino e ao diálogo de apagar.

/** E-mail comparável: sem espaços em volta e em minúsculas. Vazio quando não há. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/**
 * Chave do usuário: `human:<e-mail normalizado>` ou `agent:<nome>`. O prefixo impede que um
 * agente e uma pessoa se confundam.
 */
export function userKey(author: ThreadAuthor): string {
  return author.kind === 'human'
    ? `human:${normalizeEmail(author.email)}`
    : `agent:${author.name.trim()}`;
}

/** Nome para mostrar (sem espaços sobrando). */
export function userLabel(author: ThreadAuthor): string {
  return author.name.trim();
}

/** Iniciais: a primeira letra da primeira e da última palavra do nome; o agente é sempre `AG`. */
export function initials(author: ThreadAuthor): string {
  if (author.kind === 'agent') return 'AG';
  const words = author.name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const last = words[words.length - 1];
  if (first === undefined || last === undefined) return '?';
  const letter = (w: string) => (Array.from(w)[0] ?? '').toUpperCase();
  return words.length === 1 ? letter(first) : `${letter(first)}${letter(last)}`;
}

export interface ThreadUser {
  readonly key: string;
  /** Nome da última mensagem do usuário, na ordem da entrada. */
  readonly label: string;
  readonly kind: ThreadAuthorKind;
  /** E-mail normalizado da pessoa (o filtro mostra as pessoas por ele); `null` no agente. */
  readonly email: string | null;
  /** Conversas em que o usuário escreveu. */
  readonly count: number;
}

/** Locale fixo da ordenação: a mesma ordem em Node e no navegador, seja qual for o idioma da máquina. */
const USER_LOCALE = 'pt-BR';

function compareUsers(a: ThreadUser, b: ThreadUser): number {
  if (a.kind !== b.kind) return a.kind === 'human' ? -1 : 1;
  return (
    a.label.localeCompare(b.label, USER_LOCALE) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

/** Usuários distintos das conversas, com a contagem de conversas de cada um (filtro Usuário). */
export function threadUsers(threads: readonly Thread[]): readonly ThreadUser[] {
  const users = new Map<string, ThreadUser>();
  for (const t of threads) {
    const seen = new Set<string>();
    for (const m of t.messages) {
      const key = userKey(m.author);
      const prev = users.get(key);
      // O rótulo acompanha a última mensagem; a conversa conta uma vez só.
      const counted = seen.has(key) ? 0 : 1;
      seen.add(key);
      users.set(key, {
        key,
        label: userLabel(m.author),
        kind: m.author.kind,
        email: m.author.kind === 'human' ? normalizeEmail(m.author.email) : null,
        count: (prev?.count ?? 0) + counted,
      });
    }
  }
  return [...users.values()].sort(compareUsers);
}
