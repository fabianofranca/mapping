import {
  contentExtent,
  layoutChildren,
  isPlainNone,
  resolveSlotLayout,
  slotBoxOfScene,
  type ResolvedSlotLayout,
} from './components/arrange';
import { assignSlots, componentSlots, slotKey } from './components/slots';
import { slotInputsOf } from './componentSlotInputs';
import type {
  ComponentFile,
  FieldValues,
  IntrinsicSize,
} from './components/componentFormat';
import type { InstanceAnchor } from './components/anchor';
import { intrinsicModeOf } from './components/layoutValues';
import {
  expressionPx,
  fitComponentSize,
  followedAxes,
  resolveSizing,
  type ResolvedAxis,
  type ResolvedSizing,
} from './components/sizing';
import type { ResolvedTokens } from './components/tokens';
import {
  approximateMeasurer,
  instantiate,
  measureComponent,
  type InstantiateOptions,
  type TextMeasurer,
} from './components/instantiate';
import {
  markingComponent,
  type ComponentCatalog,
  type MarkingComponent,
} from './componentCatalog';
import { typeSlots } from './specSlots';
import {
  anchoredRect,
  clampedInto,
  resolveMarkingAnchor,
  type AnchorDefaultsUnits,
  type AnchorDefaultsSource,
} from './anchorPlacement';
import { withAnchoredFollowers } from './anchors';
import { drawingValues } from './componentValues';
import { componentForDrawing, drawOptions, measuringAnchor } from './drawingMode';
import { effectiveDirection } from './direction';
import { fail } from './errors';
import {
  MIN_STORED_MARKING_SIZE,
  bottom,
  clamp,
  imagePixelRect,
  right,
  translateRect,
} from './geometry';
import {
  effectiveDensity,
  rectFromUnits,
  rectToUnits,
  unitSpaceOf,
  unitsToPixels,
} from './density';
import { settleFrom, type SettleOptions } from './hierarchySettle';
import { markingLockStates } from './locks';
import { modelMessage, type ModelMessage } from './modelMessage';
import { findById } from './project';
import { projectIndex } from './projectIndex';
import type { Marking, Project, ReadingDirection, Rect } from './types';

// Arrange (Library stage, B3): recomputes and writes the rectangles of the children of a component
// with a slot by the slot's `layout`, and the size of the component that hugs its content (`hug`).
// Only by the person's action: never on load, in the MCP or when applying a proposal. Pure; the
// store turns it into an undo entry.

export interface ArrangeResult {
  readonly project: Project;
  /** What did not fit or was clamped, one warning per line, without repeats (of equal text). */
  readonly warnings: readonly ModelMessage[];
}

/** Maximum passes until the sizes stabilize (a component with a slot stretched by its parent rearranges the children). */
const MAX_PASSES = 4;

/** One slot of a container that holds children: its layout and the children the geometry put in it. */
interface ContainerSlot {
  /** The slot's `id` (`slotKey`; the empty key for the only slot without `id`). */
  readonly id: string;
  readonly layout: ResolvedSlotLayout;
  readonly kids: readonly Marking[];
}

/**
 * A component with slots that arranges: at least one slot with a `row`/`column`/`grid`/aligned layout
 * that holds children.
 */
interface Container {
  readonly id: string;
  readonly component: ComponentFile;
  /** Token table of the drawing mode (the same one the `component` already carries applied). */
  readonly tokens: ResolvedTokens | undefined;
  /** Effective reading direction of the marking's space (`rtl` mirrors the row and the grid). */
  readonly direction: ReadingDirection;
  readonly values: FieldValues;
  /** The slots that hold children, in template order (a plain `none` layout is not arranged). */
  readonly slots: readonly ContainerSlot[];
  /** The slot of each child (by id) that is in one. */
  readonly slotOf: ReadonlyMap<string, string>;
  /** All the children of the marking. */
  readonly kids: readonly Marking[];
  readonly label: string;
}

/**
 * The children by slot, by the geometry (`assignSlots`, decision 4): the component drawn with the slots
 * empty gives the boxes. A component with a single slot takes every child with no probe.
 */
