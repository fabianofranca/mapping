import {
  liveLabel,
  type CitationContext,
  type CitationTarget,
  type CitationTargetKind,
} from './citations';
import { refImageLabel, shortCodes, shortCodesFor } from './itemRef';
import {
  formatAnyRef,
  layerShortCodes,
  parseAnyRef,
  threadShortCodes,
  type AnyRef,
  type AnyRefKind,
  type SubRef,
} from './refGrammar';
import { projectIndex } from './projectIndex';
import { tableRows } from './refs';
import type { Thread, ThreadAnchor } from './thread';
import { typeOfAnnotation } from './specLookup';
import { annotationTitle } from './typedDisplay';
import type { Annotation, Project } from './types';

// Alvos de citação para a interface (etapa Comentários, decisões 30 e 31): a URL de um alvo, o
// rótulo que o chip grava e a busca do `@` no compositor. Puro: tudo chega por argumento.

// ------------------------------------------------------------------ URL

/** Código das propostas na URL: o id inteiro (a gramática aceita letras, dígitos, `.`, `_`, `-`). */
const PROPOSAL_CODE = /^[0-9a-zA-Z._-]+$/;

const threadCodeCache = new WeakMap<readonly Thread[], ReadonlyMap<string, string>>();

/** Código curto de cada conversa, único entre TODAS (abertas e resolvidas); memoizado por lista. */
function threadCodes(threads: readonly Thread[]): ReadonlyMap<string, string> {
  const cached = threadCodeCache.get(threads);
  if (cached) return cached;
  const codes = threadShortCodes(threads.map((t) => t.id));
  threadCodeCache.set(threads, codes);
  return codes;
}

type IdKind = Exclude<CitationTargetKind, 'field' | 'entry' | 'row'>;

interface IdRef {
  readonly letter: AnyRefKind;
  readonly code: (
    p: Project,
    threads: readonly Thread[],
    id: string,
  ) => string | undefined;
}

const ID_REFS: Readonly<Record<IdKind, IdRef>> = {
  marking: { letter: 'm', code: (p, _t, id) => shortCodes(p, 'm').get(id) },
  arrow: { letter: 'm', code: (p, _t, id) => shortCodes(p, 'm').get(id) },
  container: { letter: 'i', code: (p, _t, id) => shortCodes(p, 'i').get(id) },
  annotation: { letter: 'a', code: (p, _t, id) => shortCodes(p, 'a').get(id) },
  layer: { letter: 'l', code: (p, _t, id) => layerShortCodes(p).get(id) },
  thread: { letter: 'c', code: (_p, threads, id) => threadCodes(threads).get(id) },
  proposal: {
    letter: 'p',
    code: (_p, _t, id) => (PROPOSAL_CODE.test(id) ? id : undefined),
  },
};

type PartTarget = Extract<CitationTarget, { kind: 'field' | 'entry' | 'row' }>;

/** Código do par ou da linha entre os irmãos da anotação. */
function siblingCode(ids: readonly string[], id: string): string | undefined {
  return shortCodesFor(ids).get(id);
}

function subRefOf(p: Project, target: PartTarget): SubRef | null {
  const annotation = projectIndex(p).annotations.get(target.annotationId);
  const code = shortCodes(p, 'a').get(target.annotationId);
  if (!annotation || code === undefined) return null;
  if (target.kind === 'field')
    return { type: 'field', annotation: code, key: target.key };
  if (target.kind === 'entry') {
    const entry = siblingCode(
      annotation.entries.map((e) => e.id),
      target.entryId,
    );
    return entry === undefined ? null : { type: 'entry', annotation: code, entry };
  }
  const rowIds = tableRows(annotation.values?.[target.key]).map((r) => r._id);
  const row = siblingCode(rowIds, target.rowId);
  return row === undefined
    ? null
    : { type: 'row', annotation: code, key: target.key, row };
}

