import {
  MIN_STORED_MARKING_SIZE,
  containsRect,
  containsRectApprox,
  imageCanvasRect,
  imagePixelRect,
  isIntegerRect,
  rectsOverlap,
} from './geometry';
import { tableRows } from './refs';
import type { Entry, Perspective, Project } from './types';

export type InvariantCode =
  | 'duplicate-id'
  | 'duplicate-file'
  | 'container-content'
  | 'images-overlap'
  | 'missing-image'
  | 'missing-parent'
  | 'missing-marking'
  | 'missing-layer'
  | 'rect-not-integer'
  | 'rect-too-small'
  | 'rect-out-of-image'
  | 'parent-other-image'
  | 'rect-outside-parent'
  | 'hierarchy-cycle'
  | 'container-parent-missing'
  | 'container-parent-not-canvas'
  | 'container-outside-parent'
  | 'floating-in-container'
  | 'parent-floating'
  | 'arrow-endpoint-missing'
  | 'arrow-self'
  | 'missing-parent-annotation'
  | 'annotation-parent-other-marking'
  | 'annotation-parent-same-layer'
  | 'annotation-cycle'
  | 'empty-role'
  | 'role-without-owner'
  | 'empty-key'
  | 'duplicate-key'
  | 'duplicate-spec-file'
  | 'duplicate-entry-id'
  | 'duplicate-row-id'
  | 'perspective-root-missing'
  | 'perspective-root-not-root'
  | 'perspective-root-duplicate'
  | 'perspective-layer-missing'
  | 'perspective-duplicate-name'
  | 'arrival-root-missing'
  | 'arrival-root-not-root'
  | 'arrival-duplicate';

/** Tipo do item com problema. */
export type InvariantEntity =
  | 'image'
  | 'marking'
  | 'arrow'
  | 'annotation'
  | 'layer'
  | 'spec'
  | 'perspective'
  | 'arrival';

export interface InvariantIssue {
  readonly code: InvariantCode;
  readonly entity: InvariantEntity;
  /** Id do item com problema. */
  readonly id: string;
  /** Nome do item, quando houver (na imagem sem rótulo, o arquivo). */
  readonly name?: string;
  /** Id do outro item envolvido, quando houver (ex.: a imagem sobreposta). */
  readonly otherId?: string;
}

/** O que `validateProject` lê de cada item para identificar o problema. */
interface Named {
  readonly id: string;
  readonly name?: string | null;
  readonly file?: string | null;
}

/** Nome para a lista de problemas: o da imagem sem rótulo é o arquivo; especialização não tem. */
function itemName(entity: InvariantEntity, item: Named): string | null {
  if (entity === 'spec') return null;
  if (entity === 'image') return item.name ?? item.file ?? null;
  return item.name ?? null;
}

export type EntryIssue = 'empty-key' | 'duplicate-key' | null;

/** Erro de cada par, na mesma ordem de `entries`. Usado também pelo editor (erro inline). */
export function validateEntries<T extends Pick<Entry, 'key'>>(
  entries: readonly T[],
): EntryIssue[] {
  const seen = new Set<string>();
  return entries.map(({ key }) => {
    const trimmed = key.trim();
    if (trimmed === '') return 'empty-key';
    if (seen.has(trimmed)) return 'duplicate-key';
    seen.add(trimmed);
    return null;
  });
}

/** Nome de perspectiva para comparar: sem espaços nas pontas e sem diferença de caixa. */
export function perspectiveNameKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Raízes do projeto (v16): o container sem pai e a marcação flutuante ou do canvas sem pai.
 * Só estas aparecem numa perspectiva (`items`) ou numa chegada (`arrivals`).
 */
function rootIds(p: Project): { all: ReadonlySet<string>; roots: ReadonlySet<string> } {
  const all = new Set<string>();
  const roots = new Set<string>();
  for (const c of p.containers) {
    all.add(c.id);
    if (c.parentId === null) roots.add(c.id);
  }
  for (const m of p.markings) {
    all.add(m.id);
    if (m.floating || (m.containerId === null && m.parentId === null)) roots.add(m.id);
  }
  return { all, roots };
}

/** Código da raiz inválida (inexistente ou que não é raiz), ou `null` se a raiz serve. */
function rootProblem(
  root: string,
  ids: ReturnType<typeof rootIds>,
): 'missing' | 'not-root' | null {
  if (!ids.all.has(root)) return 'missing';
  return ids.roots.has(root) ? null : 'not-root';
}

type Report = (code: InvariantCode, item: Named, otherId?: string) => void;

/** Camadas escondidas e itens (raiz existente, que é raiz e sem repetir) de uma perspectiva. */
function validatePerspectiveContent(
  x: Perspective,
  layerIds: ReadonlySet<string>,
  ids: ReturnType<typeof rootIds>,
  report: Report,
): void {
  for (const layerId of x.hiddenLayers) {
    if (!layerIds.has(layerId)) report('perspective-layer-missing', x, layerId);
  }
  const seen = new Set<string>();
  for (const { root } of x.items) {
    const problem = rootProblem(root, ids);
    if (problem !== null) report(`perspective-root-${problem}`, x, root);
    else if (seen.has(root)) report('perspective-root-duplicate', x, root);
    seen.add(root);
  }
}

