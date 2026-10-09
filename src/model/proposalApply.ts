import { validateProject, type InvariantCode } from './invariants';
import {
  ENTRIES_FIELD_PREFIX,
  VALUES_FIELD_PREFIX,
  proposalImagePath,
  type Change,
  type ChangeEntity,
  type Proposal,
} from './proposal';
import { proposalIndex } from './proposalReview';
import { isRecord } from './refs';
import type { Spec } from './spec';
import type {
  Annotation,
  AnnotationTypeRef,
  Entry,
  ExternalSource,
  JsonValue,
  Layer,
  LayerSpecRef,
  Marking,
  Placement,
  PlatformRepo,
  Project,
  ProjectImage,
  ProjectSpecialization,
  Rect,
  TypedValues,
} from './types';

// Aplicação de uma proposta (etapa 4): o projeto atual mais as mudanças aceitas viram o
// projeto novo, sem as operações do modelo: a revisão é a decisão (a trava não impede, e
// continua ligada), e o resultado passa pelas invariantes de `validateProject`. As
// mudanças chegam validadas por `parseProposal` (ou montadas por `buildProposal`).

export type PatchProblemCode = 'entity-missing' | 'entity-exists' | 'field-mismatch';

/**
 * Mudança que não pôde ser aplicada: alteração de entidade que não existe mais
 * (`entity-missing`), criação de um id que já existe (`entity-exists`) ou campo que não
 * cabe na entidade atual (`field-mismatch`, ex: `values.*` numa anotação que virou livre).
 */
export interface PatchProblem {
  readonly code: PatchProblemCode;
  readonly changeId: string;
}

type Entity =
  ProjectSpecialization | PlatformRepo | Layer | ProjectImage | Marking | Annotation;

/** Ordem de aplicação: criações e alterações de cima para baixo, remoções de baixo para cima. */
const UPSERT_PHASE: Record<ChangeEntity, number> = {
  specialization: 0,
  platformRepo: 1,
  layer: 2,
  image: 3,
  marking: 4,
  annotation: 5,
};
const REMOVE_PHASE: Record<ChangeEntity, number> = {
  annotation: 6,
  marking: 7,
  image: 8,
  layer: 9,
  specialization: 10,
  platformRepo: 11,
};

function decode(entity: ChangeEntity, value: JsonValue): Entity {
  if (entity === 'specialization' && isRecord(value)) {
    return {
      id: value.id as string,
      version: value.version as number,
      file: value.file as string,
      spec: (value.spec ?? null) as unknown as Spec | null,
    };
  }
  return value as unknown as Entity;
}

/** A entidade com o campo da mudança aplicado; `null` se o campo não cabe nela. */
function withField(entity: ChangeEntity, current: Entity, c: Change): Entity | null {
  const field = c.field ?? '';
  const to = c.to;
  switch (entity) {
    case 'image': {
      const i = current as ProjectImage;
      if (field === 'file' && isRecord(to)) {
        return {
          ...i,
          file: to.file as string,
          width: to.width as number,
          height: to.height as number,
        };
      }
      if (field === 'placement') return { ...i, placement: to as unknown as Placement };
      if (field === 'source')
        return { ...i, source: to as unknown as ExternalSource | null };
      return { ...i, [field]: to };
    }
    case 'marking': {
      const m = current as Marking;
      if (field === 'rect') return { ...m, rect: to as unknown as Rect };
      if (field === 'source')
        return { ...m, source: to as unknown as ExternalSource | null };
      return { ...m, [field]: to };
    }
    case 'layer': {
      const l = current as Layer;
      if (field === 'spec') return { ...l, spec: to as unknown as LayerSpecRef | null };
      return { ...l, [field]: to };
    }
    case 'annotation': {
      const a = current as Annotation;
      if (field === 'type' && isRecord(to)) {
        return {
          ...a,
          type: (to.type ?? null) as unknown as AnnotationTypeRef | null,
          values: (to.values ?? null) as TypedValues | null,
          entries: (to.entries ?? []) as unknown as Entry[],
        };
      }
      if (field.startsWith(VALUES_FIELD_PREFIX)) {
        if (a.values === null) return null;
        const key = field.slice(VALUES_FIELD_PREFIX.length);
        return { ...a, values: { ...a.values, [key]: to } };
      }
      if (field.startsWith(ENTRIES_FIELD_PREFIX)) {
        if (a.type !== null) return null;
        const entryId = field.slice(ENTRIES_FIELD_PREFIX.length);
        if (!isRecord(to))
          return { ...a, entries: a.entries.filter((e) => e.id !== entryId) };
        const entry: Entry = {
          id: entryId,
          key: to.key as string,
          value: to.value as string,
        };
        const exists = a.entries.some((e) => e.id === entryId);
        return {
          ...a,
          entries: exists
            ? a.entries.map((e) => (e.id === entryId ? entry : e))
            : [...a.entries, entry],
        };
      }
      return { ...a, [field]: to };
    }
    case 'specialization':
    case 'platformRepo':
      return decode(entity, to);
  }
}