function refOfTarget(
  p: Project,
  threads: readonly Thread[],
  target: CitationTarget,
): AnyRef | null {
  if (target.kind === 'field' || target.kind === 'entry' || target.kind === 'row') {
    return subRefOf(p, target);
  }
  const spec = ID_REFS[target.kind];
  const code = spec.code(p, threads, target.id);
  return code === undefined ? null : { type: 'item', kind: spec.letter, code };
}

/**
 * `mapping://<projeto>/…` do alvo, com o código curto de cada parte (marcação, container,
 * anotação, seta, camada e conversa pelos códigos únicos entre todos do tipo; proposta pelo id;
 * campo `…/a/<cód>/f/<key>`; par `…/e/<cód>` e linha `…/r/<cód>` entre os irmãos). `null` se
 * o alvo não existe no projeto (ou o código não cabe na gramática). A resolução da URL devolve
 * o mesmo alvo.
 */
export function citationUrl(
  projectName: string,
  project: Project,
  threads: readonly Thread[],
  target: CitationTarget,
): string | null {
  const ref = refOfTarget(project, threads, target);
  if (!ref) return null;
  const url = formatAnyRef(projectName, ref);
  return parseAnyRef(url) ? url : null;
}

// ------------------------------------------------------------------ rótulo

/**
 * O rótulo que o chip grava: o nome de agora do alvo; sem nome (ou alvo que não existe), o
 * texto neutro `unnamed`, que a interface traduz.
 */
export function citationLabel(
  ctx: CitationContext,
  target: CitationTarget,
  unnamed: string,
): string {
  const { label } = liveLabel(ctx, { found: true, target }, unnamed);
  return label === null || label === '' ? unnamed : label;
}

// ------------------------------------------------------------------ busca do @

export type CiteGroup =
  'here' | 'marking' | 'container' | 'arrow' | 'annotation' | 'layer' | 'thread';

export interface CiteCandidate {
  readonly target: CitationTarget;
  /** O que o chip grava (`citationLabel`). */
  readonly label: string;
  readonly group: CiteGroup;
  /** O caminho curto, ex.: "Button · Comprar › variante". */
  readonly detail: string;
}

export interface CiteOptions {
  /** Texto neutro para o que não tem nome (traduzido pela interface). */
  readonly unnamed: string;
  /** Máximo de candidatas (padrão 30). */
  readonly limit?: number;
  /** Separador do caminho (padrão " › "). */
  readonly separator?: string;
  /** A própria conversa não se oferece para citar. */
  readonly excludeThreadId?: string;
}

const DEFAULT_LIMIT = 30;
const DEFAULT_SEPARATOR = ' › ';

interface Env {
  readonly ctx: CitationContext;
  readonly unnamed: string;
  readonly separator: string;
  readonly excludeThreadId: string | undefined;
}

/** Minúsculas e sem acentos (o mesmo critério de `src/utils/search.ts`, que o modelo não importa). */
function fold(text: string): string {
  return text.normalize('NFD').replaceAll(/[̀-ͯ]/g, '').toLowerCase();
}

function join(env: Env, parts: readonly string[]): string {
  return parts.filter((part) => part !== '').join(env.separator);
}

function labelOf(env: Env, target: CitationTarget): string {
  return citationLabel(env.ctx, target, env.unnamed);
}

function namedOrEmpty(name: string | null | undefined): string {
  return name ?? '';
}

/** Container (se tiver nome ou arquivo), marcações pais com nome e, por fim, a própria. */
function markingPath(env: Env, id: string): string {
  const idx = projectIndex(env.ctx.project);
  const own = idx.markings.get(id);
  if (!own) return '';
  const names: string[] = [labelOf(env, { kind: 'marking', id })];
  let parent = own.parentId === null ? undefined : idx.markings.get(own.parentId);
  for (let guard = idx.markings.size; parent && guard > 0; guard--) {
    names.unshift(namedOrEmpty(parent.name));
    parent = parent.parentId === null ? undefined : idx.markings.get(parent.parentId);
  }
  const container =
    own.containerId === null ? undefined : idx.containers.get(own.containerId);
  if (container) names.unshift(namedOrEmpty(refImageLabel(container)));
  return join(env, names);
}