function kidsBySlot(
  p: Project,
  catalog: ComponentCatalog,
  marking: Marking,
  mc: MarkingComponent,
  drawn: ReturnType<typeof componentForDrawing>,
  values: FieldValues,
  kids: readonly Marking[],
  measure: TextMeasurer,
): ReadonlyMap<string, readonly Marking[]> {
  const slots = componentSlots(drawn.component);
  const only = slots[0];
  if (slots.length === 1 && only !== undefined) return new Map([[slotKey(only), kids]]);
  const space = unitSpaceOf(marking.rect, effectiveDensity(p, marking.containerId));
  const options = { measure, idPrefix: marking.id, ...drawOptions(drawn) };
  const { root } = instantiate(drawn.component, values, space.box, options);
  // A slot hidden by `visible` keeps its children (#1978): they are not arranged, and do not move into another slot.
  const { inputs, revealed } = slotInputsOf({
    component: drawn.component,
    values,
    target: space.box,
    options,
    probe: root,
    space,
    // The type's `accepts` decide too, as in the drawing (`planSlots`): both put a child in the same slot.
    defs: new Map(
      typeSlots(p, mc.specId, mc.typeId, mc.component).map((def) => [def.id, def]),
    ),
    hasKids: true,
  });
  const assignment = assignSlots(
    inputs,
    kids.map((kid) => ({
      id: kid.id,
      rect: kid.rect,
      typeId: markingComponent(p, catalog, kid.id)?.type.id,
    })),
  );
  const byId = new Map(kids.map((kid) => [kid.id, kid]));
  return new Map(
    [...assignment.children]
      .filter(([id]) => !revealed.has(id))
      .map(([id, ids]) => [id, ids.flatMap((kidId) => byId.get(kidId) ?? [])]),
  );
}

function containerOf(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
  measure: TextMeasurer = approximateMeasurer,
): Container | null {
  const mc = markingComponent(p, catalog, markingId);
  if (mc === null) return null;
  const marking = projectIndex(p).markings.get(markingId);
  if (marking === undefined) return null;
  const drawn = componentForDrawing(p, mc.component, marking.containerId);
  const templates = componentSlots(drawn.component);
  if (templates.length === 0) return null;
  const kids = projectIndex(p).children.get(markingId) ?? [];
  if (kids.length === 0) return null;
  const values = drawingValues(p, mc.annotation, mc.type).values;
  const bySlot = kidsBySlot(p, catalog, marking, mc, drawn, values, kids, measure);
  const slots = templates.flatMap((template): ContainerSlot[] => {
    const id = slotKey(template);
    const own = bySlot.get(id) ?? [];
    return own.length === 0
      ? []
      : [{ id, layout: resolveSlotLayout(template, values), kids: own }];
  });
  if (slots.every((slot) => isPlainNone(slot.layout))) return null;
  return {
    id: markingId,
    component: drawn.component,
    tokens: drawn.tokens,
    direction: drawn.direction,
    values,
    slots,
    slotOf: new Map(slots.flatMap((slot) => slot.kids.map((kid) => [kid.id, slot.id]))),
    kids,
    label: marking?.name ?? mc.type.name,
  };
}

/** Can be arranged: the marking is a component with a `row`/`column` slot that has children. */
export function canArrange(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): boolean {
  return containerOf(p, catalog, markingId) !== null;
}

/** Does the slot's space decide the lines (`wrap`) or the tracks (`minColumnWidth`/`minRowHeight`)? */
function needsAvailable(layout: ResolvedSlotLayout): boolean {
  if (layout.type === 'grid') return layout.grid?.min !== undefined;
  return layout.wrap !== 'none';
}

/** The slot's main axis (what `available` measures) is the horizontal one: `row`, or a vertical grid. */
function alongTracks(layout: ResolvedSlotLayout): boolean {
  if (layout.type === 'grid') return layout.grid?.orientation !== 'horizontal';
  return layout.type === 'row';
}

/** The layout of the slot of `parent` that holds the child `kidId`, if any. */
function layoutOfKid(parent: Container, kidId: string): ResolvedSlotLayout | undefined {
  const id = parent.slotOf.get(kidId);
  return parent.slots.find((slot) => slot.id === id)?.layout;
}