/** A chegada aponta para uma raiz existente, e cada raiz tem no máximo uma. */
function validateArrivals(
  p: Project,
  ids: ReturnType<typeof rootIds>,
  report: Report,
): void {
  const arrived = new Set<string>();
  for (const a of p.arrivals) {
    const named = { id: a.root, name: a.fromName };
    const problem = rootProblem(a.root, ids);
    if (problem !== null) report(`arrival-root-${problem}`, named);
    else if (arrived.has(a.root)) report('arrival-duplicate', named);
    arrived.add(a.root);
  }
}

/**
 * Invariantes das perspectivas e das chegadas (v16). O item com problema é a perspectiva (id e
 * nome dela) com a raiz ou a camada em `otherId`; a chegada se identifica pela raiz (`id`).
 * Mapas e conjuntos: nada de busca em laço.
 */
function validatePerspectives(p: Project, perspective: Report, arrival: Report): void {
  const ids = rootIds(p);
  const layerIds = new Set(p.layers.map((l) => l.id));
  const perspectiveIds = new Set<string>();
  const names = new Map<string, string>();
  for (const x of p.perspectives) {
    if (perspectiveIds.has(x.id)) perspective('duplicate-id', x);
    perspectiveIds.add(x.id);
    const key = perspectiveNameKey(x.name);
    const first = names.get(key);
    if (first !== undefined) perspective('perspective-duplicate-name', x, first);
    else names.set(key, x.id);
    validatePerspectiveContent(x, layerIds, ids, perspective);
  }
  validateArrivals(p, ids, arrival);
}

/**
 * Checa os invariantes que o schema zod não expressa. Lista vazia = projeto válido.
 * Ver docs/FORMAT.md, "Regras de validade". A seta (v13) tem as suas:
 * `arrow-endpoint-missing` (ponta que não é uma marcação existente) e `arrow-self`. As regras das especializações (camada × tipo,
 * `allowedChildren`, referências) não bloqueiam a abertura: viram pendências
 * (`getAnnotationIssues`). Só a unicidade dos ids de tupla e de linha fica aqui.
 */
