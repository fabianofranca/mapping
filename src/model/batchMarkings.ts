import { checkAnchorTarget, setMarkingAnchor, setNewMarkingAnchor } from './anchors';
import { markingAnchorDefaults, typeAnchorDefaults } from './anchorDefaults';
import { renameAnnotation } from './annotations';
import { fitMarking, snapToAnchor } from './componentArrange';
import {
  componentFileMinSize,
  componentMinSize,
  markingComponent,
  type ComponentCatalog,
} from './componentCatalog';
import {
  addComponentMarking,
  componentAnchoredPlacement,
  componentPlacement,
  componentSize,
  hasComponentSlot,
  placementFitsSlot,
  placementIsFree,
  type ComponentType,
} from './componentMarkings';
import type { TextMeasurer } from './components/instantiate';
import { addBackgroundContainer } from './containers';
import { effectiveDensity } from './density';
import { ModelError } from './errors';
import { setMarkingLocked } from './locks';
import {
  confirmMarkingReview,
  createMarking,
  moveMarking,
  placeFloatingNear,
  renameMarking,
  setMarkingFloating,
  setMarkingRect,
  setMarkingSpace,
  type FloatingNearTarget,
} from './markings';
import type { Size } from './geometry';
import { projectIndex } from './projectIndex';
import { setImageSource, setMarkingSource } from './sources';
import { findSpecType } from './specLookup';
import { typeSlots } from './specSlots';
import type {
  AnnotationTypeRef,
  ExternalSource,
  JsonValue,
  Layer,
  Marking,
  MarkingAnchor,
  Project,
  Rect,
} from './types';

// The marking rules of the MCP batch: `add_container` with a background only, `create_marking` (`rect`,
// `inside`/`slot`, `anchor`, `near`, the component's placement and size, the typed annotation, `layer`,
// `source`, `name`) and `update_marking`. Pure functions over the project, the component catalog, the text
// measurer and a reference resolver: no DOM and no I/O, so the app, the MCP batch and the format applier
// can all use them. What stays with the caller: references and aliases (the resolver), the notes' order,
// the step descriptions and the annotation values (the `annotate` hooks, until they move to the model too).

/** A broken rule of the batch: the code and the English message the MCP reports unchanged. */
export class BatchRuleError extends Error {
  constructor(
    readonly code: 'invalid-arguments',
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'BatchRuleError';
  }
}

/** The text of an `ExternalSource` operation argument (`url` omitted = no link). */
export function toExternalSource(
  input: { system: string; id: string; url?: string | null | undefined } | null,
): ExternalSource | null {
  return input === null
    ? null
    : { system: input.system, id: input.id, url: input.url ?? null };
}

/** Short label of the source in the summaries: `source figma:3f2a` or `no source`. */
export function externalSourceLabel(source: ExternalSource | null): string {
  return source === null ? 'no source' : `source ${source.system}:${source.id}`;
}

/** The name in quotes, or `(unnamed)`. */
export function quotedLabel(text: string | null): string {
  return text === null ? '(unnamed)' : `"${text}"`;
}

/** The anchor of an operation: the target is still a reference the resolver turns into an id. */
export interface AnchorArgs {
  readonly to: string;
  readonly side?: MarkingAnchor['side'];
  readonly align?: MarkingAnchor['align'];
  readonly offset?: MarkingAnchor['offset'];
}

/** What the rules need from the caller to turn references into items (it throws its own errors). */
export interface MarkingResolver {
  /** Id of a marking: alias, reference or id. */
  marking(ref: string): string;
  /** Id of a container: alias, reference, name or id. */
  container(ref: string, p?: Project): string;
  layer(ref: string): Layer;
  type(ref: string): AnnotationTypeRef;
  /** Target of `near`: a container or a marking (never an arrow). */
  nearTarget(ref: string): FloatingNearTarget;
  /**
   * `page` of a new canvas root: the page the target of `near`, `inside` or the anchor implies, or the
   * one asked for; `undefined` leaves the choice to the model. A marking in a container has none.
   */
  pageFor(
    p: Project,
    containerId: string | null,
    args: {
      readonly page: string | undefined;
      readonly near: string | undefined;
      readonly inside: string | null;
      readonly anchor: string | null;
      readonly nearUsed: boolean;
    },
  ): string | undefined;
  /** The type with a component of `type` in the applied specializations (cached by the caller), or `null`. */
  componentType(p: Project, type: AnnotationTypeRef): ComponentType | null;
  /** `Container › Name` of a marking, as the caller's summaries write it. */
  markingLabel(p: Project, id: string): string;
  containerLabel(p: Project, id: string): string;
  /** Runs `run` and, when the rectangle ends below the component's minimum, reports what the minimum is. */
  guardMinSize<T>(minSize: Size | null, what: string, run: () => T): T;
}