/** The parent slot's `align: stretch` stretches the child on this axis (the cross axis of its layout). */
function stretchedBy(
  parent: Container | null,
  kidId: string,
  axis: 'width' | 'height',
): boolean {
  const layout = parent === null ? undefined : layoutOfKid(parent, kidId);
  if (layout === undefined) return false;
  // Grid: `justify` stretches on the tracks' axis and `align` on the lines' axis (in the cell).
  if (layout.type === 'grid') {
    const onTracks = alongTracks(layout) === (axis === 'width');
    return (onTracks ? layout.justify : layout.align) === 'stretch';
  }
  // Aligned `none` (v4), as in `layoutOverlaid`: `justify` on the width and `align` on the height.
  if (layout.type === 'none')
    return (axis === 'width' ? layout.justify : layout.align) === 'stretch';
  if (layout.align !== 'stretch') return false;
  return axis === (layout.type === 'row' ? 'height' : 'width');
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Integer rounded up, without floating-point noise adding a pixel. */
function ceilFit(value: number): number {
  return Math.ceil(value - 1e-6);
}

/**
 * What the `sizing` does on an axis: measure the content (`hug`, `min-content` or `max-content`;
 * `mode` says which intrinsic measure, none = the `hug`), give a px by expression, or nothing.
 */
interface AxisPlan {
  readonly hug: boolean;
  readonly mode: IntrinsicSize | null;
  readonly px: number | undefined;
}

function axisPlan(axis: ResolvedAxis, stretched: boolean): AxisPlan {
  const intrinsic = intrinsicModeOf(axis.spec);
  return {
    hug: (axis.spec === 'hug' || intrinsic !== null) && !stretched,
    mode: intrinsic,
    px: stretched ? undefined : expressionPx(axis),
  };
}

/** The final value of an axis: the measured one (rounded up), the expression's px or the current one, never below the minimum. */
function axisValue(
  plan: AxisPlan,
  current: number,
  measured: number,
  min: number | undefined,
): number {
  const raw = plan.hug ? ceilFit(measured) : (plan.px ?? current);
  return plan.hug || plan.px !== undefined
    ? Math.max(raw, min ?? 0, MIN_STORED_MARKING_SIZE)
    : raw;
}

/**
 * The axes that `measureComponent` receives: the `hug` is measured (`null`), the
 * `min-content`/`max-content` by the intrinsic measure; the other takes the px the expression
 * gives, or what it already has. `undefined` when no axis is measured (nothing to measure).
 */
function fixedSizes(
  rect: Rect,
  w: AxisPlan,
  h: AxisPlan,
):
  | { width: number | IntrinsicSize | null; height: number | IntrinsicSize | null }
  | undefined {
  if (!w.hug && !h.hug) return undefined;
  return {
    width: w.hug ? w.mode : (w.px ?? rect.width),
    height: h.hug ? h.mode : (h.px ?? rect.height),
  };
}

/** The axis changes in the fit: it measures the content or takes an expression px. */
const acts = (plan: AxisPlan): boolean => plan.hug || plan.px !== undefined;

/** What the evaluated `sizing` asks of a component: the new rectangle, or `undefined` if nothing changes. */
function applySizing(
  rect: Rect,
  sizing: ResolvedSizing,
  stretched: { readonly width: boolean; readonly height: boolean },
  min: { readonly width: number; readonly height: number } | undefined,
  measure: (fixed: {
    width: number | IntrinsicSize | null;
    height: number | IntrinsicSize | null;
  }) => {
    width: number;
    height: number;
  },
): { rect: Rect; hugW: boolean; hugH: boolean } | undefined {
  const w = axisPlan(sizing.width, stretched.width);
  const h = axisPlan(sizing.height, stretched.height);
  if (!acts(w) && !acts(h)) return undefined;
  const fixed = fixedSizes(rect, w, h);
  const measured = fixed === undefined ? rect : measure(fixed);
  return {
    rect: {
      ...rect,
      width: axisValue(w, rect.width, measured.width, min?.width),
      height: axisValue(h, rect.height, measured.height, min?.height),
    },
    hugW: w.hug && w.mode === null,
    hugH: h.hug,
  };
}

/** `inner` clamped inside `outer`. `push` pushes (and shrinks only if larger); `shrink` keeps x and y and cuts the excess. */
function clampRect(inner: Rect, outer: Rect, mode: 'push' | 'shrink'): Rect {
  if (mode === 'shrink') {
    const x = clamp(inner.x, outer.x, Math.max(outer.x, right(outer) - 1));
    const y = clamp(inner.y, outer.y, Math.max(outer.y, bottom(outer) - 1));
    return {
      x,
      y,
      width: Math.max(1, Math.min(right(inner), right(outer)) - x),
      height: Math.max(1, Math.min(bottom(inner), bottom(outer)) - y),
    };
  }
  const width = Math.min(inner.width, outer.width);
  const height = Math.min(inner.height, outer.height);
  return {
    x: clamp(inner.x, outer.x, right(outer) - width),
    y: clamp(inner.y, outer.y, bottom(outer) - height),
    width,
    height,
  };
}

/** What the children ask of a slot: their extent (a single line, or by the `available` main-axis space) plus the padding. */
function paddedContent(
  layout: ResolvedSlotLayout,
  children: Parameters<typeof contentExtent>[1],
  available: number | null,
): { width: number; height: number } {
  const extent = contentExtent(layout, children, available);
  const pad = layout.padding;
  return {
    width: extent.width + pad.left + pad.right,
    height: extent.height + pad.top + pad.bottom,
  };
}

/**
 * Arranges the chosen component with a slot and the components with a slot inside it (the
 * subtree). From the deepest to the shallowest, each component with a slot positions the children
 * in the slot's box (the order is the array's; the size on the main axis stays (minus that of the
 * `hug` children, remeasured), `align: stretch` stretches the cross axis, `justify` distributes)
 * and, if the component is `hug` on an axis, fits the component with a slot to the content (never
 * below `minSize`; the position stays). A fixed axis does not change: if the content does not
 * fit, it warns. Moving a child takes its descendants along. At the end, every marking is whole
 * and inside the parent and the image: whatever would go past is clamped, with a warning (a canvas
 * root has no limit). Settles at the end (the children moved: containment is redone). Returns the
 * same `Project` when nothing changes; fails with `not-arrangeable` (not a component with a
 * `row`/`column` slot with children) and `locked` (some rectangle that would change has locked
 * geometry).
 */
export function arrangeMarking(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
  measure: TextMeasurer,
  options?: SettleOptions,
): ArrangeResult {
  if (containerOf(p, catalog, markingId) === null) fail('not-arrangeable', markingId);
  const index = projectIndex(p);
  const rects = new Map<string, Rect>();
  const childrenOf = (id: string): readonly Marking[] => index.children.get(id) ?? [];

  // Subtree: top-down (the root first) and post-order (the deepest first).
  const topDownIds: string[] = [];
  const queue = [markingId];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    topDownIds.push(id);
    queue.push(...childrenOf(id).map((c) => c.id));
  }
  // Arrange runs in component units (the density of the root's container: the subtree is all in
  // the same space) and goes back to image pixels before clamping to the image and the parent.
  const density = effectiveDensity(
    p,
    (index.markings.get(markingId) as Marking).containerId,
  );
  const originals = new Map<string, Rect>();
  for (const id of topDownIds) {
    const { rect } = index.markings.get(id) as Marking;
    originals.set(id, rect);
    rects.set(id, rectToUnits(rect, density));
  }
  const postOrder: string[] = [];
  const visit = (id: string) => {
    for (const child of childrenOf(id)) visit(child.id);
    postOrder.push(id);
  };
  visit(markingId);

  const containers = new Map<string, Container | null>();
  const containerAt = (id: string): Container | null => {
    if (!containers.has(id)) containers.set(id, containerOf(p, catalog, id, measure));
    return containers.get(id) ?? null;
  };
  const labelOf = (id: string): string => {
    const marking = index.markings.get(id) as Marking;
    return marking.name ?? markingComponent(p, catalog, id)?.type.name ?? marking.id;
  };

  const translate = (id: string, dx: number, dy: number) => {
    if (dx === 0 && dy === 0) return;
    for (const child of childrenOf(id)) {
      const r = rects.get(child.id) as Rect;
      rects.set(child.id, { ...r, x: r.x + dx, y: r.y + dy });
      translate(child.id, dx, dy);
    }
  };

  /** The parent stretches this component with a slot on the axis (the parent's `stretch` outweighs the `hug`). */
  const stretchedByParent = (id: string, axis: 'width' | 'height'): boolean => {
    const parentId = (index.markings.get(id) as Marking).parentId;
    return stretchedBy(parentId === null ? null : containerAt(parentId), id, axis);
  };

  // By text, so the same warning is not repeated across passes.
  let warnings = new Map<string, ModelMessage>();
  const warn = (message: ModelMessage): void => {
    warnings.set(message.text, message);
  };

  /**
   * Remeasures the leaf children whose component is `hug` on an axis: the axis becomes the measured
   * size (rounded up, never below `minSize`). A child component with a slot already fit itself in
   * its own pass (from the deepest to the shallowest). The axis the parent's `stretch` stretches stays.
   */
  const remeasureHugKids = (kids: readonly Marking[]) => {
    for (const kid of kids) {
      if (containerAt(kid.id) !== null) continue;
      const mc = markingComponent(p, catalog, kid.id);
      if (mc === null || mc.component.sizing === undefined) continue;
      const values = drawingValues(p, mc.annotation, mc.type).values;
      const drawn = componentForDrawing(p, mc.component, kid.containerId);
      const sizing = resolveSizing(mc.component, values, drawn.tokens);
      sizing.messages.forEach(warn);
      const rect = rects.get(kid.id) as Rect;
      const fitted = applySizing(
        rect,
        sizing,
        {
          width: stretchedByParent(kid.id, 'width'),
          height: stretchedByParent(kid.id, 'height'),
        },
        mc.component.minSize,
        (fixed) =>
          measureComponent(drawn.component, values, fixed, {
            measure,
            ...drawOptions(drawn),
          }),
      );
      if (fitted !== undefined) rects.set(kid.id, fitted.rect);
    }
  };

  /** The first baseline of a child's drawing (the slot's `align: "baseline"`). */
  const baselineOf = (kid: Marking): number | undefined => {
    const mc = markingComponent(p, catalog, kid.id);
    if (mc === null) return undefined;
    const values = drawingValues(p, mc.annotation, mc.type).values;
    const drawn = componentForDrawing(p, mc.component, kid.containerId);
    return instantiate(drawn.component, values, rects.get(kid.id) as Rect, {
      measure,
      idPrefix: kid.id,
      ...drawOptions(drawn),
    }).firstBaseline;
  };

  /** What the children of one slot ask of it: their boxes (and baselines) and the size of the content. */
  interface SlotWork {
    readonly slot: ContainerSlot;
    readonly children: readonly { box: Rect; baseline: number | undefined }[];
    content: { width: number; height: number };
  }

  const workOf = (slot: ContainerSlot): SlotWork => {
    const { layout, kids } = slot;
    const baselines =
      layout.align === 'baseline' ? kids.map((kid) => baselineOf(kid)) : [];
    const children = kids.map((kid, i) => ({
      box: rects.get(kid.id) as Rect,
      baseline: baselines[i],
    }));
    return { slot, children, content: paddedContent(layout, children, null) };
  };

  const arrangeOne = (id: string) => {
    const info = containerAt(id);
    if (info === null) return;
    const { component, values, kids } = info;
    remeasureHugKids(kids);
    // What the children ask of each slot (the component's `hug`): a single line, or, with `wrap`, the
    // lines by the main-axis space the slot has (the drawing with the single-line request gives the space).
    const work = info.slots
      .filter((slot) => !isPlainNone(slot.layout))
      .map((slot) => workOf(slot));
    const filled = new Set(
      info.slots.filter((slot) => isPlainNone(slot.layout)).map((slot) => slot.id),
    );
    const contents = new Map(work.map((w) => [w.slot.id, w.content]));
    const slotOptions = (): InstantiateOptions => ({
      measure,
      idPrefix: id,
      slotContent: contents,
      filledSlots: filled,
      ...drawOptions(info),
    });
    if (work.some((w) => needsAvailable(w.slot.layout))) {
      const { root } = instantiate(
        component,
        values,
        rects.get(id) as Rect,
        slotOptions(),
      );
      for (const w of work) {
        const probe = needsAvailable(w.slot.layout)
          ? slotBoxOfScene(root, w.slot.id)
          : undefined;
        if (probe === undefined) continue;
        const { padding } = w.slot.layout;
        const available = alongTracks(w.slot.layout)
          ? probe.width - padding.left - padding.right
          : probe.height - padding.top - padding.bottom;
        w.content = paddedContent(w.slot.layout, w.children, Math.max(0, available));
        contents.set(w.slot.id, w.content);
      }
    }

    let rect = rects.get(id) as Rect;
    const sizing = resolveSizing(component, values, info.tokens);
    sizing.messages.forEach(warn);
    const fitted = applySizing(
      rect,
      sizing,
      { width: stretchedByParent(id, 'width'), height: stretchedByParent(id, 'height') },
      component.minSize,
      (fixed) =>
        measureComponent(component, values, fixed, {
          measure,
          slotContent: contents,
          filledSlots: filled,
          ...drawOptions(info),
        }),
    );
    const hugW = fitted?.hugW ?? false;
    const hugH = fitted?.hugH ?? false;
    if (fitted !== undefined) {
      rect = fitted.rect;
      rects.set(id, rect);
    }

    const { root } = instantiate(component, values, rect, slotOptions());
    for (const w of work) {
      const box = slotBoxOfScene(root, w.slot.id);
      if (box === undefined) continue;
      if (
        (!hugW && w.content.width > box.width + 0.5) ||
        (!hugH && w.content.height > box.height + 0.5)
      ) {
        warn(
          modelMessage(
            'arrange.overflow',
            { label: info.label },
            `${info.label}: content is larger than the container`,
          ),
        );
      }
      const targets = layoutChildren(box, w.slot.layout, w.children, info.direction);
      w.slot.kids.forEach((kid, i) => {
        const target = targets[i] as Rect;
        const before = rects.get(kid.id) as Rect;
        if (sameRect(before, target)) return;
        rects.set(kid.id, target);
        translate(kid.id, target.x - before.x, target.y - before.y);
      });
    }
  };

  const snapshot = () => postOrder.map((id) => rects.get(id) as Rect);
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const before = snapshot();
    warnings = new Map();
    for (const id of postOrder) arrangeOne(id);
    const after = snapshot();
    if (after.every((r, i) => sameRect(r, before[i] as Rect))) break;
  }

  for (const id of topDownIds) {
    rects.set(
      id,
      rectFromUnits(rects.get(id) as Rect, originals.get(id) as Rect, density),
    );
  }

  // Invariants: whole numbers and inside the parent (or the container). The root shrinks, the others
  // are pushed inside and only shrink if they are larger than the parent. With no parent, the limit
  // is the container (container marking) or none (canvas marking).
  for (const id of topDownIds) {
    const marking = index.markings.get(id) as Marking;
    const rect = rects.get(id) as Rect;
    const isRoot = id === markingId;
    let outer: Rect;
    let where: string;
    if (marking.parentId !== null) {
      outer = isRoot
        ? (index.markings.get(marking.parentId) as Marking).rect
        : (rects.get(marking.parentId) as Rect);
      where = labelOf(marking.parentId);
    } else if (marking.containerId === null) {
      continue; // Canvas marking with no parent: nothing limits it.
    } else {
      const container = index.containers.get(marking.containerId);
      outer = imagePixelRect(container ?? { width: 0, height: 0 });
      where = container?.name ?? marking.containerId;
    }
    const fixed = clampRect(rect, outer, isRoot ? 'shrink' : 'push');
    if (sameRect(rect, fixed)) continue;
    rects.set(id, fixed);
    translate(id, fixed.x - rect.x, fixed.y - rect.y);
    warn(
      modelMessage(
        'arrange.outside',
        { label: labelOf(id), where },
        `${labelOf(id)}: does not fit in ${where}`,
      ),
    );
  }

  const changed = topDownIds.filter(
    (id) => !sameRect(rects.get(id) as Rect, (index.markings.get(id) as Marking).rect),
  );
  if (changed.length === 0) return { project: p, warnings: [...warnings.values()] };
  const locks = markingLockStates(p);
  if (changed.some((id) => locks.has(id))) fail('locked');
  const next = new Set(changed);
  return {
    project: settleFrom(
      p,
      {
        ...p,
        markings: p.markings.map((m) =>
          next.has(m.id) ? { ...m, rect: rects.get(m.id) as Rect } : m,
        ),
      },
      options,
    ),
    warnings: [...warnings.values()],
  };
}

