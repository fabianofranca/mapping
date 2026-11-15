import {
  codeLink,
  findPlatform,
  platformRepoOf,
  type ProjectPlatform,
} from './codeLocations';
import { annotationAccessibility, type AnnotationAccessibility } from './accessibility';
import { blueprintParams, type BlueprintParam } from './codeArgs';
import type { ComponentDrawings } from './componentDrawings';
import { resolveCode } from './codeVariants';
import { fail } from './errors';
import { projectIndex } from './projectIndex';
import { instanceLabel, parseRefValue, refLabel, resolveRef, tableRows } from './refs';
import type { SpecCode, SpecField } from './spec';
import { typeOfAnnotation, type ResolvedType } from './specLookup';
import { isEmptyValue } from './typed';
import type { Annotation, JsonValue, Marking, Project, Rect, WholeRef } from './types';

// `codeBlueprint` (stage 3b): the calls an agent needs to write, on a platform,
// to instantiate a marking, from the applied specializations. The `code` of a type
// says with which code an instance of it is created (`symbol` is what you call, `path` the file
// that defines it); the values of each instance come in here too. It mirrors the hierarchy of the
// marking and its descendants; in each marking, the typed annotations with the platform's
// `code` (or `symbol: null` when the mapping is missing),
// with the linked ones under the owner. Pure function: the app and the MCP (`get_code_hints`) use the same one.

export type { BlueprintParam };

export interface BlueprintAnnotation {
  readonly annotationId: string;
  readonly specId: string;
  readonly typeId: string;
  /** Name of the type (e.g. `Button`). */
  readonly type: string;
  /** Label of the instance (`name` or `labelField`); `null` without a label. */
  readonly label: string | null;
  /** Name of the annotation's layer in the project; `null` if the layer does not exist. */
  readonly layer: string | null;
  /** `code.<platform>.symbol`; `null` = the type has no `code` for the platform. */
  readonly symbol: string | null;
  /** `code.<platform>.path`: file that defines the symbol, relative to the repository root; `null` without it. */
  readonly path: string | null;
  /**
   * `codeLink` of the `path`, through the `repo` of the specialization that owns the type (`null` without `path` or
   * without `urlTemplate` in the specialization's `repo`).
   */
  readonly pathUrl: string | null;
  /** Parameters in the order of the type's fields; empty without `code`. */
  readonly params: readonly BlueprintParam[];
  readonly notes: string | null;
  /**
   * The role, the accessible label and the parts of the annotation (stage #1128): only when the type declares
   * `accessibility` and has something to say. See `AnnotationAccessibility`.
   */
  readonly accessibility?: AnnotationAccessibility;
  /**
   * Filled-in values, per field and in the type's order, as in the mapping (untranslated):
   * `ref` by the target's label and `table` without `_id`. They serve the `notes` (e.g. "use the value
   * of the id field").
   */
  readonly values: { readonly [key: string]: JsonValue };
  /** Annotations linked to this one (e.g. events of a button), with the same shape. */
  readonly linked: readonly BlueprintAnnotation[];
  /**
   * The slot arguments (stage #1080, decision 11), only with the `drawings` option: one per slot **with an
   * `id`** that holds child markings, in the template's order. The children that sit in them are not in
   * the node's `children`. Absent without `drawings`, without children in a slot, and for a slot without `id`
   * (so the answer is the one of before the named slots).
   */
  readonly slotArgs?: readonly BlueprintSlotArg[];
  /**
   * Targets of the `ref`s to the whole annotation (v17) in the fields and cells, one per `ref`, in the
   * order of the fields and rows. The field, row and free-pair `ref`s do not count.
   */
  readonly targets: readonly BlueprintTarget[];
}

/** The argument of a slot of the component: the child markings the geometry put in it. */
export interface BlueprintSlotArg {
  /** The parameter that receives the content: `code.<platform>.slots[<slot>]`, else the slot's `id`. */
  readonly name: string;
  /** The slot's `id`. */
  readonly slot: string;
  /** The child nodes, in the order of the siblings; each is the node the tree would carry. */
  readonly children: readonly BlueprintNode[];
}

