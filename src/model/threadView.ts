import { projectIndex, type ProjectIndex } from './projectIndex';
import {
  compareThreadMessages,
  firstThreadMessage,
  type Thread,
  type ThreadAnchor,
  type ThreadMessage,
} from './thread';
import { normalizeEmail } from './threadUsers';
import type { Annotation, Project } from './types';

// Vista das conversas (etapa Comentários): onde a âncora mora, de quem é a vez, assunto e "não
// lida". Funções puras sobre `Thread` e `Project`; a resolução por id usa o `projectIndex`.
// Texto de interface (i18n) fica fora: aqui só saem dados (o tipo do alvo apagado, por exemplo).

// ---------------------------------------------------------------------------
// Âncora: hospedeiro e órfã

/**
 * O item que hospeda o pino de uma conversa (decisão 24): a marcação, o container, a seta ou o
 * próprio ponto solto. A conversa de campo, par, linha e anotação mora no pino da dona.
 */
export type ThreadHost =
  | { readonly kind: 'marking' | 'container' | 'arrow'; readonly id: string }
  | {
      readonly kind: 'point';
      readonly containerId: string | null;
      readonly x: number;
      readonly y: number;
    };

/** O que a âncora órfã procurava e não existe mais (a interface monta o texto). */
export type ThreadMissingKind =
  'marking' | 'container' | 'arrow' | 'layer' | 'annotation' | 'entry' | 'row';

export type AnchorResolution =
  | {
      readonly orphan: false;
      readonly anchor: ThreadAnchor;
      /** `null`: a camada (e a anotação sem dona) não tem pino. */
      readonly host: ThreadHost | null;
    }
  | {
      readonly orphan: true;
      readonly anchor: ThreadAnchor;
      readonly missing: ThreadMissingKind;
    };

type ItemAnchor = Extract<
  ThreadAnchor,
  { kind: 'marking' | 'container' | 'arrow' | 'layer' | 'annotation' }
>;
type PartAnchor = Exclude<ThreadAnchor, ItemAnchor>;

const found = (anchor: ThreadAnchor, host: ThreadHost | null): AnchorResolution => ({
  orphan: false,
  anchor,
  host,
});
const orphan = (anchor: ThreadAnchor, missing: ThreadMissingKind): AnchorResolution => ({
  orphan: true,
  anchor,
  missing,
});

/** A marcação ou a seta dona de uma anotação (os dois dividem o espaço de ids). */
function ownerHost(idx: ProjectIndex, ownerId: string): ThreadHost | null {
  if (idx.markings.has(ownerId)) return { kind: 'marking', id: ownerId };
  if (idx.arrows.has(ownerId)) return { kind: 'arrow', id: ownerId };
  return null;
}

function resolveItem(idx: ProjectIndex, a: ItemAnchor): AnchorResolution {
  const maps: Record<ItemAnchor['kind'], ReadonlyMap<string, unknown>> = {
    marking: idx.markings,
    container: idx.containers,
    arrow: idx.arrows,
    layer: idx.layers,
    annotation: idx.annotations,
  };
  if (!maps[a.kind].has(a.id)) return orphan(a, a.kind);
  if (a.kind === 'layer') return found(a, null);
  if (a.kind === 'annotation') {
    const annotation = idx.annotations.get(a.id);
    return found(a, annotation ? ownerHost(idx, annotation.markingId) : null);
  }
  return found(a, { kind: a.kind, id: a.id });
}

function hasRow(annotation: Annotation, key: string, rowId: string): boolean {
  const rows = annotation.values?.[key];
  if (!Array.isArray(rows)) return false;
  return rows.some(
    (r) => typeof r === 'object' && r !== null && !Array.isArray(r) && r._id === rowId,
  );
}