/** The annotation part of `create_marking`, which stays with the caller (aliases, `ref` values and table rows). */
export interface AnnotateHooks {
  /** A new typed annotation on the marking: the type's layer (or the one given), name and values. */
  typed(
    p: Project,
    id: string,
    markingId: string,
    args: {
      readonly type: AnnotationTypeRef;
      readonly layer: string | undefined;
      readonly name: string | null | undefined;
      readonly values: Readonly<Record<string, JsonValue>> | undefined;
    },
  ): Project;
  /** Sets the values of a typed annotation, field by field. */
  setValues(
    p: Project,
    annotationId: string,
    values: Readonly<Record<string, JsonValue>>,
  ): Project;
}

export interface MarkingContext {
  readonly catalog: ComponentCatalog;
  readonly measurer: TextMeasurer;
  readonly refs: MarkingResolver;
  readonly annotate: AnnotateHooks;
}

export interface CreateMarkingArgs {
  readonly container?: string | undefined;
  /** The old name of `container`. */
  readonly image?: string | undefined;
  readonly inside?: string | undefined;
  readonly slot?: string | undefined;
  readonly anchor?: AnchorArgs | undefined;
  readonly near?: string | undefined;
  readonly rect?: Rect | undefined;
  readonly name?: string | null | undefined;
  readonly page?: string | undefined;
  readonly source?: Parameters<typeof toExternalSource>[0] | undefined;
  readonly annotation?:
    | {
        readonly type: string;
        readonly layer?: string | undefined;
        readonly name?: string | null | undefined;
        readonly values?: Readonly<Record<string, JsonValue>> | undefined;
      }
    | undefined;
  readonly annotationAs?: string | undefined;
}

export interface CreatedBatchMarking {
  readonly project: Project;
  readonly notes: readonly string[];
  readonly markingId: string;
  readonly annotationId: string | null;
  /** The marking as stored (after settling). */
  readonly marking: Marking;
  readonly typeRef: AnnotationTypeRef | null;
  /** The name of the type's component, for the summary. */
  readonly componentName: string | null;
}

function refuse(message: string, details?: Readonly<Record<string, unknown>>): never {
  throw new BatchRuleError('invalid-arguments', message, details);
}

// ---------------------------------------------------------------------------
// add_container with a background only

/** The keys of `value` that are not `undefined` (the model's creators tell an absent key from `undefined`). */
function defined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

/** `width`, `height` and `background` of a container without a file are all needed. */
function backgroundSize(args: {
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly background?: string | undefined;
}): { width: number; height: number; background: string } {
  const { width, height, background } = args;
  if (width !== undefined && height !== undefined && background !== undefined) {
    return { width, height, background };
  }
  const missing = [
    width === undefined ? '`width`' : null,
    height === undefined ? '`height`' : null,
    background === undefined ? '`background`' : null,
  ].filter((m) => m !== null);
  return refuse(
    `add_container needs \`file\` (or \`base64\`), or \`width\`, \`height\` and \`background\`; missing: ${missing.join(', ')}`,
  );
}

/** `add_container` without a file: `width`, `height` and `background` are all needed. */
export function addBatchBackgroundContainer(
  p: Project,
  args: {
    readonly name?: string | undefined;
    readonly width?: number | undefined;
    readonly height?: number | undefined;
    readonly background?: string | undefined;
    readonly center?: { readonly x: number; readonly y: number } | undefined;
    readonly source?: Parameters<typeof toExternalSource>[0] | undefined;
  },
  /** The reference container and the page, resolved only after the arguments are checked. */
  place: () => {
    readonly beside?: string | undefined;
    readonly pageId?: string | undefined;
  },
): {
  readonly project: Project;
  readonly id: string;
  readonly size: { width: number; height: number; background: string };
} {
  const size = backgroundSize(args);
  const where = place();
  const id = crypto.randomUUID();
  const project = addBackgroundContainer(
    p,
    defined({
      id,
      name: args.name,
      ...size,
      center: args.center,
      beside: where.beside,
      pageId: where.pageId,
    }),
  );
  return {
    project:
      args.source === undefined
        ? project
        : setImageSource(project, id, toExternalSource(args.source)),
    id,
    size,
  };
}

// ---------------------------------------------------------------------------
// create_marking

type InitialValues = {
  values?: Record<string, JsonValue>;
  preview: 'required';
};

/**
 * What the model needs to measure the size of the new instance: the simple values (text, number, empty)
 * of `annotation.values` (a table and a reference stay on the `default`) and `preview: 'required'`: only
 * the required fields without a `default` that the batch does not give come from the component's `preview`.
 */
export function initialValuesArg(
  values: Readonly<Record<string, JsonValue>> | undefined,
): InitialValues {
  const preview = { preview: 'required' } as const;
  if (values === undefined) return preview;
  const simple = Object.entries(values).filter(
    ([, value]) =>
      value === null || typeof value === 'string' || typeof value === 'number',
  );
  return simple.length === 0
    ? preview
    : { values: Object.fromEntries(simple), ...preview };
}

