import { compareThreadMessages, type Thread } from './thread';
import { initials } from './threadUsers';
import { awaiting, hostKey, hostOf, type ThreadHost } from './threadView';
import type { Project } from './types';

// Pinos do canvas (decisão 24): um pino por item que hospeda a âncora, não por proximidade. O
// modelo só agrupa e decide cor, rótulo e "não lida"; mostrar ou não (botão Conversas, Ver
// limpo, revisão) é estado da interface.

/** Cor do pino, da mais urgente à menos: aguardando humano, aguardando agente, resolvida. */
export type PinColor = 'awaitingHuman' | 'awaitingAgent' | 'resolved';

export interface PinGroup {
  readonly hostKey: string;
  readonly host: ThreadHost;
  /** Ids das conversas do grupo, na ordem da entrada. */
  readonly threadIds: readonly string[];
  readonly count: number;
  readonly color: PinColor;
  /** Iniciais de quem abriu a conversa (só com uma conversa; senão `null`). */
  readonly initials: string | null;
  /** Mensagens da conversa (só com uma conversa; senão `null`). */
  readonly messages: number | null;
  /** `"MA 3"` (iniciais e mensagens) com uma conversa; a contagem (`"3"`) com várias. */
  readonly label: string;
  readonly hasUnread: boolean;
}

export interface PinGroupOptions {
  /** A conversa selecionada: é a única resolvida que tem pino. */
  readonly selectedThreadId: string | null;
  readonly unread: (thread: Thread) => boolean;
}

const URGENCY: Record<PinColor, number> = {
  awaitingHuman: 3,
  awaitingAgent: 2,
  resolved: 1,
};

function colorOf(thread: Thread): PinColor {
  const waiting = awaiting(thread);
  if (waiting === 'human') return 'awaitingHuman';
  return waiting === 'agent' ? 'awaitingAgent' : 'resolved';
}

function opener(thread: Thread) {
  return [...thread.messages].sort(compareThreadMessages)[0];
}

function describeGroup(
  hostKeyValue: string,
  host: ThreadHost,
  members: readonly Thread[],
  unread: (t: Thread) => boolean,
): PinGroup {
  const color = members
    .map(colorOf)
    .reduce((best, c) => (URGENCY[c] > URGENCY[best] ? c : best));
  const only = members.length === 1 ? members[0] : undefined;
  const author = only ? opener(only)?.author : undefined;
  const who = author ? initials(author) : null;
  const messages = only ? only.messages.length : null;
  return {
    hostKey: hostKeyValue,
    host,
    threadIds: members.map((t) => t.id),
    count: members.length,
    color,
    initials: who,
    messages,
    label:
      who !== null && messages !== null ? `${who} ${messages}` : String(members.length),
    hasUnread: members.some(unread),
  };
}

/**
 * Grupos de pinos por item hospedeiro. Entram as conversas abertas e a resolvida selecionada;
 * camada, órfã e anotação sem dona não têm pino. A ordem é a da primeira conversa de cada
 * grupo na entrada.
 */
export function pinGroups(
  project: Project,
  threads: readonly Thread[],
  options: PinGroupOptions,
): readonly PinGroup[] {
  const groups = new Map<string, { host: ThreadHost; members: Thread[] }>();
  for (const t of threads) {
    if (t.resolved !== null && t.id !== options.selectedThreadId) continue;
    const host = hostOf(project, t.anchor);
    if (host === null) continue;
    const key = hostKey(host);
    const group = groups.get(key);
    if (group) group.members.push(t);
    else groups.set(key, { host, members: [t] });
  }
  return [...groups].map(([key, g]) =>
    describeGroup(key, g.host, g.members, options.unread),
  );
}
