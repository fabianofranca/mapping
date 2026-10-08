import {
  annotationShortLabel,
  getBacklinks,
  getLinkedAnnotations,
  getSpec,
  isMarkingGeometryLocked,
  markingLockStates,
  projectIndex,
  projectIssues,
  refLabel,
  refsOf,
  resolveRef,
  specLayerOf,
  typeOfAnnotation,
  ancestorsOf,
  type Annotation,
  type AnnotationIssue,
  type Layer,
  type Marking,
  type Project,
  type ProjectImage,
  type ResolvedRef,
} from '../src/model';
import { ToolError } from './errors';
import { Refs } from './items';
import { resolveProjectFile, type Roots } from './paths';
import type { LoadedProject } from './projects';

// Visões em JSON das tools de leitura. Tudo o que devolvem traz as referências `mapping://`
// dos itens, para o agente passar de uma tool à outra sem conhecer ids.

type Json = Record<string, unknown>;

/** Máximo de pendências e de filhas listadas por resposta (o total vem sempre). */
const LIST_LIMIT = 50;

function rectOf(m: Marking): Json {
  const { x, y, width, height } = m.rect;
  return { x, y, width, height };
}

function layerView(project: Project, layer: Layer): Json {
  const specLayer = specLayerOf(project, layer);
  return {
    id: layer.id,
    name: layer.name,
    color: layer.color,
    spec: layer.spec
      ? {
          specId: layer.spec.specId,
          layerId: layer.spec.layerId,
          found: specLayer !== null,
        }
      : null,
  };
}

/** Marcação numa linha compacta (listas e filhas). */
export function markingRow(refs: Refs, marking: Marking): Json {
  const index = projectIndex(refs.project);
  const own = index.annotationsByMarking.get(marking.id) ?? [];
  const issues = projectIssues(refs.project);
  const incomplete = own.filter((a) => issues.has(a.id)).length;
  return {
    ref: refs.ref('m', marking.id),
    name: marking.name,
    image: refs.imageLabel(marking.imageId),
    parent: marking.parentId === null ? null : refs.bare('m', marking.parentId),
    rect: rectOf(marking),
    locked: marking.locked,
    needsReview: marking.needsReview,
    annotations: own.length,
    ...(incomplete > 0 ? { incomplete } : {}),
  };
}

function issueView(issue: AnnotationIssue): Json {
  return {
    code: issue.code,
    ...(issue.key !== undefined ? { key: issue.key } : {}),
    ...(issue.rowId !== undefined ? { rowId: issue.rowId } : {}),
    ...(issue.column !== undefined ? { column: issue.column } : {}),
  };
}

function refTarget(refs: Refs, target: ResolvedRef): Json {
  const base = {
    annotation: refs.ref('a', target.annotation.id),
    marking: refs.bare('m', target.annotation.markingId),
  };
  switch (target.kind) {
    case 'entry':
      return { ...base, kind: 'entry', entryId: target.entry.id, key: target.entry.key };
    case 'row':
      return { ...base, kind: 'row', key: target.key, rowId: target.row._id };
    case 'field':
      return { ...base, kind: 'field', key: target.key };
  }
}

/** A anotação com tudo o que a descreve: conteúdo, vínculos, referências de saída, backlinks e pendências. */
export function annotationView(
  refs: Refs,
  annotation: Annotation,
  options: { readonly withMarking?: boolean } = {},
): Json {
  const p = refs.project;
  const layer = projectIndex(p).layers.get(annotation.layerId);
  const resolvedType = typeOfAnnotation(p, annotation);
  const issues = projectIssues(p).get(annotation.id) ?? [];

  const outgoing = refsOf(p, annotation).map(({ key, ref }) => {
    const target = resolveRef(p, ref);
    return target
      ? { field: key, to: refLabel(p, ref), target: refTarget(refs, target) }
      : { field: key, broken: true, ref };
  });
  const backlinks = getBacklinks(p, annotation.id).map((link) => ({
    from: refs.ref('a', link.source.id),
    fromLabel: annotationShortLabel(p, link.source),
    fromMarking: refs.bare('m', link.source.markingId),
    field: link.key,
    to: refLabel(p, link.ref),
  }));
  const linked = getLinkedAnnotations(p, annotation.id).map((a) => refs.bare('a', a.id));

  return {
    ref: refs.ref('a', annotation.id),
    kind: annotation.type ? 'typed' : 'free',
    name: annotation.name,
    title: annotationShortLabel(p, annotation),
    layer: layer ? { id: layer.id, name: layer.name } : { id: annotation.layerId },
    ...(options.withMarking ? { marking: refs.ref('m', annotation.markingId) } : {}),
    inherit: annotation.inherit,
    owner:
      annotation.parentAnnotationId === null
        ? null
        : refs.bare('a', annotation.parentAnnotationId),
    ...(linked.length > 0 ? { linked } : {}),
    ...(annotation.type
      ? {
          type: {
            specId: annotation.type.specId,
            typeId: annotation.type.typeId,
            name: resolvedType?.type.name ?? null,
          },
          values: annotation.values,
        }
      : { entries: annotation.entries }),
    ...(outgoing.length > 0 ? { refs: outgoing } : {}),
    ...(backlinks.length > 0 ? { backlinks } : {}),
    ...(issues.length > 0 ? { issues: issues.map(issueView) } : {}),
  };
}

