// Marcas de revisão no canvas (HANDOFF-PROPOSALS 4): o que desenhar sobre o projeto
// "como ficaria" (visão Proposto) ou o atual (visão Atual). A forma da linha e o selo
// dizem o tipo; a cor nunca é a única pista. Função pura sobre o estado derivado da
// revisão (tipos, conflitos, conjunto inválido) e os dois projetos; os renderers só
// desenham o resultado.
import {
  changeImageFile,
  dominantChangeType,
  isRecord,
  proposalImagePath,
  projectIndex,
  proposalIndex,
  type Change,
  type ChangeType,
  type JsonValue,
  type Placement,
  type Project,
  type Proposal,
  type Rect,
  type ReviewTree,
} from '../model';

export type ReviewView = 'current' | 'proposed';

/** Selo no canto superior direito (no máximo dois por marcação). */
export type ReviewBadge = ChangeType | 'conflict' | 'invalid' | 'rejected';

/**
 * Linha da marcação: criada tracejada, alterada dupla, inválida tracejada em `cv-invalid`,
 * rejeitada pontilhada (só na visão Atual).
 */
export type ReviewLine = 'created' | 'changed' | 'invalid' | 'rejected';

export interface MarkingReviewMark {
  readonly line: ReviewLine | null;
  /** Esmaecida (rejeitada, na visão Atual). */
  readonly dim: boolean;
  readonly badges: readonly ReviewBadge[];
}

/** Retângulo desenhado à parte: fantasma da outra posição, item removido ou rejeitado. */
export interface ReviewShape {
  readonly key: string;
  readonly placement: Placement;
  /** Em pixels da imagem. */
  readonly rect: Rect;
  readonly name: string | null;
  readonly badges: readonly ReviewBadge[];
}

export interface ImageReviewMark {
  readonly line: 'created' | null;
  readonly badges: readonly ReviewBadge[];
}

export interface ReviewCanvas {
  readonly view: ReviewView;
  readonly markings: ReadonlyMap<string, MarkingReviewMark>;
  readonly images: ReadonlyMap<string, ImageReviewMark>;
  /** Fantasmas pontilhados: a posição antiga (Proposto) ou a nova (Atual), e as rejeitadas. */
  readonly ghosts: readonly ReviewShape[];
  /** Removidas (hachura e nome riscado): marcações e imagens inteiras. */
  readonly removed: readonly ReviewShape[];
}

export interface ReviewMarksInput {
  readonly proposal: Proposal;
  readonly tree: ReviewTree;
  readonly types: ReadonlyMap<string, ChangeType>;
  readonly conflicts: ReadonlySet<string>;
  /** Mudanças aceitas que formam o conjunto inválido. */
  readonly invalid: ReadonlySet<string>;
  readonly view: ReviewView;
  /** Projeto atual. */
  readonly current: Project;
  /** Projeto desenhado (o atual ou o "como ficaria"). */
  readonly drawn: Project;
}

const asRect = (value: JsonValue | undefined): Rect | null => {
  if (!isRecord(value)) return null;
  const { x, y, width, height } = value;
  return typeof x === 'number' &&
    typeof y === 'number' &&
    typeof width === 'number' &&
    typeof height === 'number'
    ? { x, y, width, height }
    : null;
};

const textOf = (value: JsonValue | undefined): string | null =>
  typeof value === 'string' ? value : null;

/** Até dois selos: o alerta (inválida ou conflito) e o tipo. */
function badgesOf(
  type: ReviewBadge | null,
  conflict: boolean,
  invalid: boolean,
): ReviewBadge[] {
  const out: ReviewBadge[] = [];
  if (invalid) out.push('invalid');
  else if (conflict) out.push('conflict');
  if (type) out.push(type);
  return out.slice(0, 2);
}

