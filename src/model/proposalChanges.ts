import { topDown } from './hierarchy';
import {
  ENTRIES_FIELD_PREFIX,
  PROPOSAL_FORMAT,
  PROPOSAL_FORMAT_VERSION,
  VALUES_FIELD_PREFIX,
  type Change,
  type ChangeEntity,
  type Proposal,
} from './proposal';
import {
  COMPARED_FIELDS,
  annotationField,
  annotationValue,
  imageField,
  imageValue,
  jsonEqual,
  layerField,
  layerValue,
  markingField,
  markingValue,
  platformRepoValue,
  specializationValue,
  toJson,
} from './proposalValues';
import type { Annotation, JsonValue, Marking, Project } from './types';

// Cálculo das mudanças (etapa 4): quem envia a proposta aplica as operações a uma cópia
// do projeto com as operações puras do modelo (o lote do MCP, `mcp/batch.ts`) e entrega
// o antes e o depois; aqui eles são comparados entidade por entidade, campo por campo.
// Os ids das entidades criadas são os do "depois": já são os definitivos.

type Draft = Omit<Change, 'id'>;

function byId<T extends { readonly id: string }>(list: readonly T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

/**
 * Índices de `seq` que formam a maior subsequência crescente (os itens que não
 * precisam se mover para chegar à ordem nova).
 */
function longestIncreasing(seq: readonly number[]): Set<number> {
  const tails: number[] = [];
  const prev: number[] = new Array<number>(seq.length).fill(-1);
  seq.forEach((value, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((seq[tails[mid] as number] as number) < value) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) prev[i] = tails[lo - 1] as number;
    tails[lo] = i;
  });
  const keep = new Set<number>();
  let k = tails.length > 0 ? (tails[tails.length - 1] as number) : -1;
  while (k >= 0) {
    keep.add(k);
    k = prev[k] as number;
  }
  return keep;
}

class Diff {
  readonly out: Draft[] = [];

  push(draft: Draft): void {
    this.out.push(draft);
  }

  /** Criação, remoção ou uma alteração por campo, conforme exista antes e/ou depois. */
  entity<T>(
    entity: ChangeEntity,
    entityId: string,
    where: { imageId: string | null; markingId: string | null },
    before: T | undefined,
    after: T | undefined,
    value: (item: T) => JsonValue,
    fields: readonly string[],
    get: (item: T, field: string) => JsonValue | undefined,
  ): void {
    const base = { entity, entityId, ...where };
    if (before === undefined && after !== undefined) {
      this.push({ ...base, kind: 'create', field: null, from: null, to: value(after) });
    } else if (before !== undefined && after === undefined) {
      this.push({ ...base, kind: 'remove', field: null, from: value(before), to: null });
    } else if (before !== undefined && after !== undefined) {
      for (const field of fields) {
        const from = get(before, field) ?? null;
        const to = get(after, field) ?? null;
        if (!jsonEqual(from, to)) this.push({ ...base, kind: 'update', field, from, to });
      }
    }
  }
}

/** Mudanças de uma anotação: a troca de tipo leva `values` e `entries` junto. */
function annotationChanges(
  diff: Diff,
  where: { imageId: string; markingId: string },
  before: Annotation | undefined,
  after: Annotation | undefined,
): void {
  const entityId = (after ?? before)?.id ?? '';
  if (!before || !after) {
    diff.entity(
      'annotation',
      entityId,
      where,
      before,
      after,
      annotationValue,
      [],
      () => undefined,
    );
    return;
  }
  const fields: string[] = [...COMPARED_FIELDS.annotation];
  if (!jsonEqual(toJson(before.type), toJson(after.type))) {
    fields.push('type');
  } else {
    const keys = new Set([
      ...Object.keys(after.values ?? {}),
      ...Object.keys(before.values ?? {}),
    ]);
    for (const key of keys) fields.push(`${VALUES_FIELD_PREFIX}${key}`);
    const entryIds = new Set([...after.entries, ...before.entries].map((e) => e.id));
    for (const entryId of entryIds) fields.push(`${ENTRIES_FIELD_PREFIX}${entryId}`);
  }
  diff.entity(
    'annotation',
    entityId,
    where,
    before,
    after,
    annotationValue,
    fields,
    (a, f) => annotationField(a, f),
  );
}

