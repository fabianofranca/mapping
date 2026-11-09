import { z } from 'zod';
import { normalizeIsoDate } from './schema';
import { PROPOSAL_ID_RE } from './proposal';
import { formatSpecPath, type SpecIssue } from './spec';

// Formato da conversa ancorada (etapa Comentários): um arquivo por conversa, aberta em
// `comments/<id>.json` ou resolvida em `comments/resolved/<id>.json`. O zod daqui é a fonte da
// verdade; a leitura devolve os erros com o caminho exato (`messages[2].author.email: …`).
// Puro: sem DOM nem Node. Quem grava (a sessão da app, o servidor MCP) fica fora do modelo.

export const THREAD_FORMAT = 'mapping-thread';
export const THREAD_FORMAT_VERSION = 1;
/** Pasta das conversas abertas, relativa à raiz do projeto. */
export const COMMENTS_DIR = 'comments';
/** Pasta das conversas resolvidas. */
export const RESOLVED_DIR = 'comments/resolved';
/** Tamanho máximo do texto de uma mensagem (unidades de `String.length`). */
export const THREAD_MESSAGE_MAX = 10000;

/** Id da conversa: vira nome de arquivo, então a mesma regra do id de proposta. */
export const THREAD_ID_RE = PROPOSAL_ID_RE;

export type ThreadAuthorKind = 'human' | 'agent';

/** `email` é obrigatório na pessoa e `null` no agente. */
export interface ThreadAuthor {
  readonly kind: ThreadAuthorKind;
  readonly name: string;
  readonly email: string | null;
}

export interface ThreadMessage {
  readonly id: string;
  readonly author: ThreadAuthor;
  /** ISO 8601 em UTC. */
  readonly at: string;
  /** Markdown, não vazio, até `THREAD_MESSAGE_MAX`. */
  readonly text: string;
  /** Id da proposta ligada à mensagem (só o servidor MCP preenche) ou `null`. */
  readonly proposal: string | null;
}

/** Quem resolveu e quando. */
export interface ThreadResolver {
  readonly name: string;
  readonly email: string;
}

export interface ThreadResolved {
  readonly by: ThreadResolver;
  readonly at: string;
}

/** Âncora por id: acompanha o item que se move ou troca de pai (decisão 4). */
export type ThreadAnchor =
  | {
      readonly kind: 'marking' | 'container' | 'annotation' | 'arrow' | 'layer';
      readonly id: string;
    }
  | { readonly kind: 'field'; readonly annotationId: string; readonly key: string }
  | { readonly kind: 'entry'; readonly annotationId: string; readonly entryId: string }
  | {
      readonly kind: 'row';
      readonly annotationId: string;
      readonly key: string;
      readonly rowId: string;
    }
  | {
      readonly kind: 'point';
      /** `null`: o ponto está nas unidades do canvas. */
      readonly containerId: string | null;
      readonly x: number;
      readonly y: number;
    };

export type ThreadAnchorKind = ThreadAnchor['kind'];

export const THREAD_ANCHOR_KINDS: readonly ThreadAnchorKind[] = [
  'marking',
  'container',
  'annotation',
  'arrow',
  'layer',
  'field',
  'entry',
  'row',
  'point',
];

export interface Thread {
  readonly format: typeof THREAD_FORMAT;
  readonly formatVersion: typeof THREAD_FORMAT_VERSION;
  readonly id: string;
  readonly anchor: ThreadAnchor;
  readonly createdAt: string;
  /** Contador de gravações do arquivo (mesma conferência do `mapping.json`). */
  readonly revision: number;
  readonly resolved: ThreadResolved | null;
  /** Ordenadas por `at` e, no empate, por `id`. */
  readonly messages: readonly ThreadMessage[];
}

/** `comments/<id>.json` ou, resolvida, `comments/resolved/<id>.json`. */
export function threadFilePath(threadId: string, resolved: boolean): string {
  return `${resolved ? RESOLVED_DIR : COMMENTS_DIR}/${threadId}.json`;
}

/** Ordem canônica das mensagens: pelo instante (`at`) e, no empate, pelo `id`. */
export function compareThreadMessages(a: ThreadMessage, b: ThreadMessage): number {
  const byTime = Date.parse(a.at) - Date.parse(b.at);
  if (byTime !== 0) return byTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/** A primeira mensagem na ordem canônica, sem ordenar todas (`undefined` numa conversa vazia). */
export function firstThreadMessage(thread: Thread): ThreadMessage | undefined {
  let first: ThreadMessage | undefined;
  for (const m of thread.messages) {
    if (first === undefined || compareThreadMessages(m, first) < 0) first = m;
  }
  return first;
}

/** Cópia ordenada (a entrada não muda). */
export function sortThreadMessages(
  messages: readonly ThreadMessage[],
): readonly ThreadMessage[] {
  return [...messages].sort(compareThreadMessages);
}

// ---------------------------------------------------------------------------
// Validação (zod)

const id = z.string().min(1, 'não pode ser vazio');
const isoDate = z.iso
  .datetime({ offset: true, error: 'data inválida; use ISO 8601 (UTC)' })
  .transform(normalizeIsoDate);
const nonEmptyName = z.string().trim().min(1, 'não pode ser vazio');

const threadId = z
  .string()
  .regex(THREAD_ID_RE, 'id inválido; use [A-Za-z0-9._-], sem começar com ponto');

export const threadAuthorSchema = z
  .object({
    kind: z.enum(['human', 'agent'], { error: 'deve ser "human" ou "agent"' }),
    name: nonEmptyName,
    email: z.string().nullable(),
  })
  .superRefine((a, ctx) => {
    if (a.kind === 'human' && (a.email === null || a.email.trim() === '')) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'obrigatório na pessoa',
      });
    }
    if (a.kind === 'agent' && a.email !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['email'],
        message: 'deve ser null no agente',
      });
    }
  });

