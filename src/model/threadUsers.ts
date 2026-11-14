import type { Thread, ThreadAuthor, ThreadAuthorKind } from './thread';

// Thread users (decision 13): people grouped by email, agents by name.
// Pure: serves the User filter, the pin's initials and the delete dialog.

/** Comparable email: no surrounding spaces and in lowercase. Empty when there is none. */
export function normalizeEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase();
}

/**
 * User key: `human:<normalized email>` or `agent:<name>`. The prefix keeps an
 * agent and a person from being confused.
 */
export function userKey(author: ThreadAuthor): string {
  return author.kind === 'human'
    ? `human:${normalizeEmail(author.email)}`
    : `agent:${author.name.trim()}`;
}

/** Name to display (without extra spaces). */
export function userLabel(author: ThreadAuthor): string {
  return author.name.trim();
}

/** Initials: the first letter of the first and of the last word of the name; the agent is always `AG`. */
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
  /** Name from the user's last message, in input order. */
  readonly label: string;
  readonly kind: ThreadAuthorKind;
  /** The person's normalized email (the filter shows people by it); `null` for the agent. */
  readonly email: string | null;
  /** Threads in which the user wrote. */
  readonly count: number;
}

/** Fixed locale for sorting: the same order in Node and in the browser, whatever the machine's language. */
const USER_LOCALE = 'pt-BR';

function compareUsers(a: ThreadUser, b: ThreadUser): number {
  if (a.kind !== b.kind) return a.kind === 'human' ? -1 : 1;
  return (
    a.label.localeCompare(b.label, USER_LOCALE) ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  );
}

/** Distinct users of the threads, with the count of threads of each one (User filter). */
export function threadUsers(threads: readonly Thread[]): readonly ThreadUser[] {
  const users = new Map<string, ThreadUser>();
  for (const t of threads) {
    const seen = new Set<string>();
    for (const m of t.messages) {
      const key = userKey(m.author);
      const prev = users.get(key);
      // The label follows the last message; the thread counts only once.
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