/** Ordem de saída das marcações de uma imagem: as de depois de cima para baixo, depois as removidas. */
function markingOrder(
  imageId: string,
  base: readonly Marking[],
  after: readonly Marking[],
  afterIds: ReadonlySet<string>,
): Marking[] {
  return [
    ...topDown(after.filter((m) => m.imageId === imageId)),
    ...topDown(base.filter((m) => m.imageId === imageId && !afterIds.has(m.id))),
  ];
}

/**
 * Compara o projeto antes e depois das operações e devolve as mudanças, com ids
 * `c1`, `c2`… na ordem: grupo Projeto (especializações, repositórios, camadas) e, por
 * imagem, a própria imagem e as marcações de cima para baixo, cada uma seguida das
 * anotações dela. A ordem dos pares e das marcações dentro da lista não vira mudança;
 * a das camadas vira (`position`, só para as que mudam de ordem relativa). `needsReview`
 * não vira mudança: a revisão é a própria conferência (a criação leva o valor de depois).
 */
export function computeChanges(base: Project, after: Project): Change[] {
  const diff = new Diff();
  const projectLevel = { imageId: null, markingId: null };

  // Especializações.
  const baseSpecs = byId(base.specializations);
  const afterSpecs = byId(after.specializations);
  for (const s of [
    ...after.specializations,
    ...base.specializations.filter((s) => !afterSpecs.has(s.id)),
  ]) {
    const before = baseSpecs.get(s.id);
    const next = afterSpecs.get(s.id);
    if (before && next) {
      const from = specializationValue(before);
      const to = specializationValue(next);
      if (!jsonEqual(from, to)) {
        diff.push({
          entity: 'specialization',
          entityId: s.id,
          ...projectLevel,
          kind: 'update',
          field: null,
          from,
          to,
        });
      }
    } else {
      diff.entity(
        'specialization',
        s.id,
        projectLevel,
        before,
        next,
        specializationValue,
        [],
        () => undefined,
      );
    }
  }

  // Repositórios por plataforma.
  const platforms = [
    ...Object.keys(after.platformRepos),
    ...Object.keys(base.platformRepos).filter(
      (k) => !Object.hasOwn(after.platformRepos, k),
    ),
  ];
  for (const platform of platforms) {
    const before = Object.hasOwn(base.platformRepos, platform)
      ? base.platformRepos[platform]
      : undefined;
    const next = Object.hasOwn(after.platformRepos, platform)
      ? after.platformRepos[platform]
      : undefined;
    if (before && next) {
      const from = platformRepoValue(before);
      const to = platformRepoValue(next);
      if (!jsonEqual(from, to)) {
        diff.push({
          entity: 'platformRepo',
          entityId: platform,
          ...projectLevel,
          kind: 'update',
          field: null,
          from,
          to,
        });
      }
    } else {
      diff.entity(
        'platformRepo',
        platform,
        projectLevel,
        before,
        next,
        platformRepoValue,
        [],
        () => undefined,
      );
    }
  }

  // Camadas: criação, campos, remoção e, por último, a ordem.
  const baseLayers = byId(base.layers);
  const afterLayers = byId(after.layers);
  for (const l of [
    ...after.layers,
    ...base.layers.filter((l) => !afterLayers.has(l.id)),
  ]) {
    diff.entity(
      'layer',
      l.id,
      projectLevel,
      baseLayers.get(l.id),
      afterLayers.get(l.id),
      layerValue,
      COMPARED_FIELDS.layer,
      (layer, f) => layerField(after, layer, f),
    );
  }
  // Ordem depois de aplicar criações (no fim) e remoções: as existentes na ordem de
  // antes e as criadas na ordem de depois. Quem sai da maior subsequência crescente muda
  // de posição.
  const created = after.layers.filter((l) => !baseLayers.has(l.id));
  const rank = new Map<string, number>(base.layers.map((l, i) => [l.id, i]));
  created.forEach((l, i) => rank.set(l.id, base.layers.length + i));
  const seq = after.layers.map((l) => rank.get(l.id) ?? 0);
  const keep = longestIncreasing(seq);
  after.layers.forEach((l, i) => {
    if (keep.has(i)) return;
    const from = base.layers.findIndex((b) => b.id === l.id);
    diff.push({
      entity: 'layer',
      entityId: l.id,
      ...projectLevel,
      kind: 'update',
      field: 'position',
      from: from < 0 ? null : from,
      to: i,
    });
  });

  // Imagens, marcações e anotações.
  const baseImages = byId(base.images);
  const afterImages = byId(after.images);
  const baseMarkings = byId(base.markings);
  const afterMarkings = byId(after.markings);
  const baseAnnotations = byId(base.annotations);
  const afterAnnotations = byId(after.annotations);
  // Anotações por marcação: as de depois (na ordem do projeto) e as removidas.
  const byMarking = new Map<string, Annotation[]>();
  const add = (a: Annotation) => {
    const list = byMarking.get(a.markingId);
    if (list) list.push(a);
    else byMarking.set(a.markingId, [a]);
  };
  after.annotations.forEach(add);
  base.annotations.filter((a) => !afterAnnotations.has(a.id)).forEach(add);
  const afterMarkingIds = new Set(afterMarkings.keys());

  for (const image of [
    ...after.images,
    ...base.images.filter((i) => !afterImages.has(i.id)),
  ]) {
    diff.entity(
      'image',
      image.id,
      { imageId: image.id, markingId: null },
      baseImages.get(image.id),
      afterImages.get(image.id),
      imageValue,
      COMPARED_FIELDS.image,
      imageField,
    );
    for (const m of markingOrder(
      image.id,
      base.markings,
      after.markings,
      afterMarkingIds,
    )) {
      const where = { imageId: image.id, markingId: m.id };
      diff.entity(
        'marking',
        m.id,
        where,
        baseMarkings.get(m.id),
        afterMarkings.get(m.id),
        markingValue,
        COMPARED_FIELDS.marking,
        markingField,
      );
      for (const a of byMarking.get(m.id) ?? []) {
        annotationChanges(
          diff,
          where,
          baseAnnotations.get(a.id),
          afterAnnotations.get(a.id),
        );
      }
    }
  }

  return diff.out.map((draft, i) => ({ id: `c${i + 1}`, ...draft }));
}