function markingName(env: Env, id: string): string {
  const idx = projectIndex(env.ctx.project);
  const item = idx.markings.get(id) ?? idx.arrows.get(id);
  return item?.name ? item.name : env.unnamed;
}

function annotationText(env: Env, a: Annotation): string {
  return annotationTitle(env.ctx.project, a) ?? env.unnamed;
}

function annotationPath(env: Env, a: Annotation): string {
  const idx = projectIndex(env.ctx.project);
  const host = idx.markings.get(a.markingId) ?? idx.arrows.get(a.markingId);
  return join(env, [
    namedOrEmpty(host?.name),
    labelOf(env, { kind: 'annotation', id: a.id }),
  ]);
}

function partPath(env: Env, target: PartTarget): string {
  const a = projectIndex(env.ctx.project).annotations.get(target.annotationId);
  if (!a) return '';
  const parts = [annotationText(env, a)];
  if (target.kind === 'row') {
    parts.push(labelOf(env, { kind: 'field', annotationId: a.id, key: target.key }));
  }
  return join(env, [...parts, labelOf(env, target)]);
}

function arrowEnds(env: Env, id: string): string {
  const arrow = projectIndex(env.ctx.project).arrows.get(id);
  return arrow
    ? join(env, [markingName(env, arrow.from), markingName(env, arrow.to)])
    : '';
}

/** O caminho curto do alvo (onde ele mora); vazio quando o nome basta. */
function detailOf(env: Env, target: CitationTarget): string {
  switch (target.kind) {
    case 'marking':
      return markingPath(env, target.id);
    case 'arrow':
      return arrowEnds(env, target.id);
    case 'annotation': {
      const a = projectIndex(env.ctx.project).annotations.get(target.id);
      return a ? annotationPath(env, a) : '';
    }
    case 'field':
    case 'entry':
    case 'row':
      return partPath(env, target);
    default:
      return '';
  }
}

function candidate(env: Env, target: CitationTarget, group: CiteGroup): CiteCandidate {
  return { target, label: labelOf(env, target), group, detail: detailOf(env, target) };
}

// ---- grupo "aqui": campos, pares e linhas das anotações do item da conversa

function hostAnnotations(env: Env, here: ThreadAnchor | null): readonly Annotation[] {
  if (here === null) return [];
  const idx = projectIndex(env.ctx.project);
  switch (here.kind) {
    case 'marking':
    case 'arrow':
      return idx.annotationsByMarking.get(here.id) ?? [];
    case 'annotation':
    case 'field':
    case 'entry':
    case 'row': {
      const a = idx.annotations.get('id' in here ? here.id : here.annotationId);
      return a ? [a] : [];
    }
    default:
      return [];
  }
}

function fieldKeys(env: Env, a: Annotation): readonly string[] {
  const type = typeOfAnnotation(env.ctx.project, a)?.type;
  if (type) return type.fields.map((f) => f.key);
  return a.values === null ? [] : Object.keys(a.values);
}

function typedParts(env: Env, a: Annotation): CiteCandidate[] {
  const out: CiteCandidate[] = [];
  for (const key of fieldKeys(env, a)) {
    out.push(candidate(env, { kind: 'field', annotationId: a.id, key }, 'here'));
    for (const row of tableRows(a.values?.[key])) {
      const target: CitationTarget = {
        kind: 'row',
        annotationId: a.id,
        key,
        rowId: row._id,
      };
      out.push(candidate(env, target, 'here'));
    }
  }
  return out;
}

function annotationParts(env: Env, a: Annotation): CiteCandidate[] {
  if (a.type === null) {
    return a.entries.map((e) =>
      candidate(env, { kind: 'entry', annotationId: a.id, entryId: e.id }, 'here'),
    );
  }
  return typedParts(env, a);
}