/** Some value is a table (list of rows): `initialValuesArg` leaves it out of the measurement. */
function hasTableValue(values: Readonly<Record<string, JsonValue>>): boolean {
  return Object.values(values).some((value) => Array.isArray(value));
}

/**
 * Note of the step when the type declares a component in the applied specialization and the catalog does
 * not have it (missing file, unreadable or with a problem): the annotation is created without the preview
 * and without the minimum size. `null` if the type does not declare a component.
 */
export function missingComponentNote(
  p: Project,
  catalog: ComponentCatalog,
  ref: AnnotationTypeRef,
): string | null {
  const found = findSpecType(p, ref);
  if (found === null || found.type.component === undefined) return null;
  const label = `${ref.specId}/${ref.typeId}`;
  const components = catalog.get(ref.specId);
  const problem = components?.problems.find((m) => m.startsWith(`${ref.typeId}: `));
  const reason =
    problem !== undefined
      ? problem.slice(ref.typeId.length + 2)
      : 'the batch did not find the component files of that specialization';
  return `type ${label} declares a component, but ${reason}: the annotation was created without the preview and without the minimum size`;
}

function resolveAnchor(refs: MarkingResolver, anchor: AnchorArgs): MarkingAnchor {
  return {
    to: refs.marking(anchor.to),
    ...(anchor.side === undefined ? {} : { side: anchor.side }),
    ...(anchor.align === undefined ? {} : { align: anchor.align }),
    ...(anchor.offset === undefined ? {} : { offset: anchor.offset }),
  };
}

/** Rules about the arguments alone, before anything is resolved. */
function checkCreateArgs(args: CreateMarkingArgs): void {
  if (args.annotation === undefined && args.annotationAs !== undefined) {
    refuse('`annotationAs` only applies with `annotation` in the same operation');
  }
  if (args.container !== undefined && args.image !== undefined) {
    refuse('provide `container` (the old `image` is also accepted), not both');
  }
  if (args.slot !== undefined && args.inside === undefined) {
    refuse(
      '`slot` only applies with `inside` (the component whose slot receives the child)',
    );
  }
}

/** The `slot` of `create_marking` is one of the target's slots with an `id` (the others go in `detail`). */
function checkInsideSlot(
  ctx: MarkingContext,
  p: Project,
  slot: string | undefined,
  targetId: string,
): void {
  if (slot === undefined) return;
  const drawn = markingComponent(p, ctx.catalog, targetId);
  const slots =
    drawn === null
      ? []
      : typeSlots(p, drawn.specId, drawn.typeId, drawn.component).filter(
          (candidate) => candidate.id !== '',
        );
  if (slots.some((candidate) => candidate.id === slot)) return;
  refuse(
    `the target has no slot "${slot}"; use one of its slots (see \`slots\` in get_marking)`,
    {
      detail: { slots: slots.map((s) => ({ id: s.id, name: s.name })) },
    },
  );
}

/**
 * Target of the `inside` of `create_marking`: a marking (from the batch or the project) that draws a
 * component with a slot. It only positions: the stored parent comes from the geometry. `container`, if
 * given, must be the target's.
 */
function insideTarget(
  ctx: MarkingContext,
  p: Project,
  args: CreateMarkingArgs,
  containerRef: string | undefined,
): { id: string; containerId: string | null } {
  if (args.near !== undefined) {
    refuse('`inside` and `near` are two placements: provide only one');
  }
  if (args.annotation === undefined) {
    refuse(
      '`inside` only applies with `annotation` of a type with a component (see list_components)',
    );
  }
  const id = ctx.refs.marking(args.inside!);
  const target = projectIndex(p).markings.get(id);
  if (target === undefined || !hasComponentSlot(p, ctx.catalog, id, ctx.measurer)) {
    throw new ModelError(
      'invalid-parent',
      '`inside` must be a marking that draws a component with a slot (see list_components: only a component with a slot, such as Column or Row, receives children)',
    );
  }
  if (
    containerRef !== undefined &&
    ctx.refs.container(containerRef, p) !== target.containerId
  ) {
    throw new ModelError(
      'invalid-parent',
      '`container` is not the container of the `inside` target: omit `container` (it comes from the target)',
    );
  }
  checkInsideSlot(ctx, p, args.slot, id);
  return { id, containerId: target.containerId };
}

/** What `create_marking` resolves before it creates anything. */
interface Target {
  readonly markingId: string;
  readonly inside: { id: string; containerId: string | null } | null;
  readonly containerId: string | null;
  readonly typeRef: AnnotationTypeRef | null;
  readonly component: ComponentType | null;
  readonly anchor: MarkingAnchor | null;
  readonly pageId: string | undefined;
  /** The minimum: the component's `minSize` or 1×1; `null` without a component (the marking's 8 applies). */
  readonly minSize: Size | null;
}

