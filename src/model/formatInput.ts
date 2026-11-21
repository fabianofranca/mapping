import { fail } from './errors';
import type { SpecFileFormat } from './fileFormats';
import {
  FORMAT_PLUGIN_CONTRACT,
  type FormatInput,
  type FormatInputAnchor,
  type FormatInputAnnotation,
  type FormatInputArrow,
  type FormatInputContainer,
  type FormatInputMarking,
  type FormatInputRow,
  type FormatInputSlot,
} from './formatPlugin';
import {
  formatRef,
  normalizeId,
  shortCode,
  shortCodesFor,
  type ItemKind,
} from './itemRef';
import { projectIndex } from './projectIndex';
import { formatAnyRef } from './refGrammar';
import { parseRefValue, tableRows } from './refs';
import { findSpecType } from './specLookup';
import type { Spec, SpecColumn, SpecField } from './spec';
import type {
  Annotation,
  Arrow,
  JsonValue,
  Marking,
  MarkingAnchor,
  Project,
  ProjectContainer,
  RefValue,
} from './types';

// The projection a format plugin receives (stage #1923, decision 13): a stable, versioned view of
// the project in the shape of the MCP answers, not the raw `mapping.json`. Pure and deterministic:
// the same project gives the same JSON, in the order of the project. Only what belongs to the
// format's own specialization enters. No browser APIs.

/**
 * The drawings the caller already has (`ComponentDrawings` fits): per marking, its slots and the
 * slot each child sits in. Without them no marking has a `slot`.
 */
export type FormatSlotDrawings = ReadonlyMap<
  string,
  {
    readonly slots: readonly FormatInputSlot[];
    readonly slotOf: ReadonlyMap<string, string | null>;
  }
>;

export interface FormatInputOptions {
  /** Name of the project's folder: the project segment of every reference. */
  readonly projectName: string;
  /** Scope `container`: id of the container the call is about. Scope `project` ignores it. */
  readonly target?: string;
  readonly drawings?: FormatSlotDrawings;
}

interface FoundFormat {
  readonly spec: Spec;
  readonly format: SpecFileFormat;
}

/** The declared format `<specId>/<formatId>` of an applied specialization; `not-found` otherwise. */
function findFileFormat(project: Project, ref: string): FoundFormat {
  const cut = ref.indexOf('/');
  const specId = cut < 0 ? '' : ref.slice(0, cut);
  const formatId = cut < 0 ? '' : ref.slice(cut + 1);
  const spec = projectIndex(project).specializations.get(specId)?.spec ?? null;
  const format = spec?.fileFormats?.find((f) => f.id === formatId);
  if (!spec || !format) return fail('not-found', `file format ${ref}`);
  return { spec, format };
}

/** The container of the scope `container` call: required and existing. */
function requireTarget(project: Project, target: string | undefined): string {
  if (target === undefined) {
    return fail('invalid-value', 'the format has scope container: it needs a container');
  }
  return projectIndex(project).containers.has(target)
    ? target
    : fail('not-found', `container ${target}`);
}

/** The context of one projection: the project, how it names itself and the ids that enter. */
interface Context {
  readonly project: Project;
  readonly name: string;
  readonly drawings: FormatSlotDrawings | undefined;
  /** Ids of the markings and arrows that hold an included annotation. */
  readonly hosts: ReadonlySet<string>;
}

function refOf(ctx: Context, kind: ItemKind, id: string): string {
  const known = projectIndex(ctx.project);
  const exists =
    kind === 'i'
      ? known.containers.has(id)
      : kind === 'a'
        ? known.annotations.has(id)
        : known.markings.has(id) || known.arrows.has(id);
  const code = exists ? shortCode(ctx.project, kind, id) : normalizeId(id);
  return formatRef({ project: ctx.name, kind, code });
}

/** The container a marking or arrow lives in (an arrow lives where it starts). */
function containerOfHost(project: Project, hostId: string): string | null {
  const index = projectIndex(project);
  const marking = index.markings.get(hostId);
  if (marking) return marking.containerId;
  const arrow = index.arrows.get(hostId);
  return arrow ? (index.markings.get(arrow.from)?.containerId ?? null) : null;
}

/** The typed annotations of the format's specialization that the call sees. */
function includedAnnotations(
  project: Project,
  specId: string,
  target: string | null,
): readonly Annotation[] {
  return project.annotations.filter(
    (a) =>
      a.type?.specId === specId &&
      (target === null || containerOfHost(project, a.markingId) === target),
  );
}