/** What `codeBlueprint` reads besides the project. */
export interface BlueprintOptions {
  /**
   * The drawings of the component markings (`createDrawingCache`): they say which slot each child sits in
   * (`slotOf`) and which default-content fields mean nothing then (`inactiveFields`). Without them the
   * children stay in `children` and every field is an argument, as before the named slots.
   */
  readonly drawings?: ComponentDrawings;
}

/** A `ref` to the whole annotation, with the target expanded. */
export interface BlueprintTarget {
  /** Field of the source annotation (the table, in a cell). */
  readonly field: string;
  /** Row index (from 0), or `null` in a simple `ref` field. */
  readonly row: number | null;
  /** `ref` column of the table, or `null` in a simple field. */
  readonly column: string | null;
  /** Label of the target (the same as in `values` and `args`). */
  readonly label: string | null;
  /** The target already appeared in the path: only the label comes, without `annotation` or `children`. */
  readonly repeated: boolean;
  /** The target in the tree form; `null` when `repeated`. */
  readonly annotation: BlueprintAnnotation | null;
  /** The child markings of the target's marking, for the component that contains others. */
  readonly children: readonly BlueprintNode[];
}

export interface BlueprintNode {
  readonly markingId: string;
  readonly name: string | null;
  /** In pixels of the original image (helps order and position the children). */
  readonly rect: Rect;
  /** Typed annotations of the marking that are not linked to another, in project order. */
  readonly annotations: readonly BlueprintAnnotation[];
  readonly children: readonly BlueprintNode[];
}

export interface CodeBlueprint {
  readonly platform: ProjectPlatform;
  /**
   * Repository of the platform: `url` and `ref` come from the `repo` of the first applied
   * specialization that declares it (each type brings its own link in `pathUrl`, through the specialization
   * that owns it) and `localPath` from the project's override. `null` without `repo` or `localPath`.
   */
  readonly repo: {
    readonly url: string | null;
    readonly ref: string | null;
    readonly localPath: string | null;
  } | null;
  readonly root: BlueprintNode;
}

/** The label of a reference's target (field or cell); `null` if empty or broken. */
function refText(p: Project, value: JsonValue | undefined): JsonValue {
  if (value === undefined || isEmptyValue(value)) return null;
  const ref = parseRefValue(value);
  // The label uses the default texts (pt-BR): this module is only used by the MCP.
  return ref && resolveRef(p, ref) ? refLabel(p, ref) : null;
}

/** Value of the field in the blueprint: `ref` by the label, `table` without `_id`, empty `null`. */
function mappingValue(
  p: Project,
  field: SpecField,
  value: JsonValue | undefined,
): JsonValue {
  if (value === undefined || isEmptyValue(value)) return null;
  switch (field.type) {
    case 'ref':
      return refText(p, value);
    case 'table':
      return tableRows(value).map((row) =>
        Object.fromEntries(
          field.columns.map((c) => [
            c.key,
            c.type === 'ref' ? refText(p, row[c.key]) : (row[c.key] ?? null),
          ]),
        ),
      );
    default:
      return value;
  }
}

/** Value of the parameter: the mapping's, with the `enum` translated by `values`. */
function paramValue(
  p: Project,
  field: SpecField,
  value: JsonValue | undefined,
  code: SpecCode,
): JsonValue {
  const mapped = mappingValue(p, field, value);
  if (field.type !== 'enum' || typeof mapped !== 'string') return mapped;
  const translations = code.values?.[field.key];
  return translations && Object.hasOwn(translations, mapped)
    ? (translations[mapped] ?? mapped)
    : mapped;
}