/** The container of the new marking: the `inside` target's, `container`, or the canvas (`null`). */
function resolveSpace(
  ctx: MarkingContext,
  p: Project,
  args: CreateMarkingArgs,
): { inside: Target['inside']; containerId: string | null } {
  const containerRef = args.container ?? args.image;
  // `inside`: the target (a component with a slot) gives the container; the stored parent still comes from the geometry.
  const inside =
    args.inside === undefined ? null : insideTarget(ctx, p, args, containerRef);
  if (inside !== null) return { inside, containerId: inside.containerId };
  // Without `container`: canvas marking (rect in canvas units, possibly negative).
  return {
    inside,
    containerId: containerRef === undefined ? null : ctx.refs.container(containerRef, p),
  };
}

/** The annotation's type and the component it draws with (`null` when it has none). */
function resolveType(
  ctx: MarkingContext,
  p: Project,
  args: CreateMarkingArgs,
  inside: Target['inside'],
): { typeRef: AnnotationTypeRef | null; component: ComponentType | null } {
  const typeRef = args.annotation ? ctx.refs.type(args.annotation.type) : null;
  const component = typeRef === null ? null : ctx.refs.componentType(p, typeRef);
  if (inside !== null && component === null) {
    refuse(
      '`inside` only applies with `annotation` of a type with a component (see list_components)',
    );
  }
  return { typeRef, component };
}

/** Resolves the space, the type and its component, the anchor and the page, in the batch's order of checks. */
function resolveTarget(ctx: MarkingContext, p: Project, args: CreateMarkingArgs): Target {
  const { inside, containerId } = resolveSpace(ctx, p, args);
  const markingId = crypto.randomUUID();
  const { typeRef, component } = resolveType(ctx, p, args, inside);
  const anchor = args.anchor === undefined ? null : resolveAnchor(ctx.refs, args.anchor);
  const pageId = ctx.refs.pageFor(p, containerId, {
    page: args.page,
    near: args.near,
    inside: inside?.id ?? null,
    anchor: anchor?.to ?? null,
    nearUsed: component?.floating === true,
  });
  const minSize =
    component === null
      ? null
      : componentFileMinSize(component.component, effectiveDensity(p, containerId));
  return { markingId, inside, containerId, typeRef, component, anchor, pageId, minSize };
}

/** Checks of the anchor and of the rectangle, once the target is known. */
function checkPlacement(p: Project, args: CreateMarkingArgs, target: Target): void {
  const { anchor, markingId, containerId, pageId, inside, component } = target;
  // The anchor is checked before creating (the invariant's errors); after settling, only the space
  // may have changed and then the new marking is created without an anchor, with a warning.
  if (anchor !== null) {
    checkAnchorTarget(p, markingId, containerId, anchor, pageId ?? null);
  }
  if (anchor !== null && (args.near !== undefined || inside !== null)) {
    refuse('`anchor` and `near`/`inside` are different placements: provide only one');
  }
  if (args.rect === undefined && component === null) {
    refuse(
      '`rect` is required (only an annotation type with a component dispenses with the rectangle: see list_components)',
    );
  }
}

/**
 * `near` (only a floating type): the spot comes from `placeFloatingNear` and the `rect`, if given, supplies only
 * the size. In the other cases the argument is ignored, with a note. `null` when there is no `near`.
 */
function nearRectOf(
  ctx: MarkingContext,
  p: Project,
  args: CreateMarkingArgs,
  target: Target,
  notes: string[],
): Rect | null {
  if (args.near === undefined) return null;
  if (target.component?.floating !== true || target.containerId !== null) {
    notes.push(
      '`near` only applies to a floating annotation type, without `container`: it was ignored (to place the marking in a container, use `container` and `rect`)',
    );
    return null;
  }
  const near = ctx.refs.nearTarget(args.near);
  const size =
    args.rect ??
    componentSize(
      p,
      ctx.catalog,
      {
        containerId: null,
        parentId: null,
        ...target.typeRef!,
        ...initialValuesArg(args.annotation?.values),
      },
      ctx.measurer,
    );
  return placeFloatingNear(p, near, size);
}

/**
 * The rectangle of a new instance with `anchor` and without `rect`: the measured size snapped to the target,
 * with the component's defaults; `null` when there is no `anchor` or the `rect` rules. The "clamped
 * inside the container" warning goes to the notes.
 */
function anchoredRect(
  ctx: MarkingContext,
  p: Project,
  notes: string[],
  args: CreateMarkingArgs,
  target: Target,
): Rect | null {
  const { anchor, typeRef } = target;
  if (anchor === null || args.rect !== undefined || typeRef === null) return null;
  const placed = componentAnchoredPlacement(
    p,
    ctx.catalog,
    {
      markingId: target.markingId,
      containerId: target.containerId,
      parentId: null,
      ...typeRef,
      ...initialValuesArg(args.annotation?.values),
      anchor,
      anchorDefaults: typeAnchorDefaults(ctx.catalog, typeRef.specId, typeRef.typeId),
    },
    ctx.measurer,
  );
  notes.push(...placed.warnings.map((w) => w.text));
  return placed.rect;
}