// ----------------------------------------------------------------------- references in values

/** A row of `owner`'s table `key`, by the code it has among the table's rows. */
function rowRefText(ctx: Context, ref: Extract<RefValue, { rowId: string }>): string {
  const owner = projectIndex(ctx.project).annotations.get(ref.annotationId)!;
  const codes = shortCodesFor(tableRows(owner.values?.[ref.key]).map((r) => r._id));
  const row = codes.get(ref.rowId) ?? normalizeId(ref.rowId).slice(0, 8);
  const annotation = shortCode(ctx.project, 'a', owner.id);
  return formatAnyRef(ctx.name, { type: 'row', annotation, key: ref.key, row });
}

function entryRefText(ctx: Context, ref: Extract<RefValue, { entryId: string }>): string {
  const owner = projectIndex(ctx.project).annotations.get(ref.annotationId)!;
  const codes = shortCodesFor(owner.entries.map((e) => e.id));
  const entry = codes.get(ref.entryId) ?? normalizeId(ref.entryId).slice(0, 8);
  const annotation = shortCode(ctx.project, 'a', owner.id);
  return formatAnyRef(ctx.name, { type: 'entry', annotation, entry });
}

/** The reference text of a stored `ref` value; `null` when it is empty, malformed or dangling. */
function refValueText(ctx: Context, value: JsonValue | undefined): string | null {
  const ref = parseRefValue(value);
  if (ref === null || !projectIndex(ctx.project).annotations.has(ref.annotationId)) {
    return null;
  }
  if ('rowId' in ref) return rowRefText(ctx, ref);
  if ('entryId' in ref) return entryRefText(ctx, ref);
  if ('key' in ref) {
    const annotation = shortCode(ctx.project, 'a', ref.annotationId);
    return formatAnyRef(ctx.name, { type: 'field', annotation, key: ref.key });
  }
  return refOf(ctx, 'a', ref.annotationId);
}

function cellValue(
  ctx: Context,
  column: SpecColumn,
  value: JsonValue | undefined,
): JsonValue {
  return column.type === 'ref' ? refValueText(ctx, value) : (value ?? null);
}

function rowsOf(
  ctx: Context,
  annotation: Annotation,
  field: Extract<SpecField, { type: 'table' }>,
): FormatInputRow[] {
  const rows = tableRows(annotation.values?.[field.key]);
  const codes = shortCodesFor(rows.map((r) => r._id));
  const code = shortCode(ctx.project, 'a', annotation.id);
  return rows.map((row) => ({
    ref: formatAnyRef(ctx.name, {
      type: 'row',
      annotation: code,
      key: field.key,
      row: codes.get(row._id) ?? normalizeId(row._id).slice(0, 8),
    }),
    values: Object.fromEntries(
      field.columns.map((c) => [c.key, cellValue(ctx, c, row[c.key])]),
    ),
  }));
}

// ----------------------------------------------------------------------------- the items

/** The fields of an annotation split as the contract says: the table fields apart from the rest. */
function fieldsOf(
  ctx: Context,
  annotation: Annotation,
): Pick<FormatInputAnnotation, 'values' | 'rows'> {
  const fields = annotation.type
    ? (findSpecType(ctx.project, annotation.type)?.type.fields ?? [])
    : [];
  const values: Record<string, JsonValue> = {};
  const rows: Record<string, FormatInputRow[]> = {};
  for (const field of fields) {
    if (field.type === 'table') rows[field.key] = rowsOf(ctx, annotation, field);
    else values[field.key] = cellValue(ctx, field, annotation.values?.[field.key]);
  }
  return { values, rows };
}

function annotationOf(ctx: Context, annotation: Annotation): FormatInputAnnotation {
  const layer = projectIndex(ctx.project).layers.get(annotation.layerId);
  const owner = annotation.parentAnnotationId;
  return {
    ref: refOf(ctx, 'a', annotation.id),
    code: shortCode(ctx.project, 'a', annotation.id),
    host: refOf(ctx, 'm', annotation.markingId),
    type: annotation.type!.typeId,
    layer: layer?.spec?.layerId ?? annotation.layerId,
    name: annotation.name,
    owner: owner === null ? null : refOf(ctx, 'a', owner),
    role: annotation.parentRole,
    ...fieldsOf(ctx, annotation),
  };
}

