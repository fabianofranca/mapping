import {
  drawingModesOf,
  effectiveDirection,
  effectiveDrawingMode,
  arrowsOf,
  markingComponent,
  siblingPosition,
  annotationShortLabel,
  getBacklinks,
  type AnnotationRef,
  getLinkedAnnotations,
  linkedByRole,
  roleLabelOf,
  projectDocRepos,
  docRepoOf,
  getSpec,
  isMarkingGeometryLocked,
  markingLockStates,
  projectIndex,
  projectIssues,
  platformRepoOf,
  projectPlatforms,
  refLabel,
  refPathText,
  refsOf,
  resolveRef,
  specLayerOf,
  typeOfAnnotation,
  ancestorsOf,
  type Annotation,
  type Arrow,
  type AnnotationIssue,
  type Layer,
  type Marking,
  type Project,
  type ProjectContainer,
  type ResolvedRef,
} from '../src/model';
import { memoByProject } from '../src/model/projectIndex';
import { annotationCode, assertPlatform, CODE_HINT, type CodeContext } from './codeViews';
import { ToolError } from './errors';
import { Refs } from './items';
import {
  arrivalsView,
  perspectivesOfArrow,
  perspectiveSummaries,
  rootInfo,
} from './perspectives';
import { resolveProjectFile, type Roots } from './paths';
import type { LoadedProject } from './projects';

// JSON views of the read tools. Everything they return carries the `mapping://` references
// of the items, so the agent can pass from one tool to another without knowing ids.

type Json = Record<string, unknown>;

/** Maximum number of pending items and children listed per response (the total always comes). */
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

/**
 * When the marking draws a component (first own typed annotation with a component
 * in the catalog): `component` (`specId/typeId`) and `minSize`, the minimum size of the rectangle.
 */
function componentInfo(refs: Refs, marking: Marking): Json {
  const drawn = markingComponent(refs.project, refs.loaded.catalog, marking.id);
  if (drawn === null) return {};
  const { minSize } = drawn.component;
  return {
    component: `${drawn.specId}/${drawn.typeId}`,
    ...(minSize ? { minSize: { width: minSize.width, height: minSize.height } } : {}),
  };
}

/**
 * Drawing mode that applies in a space (`containerId` null = the canvas): the container's, else the
 * project's, else the first mode the applied specializations declare; `null` with no mode.
 */
export function effectiveModeOf(p: Project, containerId: string | null): string | null {
  const fixed = effectiveDrawingMode(p, containerId);
  if (fixed !== undefined) return fixed;
  return drawingModesOf(p.specializations.map((s) => s.spec?.tokens))[0] ?? null;
}

/**
 * Position of each marking among its siblings (same parent and same space, in array order),
 * built once per project version: a list with hundreds of rows does not scan the siblings
 * for each one.
 */
const siblingIndexes = memoByProject((p: Project): ReadonlyMap<string, number> => {
  const counters = new Map<string, number>();
  const indexes = new Map<string, number>();
  for (const m of p.markings) {
    const key = `${m.parentId ?? ''}|${m.containerId ?? ''}`;
    const next = counters.get(key) ?? 0;
    indexes.set(m.id, next);
    counters.set(key, next + 1);
  }
  return indexes;
});

/** Marking in a compact row (lists and children). */
export function markingRow(refs: Refs, marking: Marking): Json {
  const index = projectIndex(refs.project);
  const own = index.annotationsByMarking.get(marking.id) ?? [];
  const issues = projectIssues(refs.project);
  const incomplete = own.filter((a) => issues.has(a.id)).length;
  return {
    ref: refs.ref('m', marking.id),
    name: marking.name,
    container: refs.imageLabel(marking.containerId),
    space: marking.containerId === null ? 'canvas' : 'container',
    effectiveDrawingMode: effectiveModeOf(refs.project, marking.containerId),
    floating: marking.floating,
    parent: marking.parentId === null ? null : refs.ref('m', marking.parentId),
    rect: rectOf(marking),
    // Position among the siblings (0 = first, drawn at the bottom).
    order: siblingIndexes(refs.project).get(marking.id) ?? 0,
    ...componentInfo(refs, marking),
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
    marking: refs.ref('m', target.annotation.markingId),
  };
  switch (target.kind) {
    case 'annotation':
      return { ...base, kind: 'annotation' };
    case 'entry':
      return { ...base, kind: 'entry', entryId: target.entry.id, key: target.entry.key };
    case 'row':
      return { ...base, kind: 'row', key: target.key, rowId: target.row._id };
    case 'field':
      return { ...base, kind: 'field', key: target.key };
  }
}