/** Rectangle of the child in the target's slot; the step's `rect` supplies only the size (x and y are ignored). */
function insideRect(
  ctx: MarkingContext,
  p: Project,
  args: CreateMarkingArgs,
  target: Target,
): Rect {
  const { rect } = args;
  const { minSize, typeRef } = target;
  if (
    rect !== undefined &&
    minSize !== null &&
    (rect.width < minSize.width || rect.height < minSize.height)
  ) {
    ctx.refs.guardMinSize(minSize, `"${typeRef!.specId}/${typeRef!.typeId}"`, () => {
      throw new ModelError('rect-too-small', undefined, {
        received: { width: rect.width, height: rect.height },
        min: { ...minSize },
        source: 'component',
      });
    });
  }
  return componentPlacement(
    p,
    ctx.catalog,
    {
      containerId: target.containerId,
      parentId: target.inside!.id,
      ...(args.slot === undefined ? {} : { slot: args.slot }),
      ...typeRef!,
      ...(rect === undefined ? {} : { size: { width: rect.width, height: rect.height } }),
      ...initialValuesArg(args.annotation?.values),
    },
    ctx.measurer,
  );
}

/**
 * The warning of a marking created without `rect`, `inside`, `near` or `anchor` that was born over others:
 * `placementIsFree` (on the project from before, with the rectangle that was stored) says it did not find a
 * free spot at any level.
 */
function noteNoFreeSpace(
  ctx: MarkingContext,
  notes: string[],
  before: Project,
  created: {
    containerId: string | null;
    pageId: string | undefined;
    typeRef: AnnotationTypeRef;
    rect: Rect;
  },
): void {
  const free = placementIsFree(
    before,
    ctx.catalog,
    {
      containerId: created.containerId,
      parentId: null,
      ...(created.pageId === undefined ? {} : { pageId: created.pageId }),
      ...created.typeRef,
      rect: created.rect,
    },
    ctx.measurer,
  );
  if (free) return;
  notes.push(
    'no free space: the marking was born over other markings (give `rect` or make room in the container)',
  );
}

/**
 * Warnings of `inside`: full slot (the child did not fit in the slot's area), stored parent that is not the
 * target (and who it ended up in, even when it fit) and `rect` shrunk to the slot.
 */
function noteInsideFit(
  ctx: MarkingContext,
  notes: string[],
  before: Project,
  after: Project,
  targetId: string,
  created: {
    id: string;
    rect: Rect;
    asked: Rect | undefined;
    typeId: string;
    slot: string | undefined;
  },
): void {
  const target = ctx.refs.markingLabel(after, targetId);
  const { asked, rect } = created;
  if (asked && (asked.width !== rect.width || asked.height !== rect.height)) {
    notes.push(
      `the size of the \`rect\` (${asked.width}×${asked.height}) does not fit in the slot of ${target}: the marking was created at ${rect.width}×${rect.height}`,
    );
  }
  const parentId = projectIndex(after).markings.get(created.id)?.parentId ?? null;
  const where =
    parentId === targetId
      ? ''
      : parentId === null
        ? '; it ended up outside it'
        : `; it ended up inside ${ctx.refs.markingLabel(after, parentId)}`;
  const fits = placementFitsSlot(
    before,
    ctx.catalog,
    targetId,
    rect,
    ctx.measurer,
    created.slot,
    created.typeId,
  );
  if (!fits) {
    notes.push(
      `the marking did not fit in the slot of ${target}: enlarge the component or use Arrange in the app${where}`,
    );
  } else if (where !== '') {
    notes.push(
      `the marking was created in the slot of ${target}, but the stored parent is not it${where}`,
    );
  }
}

/**
 * Redoes the size of a new instance after the batch's table rows have been entered (the initial size
 * is measured before them, with the table empty): `fitMarking` and, if the marking was created anchored,
 * `snapToAnchor` with the component's defaults. A component that does not fit (slot, no `sizing`)
 * stays as it is.
 */
function refitToRows(
  ctx: MarkingContext,
  p: Project,
  markingId: string,
  anchored: boolean,
): Project {
  let next = p;
  try {
    next = fitMarking(next, ctx.catalog, markingId, ctx.measurer, {
      minSizeOf: (id) => componentMinSize(next, ctx.catalog, id),
    });
  } catch (error) {
    if (!(error instanceof ModelError)) throw error;
    return p;
  }
  if (!anchored || projectIndex(next).markings.get(markingId)?.anchor == null)
    return next;
  try {
    return snapToAnchor(next, markingId, {
      defaults: markingAnchorDefaults(next, ctx.catalog),
    }).project;
  } catch (error) {
    if (!(error instanceof ModelError)) throw error;
    return next;
  }
}