function resolvePart(idx: ProjectIndex, a: PartAnchor): AnchorResolution {
  if (a.kind === 'point') {
    const lost = a.containerId !== null && !idx.containers.has(a.containerId);
    if (lost) return orphan(a, 'container');
    return found(a, { kind: 'point', containerId: a.containerId, x: a.x, y: a.y });
  }
  const annotation = idx.annotations.get(a.annotationId);
  if (!annotation) return orphan(a, 'annotation');
  if (a.kind === 'entry' && !idx.entries.get(annotation.id)?.has(a.entryId)) {
    return orphan(a, 'entry');
  }
  if (a.kind === 'row' && !hasRow(annotation, a.key, a.rowId)) return orphan(a, 'row');
  return found(a, ownerHost(idx, annotation.markingId));
}

/**
 * Onde a âncora está no projeto: o hospedeiro do pino (`host`) ou a órfã, com o tipo do que
 * sumiu. Campo: basta a anotação existir; par e linha também precisam existir (órfã se não).
 */
export function resolveAnchor(project: Project, anchor: ThreadAnchor): AnchorResolution {
  const idx = projectIndex(project);
  switch (anchor.kind) {
    case 'marking':
    case 'container':
    case 'arrow':
    case 'layer':
    case 'annotation':
      return resolveItem(idx, anchor);
    default:
      return resolvePart(idx, anchor);
  }
}

/** A âncora não existe mais no projeto (item apagado, ou container do ponto apagado). */
export function isOrphan(project: Project, anchor: ThreadAnchor): boolean {
  return resolveAnchor(project, anchor).orphan;
}

/** O hospedeiro do pino; `null` para a camada, a órfã e a anotação sem dona. */
export function hostOf(project: Project, anchor: ThreadAnchor): ThreadHost | null {
  const r = resolveAnchor(project, anchor);
  return r.orphan ? null : r.host;
}

/** Chave estável do hospedeiro (agrupa os pinos): `marking:<id>`, `point:<container>:<x>:<y>`… */
export function hostKey(host: ThreadHost): string {
  return host.kind === 'point'
    ? `point:${host.containerId ?? ''}:${host.x}:${host.y}`
    : `${host.kind}:${host.id}`;
}

// ---------------------------------------------------------------------------
// Estado: de quem é a vez

/** A última mensagem na ordem canônica (`at`, `id`); `null` numa conversa sem mensagens. */
export function lastMessage(thread: Thread): ThreadMessage | null {
  let last: ThreadMessage | null = null;
  for (const m of thread.messages) {
    if (last === null || compareThreadMessages(m, last) > 0) last = m;
  }
  return last;
}

/** Quem a conversa aguarda: `agent` ou `human`; `null` na resolvida (decisão 14). */
export type ThreadAwaiting = 'agent' | 'human';

export function awaiting(thread: Thread): ThreadAwaiting | null {
  if (thread.resolved !== null) return null;
  const last = lastMessage(thread);
  if (last === null) return null;
  return last.author.kind === 'human' ? 'agent' : 'human';
}

// ---------------------------------------------------------------------------
// Assunto (decisão 17)

/** Tamanho máximo do assunto, reticências incluídas. */
export const SUBJECT_MAX = 80;

/** Troca o rótulo de um link markdown (o chip vivo é da fase das citações). */
export type SubjectLabelResolver = (label: string, url: string) => string;