interface LinkNode {
  readonly ref: string;
  readonly title: string;
  readonly layer: string;
  readonly linked?: LinkNode[];
}

/** Árvore de vínculos das anotações da marcação: dona → vinculadas (podem estar em outras camadas). */
function linkTree(refs: Refs, own: readonly Annotation[]): LinkNode[] | null {
  const p = refs.project;
  const index = projectIndex(p);
  if (!own.some((a) => a.parentAnnotationId !== null)) return null;
  const seen = new Set<string>();
  const node = (a: Annotation): LinkNode => {
    seen.add(a.id);
    const children = (index.annotationsByOwner.get(a.id) ?? [])
      .filter((c) => !seen.has(c.id))
      .map(node);
    return {
      ref: refs.bare('a', a.id),
      title: annotationShortLabel(p, a),
      layer: index.layers.get(a.layerId)?.name ?? a.layerId,
      ...(children.length > 0 ? { linked: children } : {}),
    };
  };
  return own.filter((a) => a.parentAnnotationId === null).map(node);
}

/** Tudo sobre a marcação (`get_marking`). */
export function markingView(refs: Refs, marking: Marking): Json {
  const p = refs.project;
  const index = projectIndex(p);
  const image = index.images.get(marking.imageId);
  const own = index.annotationsByMarking.get(marking.id) ?? [];
  const ancestors = ancestorsOf(p, marking.id).reverse();
  const lockState = markingLockStates(p).get(marking.id) ?? null;

  const inheritedBy = new Map<string, { source: Marking; annotation: Annotation }[]>();
  for (const source of ancestors) {
    for (const annotation of index.annotationsByMarking.get(source.id) ?? []) {
      if (!annotation.inherit) continue;
      const list = inheritedBy.get(annotation.layerId) ?? [];
      list.push({ source, annotation });
      inheritedBy.set(annotation.layerId, list);
    }
  }
  const layers = p.layers.flatMap((layer) => {
    const mine = own.filter((a) => a.layerId === layer.id);
    const inherited = inheritedBy.get(layer.id) ?? [];
    if (mine.length === 0 && inherited.length === 0) return [];
    return [
      {
        layer: { id: layer.id, name: layer.name },
        annotations: mine.map((a) => annotationView(refs, a)),
        ...(inherited.length > 0
          ? {
              inherited: inherited.map((i) => ({
                from: refs.ref('m', i.source.id),
                annotation: annotationView(refs, i.annotation),
              })),
            }
          : {}),
      },
    ];
  });

  const issues = projectIssues(p);
  const tree = linkTree(refs, own);
  const children = index.children.get(marking.id) ?? [];
  return {
    ref: refs.ref('m', marking.id),
    id: marking.id,
    name: marking.name,
    path: [
      image ? { ref: refs.bare('i', image.id), name: refs.imageLabel(image.id) } : null,
      ...[...ancestors, marking].map((m) => ({
        ref: refs.bare('m', m.id),
        name: refs.markingName(m.id),
      })),
    ].filter((segment) => segment !== null),
    image: image ? imageSummary(refs, image) : null,
    rect: rectOf(marking),
    lock: {
      locked: marking.locked,
      geometryLocked: isMarkingGeometryLocked(p, marking.id),
      source: lockState,
    },
    needsReview: marking.needsReview,
    parent: marking.parentId === null ? null : refs.ref('m', marking.parentId),
    children: children.slice(0, LIST_LIMIT).map((c) => ({
      ref: refs.ref('m', c.id),
      name: c.name,
      rect: rectOf(c),
    })),
    ...(children.length > LIST_LIMIT ? { childrenTotal: children.length } : {}),
    layers,
    ...(tree ? { linkTree: tree } : {}),
    incompleteAnnotations: own.filter((a) => issues.has(a.id)).length,
  };
}

function imageSummary(refs: Refs, image: ProjectImage): Json {
  return {
    ref: refs.ref('i', image.id),
    name: image.name,
    file: image.file,
    width: image.width,
    height: image.height,
    locked: image.locked,
  };
}

/** Dados da imagem (`get_image`); confere se o arquivo existe dentro das raízes. */
export async function imageView(
  roots: Roots,
  refs: Refs,
  image: ProjectImage,
): Promise<Json> {
  const p = refs.project;
  const index = projectIndex(p);
  const absolute = await resolveProjectFile(roots, refs.loaded.location.dir, image.file);
  const topLevel = (index.children.get(null) ?? []).filter((m) => m.imageId === image.id);
  return {
    ...imageSummary(refs, image),
    exists: absolute !== null,
    path: absolute,
    placement: image.placement,
    markingColor: image.markingColor,
    markings: p.markings.filter((m) => m.imageId === image.id).length,
    topLevelMarkings: topLevel.slice(0, LIST_LIMIT).map((m) => markingRow(refs, m)),
    ...(topLevel.length > LIST_LIMIT ? { topLevelMarkingsTotal: topLevel.length } : {}),
  };
}

