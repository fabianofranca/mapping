import {
  THREAD_FORMAT,
  THREAD_FORMAT_VERSION,
  compareThreadMessages,
  parseThread,
  sortThreadMessages,
  threadMessageSchema,
  threadResolvedSchema,
  type Thread,
  type ThreadAnchor,
  type ThreadAuthor,
  type ThreadMessage,
  type ThreadResolved,
  type ThreadResolver,
} from './thread';

// Operações puras e imutáveis sobre uma conversa (nunca alteram a entrada). Quem grava
// (a sessão da app e o servidor MCP) relê o arquivo, refaz a operação sobre a versão do disco e
// grava o resultado (decisão 6).
//
// Convenção de `revision`: toda operação que MUDA a conversa devolve `revision + 1`, como o
// `bumpRevision` do projeto; a que não muda (resolver uma resolvida, reabrir uma aberta) devolve
// a mesma conversa, sem tocar na `revision`. A junção das cópias (`mergeThreadCopies`) devolve a
// maior `revision` das duas, sem somar: quem grava o resultado é que soma.

/**
 * Códigos de erro das operações. São próprios do módulo (não de `ModelErrorCode`): a UI e o MCP
 * os traduzem. `thread-resolved` (mensagem do MCP numa conversa resolvida) é regra de quem
 * chama e não é lançado aqui.
 */
export type ThreadErrorCode = 'thread-message-duplicate' | 'invalid-thread';

export class ThreadError extends Error {
  constructor(
    readonly code: ThreadErrorCode,
    message?: string,
  ) {
    super(message ? `${code}: ${message}` : code);
    this.name = 'ThreadError';
  }
}

function failThread(code: ThreadErrorCode, message?: string): never {
  throw new ThreadError(code, message);
}

export interface OpenThreadArgs {
  readonly id: string;
  readonly anchor: ThreadAnchor;
  readonly author: ThreadAuthor;
  readonly text: string;
  readonly at: string;
  /** Id da primeira mensagem. */
  readonly messageId: string;
  readonly proposal?: string | null;
}

/** Valida `data` com o formato e devolve a conversa lida; `invalid-thread` com os erros. */
function validated(data: unknown): Thread {
  const result = parseThread(data);
  if (!result.ok) failThread('invalid-thread', result.errors.join('; '));
  return result.thread;
}

/** Abre a conversa com a primeira mensagem: `revision` 0, não resolvida. */
export function openThread(args: OpenThreadArgs): Thread {
  return validated({
    format: THREAD_FORMAT,
    formatVersion: THREAD_FORMAT_VERSION,
    id: args.id,
    anchor: args.anchor,
    createdAt: args.at,
    revision: 0,
    resolved: null,
    messages: [
      {
        id: args.messageId,
        author: args.author,
        at: args.at,
        text: args.text,
        proposal: args.proposal ?? null,
      },
    ],
  });
}

/**
 * Acrescenta a mensagem (a ordem por `at` e `id` é mantida) e devolve `revision + 1`.
 * `thread-message-duplicate` se o id já existe; `invalid-thread` se a mensagem é inválida. Não
 * olha o estado: numa conversa resolvida a recusa é de quem chama (o MCP).
 */
