import { computed, signal, type ReadonlySignal } from '@preact/signals';
import {
  awaiting,
  filterThreads,
  hostOf,
  isUnread,
  pinGroups,
  resolveAnchor,
  threadUsers,
  type AnchorResolution,
  type PinGroup,
  type Project,
  type Thread,
  type ThreadUser,
} from '../model';
import type { Identity } from './identity';
import { lastReadAt, threadReads } from './threadReads';
import { selectedThreadId } from './threadUi';
import type { EditorUi } from './ui';

// Estado derivado das conversas (etapa Comentários): a janela Comentários, a seção Conversas dos
// Detalhes e a barra de status leem daqui, sem recalcular. Depende só das conversas, do projeto à
// vista, da identidade e dos filtros da janela; pan e zoom não passam por aqui.

/** Uma conversa com o lugar dela no projeto à vista. */
export interface ThreadEntry {
  readonly thread: Thread;
  readonly resolution: AnchorResolution;
}

export interface ThreadSources {
  readonly threads: ReadonlySignal<readonly Thread[]>;
  /** A cópia do projeto (onde o "lida" fica); `null` fora de uma sessão. */
  readonly copyId: string | null;
  readonly identity: ReadonlySignal<Identity | null>;
}

export interface ThreadDerived {
  /** Todas as conversas (abertas e resolvidas), a mais nova primeiro, com a âncora resolvida. */
  readonly entries: ReadonlySignal<readonly ThreadEntry[]>;
  /** Conversas por item que as hospeda (marcação, container ou seta), com as das partes dele. */
  readonly byItem: ReadonlySignal<ReadonlyMap<string, readonly ThreadEntry[]>>;
  readonly openCount: ReadonlySignal<number>;
  readonly awaitingAgentCount: ReadonlySignal<number>;
  readonly awaitingHumanCount: ReadonlySignal<number>;
  readonly resolvedCount: ReadonlySignal<number>;
  /** Ids das conversas com mensagem não lida (decisão 16). */
  readonly unreadIds: ReadonlySignal<ReadonlySet<string>>;
  /**
   * Grupos dos pinos do canvas (decisão 24), um por item que hospeda a âncora: com os pinos
   * ligados, as conversas abertas e a resolvida selecionada; desligados, só a selecionada. Não
   * depende do viewport (pan e zoom não os recalculam).
   */
  readonly pins: ReadonlySignal<readonly PinGroup[]>;
  /** Usuários das conversas (filtro Usuário). */
  readonly users: ReadonlySignal<readonly ThreadUser[]>;
  /** As linhas da janela: as conversas depois dos filtros de status, usuário e busca. */
  readonly rows: ReadonlySignal<readonly ThreadEntry[]>;
}

const NO_SOURCES: ThreadSources = {
  threads: signal<readonly Thread[]>([]),
  copyId: null,
  identity: signal<Identity | null>(null),
};

export const NO_THREAD_SOURCES = NO_SOURCES;

const NO_PINS: readonly PinGroup[] = [];

/** O item (marcação, container ou seta) onde a conversa mora, se houver. */
export function itemHostId(entry: ThreadEntry, project: Project): string | null {
  const host = hostOf(project, entry.thread.anchor);
  return host !== null && host.kind !== 'point' ? host.id : null;
}

export function createThreadDerived(
  project: ReadonlySignal<Project | null>,
  ui: EditorUi,
  sources: ThreadSources = NO_SOURCES,
): ThreadDerived {
  const entries = computed((): readonly ThreadEntry[] => {
    const p = project.value;
    if (!p) return [];
    return sources.threads.value.map((thread) => ({
      thread,
      resolution: resolveAnchor(p, thread.anchor),
    }));
  });

  const byItem = computed(() => {
    const map = new Map<string, ThreadEntry[]>();
    for (const entry of entries.value) {
      const r = entry.resolution;
      if (r.orphan || r.host === null || r.host.kind === 'point') continue;
      const list = map.get(r.host.id);
      if (list) list.push(entry);
      else map.set(r.host.id, [entry]);
    }
    return map as ReadonlyMap<string, readonly ThreadEntry[]>;
  });

  const count = (test: (t: Thread) => boolean) =>
    computed(() => sources.threads.value.filter(test).length);

  const unreadIds = computed((): ReadonlySet<string> => {
    const me = sources.identity.value;
    // Ler o blob aqui faz o "não lida" se atualizar quando `markThreadRead` grava.
    void threadReads.value;
    const copy = sources.copyId;
    const ids = new Set<string>();
    for (const t of sources.threads.value) {
      const read = copy === null ? null : lastReadAt(copy, t.id);
      if (isUnread(t, read, me)) ids.add(t.id);
    }
    return ids;
  });

  const users = computed(() => threadUsers(sources.threads.value));

  const pins = computed((): readonly PinGroup[] => {
    const p = project.value;
    if (!p) return NO_PINS;
    const selected = selectedThreadId(ui);
    const all = sources.threads.value;
    const threads = ui.commentPins.value ? all : all.filter((t) => t.id === selected);
    if (threads.length === 0) return NO_PINS;
    const unread = unreadIds.value;
    return pinGroups(p, threads, {
      selectedThreadId: selected,
      unread: (t) => unread.has(t.id),
    });
  });

  const rows = computed((): readonly ThreadEntry[] => {
    const p = project.value;
    if (!p) return [];
    const user = ui.commentsUser.value;
    const kept = filterThreads(
      entries.value.map((e) => e.thread),
      p,
      {
        status: ui.commentsStatus.value,
        ...(user === '' ? {} : { user }),
        text: ui.commentsText.value,
      },
    );
    const keep = new Set(kept.map((t) => t.id));
    return entries.value.filter((e) => keep.has(e.thread.id));
  });

  return {
    entries,
    byItem,
    openCount: count((t) => t.resolved === null),
    awaitingAgentCount: count((t) => awaiting(t) === 'agent'),
    awaitingHumanCount: count((t) => awaiting(t) === 'human'),
    resolvedCount: count((t) => t.resolved !== null),
    unreadIds,
    pins,
    users,
    rows,
  };
}