/** What fitting to the content needs from a component marking with no children in the slot. */
interface FitTarget {
  readonly marking: Marking;
  readonly component: ComponentFile;
  readonly tokens: ResolvedTokens | undefined;
  readonly direction: ReadingDirection;
  /** The marking's anchor as the drawing reads it (`$anchor.*`); `undefined` with no anchor. */
  readonly anchor: InstanceAnchor | undefined;
  readonly values: FieldValues;
  readonly parent: Container | null;
}

/**
 * The marking is of a component whose evaluated `sizing` depends on the content (`hug` or px by
 * expression) on one of the axes and which is not a component with a slot with children (that one
 * is arranged: `arrangeMarking` already fits its `hug`). `null` when it is not.
 */
function fitTargetOf(
  p: Project,
  catalog: ComponentCatalog,
  marking: Marking,
): FitTarget | null {
  if (containerOf(p, catalog, marking.id) !== null) return null;
  const mc = markingComponent(p, catalog, marking.id);
  if (mc === null) return null;
  // Children in a slot without a `row`/`column` layout do not fit either: measuring without them
  // would shrink the component and the settle would take the children out of it.
  const hasKids = (projectIndex(p).children.get(marking.id)?.length ?? 0) > 0;
  if (hasKids && componentSlots(mc.component).length > 0) return null;
  const values = drawingValues(p, mc.annotation, mc.type).values;
  const drawn = componentForDrawing(p, mc.component, marking.containerId);
  const followed = followedAxes(resolveSizing(mc.component, values, drawn.tokens));
  if (!followed.width && !followed.height) return null;
  return {
    marking,
    component: drawn.component,
    tokens: drawn.tokens,
    direction: drawn.direction,
    anchor: measuringAnchor(p, marking, mc.component),
    values,
    parent: marking.parentId === null ? null : containerOf(p, catalog, marking.parentId),
  };
}