export function appendMessage(thread: Thread, message: ThreadMessage): Thread {
  const parsed = threadMessageSchema.safeParse(message);
  if (!parsed.success) {
    failThread(
      'invalid-thread',
      parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
  }
  const next = parsed.data as ThreadMessage;
  if (thread.messages.some((m) => m.id === next.id)) {
    failThread('thread-message-duplicate', `id "${next.id}" repetido`);
  }
  return {
    ...thread,
    revision: thread.revision + 1,
    messages: sortThreadMessages([...thread.messages, next]),
  };
}

/**
 * Resolve a conversa (`revision + 1`). Já resolvida: devolve a mesma, intacta (refazer a
 * operação sobre a versão do disco, que outra pessoa já resolveu, não muda nada).
 */
export function resolveThread(thread: Thread, by: ThreadResolver, at: string): Thread {
  if (thread.resolved !== null) return thread;
  const parsed = threadResolvedSchema.safeParse({ by, at });
  if (!parsed.success) {
    failThread(
      'invalid-thread',
      parsed.error.issues
        .map((i) => `resolved.${i.path.join('.')}: ${i.message}`)
        .join('; '),
    );
  }
  return { ...thread, revision: thread.revision + 1, resolved: parsed.data };
}

/** Reabre a conversa (`revision + 1`). Já aberta: devolve a mesma, intacta. */
export function reopenThread(thread: Thread): Thread {
  if (thread.resolved === null) return thread;
  return { ...thread, revision: thread.revision + 1, resolved: null };
}

/** Onde o arquivo da conversa deve ficar: o campo `resolved` é a verdade; a pasta é o índice. */
export type ThreadLocation = 'open' | 'resolved';

export function threadLocation(thread: Thread): ThreadLocation {
  return thread.resolved === null ? 'open' : 'resolved';
}

export interface MergedThread {
  readonly thread: Thread;
  /** `thread.resolved !== null`, para quem só quer o booleano. */
  readonly resolved: boolean;
  /** A pasta onde a próxima gravação deve deixar o arquivo (e de onde apagar a outra cópia). */
  readonly location: ThreadLocation;
}

function mergedMessages(a: Thread, b: Thread): readonly ThreadMessage[] {
  const byId = new Map<string, ThreadMessage>();
  for (const m of [...a.messages, ...b.messages]) {
    if (!byId.has(m.id)) byId.set(m.id, m);
  }
  return [...byId.values()].sort(compareThreadMessages);
}

/** A resolução mais recente entre as duas cópias, ou `null`. */
function latestResolved(a: Thread, b: Thread): ThreadResolved | null {
  const options = [a.resolved, b.resolved].filter((r): r is ThreadResolved => r !== null);
  if (options.length === 0) return null;
  return options.reduce((x, y) => (Date.parse(y.at) > Date.parse(x.at) ? y : x));
}

/**
 * A resolução que vale na junção, ou `null` (aberta). Com as mesmas mensagens nas duas cópias e
 * `revision` diferente, a cópia de maior `revision` (`base`) decide; senão a resolução mais
 * recente vale só se for posterior à última mensagem da união.
 */
function joinedResolution(
  open: Thread,
  resolved: Thread,
  base: Thread,
  messages: readonly ThreadMessage[],
): ThreadResolved | null {
  const sameMessages =
    open.revision !== resolved.revision &&
    open.messages.length === messages.length &&
    resolved.messages.length === messages.length;
  if (sameMessages) return base.resolved;
  const candidate = latestResolved(open, resolved);
  const last = messages[messages.length - 1] as ThreadMessage;
  return candidate !== null && Date.parse(candidate.at) > Date.parse(last.at)
    ? candidate
    : null;
}

/**
 * Junta as duas cópias da mesma conversa (uma em `comments/`, outra em `comments/resolved/`),
 * como fica depois de uma mesclagem do git ou de uma mudança de pasta que parou no meio
 * (decisão 7):
 * - uma cópia só: vale ela, e o campo `resolved` diz o lugar;
 * - duas: as mensagens são a união por `id` (a cópia aberta vence um id repetido, que é a
 *   mesma mensagem) e a `revision` é a maior. Com as mesmas mensagens nas duas e `revision`
 *   diferente, a cópia de maior `revision` decide se está resolvida (a reabertura interrompida
 *   não se perde). Senão a conversa fica resolvida só se o `resolved.at` é posterior à última
 *   mensagem da união; mensagem nova depois da resolução reabre, com `resolved` `null`.
 * A âncora e o `createdAt` vêm da cópia de maior `revision` (a aberta, no empate).
 * `invalid-thread` se não há cópia ou se os ids diferem.
 */
export function mergeThreadCopies(
  open: Thread | null,
  resolved: Thread | null,
): MergedThread {
  if (open === null && resolved === null) failThread('invalid-thread', 'nenhuma cópia');
  if (open === null || resolved === null) {
    const only = (open ?? resolved) as Thread;
    return {
      thread: only,
      resolved: only.resolved !== null,
      location: threadLocation(only),
    };
  }
  if (open.id !== resolved.id) {
    failThread('invalid-thread', `ids diferentes: "${open.id}" e "${resolved.id}"`);
  }
  const base = resolved.revision > open.revision ? resolved : open;
  const messages = mergedMessages(open, resolved);
  const candidate = joinedResolution(open, resolved, base, messages);
  const thread: Thread = {
    ...base,
    revision: Math.max(open.revision, resolved.revision),
    resolved: candidate,
    messages,
  };
  return { thread, resolved: candidate !== null, location: threadLocation(thread) };
}