const messageText = z.string().superRefine((text, ctx) => {
  if (text.trim() === '') {
    ctx.addIssue({ code: 'custom', message: 'não pode ser vazio' });
  } else if (text.length > THREAD_MESSAGE_MAX) {
    ctx.addIssue({
      code: 'custom',
      message: `no máximo ${THREAD_MESSAGE_MAX} caracteres`,
    });
  }
});

export const threadMessageSchema = z.object({
  id,
  author: threadAuthorSchema,
  at: isoDate,
  text: messageText,
  proposal: id.nullable(),
});

const kindError = `deve ser ${THREAD_ANCHOR_KINDS.map((k) => `"${k}"`).join(', ')}`;

export const threadAnchorSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('marking'), id }),
    z.object({ kind: z.literal('container'), id }),
    z.object({ kind: z.literal('annotation'), id }),
    z.object({ kind: z.literal('arrow'), id }),
    z.object({ kind: z.literal('layer'), id }),
    z.object({ kind: z.literal('field'), annotationId: id, key: id }),
    z.object({ kind: z.literal('entry'), annotationId: id, entryId: id }),
    z.object({ kind: z.literal('row'), annotationId: id, key: id, rowId: id }),
    z.object({
      kind: z.literal('point'),
      containerId: id.nullable(),
      x: z.number(),
      y: z.number(),
    }),
  ],
  { error: kindError },
);

export const threadResolverSchema = z.object({
  name: nonEmptyName,
  email: z.string().trim().min(1, 'não pode ser vazio'),
});

export const threadResolvedSchema = z.object({ by: threadResolverSchema, at: isoDate });

export const threadSchema = z
  .object({
    format: z.literal(THREAD_FORMAT, { error: `deve ser "${THREAD_FORMAT}"` }),
    formatVersion: z.literal(THREAD_FORMAT_VERSION, {
      error: `deve ser ${THREAD_FORMAT_VERSION}`,
    }),
    id: threadId,
    anchor: threadAnchorSchema,
    createdAt: isoDate,
    revision: z.number().int().min(0),
    resolved: threadResolvedSchema.nullable(),
    messages: z.array(threadMessageSchema).min(1, 'deve ter ao menos uma mensagem'),
  })
  .superRefine((t, ctx) => {
    const seen = new Set<string>();
    t.messages.forEach((m, i) => {
      if (seen.has(m.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['messages', i, 'id'],
          message: `id "${m.id}" repetido`,
        });
      }
      seen.add(m.id);
    });
  })
  .transform((t) => ({ ...t, messages: sortThreadMessages(t.messages) }));

export type ThreadParseResult =
  | {
      readonly ok: true;
      readonly thread: Thread;
      /** Avisos da leitura (nenhum na formatVersion 1; o campo existe para as próximas). */
      readonly warnings: readonly string[];
    }
  | { readonly ok: false; readonly issues: SpecIssue[]; readonly errors: string[] };

/** Valida um JSON já lido; erros no formato `caminho: mensagem`. */
export function parseThread(data: unknown): ThreadParseResult {
  const result = threadSchema.safeParse(data);
  if (result.success) {
    return { ok: true, thread: result.data as Thread, warnings: [] };
  }
  const issues = result.error.issues.map((i) => ({
    path: formatSpecPath(i.path),
    message: i.message,
  }));
  return {
    ok: false,
    issues,
    errors: issues.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message)),
  };
}

/** Lê o texto de um arquivo de conversa. */
export function parseThreadText(text: string): ThreadParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    const message = `JSON inválido: ${e instanceof Error ? e.message : String(e)}`;
    return { ok: false, issues: [{ path: '', message }], errors: [message] };
  }
  return parseThread(data);
}

function serializeAnchor(a: ThreadAnchor) {
  switch (a.kind) {
    case 'field':
      return { kind: a.kind, annotationId: a.annotationId, key: a.key };
    case 'entry':
      return { kind: a.kind, annotationId: a.annotationId, entryId: a.entryId };
    case 'row':
      return { kind: a.kind, annotationId: a.annotationId, key: a.key, rowId: a.rowId };
    case 'point':
      return { kind: a.kind, containerId: a.containerId, x: a.x, y: a.y };
    default:
      return { kind: a.kind, id: a.id };
  }
}

function serializeMessage(m: ThreadMessage) {
  return {
    id: m.id,
    author: { kind: m.author.kind, name: m.author.name, email: m.author.email },
    at: m.at,
    text: m.text,
    proposal: m.proposal,
  };
}

/**
 * Texto do arquivo da conversa: chaves sempre na mesma ordem, mensagens na ordem canônica
 * (`at`, `id`), indentação de 2 espaços e quebra de linha no final.
 */
export function serializeThread(t: Thread): string {
  const canonical = {
    format: t.format,
    formatVersion: t.formatVersion,
    id: t.id,
    anchor: serializeAnchor(t.anchor),
    createdAt: t.createdAt,
    revision: t.revision,
    resolved: t.resolved
      ? {
          by: { name: t.resolved.by.name, email: t.resolved.by.email },
          at: t.resolved.at,
        }
      : null,
    messages: sortThreadMessages(t.messages).map(serializeMessage),
  };
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