/** The platform's `code` already resolved by the annotation's values (`variants`); `null` without `code`. */
function codeFor(
  resolved: ResolvedType,
  platformId: string,
  values: Readonly<Record<string, JsonValue>>,
): SpecCode | null {
  const code = resolved.type.code;
  const own = code && Object.hasOwn(code, platformId) ? code[platformId] : undefined;
  return own === undefined ? null : resolveCode(own, values, resolved.type.fields);
}

/** A `ref` to the whole annotation in a field or in a cell. */
interface WholeSite {
  readonly field: string;
  readonly row: number | null;
  readonly column: string | null;
  readonly ref: WholeRef;
}

function wholeRefOf(value: JsonValue | undefined): WholeRef | null {
  const ref = parseRefValue(value);
  return ref && Object.keys(ref).length === 1 ? (ref as WholeRef) : null;
}

/** The whole-annotation `ref`s of the fields and cells, in the order of the fields and rows. */
function wholeSites(
  fields: readonly SpecField[],
  values: Readonly<Record<string, JsonValue>>,
): WholeSite[] {
  const sites: WholeSite[] = [];
  for (const field of fields) {
    if (field.type === 'ref') {
      const ref = wholeRefOf(values[field.key]);
      if (ref) sites.push({ field: field.key, row: null, column: null, ref });
    } else if (field.type === 'table') {
      tableRows(values[field.key]).forEach((row, index) => {
        for (const column of field.columns) {
          const ref = column.type === 'ref' ? wholeRefOf(row[column.key]) : null;
          if (ref) sites.push({ field: field.key, row: index, column: column.key, ref });
        }
      });
    }
  }
  return sites;
}

/** The mapping values of the fields that carry something (empty lists stay out). */
function mappedValues(
  p: Project,
  fields: readonly SpecField[],
  values: Readonly<Record<string, JsonValue>>,
): Record<string, JsonValue> {
  const mapped: Record<string, JsonValue> = {};
  for (const field of fields) {
    const v = mappingValue(p, field, values[field.key]);
    if (v !== null && !(Array.isArray(v) && v.length === 0)) mapped[field.key] = v;
  }
  return mapped;
}

/** What the type's `code` on the platform says about the annotation: symbol, path, its link and notes. */
function codeSummary(
  p: Project,
  resolved: ResolvedType,
  platformId: string,
  code: SpecCode | null,
): Pick<BlueprintAnnotation, 'symbol' | 'path' | 'pathUrl' | 'notes'> {
  const path = code?.path ?? null;
  return {
    symbol: code?.symbol ?? null,
    path,
    pathUrl: path
      ? codeLink(p, { specId: resolved.spec.id, platform: platformId, path })
      : null,
    notes: code?.notes ?? null,
  };
}

/** The default-content fields that the filled slot `slotId` makes meaningless. */
function inactiveOf(
  inactiveFields: ReadonlyMap<string, string>,
  slotId: string,
): string[] {
  return [...inactiveFields]
    .filter(([, slot]) => slot === slotId)
    .map(([field]) => field);
}

/** The slot arguments of a marking, with what they take away from the annotation and the children. */
interface Slotted {
  /** The annotation that draws the marking (the one that carries `slotArgs`). */
  readonly annotationId: string;
  readonly args: readonly BlueprintSlotArg[];
  /** The ids of the child markings that went into the arguments. */
  readonly claimed: ReadonlySet<string>;
  /** The default-content fields of the filled slots: not arguments. */
  readonly inactive: ReadonlySet<string>;
}

/** The parameter of a slot on the platform: `code.<platform>.slots[<id>]`, else the `id` itself. */
export function slotParam(code: SpecCode, slotId: string): string {
  const slots = code.slots;
  return slots !== undefined && Object.hasOwn(slots, slotId)
    ? (slots[slotId] ?? slotId)
    : slotId;
}