export interface NewProposalArgs {
  /** Id da proposta (nome da pasta em `proposals/`). Padrão: `crypto.randomUUID()`. */
  readonly id?: string;
  readonly title: string;
  readonly description?: string | null;
  readonly origin?: string | null;
  readonly author?: string | null;
  /** Data ISO 8601 da criação. */
  readonly createdAt: string;
  /** Proposta substituída por esta. */
  readonly supersedes?: string | null;
  /** As operações enviadas, guardadas só para referência. */
  readonly operations?: readonly JsonValue[];
}

/**
 * Monta uma proposta aberta a partir do projeto lido (`base`, cuja `revision` vira
 * `baseRevision`) e do resultado das operações (`after`).
 */
export function buildProposal(
  base: Project,
  after: Project,
  args: NewProposalArgs,
): Proposal {
  const clean = (text: string | null | undefined) => {
    const trimmed = text?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  };
  return {
    format: PROPOSAL_FORMAT,
    formatVersion: PROPOSAL_FORMAT_VERSION,
    id: args.id ?? crypto.randomUUID(),
    title: args.title.trim(),
    description: clean(args.description),
    origin: clean(args.origin),
    author: clean(args.author),
    createdAt: args.createdAt,
    baseRevision: base.revision,
    supersedes: args.supersedes ?? null,
    status: 'open',
    revision: 0,
    operations: (args.operations ?? []).map(toJson),
    changes: computeChanges(base, after),
    decisions: {},
    notes: [],
    applied: {},
  };
}