/** Dados da anotação (`get_annotation`). */
export function annotationDetail(refs: Refs, annotation: Annotation): Json {
  return annotationView(refs, annotation, { withMarking: true });
}

/** Linha de `list_projects`. */
export function projectSummary(loaded: LoadedProject): Json {
  const { location, project } = loaded;
  return {
    name: location.name,
    path: location.path,
    dir: location.dir,
    root: location.root,
    projectName: project.project.name,
    schemaVersion: project.schemaVersion,
    revision: project.revision,
    ...(loaded.readOnly ? { readOnly: true } : {}),
    updatedAt: project.project.updatedAt,
    counts: {
      images: project.images.length,
      markings: project.markings.length,
      annotations: project.annotations.length,
      layers: project.layers.length,
    },
    specializations: project.specializations.map((s) => ({
      id: s.id,
      version: s.version,
    })),
  };
}

/** Resumo do projeto (`get_project`). */
export function projectDetail(refs: Refs): Json {
  const loaded = refs.loaded;
  const p = refs.project;
  const issues = projectIssues(p);

  const byCode: Record<string, number> = {};
  for (const list of issues.values()) {
    for (const issue of list) byCode[issue.code] = (byCode[issue.code] ?? 0) + 1;
  }
  const incomplete = p.annotations
    .filter((a) => issues.has(a.id))
    .slice(0, LIST_LIMIT)
    .map((a) => ({
      annotation: refs.ref('a', a.id),
      marking: refs.bare('m', a.markingId),
      issues: (issues.get(a.id) ?? []).map(issueView),
    }));

  const annotationsByLayer = new Map<string, number>();
  for (const a of p.annotations) {
    annotationsByLayer.set(a.layerId, (annotationsByLayer.get(a.layerId) ?? 0) + 1);
  }
  const annotationsBySpec = new Map<string, number>();
  for (const a of p.annotations) {
    if (a.type) {
      annotationsBySpec.set(
        a.type.specId,
        (annotationsBySpec.get(a.type.specId) ?? 0) + 1,
      );
    }
  }
  const markingsByImage = new Map<string, number>();
  for (const m of p.markings) {
    markingsByImage.set(m.imageId, (markingsByImage.get(m.imageId) ?? 0) + 1);
  }
  const warnings = new Map(loaded.specWarnings.map((w) => [w.specId, w]));

  return {
    ...projectSummary(loaded),
    createdAt: p.project.createdAt,
    ...(loaded.migratedFrom !== null ? { migratedFrom: loaded.migratedFrom } : {}),
    images: p.images.map((image) => ({
      ...imageSummary(refs, image),
      markings: markingsByImage.get(image.id) ?? 0,
    })),
    layers: p.layers.map((layer) => ({
      ...layerView(p, layer),
      annotations: annotationsByLayer.get(layer.id) ?? 0,
    })),
    specializations: p.specializations.map((s) => {
      const warning = warnings.get(s.id);
      return {
        id: s.id,
        name: s.spec?.name ?? null,
        version: s.version,
        file: s.file,
        available: s.spec !== null,
        ...(warning ? { problem: warning.problem } : {}),
        annotations: annotationsBySpec.get(s.id) ?? 0,
      };
    }),
    lockedMarkings: p.markings.filter((m) => m.locked).length,
    needsReview: p.markings.filter((m) => m.needsReview).length,
    issues: {
      total: issues.size,
      byCode,
      annotations: incomplete,
      ...(issues.size > LIST_LIMIT ? { truncated: true } : {}),
    },
  };
}

/** Uma especialização aplicada, com o conteúdo completo (`get_specialization`). */
export function specializationView(refs: Refs, specId: string): Json {
  const p = refs.project;
  const applied = projectIndex(p).specializations.get(specId);
  if (!applied) {
    throw new ToolError('not-found', `especialização não aplicada: ${specId}`, {
      applied: p.specializations.map((s) => s.id),
    });
  }
  const spec = getSpec(p, specId);
  const warning = refs.loaded.specWarnings.find((w) => w.specId === specId);
  if (!spec) {
    throw new ToolError(
      'spec-unavailable',
      `a cópia da especialização está ${warning?.problem === 'missing' ? 'ausente' : 'inválida'}: ${applied.file}`,
      { specId, file: applied.file, ...(warning ? { warning } : {}) },
    );
  }
  return {
    id: applied.id,
    version: applied.version,
    file: applied.file,
    ...(warning ? { warning } : {}),
    projectLayers: p.layers
      .filter((l) => l.spec?.specId === specId)
      .map((l) => ({ id: l.id, name: l.name, specLayerId: l.spec?.layerId })),
    spec,
  };
}