export interface PatchResult {
  readonly project: Project;
  readonly problems: readonly PatchProblem[];
}

/**
 * Aplica `changes` ao projeto, sem validar o resultado: criações entram no fim das
 * listas, remoções de entidade ausente não fazem nada, e as camadas reposicionadas vão
 * para o índice proposto (em ordem crescente). O que não pôde ser aplicado volta em
 * `problems` e fica de fora.
 */
export function patchProject(p: Project, changes: readonly Change[]): PatchResult {
  const maps: Record<ChangeEntity, Map<string, Entity>> = {
    specialization: new Map(p.specializations.map((s) => [s.id, s])),
    platformRepo: new Map(Object.entries(p.platformRepos)),
    layer: new Map(p.layers.map((l) => [l.id, l])),
    image: new Map(p.images.map((i) => [i.id, i])),
    marking: new Map(p.markings.map((m) => [m.id, m])),
    annotation: new Map(p.annotations.map((a) => [a.id, a])),
  };
  const problems: PatchProblem[] = [];
  const positions: Change[] = [];
  const phase = (c: Change) =>
    c.kind === 'remove' ? REMOVE_PHASE[c.entity] : UPSERT_PHASE[c.entity];
  const ordered = changes
    .map((c, i) => ({ c, i }))
    .sort((a, b) => phase(a.c) - phase(b.c) || a.i - b.i)
    .map(({ c }) => c);

  for (const c of ordered) {
    const map = maps[c.entity];
    if (c.kind === 'create') {
      if (map.has(c.entityId)) problems.push({ code: 'entity-exists', changeId: c.id });
      else map.set(c.entityId, decode(c.entity, c.to));
    } else if (c.kind === 'remove') {
      map.delete(c.entityId);
    } else if (c.entity === 'layer' && c.field === 'position') {
      if (map.has(c.entityId)) positions.push(c);
      else problems.push({ code: 'entity-missing', changeId: c.id });
    } else {
      const current = map.get(c.entityId);
      const next = current && withField(c.entity, current, c);
      if (!current) problems.push({ code: 'entity-missing', changeId: c.id });
      else if (!next) problems.push({ code: 'field-mismatch', changeId: c.id });
      else map.set(c.entityId, next);
    }
  }

  const layers = [...maps.layer.values()] as Layer[];
  for (const c of [...positions].sort((a, b) => (a.to as number) - (b.to as number))) {
    const from = layers.findIndex((l) => l.id === c.entityId);
    const [layer] = layers.splice(from, 1);
    if (layer) layers.splice(Math.min(c.to as number, layers.length), 0, layer);
  }

  return {
    project: {
      ...p,
      specializations: [...maps.specialization.values()] as ProjectSpecialization[],
      platformRepos: Object.fromEntries(maps.platformRepo) as Record<
        string,
        PlatformRepo
      >,
      layers,
      images: [...maps.image.values()] as ProjectImage[],
      markings: [...maps.marking.values()] as Marking[],
      annotations: [...maps.annotation.values()] as Annotation[],
    },
    problems,
  };
}