export function validateProject(p: Project): InvariantIssue[] {
  const issues: InvariantIssue[] = [];
  // Entidade e nome só são montados quando há problema: o caminho feliz não paga nada.
  const issue =
    (entity: InvariantEntity) => (code: InvariantCode, item: Named, otherId?: string) => {
      const name = itemName(entity, item);
      issues.push({
        code,
        entity,
        id: item.id,
        ...(name === null ? {} : { name }),
        ...(otherId === undefined ? {} : { otherId }),
      });
    };
  const spec = issue('spec');
  const layer = issue('layer');
  const imageIssue = issue('image');
  const marking = issue('marking');
  const arrow = issue('arrow');
  const annotation = issue('annotation');

  validatePerspectives(p, issue('perspective'), issue('arrival'));

  const lists = [
    [p.specializations, spec],
    [p.layers, layer],
    [p.containers, imageIssue],
    [p.markings, marking],
    [p.annotations, annotation],
  ] as const;
  for (const [list, push] of lists) {
    const ids = new Set<string>();
    for (const item of list) {
      if (ids.has(item.id)) push('duplicate-id', item);
      ids.add(item.id);
    }
  }

  // Marcações e setas dividem o espaço de ids (a anotação aponta para qualquer das duas): a
  // seta que repete o id de uma marcação, ou de outra seta, é a duplicada.
  const ownerIds = new Set(p.markings.map((m) => m.id));
  for (const a of p.arrows) {
    if (ownerIds.has(a.id)) arrow('duplicate-id', a);
    ownerIds.add(a.id);
  }

  const specFiles = new Set<string>();
  for (const s of p.specializations) {
    if (specFiles.has(s.file)) spec('duplicate-spec-file', s);
    specFiles.add(s.file);
  }

  const entryIds = new Set<string>();
  for (const a of p.annotations) {
    for (const e of a.entries) {
      if (entryIds.has(e.id)) annotation('duplicate-entry-id', a, e.id);
      entryIds.add(e.id);
    }
    for (const value of Object.values(a.values ?? {})) {
      const rowIds = new Set<string>();
      for (const row of tableRows(value)) {
        if (rowIds.has(row._id)) annotation('duplicate-row-id', a, row._id);
        rowIds.add(row._id);
      }
    }
  }

  const files = new Set<string>();
  p.containers.forEach((image, i) => {
    // Container sem arquivo (sem arquivo) não disputa nome; cor e arquivo são mutuamente exclusivos.
    if (image.file !== null) {
      if (files.has(image.file)) imageIssue('duplicate-file', image);
      files.add(image.file);
    }
    if ((image.file === null) !== (image.background !== null)) {
      imageIssue('container-content', image);
    }
    const rect = imageCanvasRect(image, image.placement);
    for (const other of p.containers.slice(i + 1)) {
      if (rectsOverlap(rect, imageCanvasRect(other, other.placement))) {
        imageIssue('images-overlap', image, other.id);
      }
    }
  });

  const containers = new Map(p.containers.map((image) => [image.id, image]));
  const markings = new Map(p.markings.map((m) => [m.id, m]));
  const annotations = new Map(p.annotations.map((a) => [a.id, a]));

  for (const m of p.markings) {
    // Marcação do canvas (v13): `containerId` nulo, `rect` em unidades do canvas, sem limite.
    const image = m.containerId === null ? undefined : containers.get(m.containerId);
    if (m.containerId !== null && !image) marking('missing-image', m, m.containerId);
    if (!isIntegerRect(m.rect)) marking('rect-not-integer', m);
    if (
      m.rect.width < MIN_STORED_MARKING_SIZE ||
      m.rect.height < MIN_STORED_MARKING_SIZE
    ) {
      marking('rect-too-small', m);
    }
    if (image && !containsRect(imagePixelRect(image), m.rect)) {
      marking('rect-out-of-image', m);
    }
    // A flutuante vive no canvas, fora da árvore de pertencimento.
    if (m.floating && (m.containerId !== null || m.parentId !== null)) {
      marking('floating-in-container', m);
    }
    if (m.parentId === null) continue;
    const parent = markings.get(m.parentId);
    if (!parent) {
      marking('missing-parent', m, m.parentId);
      continue;
    }
    if (parent.floating) marking('parent-floating', m, parent.id);
    else if (parent.containerId !== m.containerId)
      marking('parent-other-image', m, parent.id);
    else if (!containsRect(parent.rect, m.rect))
      marking('rect-outside-parent', m, parent.id);
  }

  // Seta (v13): liga duas marcações existentes e diferentes (nem outra seta, nem container).
  for (const a of p.arrows) {
    if (!markings.has(a.from)) arrow('arrow-endpoint-missing', a, a.from);
    if (!markings.has(a.to)) arrow('arrow-endpoint-missing', a, a.to);
    if (a.from === a.to) arrow('arrow-self', a, a.from);
  }

  // Pai de um container (v13): uma marcação do canvas, não flutuante, que o contém inteiro.
  for (const c of p.containers) {
    if (c.parentId === null) continue;
    const parent = markings.get(c.parentId);
    if (!parent) imageIssue('container-parent-missing', c, c.parentId);
    else if (parent.containerId !== null || parent.floating) {
      imageIssue('container-parent-not-canvas', c, parent.id);
    } else if (!containsRectApprox(parent.rect, imageCanvasRect(c, c.placement))) {
      imageIssue('container-outside-parent', c, parent.id);
    }
  }

  for (const m of p.markings) {
    // Sobe a cadeia de pais; se passar de novo por um id já visto, há ciclo.
    const visited = new Set<string>([m.id]);
    let parentId = m.parentId;
    while (parentId !== null) {
      if (visited.has(parentId)) {
        marking('hierarchy-cycle', m);
        break;
      }
      visited.add(parentId);
      parentId = markings.get(parentId)?.parentId ?? null;
    }
  }

  const layerIds = new Set(p.layers.map((l) => l.id));
  for (const a of p.annotations) {
    // A dona da anotação é uma marcação ou uma seta (v13).
    if (!ownerIds.has(a.markingId)) annotation('missing-marking', a, a.markingId);
    if (!layerIds.has(a.layerId)) annotation('missing-layer', a, a.layerId);
    for (const entryIssue of validateEntries(a.entries)) {
      if (entryIssue) annotation(entryIssue, a);
    }
    if (a.parentRole === '') annotation('empty-role', a);
    if (a.parentAnnotationId === null) {
      if (a.parentRole !== null) annotation('role-without-owner', a);
      continue;
    }
    const owner = annotations.get(a.parentAnnotationId);
    if (!owner) {
      annotation('missing-parent-annotation', a, a.parentAnnotationId);
      continue;
    }
    if (owner.markingId !== a.markingId) {
      annotation('annotation-parent-other-marking', a, owner.id);
    }
    // Só a livre: a tipada com dona da mesma camada que o tipo não aceita é a pendência `owner-not-allowed`.
    if (owner.layerId === a.layerId && a.type === null)
      annotation('annotation-parent-same-layer', a, owner.id);
  }

  for (const a of p.annotations) {
    // Mesma detecção de ciclo usada na hierarquia de marcações.
    const visited = new Set<string>([a.id]);
    let ownerId = a.parentAnnotationId;
    while (ownerId !== null) {
      if (visited.has(ownerId)) {
        annotation('annotation-cycle', a);
        break;
      }
      visited.add(ownerId);
      ownerId = annotations.get(ownerId)?.parentAnnotationId ?? null;
    }
  }

  return issues;
}