/**
 * Code blueprint of the marking `markingId` for the platform `platformId` (declared by
 * some applied specialization; otherwise fails with `unknown-platform`). In each marking
 * of the tree (it and its descendants, in project order), the own typed annotations;
 * free annotations and ones of a nonexistent type stay out, but the `ref`s that point to them appear by label.
 */
export function codeBlueprint(
  p: Project,
  markingId: string,
  platformId: string,
  options: BlueprintOptions = {},
): CodeBlueprint {
  const index = projectIndex(p);
  const rootMarking = index.markings.get(markingId) ?? fail('not-found', markingId);
  const platform = findPlatform(p, platformId) ?? fail('unknown-platform', platformId);

  /** `{ accessibility }` of the annotation, or nothing; the parts a child fills in are not drawn. */
  const accessibilityOf = (
    a: Annotation,
  ): { accessibility?: AnnotationAccessibility } => {
    const drawing = options.drawings?.get(a.markingId);
    const inactive = drawing?.annotationId === a.id ? drawing.inactiveFields : undefined;
    const accessibility = annotationAccessibility(p, a, inactive);
    return accessibility === null ? {} : { accessibility };
  };

  const annotationOf = (
    a: Annotation,
    resolved: ResolvedType,
    included: ReadonlyMap<string, ResolvedType>,
    seen: Set<string>,
    path: ReadonlySet<string>,
    slotted: Slotted | null,
  ): BlueprintAnnotation => {
    seen.add(a.id);
    const here = new Set(path).add(a.id);
    const values = a.values ?? {};
    const code = codeFor(resolved, platformId, values);
    const fields = resolved.type.fields;
    const mine = slotted?.annotationId === a.id ? slotted : null;
    // The default-content fields of a filled slot are no arguments: the child is the content.
    const params = blueprintParams(
      mine === null ? fields : fields.filter((field) => !mine.inactive.has(field.key)),
      code,
      resolved.spec.formatVersion,
      (field) => (code === null ? null : paramValue(p, field, values[field.key], code)),
    );
    const linked = (index.annotationsByOwner.get(a.id) ?? []).flatMap((child) => {
      const childType = included.get(child.id);
      return childType && !seen.has(child.id)
        ? [annotationOf(child, childType, included, seen, here, slotted)]
        : [];
    });
    return {
      annotationId: a.id,
      specId: resolved.spec.id,
      typeId: resolved.type.id,
      type: resolved.type.name,
      label: instanceLabel(p, a),
      layer: index.layers.get(a.layerId)?.name ?? null,
      ...codeSummary(p, resolved, platformId, code),
      ...accessibilityOf(a),
      params,
      values: mappedValues(p, fields, values),
      linked,
      ...(mine === null ? {} : { slotArgs: mine.args }),
      targets: wholeSites(fields, values).flatMap((site) => {
        const target = targetOf(site, here);
        return target ? [target] : [];
      }),
    };
  };

  /** The target of a whole-annotation `ref`; `null` if broken or without a type (the label stays). */
  const targetOf = (
    site: WholeSite,
    path: ReadonlySet<string>,
  ): BlueprintTarget | null => {
    const target = index.annotations.get(site.ref.annotationId);
    const resolved = target ? typeOfAnnotation(p, target) : null;
    if (!target || !resolved) return null;
    const base = {
      field: site.field,
      row: site.row,
      column: site.column,
      // Default texts (pt-BR): only the MCP uses this module.
      label: refLabel(p, site.ref),
    };
    if (path.has(target.id)) {
      return { ...base, repeated: true, annotation: null, children: [] };
    }
    // The target enters the path when descending: a `ref` that comes back to it becomes a `repeated` node.
    const here = new Set(path).add(target.id);
    // An annotation of the project always has its marking (the model validates it).
    const targetMarking = index.markings.get(target.markingId)!;
    const slotted = slottedOf(targetMarking, new Set<string>(), here, target.id);
    const annotation = annotationOf(
      target,
      resolved,
      includedFor(target.markingId),
      new Set(),
      here,
      slotted,
    );
    const children = (index.children.get(target.markingId) ?? [])
      .filter((child) => slotted?.claimed.has(child.id) !== true)
      .map((child) => nodeOf(child, new Set(), here));
    return { ...base, repeated: false, annotation, children };
  };

  const includedFor = (markingId: string): Map<string, ResolvedType> => {
    const included = new Map<string, ResolvedType>();
    for (const a of index.annotationsByMarking.get(markingId) ?? []) {
      const resolved = typeOfAnnotation(p, a);
      if (resolved && a.values) included.set(a.id, resolved);
    }
    return included;
  };

  /**
   * The slot arguments of marking `m` (decision 11): the children its drawing put in a slot with an `id`,
   * as nodes, under the annotation that draws it. `null` without drawings, without `code` on the platform
   * (nothing to call), without a child in a slot or, with `only`, when another annotation draws the marking
   * (the arguments would never be written and the children would vanish).
   */
  const slottedOf = (
    m: Marking,
    seenMarkings: Set<string>,
    path: ReadonlySet<string>,
    only?: string,
  ): Slotted | null => {
    const drawing = options.drawings?.get(m.id);
    const drawn = drawing && index.annotations.get(drawing.annotationId);
    if (!drawing || !drawn?.values || (only !== undefined && drawn.id !== only)) {
      return null;
    }
    const resolved = typeOfAnnotation(p, drawn);
    const code = resolved ? codeFor(resolved, platformId, drawn.values) : null;
    if (code === null) return null;
    const args: BlueprintSlotArg[] = [];
    const claimed = new Set<string>();
    const inactive = new Set<string>();
    for (const slot of drawing.slots) {
      const kids = slot.children
        .flatMap((id) => index.markings.get(id) ?? [])
        .filter((kid) => !seenMarkings.has(kid.id));
      if (slot.id === '' || kids.length === 0) continue;
      kids.forEach((kid) => claimed.add(kid.id));
      inactiveOf(drawing.inactiveFields, slot.id).forEach((field) => inactive.add(field));
      args.push({
        name: slotParam(code, slot.id),
        slot: slot.id,
        children: kids.map((kid) => nodeOf(kid, seenMarkings, path)),
      });
    }
    return args.length === 0
      ? null
      : { annotationId: drawing.annotationId, args, claimed, inactive };
  };

  const visited = new Set<string>();
  const nodeOf = (
    m: Marking,
    seenMarkings: Set<string>,
    path: ReadonlySet<string>,
  ): BlueprintNode => {
    seenMarkings.add(m.id);
    const included = includedFor(m.id);
    const seen = new Set<string>();
    const slotted = slottedOf(m, seenMarkings, path);
    const annotations: BlueprintAnnotation[] = [];
    for (const a of index.annotationsByMarking.get(m.id) ?? []) {
      const resolved = included.get(a.id);
      if (!resolved) continue;
      // Linked to another included annotation: appears under the owner.
      if (a.parentAnnotationId !== null && included.has(a.parentAnnotationId)) continue;
      annotations.push(annotationOf(a, resolved, included, seen, path, slotted));
    }
    const children = (index.children.get(m.id) ?? [])
      .filter(
        (child) => !seenMarkings.has(child.id) && slotted?.claimed.has(child.id) !== true,
      )
      .map((child) => nodeOf(child, seenMarkings, path));
    return {
      markingId: m.id,
      name: m.name,
      rect: { x: m.rect.x, y: m.rect.y, width: m.rect.width, height: m.rect.height },
      annotations,
      children,
    };
  };

  const specRepo = platform.repos[0]?.repo;
  const localPath = platformRepoOf(p, platformId)?.localPath ?? null;
  return {
    platform,
    repo:
      specRepo === undefined && localPath === null
        ? null
        : { url: specRepo?.url ?? null, ref: specRepo?.ref ?? null, localPath },
    root: nodeOf(rootMarking, visited, new Set()),
  };
}