/** `row` (0-based) and `column` of a reference; `null` in both when it is in a field and not in a cell. */
function refCell(link: Pick<AnnotationRef, 'rowIndex' | 'column'>): {
  row: number | null;
  column: string | null;
} {
  return { row: link.rowIndex ?? null, column: link.column ?? null };
}

/** What points to the annotation: one entry per source (in project order), with the `fields` that point. */
function backlinksView(refs: Refs, annotation: Annotation): Json[] {
  const p = refs.project;
  const bySource = new Map<string, { source: Annotation; fields: Json[] }>();
  for (const link of getBacklinks(p, annotation.id)) {
    const field = {
      field: refPathText(link),
      ...refCell(link),
      to: refLabel(p, link.ref),
    };
    const entry = bySource.get(link.source.id);
    if (entry) entry.fields.push(field);
    else bySource.set(link.source.id, { source: link.source, fields: [field] });
  }
  return [...bySource.values()].map(({ source, fields }) => ({
    from: refs.ref('a', source.id),
    fromLabel: annotationShortLabel(p, source),
    fromMarking: refs.ref('m', source.markingId),
    fields,
  }));
}

/** The annotation with everything that describes it: content, links, outgoing references, backlinks and pending items. */
export function annotationView(
  refs: Refs,
  annotation: Annotation,
  options: {
    readonly withMarking?: boolean;
    /** `code` of the type (`annotationCode`, with the `path` already resolved); without it, the annotation carries no `code`. */
    readonly code?: Json | null;
  } = {},
): Json {
  const p = refs.project;
  const layer = projectIndex(p).layers.get(annotation.layerId);
  const resolvedType = typeOfAnnotation(p, annotation);
  const issues = projectIssues(p).get(annotation.id) ?? [];

  const outgoing = refsOf(p, annotation).map((link) => {
    const { ref } = link;
    // In a cell of a `ref` column, the field is `table[2].column`.
    const field = refPathText(link);
    const target = resolveRef(p, ref);
    const cell = refCell(link);
    return target
      ? { field, ...cell, to: refLabel(p, ref), target: refTarget(refs, target) }
      : { field, ...cell, broken: true, ref };
  });
  const backlinks = backlinksView(refs, annotation);
  const linked = getLinkedAnnotations(p, annotation.id).map((a) => refs.ref('a', a.id));
  const byRole = linkedByRoleView(refs, annotation);
  const roleName = roleLabelOf(p, annotation);
  const code = annotation.type ? (options.code ?? null) : null;

  return {
    ref: refs.ref('a', annotation.id),
    kind: annotation.type ? 'typed' : 'free',
    name: annotation.name,
    title: annotationShortLabel(p, annotation),
    layer: layer ? { id: layer.id, name: layer.name } : { id: annotation.layerId },
    ...(options.withMarking ? { marking: refs.ref('m', annotation.markingId) } : {}),
    owner:
      annotation.parentAnnotationId === null
        ? null
        : refs.ref('a', annotation.parentAnnotationId),
    ...(annotation.parentRole === null
      ? {}
      : { parentRole: annotation.parentRole, roleName }),
    ...(linked.length > 0 ? { linked } : {}),
    ...(byRole ? { linkedByRole: byRole } : {}),
    ...(annotation.type
      ? {
          type: {
            specId: annotation.type.specId,
            typeId: annotation.type.typeId,
            name: resolvedType?.type.name ?? null,
          },
          values: annotation.values,
          ...(code ? { code } : {}),
        }
      : { entries: annotation.entries }),
    ...(outgoing.length > 0 ? { refs: outgoing } : {}),
    ...(backlinks.length > 0 ? { backlinks } : {}),
    ...(issues.length > 0 ? { issues: issues.map(issueView) } : {}),
  };
}

/**
 * The children of an owner with `childRoles` grouped by role (in role order), plus those that
 * have no role or a role the owner does not offer (`unassigned`). `null` for an owner without
 * roles: there the agent reads `linked`. It is the model's resolver, not a raw list.
 */
function linkedByRoleView(refs: Refs, owner: Annotation): Json | null {
  const grouped = linkedByRole(refs.project, owner);
  if (!grouped) return null;
  const refsOf = (items: readonly Annotation[]) => items.map((a) => refs.ref('a', a.id));
  return {
    label: grouped.label,
    roles: grouped.rows.map((row) => ({
      id: row.role.id,
      name: row.role.name,
      linked: refsOf(row.items),
    })),
    unassigned: refsOf(grouped.unassigned),
  };
}