/** The rectangle of a component instance, by the placement that applies (`near`, `inside`, `rect`, `anchor` or the component's). */
function componentRect(
  ctx: MarkingContext,
  p: Project,
  args: CreateMarkingArgs,
  target: Target,
  nearRect: Rect | null,
  notes: string[],
): Rect {
  const typeRef = target.typeRef!;
  return (
    nearRect ??
    (target.inside ? insideRect(ctx, p, args, target) : null) ??
    args.rect ??
    anchoredRect(ctx, p, notes, args, target) ??
    componentPlacement(
      p,
      ctx.catalog,
      {
        containerId: target.containerId,
        parentId: null,
        ...(target.pageId === undefined ? {} : { pageId: target.pageId }),
        ...typeRef,
        ...initialValuesArg(args.annotation!.values),
      },
      ctx.measurer,
    )
  );
}

/** The `layer` of the annotation, if given, must be the type's. */
function checkLayerOfType(
  ctx: MarkingContext,
  args: CreateMarkingArgs,
  target: Target,
): void {
  const layerRef = args.annotation?.layer;
  if (layerRef === undefined) return;
  const layer = ctx.refs.layer(layerRef);
  if (
    layer.spec?.specId !== target.typeRef!.specId ||
    layer.spec.layerId !== target.component!.layerId
  ) {
    throw new ModelError('type-not-in-layer');
  }
}

/** The part of `create_marking` of a type with a component: the instance, its name and its values. */
function createComponentMarking(
  ctx: MarkingContext,
  p: Project,
  args: CreateMarkingArgs,
  target: Target,
  nearRect: Rect | null,
  notes: string[],
): { project: Project; annotationId: string; autoPlaced: boolean } {
  const typeRef = target.typeRef!;
  const annotationId = crypto.randomUUID();
  // The parent comes from the geometry (the model settles on creation): without `rect`, in the center of the container.
  // The size came from the component (not from the request): the batch's table rows did not
  // exist yet when it was measured, so `refitToRows` redoes it after `setValues`.
  const rectFromComponent =
    nearRect === null && target.inside === null && args.rect === undefined;
  const rect = componentRect(ctx, p, args, target, nearRect, notes);
  checkLayerOfType(ctx, args, target);
  let project = ctx.refs.guardMinSize(
    target.minSize,
    `"${typeRef.specId}/${typeRef.typeId}"`,
    () =>
      addComponentMarking(
        p,
        ctx.catalog,
        {
          markingId: target.markingId,
          annotationId,
          containerId: target.containerId,
          ...(target.pageId === undefined ? {} : { pageId: target.pageId }),
          parentId: target.inside?.id ?? null,
          ...typeRef,
          rect,
          name: args.name ?? null,
          preview: 'required',
          ...(target.anchor === null ? {} : { anchor: target.anchor }),
        },
        ctx.measurer,
      ),
  );
  // Automatic placement only (no rect, near, inside or anchor; not a floating type): the "no free space" check
  // runs on the stored rectangle. `inside` has its own full-slot warning.
  const autoPlaced =
    rectFromComponent &&
    target.anchor === null &&
    args.near === undefined &&
    target.component!.floating !== true;
  if (target.inside) {
    noteInsideFit(ctx, notes, p, project, target.inside.id, {
      id: target.markingId,
      rect,
      asked: args.rect,
      typeId: typeRef.typeId,
      slot: args.slot,
    });
  }
  project = fillAnnotation(ctx, project, annotationId, args, target, rectFromComponent);
  return { project, annotationId, autoPlaced };
}

/** The annotation's name and values; a table redoes the size the component measured with the table empty. */
function fillAnnotation(
  ctx: MarkingContext,
  p: Project,
  annotationId: string,
  args: CreateMarkingArgs,
  target: Target,
  rectFromComponent: boolean,
): Project {
  const annotation = args.annotation!;
  let project = p;
  if (annotation.name !== undefined) {
    project = renameAnnotation(project, annotationId, annotation.name);
  }
  if (annotation.values === undefined) return project;
  project = ctx.annotate.setValues(project, annotationId, annotation.values);
  if (rectFromComponent && hasTableValue(annotation.values)) {
    project = refitToRows(ctx, project, target.markingId, target.anchor !== null);
  }
  return project;
}

/** The part of `create_marking` without a component: a plain marking and, with a type, its typed annotation. */
function createPlainMarking(
  ctx: MarkingContext,
  p: Project,
  args: CreateMarkingArgs,
  target: Target,
): { project: Project; annotationId: string | null } {
  let project = createMarking(p, {
    id: target.markingId,
    containerId: target.containerId,
    ...(target.pageId === undefined ? {} : { pageId: target.pageId }),
    rect: args.rect!,
    name: args.name ?? null,
  });
  if (target.anchor !== null) {
    project = setNewMarkingAnchor(project, target.markingId, target.anchor);
  }
  const { annotation } = args;
  if (!annotation || target.typeRef === null) return { project, annotationId: null };
  const annotationId = crypto.randomUUID();
  project = ctx.annotate.typed(project, annotationId, target.markingId, {
    type: target.typeRef,
    layer: annotation.layer,
    name: annotation.name,
    values: annotation.values,
  });
  return { project, annotationId };
}