/** The nearest ancestor of the marking that is in the projection, or `null`. */
function includedParent(ctx: Context, marking: Marking): string | null {
  const markings = projectIndex(ctx.project).markings;
  let id = marking.parentId;
  for (let hops = 0; id !== null && hops <= markings.size; hops++) {
    if (ctx.hosts.has(id)) return refOf(ctx, 'm', id);
    id = markings.get(id)?.parentId ?? null;
  }
  return null;
}

/** The slot of the mother that holds the marking; `null` when it holds it in none (or one with no id). */
function slotOf(ctx: Context, marking: Marking): FormatInputSlot | null {
  const drawing =
    marking.parentId === null ? undefined : ctx.drawings?.get(marking.parentId);
  const id = drawing?.slotOf.get(marking.id) ?? '';
  const slot = id === '' ? undefined : drawing?.slots.find((s) => s.id === id);
  return slot ? { id: slot.id, name: slot.name } : null;
}

function anchorOf(
  ctx: Context,
  anchor: MarkingAnchor | null | undefined,
): FormatInputAnchor | null {
  if (!anchor || !projectIndex(ctx.project).markings.has(anchor.to)) return null;
  return {
    to: refOf(ctx, 'm', anchor.to),
    ...(anchor.side === undefined ? {} : { side: anchor.side }),
    ...(anchor.align === undefined ? {} : { align: anchor.align }),
    ...(anchor.offset === undefined ? {} : { offset: anchor.offset }),
  };
}

function markingOf(ctx: Context, marking: Marking): FormatInputMarking {
  return {
    ref: refOf(ctx, 'm', marking.id),
    code: shortCode(ctx.project, 'm', marking.id),
    container: marking.containerId === null ? null : refOf(ctx, 'i', marking.containerId),
    parent: includedParent(ctx, marking),
    rect: marking.rect,
    name: marking.name,
    slot: slotOf(ctx, marking),
    anchor: anchorOf(ctx, marking.anchor),
    source: marking.source,
  };
}

function arrowOf(ctx: Context, arrow: Arrow): FormatInputArrow {
  return {
    ref: refOf(ctx, 'm', arrow.id),
    code: shortCode(ctx.project, 'm', arrow.id),
    from: refOf(ctx, 'm', arrow.from),
    to: refOf(ctx, 'm', arrow.to),
    name: arrow.name,
  };
}

function containerOf(ctx: Context, container: ProjectContainer): FormatInputContainer {
  const page = ctx.project.pages.find((g) => g.id === container.pageId);
  return {
    ref: refOf(ctx, 'i', container.id),
    code: shortCode(ctx.project, 'i', container.id),
    name: container.name,
    page: page?.name ?? null,
    width: container.width,
    height: container.height,
    background: container.background,
    source: container.source,
  };
}

/**
 * The projection of `project` for the format `formatRef` (`<specId>/<formatId>`): the typed
 * annotations of the format's own specialization (the others and the free layers are left out), the
 * markings and arrows that hold them and the containers of those markings. With scope `container`
 * only the target container and what it holds. Fails with `not-found` for a format or a container
 * the project does not have and with `invalid-value` for scope `container` without a target.
 */
export function buildFormatInput(
  project: Project,
  formatRef: string,
  options: FormatInputOptions,
): FormatInput {
  const { spec, format } = findFileFormat(project, formatRef);
  const scope = format.scope ?? 'project';
  const target = scope === 'container' ? requireTarget(project, options.target) : null;
  const annotations = includedAnnotations(project, spec.id, target);
  const hosts = new Set(annotations.map((a) => a.markingId));
  const ctx: Context = {
    project,
    name: options.projectName,
    drawings: options.drawings,
    hosts,
  };
  const markings = project.markings.filter((m) => hosts.has(m.id));
  const containerIds = new Set(
    target === null ? markings.map((m) => m.containerId) : [target],
  );
  return {
    contract: FORMAT_PLUGIN_CONTRACT,
    format: {
      ref: formatRef,
      id: format.id,
      specId: spec.id,
      name: format.name,
      extension: format.extension,
      scope,
    },
    specialization: spec,
    project: { name: options.projectName },
    target: target === null ? null : { container: refOf(ctx, 'i', target) },
    containers: project.containers
      .filter((c) => containerIds.has(c.id))
      .map((c) => containerOf(ctx, c)),
    markings: markings.map((m) => markingOf(ctx, m)),
    annotations: annotations.map((a) => annotationOf(ctx, a)),
    arrows: project.arrows.filter((r) => hosts.has(r.id)).map((r) => arrowOf(ctx, r)),
  };
}