interface LinkNode {
  readonly ref: string;
  readonly title: string;
  readonly layer: string;
  readonly parentRole?: string;
  readonly linked?: LinkNode[];
}

/** Link tree of the marking's annotations: owner -> linked (from the same layer or others). */
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
      ref: refs.ref('a', a.id),
      title: annotationShortLabel(p, a),
      layer: index.layers.get(a.layerId)?.name ?? a.layerId,
      ...(a.parentRole === null ? {} : { parentRole: a.parentRole }),
      ...(children.length > 0 ? { linked: children } : {}),
    };
  };
  return own.filter((a) => a.parentAnnotationId === null).map(node);
}

/** The marking's anchor with `to` as a reference (the fields it does not state are absent); `null` without an anchor. */
function anchorView(refs: Refs, marking: Marking): Json | null {
  const { anchor } = marking;
  if (anchor == null) return null;
  return {
    to: refs.ref('m', anchor.to),
    ...(anchor.side === undefined ? {} : { side: anchor.side }),
    ...(anchor.align === undefined ? {} : { align: anchor.align }),
    ...(anchor.offset === undefined ? {} : { offset: anchor.offset }),
  };
}

/** Everything about the marking (`get_marking`). With `platform`, `code` shows only that platform. */
export async function markingView(
  ctx: CodeContext,
  marking: Marking,
  platform?: string,
): Promise<Json> {
  const { refs } = ctx;
  if (platform !== undefined) assertPlatform(refs, platform);
  const p = refs.project;
  const index = projectIndex(p);
  const image =
    marking.containerId === null ? null : index.containers.get(marking.containerId);
  const own = index.annotationsByMarking.get(marking.id) ?? [];
  const ancestors = ancestorsOf(p, marking.id).reverse();
  const lockState = markingLockStates(p).get(marking.id) ?? null;

  const codes = new Map<string, Json | null>(
    await Promise.all(
      own.map(async (a) => [a.id, await annotationCode(ctx, a, platform)] as const),
    ),
  );
  const view = (a: Annotation) =>
    annotationView(refs, a, {
      code: codes.get(a.id) ?? null,
    });
  const layers = p.layers.flatMap((layer) => {
    const mine = own.filter((a) => a.layerId === layer.id);
    if (mine.length === 0) return [];
    return [{ layer: { id: layer.id, name: layer.name }, annotations: mine.map(view) }];
  });

  const issues = projectIssues(p);
  const tree = linkTree(refs, own);
  const children = index.children.get(marking.id) ?? [];
  const childRows = children.slice(0, LIST_LIMIT).map((c) => ({
    ref: refs.ref('m', c.id),
    name: c.name,
    rect: rectOf(c),
  }));
  const memberContainers = index.containersByParent.get(marking.id) ?? [];
  const attachedArrows = arrowsOf(p, marking.id);
  return {
    ref: refs.ref('m', marking.id),
    id: marking.id,
    name: marking.name,
    path: [
      image
        ? { ref: refs.ref('i', image.id), name: refs.imageLabel(image.id) }
        : // Canvas marking: the space segment is "Canvas", with no reference.
          { ref: null, name: refs.imageLabel(null) },
      ...[...ancestors, marking].map((m) => ({
        ref: refs.ref('m', m.id),
        name: refs.markingName(m.id),
      })),
    ],
    container: image ? containerSummary(refs, image) : null,
    space: marking.containerId === null ? 'canvas' : 'container',
    floating: marking.floating,
    ...rootInfo(refs, marking.id),
    rect: rectOf(marking),
    // Position among the siblings (same parent and same space) and how many there are: `index` 0 = the first,
    // drawn at the bottom.
    order: siblingPosition(p, marking.id),
    ...componentInfo(refs, marking),
    lock: {
      locked: marking.locked,
      geometryLocked: isMarkingGeometryLocked(p, marking.id),
      source: lockState,
    },
    needsReview: marking.needsReview,
    parent: marking.parentId === null ? null : refs.ref('m', marking.parentId),
    // Anchor (v20): the marking this one is attached to and those attached to it.
    anchor: anchorView(refs, marking),
    anchoredBy: (index.anchoredBy.get(marking.id) ?? []).map((m) => refs.ref('m', m.id)),
    children: childRows,
    ...(children.length > LIST_LIMIT ? { childrenTotal: children.length } : {}),
    // Who has this marking as parent (derived from the geometry): markings in the same space and,
    // on a canvas marking, the containers it contains.
    members: {
      markings: childRows,
      containers: memberContainers.slice(0, LIST_LIMIT).map((c) => ({
        ref: refs.ref('i', c.id),
        name: c.name,
      })),
      ...(children.length > LIST_LIMIT ? { markingsTotal: children.length } : {}),
      ...(memberContainers.length > LIST_LIMIT
        ? { containersTotal: memberContainers.length }
        : {}),
    },
    ...(platform !== undefined ? { platform } : {}),
    layers,
    ...(attachedArrows.outgoing.length + attachedArrows.incoming.length > 0
      ? {
          arrows: {
            outgoing: attachedArrows.outgoing.map((a) => arrowRow(refs, a, 'to')),
            incoming: attachedArrows.incoming.map((a) => arrowRow(refs, a, 'from')),
          },
        }
      : {}),
    ...(tree ? { linkTree: tree } : {}),
    incompleteAnnotations: own.filter((a) => issues.has(a.id)).length,
  };
}