/**
 * Can be fit to the content: the marking is of a component with no children in the slot whose
 * `sizing` (hug or expression) depends on the content on an axis. It measures nothing (the
 * menu's and the button's question).
 */
export function canFit(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): boolean {
  const marking = projectIndex(p).markings.get(markingId);
  return marking !== undefined && fitTargetOf(p, catalog, marking) !== null;
}

/**
 * Arrange on a marking fits it to the content (`fitMarking`) and does not arrange children: it is
 * of a component that is not arranged (no `row`/`column` slot with children). A marking with no
 * component stays with `arrangeMarking` (and its `not-arrangeable`).
 */
export function arrangesByFit(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
): boolean {
  return (
    containerOf(p, catalog, markingId) === null &&
    markingComponent(p, catalog, markingId) !== null
  );
}

function optionalMaxWidth(value: number | undefined): { maxWidth?: number } {
  return value === undefined || value < MIN_STORED_MARKING_SIZE
    ? {}
    : { maxWidth: value };
}

/** The width left from position `x` to the container image's edge; on the canvas there is no limit. */
function widthToImageEdge(p: Project, marking: Marking): number | undefined {
  if (marking.containerId === null) return undefined;
  const container = projectIndex(p).containers.get(marking.containerId);
  return container === undefined
    ? undefined
    : right(imagePixelRect(container)) - marking.rect.x;
}