function hereCandidates(env: Env, here: ThreadAnchor | null): CiteCandidate[] {
  return hostAnnotations(env, here).flatMap((a) => annotationParts(env, a));
}

// ---- demais grupos

function threadCandidates(env: Env): CiteCandidate[] {
  return env.ctx.threads
    .filter((t) => t.resolved === null && t.id !== env.excludeThreadId)
    .map((t) => {
      const target: CitationTarget = { kind: 'thread', id: t.id };
      const anchor = t.anchor.kind === 'point' ? null : t.anchor;
      return {
        target,
        label: labelOf(env, target),
        group: 'thread' as const,
        detail: anchor ? detailOf(env, anchor) : '',
      };
    });
}

function simpleGroup(
  env: Env,
  group: CiteGroup,
  kind: 'marking' | 'container' | 'arrow' | 'annotation' | 'layer',
  ids: readonly { readonly id: string }[],
): CiteCandidate[] {
  return ids.map((item) => candidate(env, { kind, id: item.id }, group));
}

type GroupBuilder = (env: Env, here: ThreadAnchor | null) => CiteCandidate[];

/** Na ordem do `@`: o do item da conversa, marcações, containers, setas, anotações, camadas, conversas. */
const GROUPS: readonly GroupBuilder[] = [
  hereCandidates,
  (env) => simpleGroup(env, 'marking', 'marking', env.ctx.project.markings),
  (env) => simpleGroup(env, 'container', 'container', env.ctx.project.containers),
  (env) => simpleGroup(env, 'arrow', 'arrow', env.ctx.project.arrows),
  (env) => simpleGroup(env, 'annotation', 'annotation', env.ctx.project.annotations),
  (env) => simpleGroup(env, 'layer', 'layer', env.ctx.project.layers),
  threadCandidates,
];

// ---- casamento

/** 0: todas as palavras no nome; 1: no nome ou no caminho; `null`: não casa. */
function score(words: readonly string[], c: CiteCandidate): 0 | 1 | null {
  if (words.length === 0) return 0;
  const name = fold(c.label);
  if (words.every((w) => name.includes(w))) return 0;
  const full = fold(`${c.label} ${c.detail}`);
  return words.every((w) => full.includes(w)) ? 1 : null;
}

/** Os que casam, o casamento pelo nome antes do pelo caminho (estável dentro de cada um). */
function matching(
  words: readonly string[],
  list: readonly CiteCandidate[],
): CiteCandidate[] {
  const byName: CiteCandidate[] = [];
  const byPath: CiteCandidate[] = [];
  for (const c of list) {
    const s = score(words, c);
    if (s === 0) byName.push(c);
    else if (s === 1) byPath.push(c);
  }
  return [...byName, ...byPath];
}

/**
 * A busca do `@` (decisão 31): primeiro os campos, pares e linhas das anotações do item da
 * conversa (`here`, a âncora dela), depois marcações, containers, setas, anotações, camadas e
 * conversas abertas. Casa por nome (e, em segundo, pelo caminho) sem diferença de caixa nem de
 * acento; consulta vazia devolve tudo na mesma ordem, até o limite.
 */
export function citeCandidates(
  ctx: CitationContext,
  query: string,
  here: ThreadAnchor | null,
  options: CiteOptions,
): CiteCandidate[] {
  const env: Env = {
    ctx,
    unnamed: options.unnamed,
    separator: options.separator ?? DEFAULT_SEPARATOR,
    excludeThreadId: options.excludeThreadId,
  };
  const limit = options.limit ?? DEFAULT_LIMIT;
  const words = fold(query).split(/\s+/).filter(Boolean);
  const out: CiteCandidate[] = [];
  for (const build of GROUPS) {
    if (out.length >= limit) break;
    out.push(...matching(words, build(env, here)));
  }
  return out.slice(0, limit);
}