/** The other end of an arrow: reference, name and readable path. */
function arrowEnd(refs: Refs, markingId: string): Json {
  const exists = projectIndex(refs.project).markings.has(markingId);
  return {
    ref: refs.ref('m', markingId),
    name: exists ? refs.markingName(markingId) : null,
    path: exists ? refs.markingPath(markingId) : [],
  };
}

/** Arrow in a row, seen from one of its ends: `other` says which is the other (`to` on outgoing ones). */
function arrowRow(refs: Refs, arrow: Arrow, other: 'from' | 'to'): Json {
  return {
    ref: refs.ref('m', arrow.id),
    id: arrow.id,
    [other]: arrowEnd(refs, arrow[other]),
    name: arrow.name,
    style: arrow.style,
    locked: arrow.locked,
  };
}

/**
 * Everything about the arrow (`get_marking` with its id): `kind: "arrow"`, the two ends, style,
 * lock and the annotations by layer, as on a marking. It does not carry `points` (the route is the person's).
 */
export async function arrowView(
  ctx: CodeContext,
  arrow: Arrow,
  platform?: string,
): Promise<Json> {
  const { refs } = ctx;
  if (platform !== undefined) assertPlatform(refs, platform);
  const p = refs.project;
  const index = projectIndex(p);
  const own = index.annotationsByMarking.get(arrow.id) ?? [];
  const codes = new Map<string, Json | null>(
    await Promise.all(
      own.map(async (a) => [a.id, await annotationCode(ctx, a, platform)] as const),
    ),
  );
  const layers = p.layers.flatMap((layer) => {
    const mine = own.filter((a) => a.layerId === layer.id);
    if (mine.length === 0) return [];
    return [
      {
        layer: { id: layer.id, name: layer.name },
        annotations: mine.map((a) =>
          annotationView(refs, a, { code: codes.get(a.id) ?? null }),
        ),
      },
    ];
  });
  const issues = projectIssues(p);
  const tree = linkTree(refs, own);
  return {
    kind: 'arrow',
    ref: refs.ref('m', arrow.id),
    id: arrow.id,
    name: arrow.name,
    path: [{ ref: refs.ref('m', arrow.id), name: refs.arrowName(arrow.id) }],
    from: arrowEnd(refs, arrow.from),
    to: arrowEnd(refs, arrow.to),
    style: arrow.style,
    lock: { locked: arrow.locked },
    perspectives: perspectivesOfArrow(p, arrow.id),
    ...(platform !== undefined ? { platform } : {}),
    layers,
    ...(tree ? { linkTree: tree } : {}),
    incompleteAnnotations: own.filter((a) => issues.has(a.id)).length,
  };
}

function containerSummary(refs: Refs, image: ProjectContainer): Json {
  return {
    ref: refs.ref('i', image.id),
    name: image.name,
    file: image.file,
    // Container with only a background: `file` is `null` and `background` carries the color.
    background: image.background,
    width: image.width,
    height: image.height,
    locked: image.locked,
    // Drawing mode the container fixes (`null` = follows the project) and the one that applies in it.
    drawingMode: image.drawingMode ?? null,
    effectiveDrawingMode: effectiveModeOf(refs.project, image.id),
    // Reading direction the container fixes (`null` = follows the project) and the one that applies in it.
    direction: image.direction ?? null,
    effectiveDirection: effectiveDirection(refs.project, image.id),
    // Image pixels per component unit (1 = the default, also when absent).
    density: image.density ?? 1,
    // Canvas marking that contains the container (derived from the geometry), or `null`.
    parent: image.parentId === null ? null : refs.ref('m', image.parentId),
  };
}