/**
 * One axis of a fitted box inside the image's span: a box that fits the image slides back from the edge
 * (the content stays whole); only one larger than the image keeps its start and is cut at the edge.
 */
function slideInto(
  start: number,
  size: number,
  lo: number,
  hi: number,
): { start: number; size: number } {
  if (start + size <= hi) return { start, size };
  return size <= hi - lo
    ? { start: hi - size, size }
    : { start, size: Math.max(0, hi - start) };
}

/**
 * The rectangle inside the container's image (the fit does not go past it): a fitted box that is past the
 * edge but fits the image moves back inside (a hug text that cannot wrap is not cut at the edge); one
 * larger than the image is cut at it. On the canvas there is no limit.
 */
function withinImage(p: Project, marking: Marking, rect: Rect): Rect {
  if (marking.containerId === null) return rect;
  const container = projectIndex(p).containers.get(marking.containerId);
  if (container === undefined) return rect;
  const image = imagePixelRect(container);
  const across = slideInto(rect.x, rect.width, image.x, right(image));
  const down = slideInto(rect.y, rect.height, image.y, bottom(image));
  return { x: across.start, y: down.start, width: across.size, height: down.size };
}

/**
 * Fits a component's marking to the content (decision 14 of #898): each axis whose `sizing` is
 * `hug` (or an expression that gives `hug` or px) becomes the size measured with the annotation's
 * values, rounded up, between the `minSize` and the limits of the component's root and never below
 * `MIN_STORED_MARKING_SIZE`. The position (top-left corner) stays; the `fill` axis, the absent one
 * and the one the parent's `align: stretch` stretches do not change; the result never goes past the
 * image (a box that fits the image slides back inside it, one larger is cut at the edge). Only by the
 * person's or the agent's action: never on load or when editing a value. Settles
 * at the end (the marking may come to contain others), in one undo entry. Returns the same
 * `Project` when nothing changes; fails with `not-found`, `not-fittable` (no axis depends on the
 * content, the marking is not of a component or is a component with children in the slot, which
 * is arranged) and `locked` (the geometry is locked and would change).
 */