/** The new marking is at the end of the array (settling does not reorder): the backward search is O(1). */
function findCreated(project: Project, markingId: string): Marking {
  for (let i = project.markings.length - 1; i >= 0; i--) {
    const candidate = project.markings[i]!;
    if (candidate.id === markingId) return candidate;
  }
  throw new ModelError('not-found', markingId);
}

/**
 * `create_marking`: a plain marking (`rect` required) or the instance of a component type (`rect` optional:
 * `near`, `inside` + `slot`, `anchor` or the component's own placement), with its typed annotation.
 * A broken rule throws `BatchRuleError` (`invalid-arguments`) or `ModelError`.
 */
export function createBatchMarking(
  ctx: MarkingContext,
  p: Project,
  args: CreateMarkingArgs,
): CreatedBatchMarking {
  checkCreateArgs(args);
  const target = resolveTarget(ctx, p, args);
  checkPlacement(p, args, target);
  const notes: string[] = [];
  const nearRect = nearRectOf(ctx, p, args, target, notes);
  if (target.typeRef !== null && target.component === null) {
    const missing = missingComponentNote(p, ctx.catalog, target.typeRef);
    if (missing !== null) notes.push(missing);
  }
  const made = buildMarking(ctx, p, args, target, nearRect, notes);
  const created = findCreated(made.project, target.markingId);
  noteCreated(ctx, notes, p, target, made.autoPlaced, created);
  return {
    project: made.project,
    notes,
    markingId: target.markingId,
    annotationId: made.annotationId,
    marking: created,
    typeRef: target.typeRef,
    componentName: target.component?.name ?? null,
  };
}

/** The marking itself: a component instance or a plain one, and its `source`. */
function buildMarking(
  ctx: MarkingContext,
  p: Project,
  args: CreateMarkingArgs,
  target: Target,
  nearRect: Rect | null,
  notes: string[],
): { project: Project; annotationId: string | null; autoPlaced: boolean } {
  const withComponent =
    args.annotation !== undefined && target.typeRef !== null && target.component !== null;
  const made = withComponent
    ? createComponentMarking(ctx, p, args, target, nearRect, notes)
    : { ...createPlainMarking(ctx, p, args, target), autoPlaced: false };
  if (args.source === undefined) return made;
  return {
    ...made,
    project: setMarkingSource(
      made.project,
      target.markingId,
      toExternalSource(args.source),
    ),
  };
}

/** The notes that need the stored marking: no free space and a dropped anchor. */
function noteCreated(
  ctx: MarkingContext,
  notes: string[],
  before: Project,
  target: Target,
  autoPlaced: boolean,
  created: Marking,
): void {
  if (autoPlaced && target.typeRef !== null) {
    noteNoFreeSpace(ctx, notes, before, {
      containerId: target.containerId,
      pageId: target.pageId,
      typeRef: target.typeRef,
      rect: created.rect,
    });
  }
  if (target.anchor !== null && created.anchor == null) {
    notes.push(
      'the anchor was dropped: by geometry the marking was created in a different space than the target (the container or the canvas); anchor it afterwards with `update_marking`, in the same space as the target',
    );
  }
}

// ---------------------------------------------------------------------------
// update_marking

export interface UpdateMarkingArgs {
  readonly name?: string | null | undefined;
  readonly source?: Parameters<typeof toExternalSource>[0] | undefined;
  readonly move?: { readonly dx: number; readonly dy: number } | undefined;
  readonly floating?: boolean | undefined;
  /** The new container (`null`: the canvas); it needs `rect` in the new space's pixels. */
  readonly container?: string | null | undefined;
  readonly rect?: Rect | undefined;
  /** `null` removes the anchor. */
  readonly anchor?: AnchorArgs | null | undefined;
  readonly confirmReview?: boolean | undefined;
  readonly locked?: boolean | undefined;
}

function minSizeOfAll(
  ctx: MarkingContext,
  p: Project,
): (markingId: string) => Size | null {
  return (markingId) => componentMinSize(p, ctx.catalog, markingId);
}