export function reviewMarks(input: ReviewMarksInput): ReviewCanvas {
  const { proposal: p, tree, types, conflicts, invalid, view, current, drawn } = input;
  const changes = proposalIndex(p).changes;
  const currentIndex = projectIndex(current);
  const drawnIndex = projectIndex(drawn);
  const rejected = (c: Change) => p.decisions[c.id]?.state === 'rejected';
  const applied = (c: Change) => Object.hasOwn(p.applied, c.id);
  const placementOf = (imageId: string): Placement | null =>
    drawnIndex.images.get(imageId)?.placement ??
    currentIndex.images.get(imageId)?.placement ??
    null;

  const markings = new Map<string, MarkingReviewMark>();
  const images = new Map<string, ImageReviewMark>();
  const ghosts: ReviewShape[] = [];
  const removed: ReviewShape[] = [];

  for (const node of tree.nodes.values()) {
    if (node.id === null || (node.level !== 'item' && node.level !== 'image')) continue;
    const id = node.id;
    const own = node.changeIds
      .map((changeId) => changes.get(changeId))
      .filter((c): c is Change => c !== undefined && !applied(c));
    if (own.length === 0) continue;
    const live = own.filter((c) => !rejected(c));
    const conflict = live.some((c) => conflicts.has(c.id));
    const isInvalid = own.some((c) => invalid.has(c.id));
    const entity = node.level === 'item' ? 'marking' : 'image';
    const self = (c: Change) => c.entity === entity && c.entityId === id;
    const create = own.find((c) => self(c) && c.kind === 'create');
    const remove = own.find((c) => self(c) && c.kind === 'remove');
    // Tipo pela própria entidade; o que muda dentro (anotações) faz "alterada", e
    // "movida" só quando a posição é a única coisa que muda (a mesma regra dos níveis).
    const ownLive = live.filter(self);
    const ownType = dominantChangeType(
      ownLive.map((c) => types.get(c.id)).filter((x): x is ChangeType => x !== undefined),
    );
    const liveType: ChangeType | null =
      live.length === 0
        ? null
        : ownType === null || (ownType === 'moved' && ownLive.length < live.length)
          ? 'changed'
          : ownType;

    if (node.level === 'image') {
      const image = currentIndex.images.get(id);
      if (remove && !rejected(remove) && image) {
        removed.push({
          key: `image:${id}`,
          placement: image.placement,
          rect: { x: 0, y: 0, width: image.width, height: image.height },
          name: image.name ?? image.file,
          badges: badgesOf('removed', conflict, isInvalid),
        });
        continue;
      }
      if (create && !rejected(create)) {
        if (view === 'proposed') {
          images.set(id, {
            line: 'created',
            badges: badgesOf('created', conflict, isInvalid),
          });
        }
        continue;
      }
      if (liveType) {
        images.set(id, { line: null, badges: badgesOf(liveType, conflict, isInvalid) });
      }
      continue;
    }

    // Item (marcação com tudo que mudou nela).
    const marking = currentIndex.markings.get(id);
    const rectChange = own.find(
      (c) => self(c) && c.kind === 'update' && c.field === 'rect',
    );
    const imageId =
      create?.imageId ??
      marking?.imageId ??
      node.changeIds
        .map((changeId) => changes.get(changeId)?.imageId)
        .find((x): x is string => typeof x === 'string');
    const placement = imageId ? placementOf(imageId) : null;

    if (create) {
      if (!rejected(create)) {
        if (view === 'proposed') {
          markings.set(id, {
            line: isInvalid ? 'invalid' : 'created',
            dim: false,
            badges: badgesOf('created', conflict, isInvalid),
          });
        }
      } else if (view === 'current' && placement) {
        const record = isRecord(create.to) ? create.to : null;
        const rect = asRect(record?.rect);
        if (rect) {
          ghosts.push({
            key: `rejected:${id}`,
            placement,
            rect,
            name: textOf(record?.name),
            badges: ['rejected'],
          });
        }
      }
      continue;
    }

    if (remove) {
      const rect =
        asRect(isRecord(remove.from) ? remove.from.rect : undefined) ?? marking?.rect;
      if (!rejected(remove)) {
        if (rect && placement) {
          removed.push({
            key: `marking:${id}`,
            placement,
            rect,
            name:
              marking?.name ?? textOf(isRecord(remove.from) ? remove.from.name : null),
            badges: badgesOf('removed', conflict, isInvalid),
          });
        }
        continue;
      }
      if (view === 'current')
        markings.set(id, { line: 'rejected', dim: true, badges: ['rejected'] });
      continue;
    }

    if (live.length === 0) {
      // Tudo rejeitado: só aparece na visão Atual (fantasma e ✕), nunca na Proposto.
      if (view === 'current') {
        markings.set(id, { line: 'rejected', dim: true, badges: ['rejected'] });
        const rect = rectChange ? asRect(rectChange.to) : null;
        if (rect && placement) {
          ghosts.push({
            key: `rejected:${id}`,
            placement,
            rect,
            name: null,
            badges: ['rejected'],
          });
        }
      }
      continue;
    }

    const line: ReviewLine | null = isInvalid
      ? 'invalid'
      : liveType === 'changed' || liveType === 'replaced'
        ? 'changed'
        : null;
    markings.set(id, {
      line,
      dim: false,
      badges: badgesOf(liveType, conflict, isInvalid),
    });
    // Movida: fantasma na posição antiga (Proposto) ou na nova (Atual).
    if (rectChange && !rejected(rectChange) && placement) {
      const rect = asRect(view === 'proposed' ? rectChange.from : rectChange.to);
      if (rect)
        ghosts.push({ key: `moved:${id}`, placement, rect, name: null, badges: [] });
    }
  }
  return { view, markings, images, ghosts, removed };
}

/** Selos que continuam à vista com a marcação pequena na tela (zoom baixo, muitas marcas). */
export function importantBadge(badge: ReviewBadge): boolean {
  return (
    badge === 'changed' ||
    badge === 'removed' ||
    badge === 'conflict' ||
    badge === 'invalid'
  );
}

const displayCache = new WeakMap<Project, { proposal: Proposal; project: Project }>();

/**
 * O "como ficaria" pronto para desenhar: as imagens novas ou trocadas pela proposta (ainda
 * não aplicadas) apontam para o arquivo que espera em `proposals/<id>/images/…`. Só para a
 * exibição; nada disto vai para o projeto.
 */
export function proposedDisplay(preview: Project, p: Proposal): Project {
  const cached = displayCache.get(preview);
  if (cached && cached.proposal === p) return cached.project;
  const files = new Map<string, string>();
  for (const c of p.changes) {
    if (p.decisions[c.id]?.state === 'rejected' || Object.hasOwn(p.applied, c.id))
      continue;
    const file = changeImageFile(c);
    if (file !== null) files.set(c.entityId, proposalImagePath(p.id, file));
  }
  const project =
    files.size === 0
      ? preview
      : {
          ...preview,
          images: preview.images.map((image) => {
            const file = files.get(image.id);
            return file === undefined || image.file === file ? image : { ...image, file };
          }),
        };
  displayCache.set(preview, { proposal: p, project });
  return project;
}