// ---------------------------------------------------------------------------
// Validação do conjunto aceito

export type ProposalIssueCode =
  | InvariantCode
  | PatchProblemCode
  /** Camada ou anotação tipada de uma especialização que não ficaria aplicada. */
  | 'missing-specialization'
  /** A proposta não está aberta nem substituída: nada mais pode ser aplicado. */
  | 'proposal-closed';

/**
 * Problema que bloqueia "Aplicar aceitas". `changeIds`: as mudanças aceitas envolvidas
 * (rejeitar uma delas resolve); `related`: as mudanças sem decisão nas mesmas entidades
 * (aceitar uma delas pode resolver, ex: a posição do pai que falta).
 */
export interface ProposalIssue {
  readonly code: ProposalIssueCode;
  /** Entidade com problema (na de invariante, o `id` do `InvariantIssue`). */
  readonly id: string;
  readonly otherId?: string;
  readonly changeIds: readonly string[];
  readonly related: readonly string[];
}

/** Mudanças que "Aplicar aceitas" efetiva: aceitas e ainda não aplicadas. */
export function acceptedPending(p: Proposal): Change[] {
  return p.changes.filter(
    (c) => p.decisions[c.id]?.state === 'accepted' && !Object.hasOwn(p.applied, c.id),
  );
}

/** Camadas e anotações tipadas que citam uma especialização que não está no projeto. */
function specializationIssues(p: Project): { id: string; otherId: string }[] {
  const applied = new Set(p.specializations.map((s) => s.id));
  const out: { id: string; otherId: string }[] = [];
  for (const l of p.layers) {
    if (l.spec && !applied.has(l.spec.specId))
      out.push({ id: l.id, otherId: l.spec.specId });
  }
  for (const a of p.annotations) {
    if (a.type && !applied.has(a.type.specId))
      out.push({ id: a.id, otherId: a.type.specId });
  }
  return out;
}

export interface AcceptedValidation {
  readonly ok: boolean;
  /** As mudanças que seriam aplicadas. */
  readonly changeIds: readonly string[];
  readonly issues: readonly ProposalIssue[];
  /** O projeto com elas aplicadas (mesmo inválido, para a revisão mostrar). */
  readonly project: Project;
}

/**
 * Aplica as aceitas pendentes a uma cópia e valida: invariantes do modelo, especializações
 * citadas e mudanças que não puderam ser aplicadas. Só contam os problemas novos (os que o
 * projeto atual já tinha não bloqueiam).
 */
export function validateAccepted(project: Project, p: Proposal): AcceptedValidation {
  const pending = acceptedPending(p);
  const changeIds = pending.map((c) => c.id);
  if (p.status !== 'open' && p.status !== 'superseded') {
    return {
      ok: pending.length === 0,
      changeIds,
      issues:
        pending.length === 0
          ? []
          : [{ code: 'proposal-closed', id: p.id, changeIds, related: [] }],
      project,
    };
  }
  // Nada a aplicar: o mesmo projeto (o store não cria entrada de desfazer).
  const { project: result, problems } =
    pending.length === 0 ? { project, problems: [] } : patchProject(project, pending);
  const byEntity = new Map<string, Change[]>();
  for (const c of p.changes) {
    if (Object.hasOwn(p.applied, c.id)) continue;
    const list = byEntity.get(c.entityId);
    if (list) list.push(c);
    else byEntity.set(c.entityId, [c]);
  }
  const accepted = new Set(changeIds);
  const involved = (...ids: (string | undefined)[]) => {
    const changes = ids.flatMap((id) =>
      id === undefined ? [] : (byEntity.get(id) ?? []),
    );
    return {
      changeIds: changes.filter((c) => accepted.has(c.id)).map((c) => c.id),
      related: changes.filter((c) => p.decisions[c.id] === undefined).map((c) => c.id),
    };
  };

  const issues: ProposalIssue[] = [];
  const changesById = proposalIndex(p).changes;
  for (const problem of problems) {
    const change = changesById.get(problem.changeId);
    issues.push({
      code: problem.code,
      id: change?.entityId ?? problem.changeId,
      changeIds: [problem.changeId],
      related: [],
    });
  }
  const key = (code: string, id: string, otherId?: string) =>
    `${code}|${id}|${otherId ?? ''}`;
  const before = new Set(
    validateProject(project).map((i) => key(i.code, i.id, i.otherId)),
  );
  for (const issue of validateProject(result)) {
    if (before.has(key(issue.code, issue.id, issue.otherId))) continue;
    issues.push({
      code: issue.code,
      id: issue.id,
      ...(issue.otherId === undefined ? {} : { otherId: issue.otherId }),
      ...involved(issue.id, issue.otherId),
    });
  }
  const specBefore = new Set(
    specializationIssues(project).map((i) =>
      key('missing-specialization', i.id, i.otherId),
    ),
  );
  for (const issue of specializationIssues(result)) {
    if (specBefore.has(key('missing-specialization', issue.id, issue.otherId))) continue;
    issues.push({
      code: 'missing-specialization',
      ...issue,
      ...involved(issue.id, issue.otherId),
    });
  }
  return { ok: issues.length === 0, changeIds, issues, project: result };
}