/** `container` + `rect`: the marking goes to another space (or the canvas). */
function changeSpace(
  ctx: MarkingContext,
  p: Project,
  id: string,
  args: UpdateMarkingArgs,
  label: string,
): { project: Project; change: string } {
  if (args.rect === undefined) {
    refuse(
      'changing `container` requires the `rect` in the pixels of the new container (on the canvas, in canvas units)',
    );
  }
  const target = args.container === null ? null : ctx.refs.container(args.container!, p);
  const { rect } = args;
  const minSize = componentMinSize(p, ctx.catalog, id);
  const project = ctx.refs.guardMinSize(minSize, `"${label}"`, () =>
    setMarkingSpace(p, id, target, rect, {
      ...(minSize ? { minSize } : {}),
      minSizeOf: minSizeOfAll(ctx, p),
    }),
  );
  const where =
    target === null
      ? 'go to the canvas'
      : `go to the container "${ctx.refs.containerLabel(project, target)}"`;
  return {
    project,
    change: `${where}, rectangle x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height}`,
  };
}

/** `rect` alone: resize or reposition inside the same space. */
function changeRect(
  ctx: MarkingContext,
  p: Project,
  id: string,
  rect: Rect,
  label: string,
): { project: Project; change: string } {
  const minSize = componentMinSize(p, ctx.catalog, id);
  const project = ctx.refs.guardMinSize(minSize, `"${label}"`, () =>
    setMarkingRect(p, id, rect, {
      ...(minSize ? { minSize } : {}),
      minSizeOf: minSizeOfAll(ctx, p),
    }),
  );
  return {
    project,
    change: `rectangle x ${rect.x}, y ${rect.y}, ${rect.width}×${rect.height}`,
  };
}

/** The fields of `update_marking` that change the item's own data (name, source, lock and review). */
function applyFlags(
  p: Project,
  id: string,
  args: UpdateMarkingArgs,
  changes: string[],
  when: 'before' | 'after',
): Project {
  let project = p;
  if (when === 'before') {
    if (args.locked === false) {
      project = setMarkingLocked(project, id, false);
      changes.push('unlock');
    }
    if (args.name !== undefined) {
      project = renameMarking(project, id, args.name);
      changes.push(`name ${quotedLabel(projectIndex(project).markings.get(id)!.name)}`);
    }
    if (args.source !== undefined) {
      project = setMarkingSource(project, id, toExternalSource(args.source));
      changes.push(externalSourceLabel(projectIndex(project).markings.get(id)!.source));
    }
    return project;
  }
  if (args.confirmReview === true) {
    project = confirmMarkingReview(project, id);
    changes.push('confirm the position');
  }
  if (args.locked === true) {
    project = setMarkingLocked(project, id, true);
    changes.push('lock');
  }
  return project;
}

/** `move` and `floating`: the geometry changes that do not need a rectangle. */
function applyMoves(
  ctx: MarkingContext,
  p: Project,
  id: string,
  args: UpdateMarkingArgs,
  changes: string[],
): Project {
  let project = p;
  if (args.move !== undefined) {
    project = moveMarking(project, id, args.move.dx, args.move.dy, {
      minSizeOf: minSizeOfAll(ctx, project),
    });
    changes.push(`move (${args.move.dx}, ${args.move.dy}) with the children`);
  }
  if (args.floating !== undefined) {
    const minSize = componentMinSize(project, ctx.catalog, id);
    project = setMarkingFloating(project, id, args.floating, {
      ...(minSize ? { minSize } : {}),
      minSizeOf: minSizeOfAll(ctx, project),
    });
    changes.push(args.floating ? 'floating' : 'stop being floating');
  }
  return project;
}

/** `anchor`: sets the anchor (`null` removes it). */
function applyAnchor(
  ctx: MarkingContext,
  p: Project,
  id: string,
  anchorArgs: AnchorArgs | null,
  changes: string[],
): Project {
  const anchor = anchorArgs === null ? null : resolveAnchor(ctx.refs, anchorArgs);
  const project = setMarkingAnchor(p, id, anchor);
  changes.push(
    anchor === null
      ? 'remove the anchor'
      : `anchor to "${ctx.refs.markingLabel(project, anchor.to)}"`,
  );
  return project;
}

/**
 * `update_marking`: name, source, move, floating, container and rectangle, anchor, lock and review of one
 * marking, in that order. Returns the project and what changed (the caller writes the step's description).
 */
export function updateBatchMarking(
  ctx: MarkingContext,
  p: Project,
  id: string,
  args: UpdateMarkingArgs,
): { readonly project: Project; readonly changes: string[] } {
  const label = ctx.refs.markingLabel(p, id);
  const changes: string[] = [];
  let project = applyFlags(p, id, args, changes, 'before');
  project = applyMoves(ctx, project, id, args, changes);
  if (args.container !== undefined) {
    const moved = changeSpace(ctx, project, id, args, label);
    project = moved.project;
    changes.push(moved.change);
  } else if (args.rect !== undefined) {
    const resized = changeRect(ctx, project, id, args.rect, label);
    project = resized.project;
    changes.push(resized.change);
  }
  if (args.anchor !== undefined) {
    project = applyAnchor(ctx, project, id, args.anchor, changes);
  }
  project = applyFlags(project, id, args, changes, 'after');
  return { project, changes };
}