const LINK_RE = /(!?)\[((?:\\.|[^\]\\])*)\]\(([^)\s]*)\)/g;
const UNESCAPE_RE = /\\([\\`*_{}[\]()#+\-.!>~|])/g;
const LINE_PREFIX_RE = /^(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)+/;
const STRONG_RE = /(\*\*|~~)(?=\S)(.+?)(?<=\S)\1/g;
const EM_STAR_RE = /\*(?=\S)(.+?)(?<=\S)\*/g;
const EM_UNDERSCORE_RE = /(^|[^\p{L}\p{N}_])(__?)(?=\S)(.+?)(?<=\S)\2(?![\p{L}\p{N}_])/gu;
const CODE_RE = /(`+)([^`]+)\1/g;
const FENCE_RE = /^\s*(?:`{3,}|~{3,})/;

/** Marcadores (área de uso privado) que seguram o rótulo vivo de um link até o fim da limpeza. */
const LIVE_OPEN = '\uE000';
const LIVE_CLOSE = '\uE001';
const LIVE_RE = /\uE000(\d+)\uE001/g;

/**
 * Link → rótulo. O rótulo vivo (de `resolveLabel`) já é texto final: entra como marcador e só
 * volta no fim, para a ênfase e os escapes não o lerem de novo (`__init__` continua `__init__`).
 */
function stripLinks(
  line: string,
  resolveLabel: SubjectLabelResolver | undefined,
  live: string[],
): string {
  return line.replace(LINK_RE, (_all, bang: string, label: string, url: string) => {
    if (bang !== '' || !resolveLabel) return label;
    live.push(resolveLabel(label.replace(UNESCAPE_RE, '$1'), url));
    return `${LIVE_OPEN}${live.length - 1}${LIVE_CLOSE}`;
  });
}

function stripEmphasis(line: string): string {
  return line
    .replace(CODE_RE, '$2')
    .replace(STRONG_RE, '$2')
    .replace(EM_STAR_RE, '$1')
    .replace(EM_UNDERSCORE_RE, '$1$3');
}

function plainLine(line: string, resolveLabel?: SubjectLabelResolver): string {
  if (FENCE_RE.test(line)) return '';
  const body = line.trim().replace(LINE_PREFIX_RE, '');
  const live: string[] = [];
  const plain = stripEmphasis(stripLinks(body, resolveLabel, live)).replace(
    UNESCAPE_RE,
    '$1',
  );
  return plain
    .replace(LIVE_RE, (_all, index: string) => live[Number(index)] ?? '')
    .trim();
}

/**
 * O assunto da conversa: a primeira linha com texto da primeira mensagem, sem a marcação do
 * markdown (título, lista, citação, ênfase, código, link → rótulo), com até `SUBJECT_MAX`
 * caracteres (a reticência `…` conta no total). `resolveLabel` troca o rótulo dos links.
 */
export function threadSubject(
  thread: Thread,
  resolveLabel?: SubjectLabelResolver,
): string {
  const first = firstThreadMessage(thread);
  if (!first) return '';
  for (const line of first.text.split(/\r?\n/)) {
    const plain = plainLine(line, resolveLabel);
    if (plain !== '') return clip(plain);
  }
  return '';
}

function clip(text: string, max: number = SUBJECT_MAX): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 1)
    .join('')
    .trimEnd()}…`;
}

/** Tamanho máximo do texto simples da coluna "Última mensagem". */
export const MESSAGE_PLAIN_MAX = 200;

/**
 * O texto da mensagem numa linha, sem a marcação do markdown (como o assunto, decisão 17):
 * as linhas com texto são juntas por espaço, e o link vira o rótulo.
 */
export function messagePlainText(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => plainLine(line))
    .filter((line) => line !== '');
  return clip(lines.join(' '), MESSAGE_PLAIN_MAX);
}

// ---------------------------------------------------------------------------
// Não lida (decisão 16)

/** A pessoa deste dispositivo (a identidade das Configurações). */
export interface ThreadViewer {
  readonly email: string;
}

function isOwn(message: ThreadMessage, myEmail: string): boolean {
  return (
    message.author.kind === 'human' &&
    myEmail !== '' &&
    normalizeEmail(message.author.email) === myEmail
  );
}

/**
 * A conversa tem mensagem de outra pessoa (outro e-mail) ou de agente depois do `lastReadAt`
 * (estritamente depois; `null` = tudo é posterior). A própria mensagem nunca conta.
 */
export function isUnread(
  thread: Thread,
  lastReadAt: string | null,
  me: ThreadViewer | null,
): boolean {
  const parsed = lastReadAt === null ? Number.NaN : Date.parse(lastReadAt);
  const since = Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
  const myEmail = normalizeEmail(me?.email);
  return thread.messages.some((m) => Date.parse(m.at) > since && !isOwn(m, myEmail));
}