// ---------------------------------------------------------------------------
// Aplicar aceitas

/** Arquivo de imagem a mover de `proposals/<id>/…` para o lugar definitivo. */
export interface ProposalFileMove {
  readonly from: string;
  readonly to: string;
}

export type ApplyAcceptedResult =
  | {
      readonly ok: true;
      readonly project: Project;
      /** A proposta com `applied` (e o `status`, se tudo foi decidido) atualizados. */
      readonly proposal: Proposal;
      /** As mudanças efetivadas, na ordem da proposta. */
      readonly applied: readonly Change[];
      /** Imagens novas ou trocadas a mover para `images/`. */
      readonly files: readonly ProposalFileMove[];
    }
  | { readonly ok: false; readonly issues: readonly ProposalIssue[] };

/**
 * "Aplicar aceitas": efetiva só as aceitas ainda não aplicadas (uma entrada de desfazer
 * para quem chama). O que está sem decisão continua pendente; uma nova aplicação depois
 * efetiva o que for aceito em seguida. Quando nada fica sem decisão nem aceito sem
 * aplicar, a proposta aberta passa a `applied`. Bloqueado (`ok: false`) se o conjunto
 * aceito deixaria o projeto inválido.
 */
export function applyAccepted(
  project: Project,
  p: Proposal,
  at: string,
): ApplyAcceptedResult {
  const validation = validateAccepted(project, p);
  if (!validation.ok) return { ok: false, issues: validation.issues };
  const ids = new Set(validation.changeIds);
  const applied = p.changes.filter((c) => ids.has(c.id));
  const appliedMap = { ...p.applied };
  for (const c of applied) appliedMap[c.id] = { at };
  const done = p.changes.every(
    (c) =>
      p.decisions[c.id] !== undefined &&
      (p.decisions[c.id]?.state === 'rejected' || Object.hasOwn(appliedMap, c.id)),
  );
  const files: ProposalFileMove[] = [];
  for (const c of applied) {
    if (c.entity !== 'image' || !isRecord(c.to)) continue;
    if (c.kind === 'create' || (c.kind === 'update' && c.field === 'file')) {
      const file = c.to.file;
      if (typeof file === 'string')
        files.push({ from: proposalImagePath(p.id, file), to: file });
    }
  }
  return {
    ok: true,
    project: validation.project,
    proposal: {
      ...p,
      applied: appliedMap,
      status: p.status === 'open' && done ? 'applied' : p.status,
    },
    applied,
    files,
  };
}

/**
 * O projeto "como ficaria" (visão Proposto): o atual mais as mudanças não rejeitadas e
 * ainda não aplicadas, sem validar. O que não cabe fica de fora (`problems`).
 */
export function previewProject(project: Project, p: Proposal): PatchResult {
  return patchProject(
    project,
    p.changes.filter(
      (c) => p.decisions[c.id]?.state !== 'rejected' && !Object.hasOwn(p.applied, c.id),
    ),
  );
}