export function fitMarking(
  p: Project,
  catalog: ComponentCatalog,
  markingId: string,
  measure: TextMeasurer,
  options?: SettleOptions,
): Project {
  const marking = findById(p.markings, markingId);
  const target = fitTargetOf(p, catalog, marking) ?? fail('not-fittable', markingId);
  const auto: { width?: boolean; height?: boolean } = {};
  if (stretchedBy(target.parent, target.marking.id, 'width')) auto.width = false;
  if (stretchedBy(target.parent, target.marking.id, 'height')) auto.height = false;
  // Measures in component units and writes in image pixels (× density, rounded up).
  const density = effectiveDensity(p, marking.containerId);
  const base = rectToUnits(marking.rect, density);
  const edge = widthToImageEdge(p, marking);
  const fitted = fitComponentSize(
    target.component,
    target.values,
    { measure, ...drawOptions(target) },
    {
      base,
      auto,
      ...optionalMaxWidth(edge === undefined ? undefined : edge / density),
    },
  );
  if (fitted === undefined) return p;
  const pixels = (axis: 'width' | 'height'): number =>
    fitted[axis] === base[axis]
      ? marking.rect[axis]
      : Math.max(MIN_STORED_MARKING_SIZE, unitsToPixels(fitted[axis], density));
  const rect = withinImage(p, marking, {
    ...marking.rect,
    width: pixels('width'),
    height: pixels('height'),
  });
  if (sameRect(rect, marking.rect)) return p;
  if (markingLockStates(p).has(markingId)) fail('locked');
  return settleFrom(
    p,
    { ...p, markings: p.markings.map((m) => (m.id === markingId ? { ...m, rect } : m)) },
    options,
  );
}

/** Snap options: the settle and the component's anchor defaults (offset in units). */
export interface SnapToAnchorOptions extends SettleOptions {
  readonly defaults?: AnchorDefaultsSource<Marking>;
}

function defaultsOf(
  source: AnchorDefaultsSource<Marking> | undefined,
  marking: Marking,
): AnchorDefaultsUnits | undefined {
  return typeof source === 'function' ? source(marking) : source;
}