/** Container data (`get_container`); checks that the file exists inside the roots. */
export async function containerView(
  roots: Roots,
  refs: Refs,
  image: ProjectContainer,
): Promise<Json> {
  const p = refs.project;
  const index = projectIndex(p);
  const absolute =
    image.file === null
      ? null
      : await resolveProjectFile(roots, refs.loaded.location.dir, image.file);
  const topLevel = (index.children.get(null) ?? []).filter(
    (m) => m.containerId === image.id,
  );
  return {
    ...containerSummary(refs, image),
    // A container without a file has no file: nothing to check.
    exists: image.file === null ? true : absolute !== null,
    path: absolute,
    placement: image.placement,
    ...rootInfo(refs, image.id),
    markingColor: image.markingColor,
    markings: p.markings.filter((m) => m.containerId === image.id).length,
    topLevelMarkings: topLevel.slice(0, LIST_LIMIT).map((m) => markingRow(refs, m)),
    ...(topLevel.length > LIST_LIMIT ? { topLevelMarkingsTotal: topLevel.length } : {}),
  };
}

/** Annotation data (`get_annotation`). */
export async function annotationDetail(
  ctx: CodeContext,
  annotation: Annotation,
): Promise<Json> {
  return annotationView(ctx.refs, annotation, {
    withMarking: true,
    code: await annotationCode(ctx, annotation),
  });
}

/** Row of `list_projects`. */
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
      containers: project.containers.length,
      markings: project.markings.length,
      canvasMarkings: project.markings.filter((m) => m.containerId === null).length,
      floatingMarkings: project.markings.filter((m) => m.floating).length,
      arrows: project.arrows.length,
      annotations: project.annotations.length,
      layers: project.layers.length,
    },
    specializations: project.specializations.map((s) => ({
      id: s.id,
      version: s.version,
    })),
  };
}

/** Project summary (`get_project`). */
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
      marking: refs.ref('m', a.markingId),
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
  const markingsByContainer = new Map<string, number>();
  for (const m of p.markings) {
    if (m.containerId === null) continue;
    markingsByContainer.set(
      m.containerId,
      (markingsByContainer.get(m.containerId) ?? 0) + 1,
    );
  }
  const warnings = new Map(loaded.specWarnings.map((w) => [w.specId, w]));

  const platforms = projectPlatforms(p).map((platform) => ({
    id: platform.id,
    name: platform.name,
    language: platform.language,
    specs: platform.specIds,
    repos: platform.repos.map((r) => ({ specId: r.specId, ...r.repo })),
    localPath: platformRepoOf(p, platform.id)?.localPath ?? null,
  }));

  return {
    ...projectSummary(loaded),
    createdAt: p.project.createdAt,
    // The project's drawing mode (`null` = the first mode of each specialization).
    drawingMode: p.drawingMode ?? null,
    // The project's reading direction: `ltr` when none is saved (it is what applies).
    direction: p.direction ?? 'ltr',
    ...(loaded.migratedFrom !== null ? { migratedFrom: loaded.migratedFrom } : {}),
    containers: p.containers.map((image) => ({
      ...containerSummary(refs, image),
      markings: markingsByContainer.get(image.id) ?? 0,
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
    platforms,
    ...(platforms.length > 0 ? { codeHint: CODE_HINT } : {}),
    platformRepos: p.platformRepos,
    docRepos: projectDocRepos(p).map((r) => ({
      id: r.id,
      specs: r.specIds,
      repos: r.repos.map((x) => ({ specId: x.specId, ...x.repo })),
      localPath: docRepoOf(p, r.id)?.localPath ?? null,
    })),
    perspectives: perspectiveSummaries(refs),
    arrivals: arrivalsView(refs),
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

/** An applied specialization, with the full content (`get_specialization`). */
export function specializationView(refs: Refs, specId: string): Json {
  const p = refs.project;
  const applied = projectIndex(p).specializations.get(specId);
  if (!applied) {
    throw new ToolError('not-found', `specialization not applied: ${specId}`, {
      applied: p.specializations.map((s) => s.id),
    });
  }
  const spec = getSpec(p, specId);
  const warning = refs.loaded.specWarnings.find((w) => w.specId === specId);
  if (!spec) {
    throw new ToolError(
      'spec-unavailable',
      `the specialization copy is ${warning?.problem === 'missing' ? 'missing' : 'invalid'}: ${applied.file}`,
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
    ...(spec.platforms && spec.platforms.length > 0 ? { codeHint: CODE_HINT } : {}),
    spec,
  };
}