/** The rectangle of the marking snapped to the anchor, clamped to the container's image (and whether clamping was needed). */
function snappedRect(
  p: Project,
  marking: Marking,
  options: SnapToAnchorOptions | undefined,
): { readonly rect: Rect; readonly clamped: boolean } {
  const index = projectIndex(p);
  const anchor = marking.anchor ?? fail('not-anchored', marking.id);
  const target = index.markings.get(anchor.to) ?? fail('anchor-missing', anchor.to);
  const resolved = resolveMarkingAnchor(
    anchor,
    defaultsOf(options?.defaults, marking),
    effectiveDensity(p, marking.containerId),
  );
  const wanted = anchoredRect(
    target.rect,
    marking.rect,
    resolved,
    effectiveDirection(p, marking.containerId),
  );
  const container =
    marking.containerId === null ? undefined : index.containers.get(marking.containerId);
  return container === undefined
    ? { rect: wanted, clamped: false }
    : clampedInto(wanted, imagePixelRect(container));
}

/** The warning that the snap went past the container and was clamped inside it. */
function clampedWarning(p: Project, marking: Marking): ModelMessage {
  const label = marking.name ?? marking.id;
  const container =
    marking.containerId === null
      ? undefined
      : projectIndex(p).containers.get(marking.containerId);
  const where = container?.name ?? marking.containerId ?? '';
  return modelMessage(
    'arrange.outside',
    { label, where },
    `${label}: does not fit in ${where}`,
  );
}

/**
 * Snaps the anchored marking (`anchor`) to the anchor (R3, decision 12) and takes its children and
 * the markings anchored to it along (`withAnchoredFollowers`, the same as `moveMarking`). It
 * computes the rectangle by `side`, `align` and `offset` (`anchoredRect`; what is missing comes from
 * `options.defaults`, its `offset` in units × the container's density), keeps the size and, in a
 * container, clamps the result inside the image with a warning (`arrange.outside`). Settles at the
 * end, in one undo entry. Returns the same `Project` when the rectangle does not change (the lock
 * does not count); fails with `not-found`, `not-anchored` (the marking has no anchor) and `locked`
 * (the geometry is locked and would change). Only by the person's or the agent's action.
 */
export function snapToAnchor(
  p: Project,
  markingId: string,
  options?: SnapToAnchorOptions,
): ArrangeResult {
  const marking = projectIndex(p).markings.get(markingId) ?? fail('not-found', markingId);
  const snapped = snappedRect(p, marking, options);
  const followers = withAnchoredFollowers(p, [markingId]);
  const { dx, dy, limited } = followersDelta(p, marking, snapped.rect, followers);
  const warnings = snapped.clamped || limited ? [clampedWarning(p, marking)] : [];
  if (dx === 0 && dy === 0) return { project: p, warnings };
  if (markingLockStates(p).has(markingId)) fail('locked');
  // The children and the ones anchored to it (and those anchored to those) move by the same offset,
  // as in `moveMarking`; the size does not change, so the offset is the corner's.
  const next = {
    ...p,
    markings: p.markings.map((m) =>
      followers.has(m.id) ? { ...m, rect: translateRect(m.rect, dx, dy) } : m,
    ),
  };
  return { project: settleFrom(p, next, options), warnings };
}

/**
 * The snap offset, reduced so that the set that moves together (`followers`, the marking
 * included) stays inside the container's image: a follower that left it would be converted into a
 * canvas marking by the settle, dropping the anchor without a warning. Without a container
 * (canvas) there is no limit. `limited`: the offset had to be reduced beyond what was clamped on
 * the marking itself.
 */
function followersDelta(
  p: Project,
  marking: Marking,
  rect: Rect,
  followers: ReadonlySet<string>,
): { readonly dx: number; readonly dy: number; readonly limited: boolean } {
  const wanted = { dx: rect.x - marking.rect.x, dy: rect.y - marking.rect.y };
  const index = projectIndex(p);
  const container =
    marking.containerId === null ? undefined : index.containers.get(marking.containerId);
  if (container === undefined) return { ...wanted, limited: false };
  const bounds = imagePixelRect(container);
  let [loX, hiX, loY, hiY] = [-Infinity, Infinity, -Infinity, Infinity];
  for (const id of followers) {
    const r = (index.markings.get(id) as Marking).rect;
    loX = Math.max(loX, bounds.x - r.x);
    hiX = Math.min(hiX, bounds.x + bounds.width - (r.x + r.width));
    loY = Math.max(loY, bounds.y - r.y);
    hiY = Math.min(hiY, bounds.y + bounds.height - (r.y + r.height));
  }
  // A set wider than the image has no offset that fits it: it does not move on that axis.

  const fit = (v: number, lo: number, hi: number): number =>
    lo > hi ? 0 : Math.min(Math.max(v, lo), hi);
  const dx = fit(wanted.dx, loX, hiX);
  const dy = fit(wanted.dy, loY, hiY);
  return { dx, dy, limited: dx !== wanted.dx || dy !== wanted.dy };
}
