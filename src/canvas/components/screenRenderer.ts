/**
 * Draws ONE screen inside a `Konva.Group` supplied by the caller (the
 * viewer uses one per Stage; the lab editor, one per board screen). Each instance
 * becomes a child `Konva.Group`, at the rectangle's position (screen coordinates), with the
 * `instanceId` attribute, the instantiated component (`instantiate` → `renderScene`) and a
 * transparent "hit" rectangle for the click. A type without a component (or unknown) becomes the
 * dashed reserved box, with a notice.
 *
 * `update` diffs per instance: it compares the library and each instance's object by identity
 * (`===`); only new instances or ones with a new object are (re)instantiated, those that
 * vanished are destroyed. The renderer does not know "board", "artboard" or "active screen": only
 * the group it
 * receives. It has no drag events (the editor wires its own in `onInstanceCreated`).
 */
import Konva from 'konva/lib/Core';
import { Rect as KonvaRect } from 'konva/lib/shapes/Rect';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { type RemoteImageResult, renderScene } from './renderScene';
import { DEFAULT_PALETTE, type RenderPalette } from './palette';
import type { RenderWarning } from './renderWarnings';
import { clippedSlotBox } from '../../model/components/arrange';
import { type Box, intersectClips } from '../../model/components/box';
import type { Direction, FieldValues } from '../../model/components/componentFormat';
import { type TextMeasurer, instantiate } from '../../model/components/instantiate';
import {
  type Library,
  type TypeDef,
  instanceLabel,
} from '../../model/components/library';
import {
  NO_PROVIDED,
  extendProvided,
  pickProvided,
  sameProvided,
  type ProvidedValues,
} from '../../model/components/provided';
import { type Instance, type Screen, renderOrder } from '../../model/components/screen';
import { konvaMeasurer } from './konvaMeasurer';

/** Clickable area of the instance: transparent, but it receives the pointer. */
const HIT_FILL = 'transparent';

/** Per-instance instantiation warnings (only those that have a warning). */
export type InstanceWarnings = ReadonlyMap<string, readonly string[]>;

/**
 * The texts the renderer draws or returns (the missing-type box and the warnings): the caller
 * supplies them, in its language. The renderer has no interface text of its own.
 */
export interface ScreenRendererLabels {
  /** Box text of an instance whose type has no component. */
  typeWithoutComponent(typeName: string): string;
  /** Box text of an instance whose type the library does not have. */
  unknownType(typeId: string): string;
  /** Warning of the instance of a type without a component. */
  readonly warningTypeWithoutComponent: string;
  /** Warning of the instance of a type the library does not have. */
  readonly warningUnknownType: string;
  /** Text of a scene-drawing warning (`renderScene`). */
  drawWarning(warning: RenderWarning): string;
}

export interface ScreenRendererOptions {
  /** Renderer texts, in the caller's language. */
  readonly labels: ScreenRendererLabels;
  /** Colors and measures of the placeholder and the missing-type box (default: `DEFAULT_PALETTE`). */
  readonly palette?: Partial<RenderPalette>;
  /** Text measurer (default: `konvaMeasurer`). */
  readonly measure?: TextMeasurer;
  /** Called once per instance, when its group is created (the editor wires the drag here). */
  readonly onInstanceCreated?: (id: string, node: Konva.Group) => void;
  /**
   * Resolves the URL of the components' `image` node (see `RenderOptions.remoteImage`). Without it,
   * every remote image is the placeholder.
   */
  readonly remoteImage?: (url: string) => RemoteImageResult;
  /** The result will be read back (`toDataURL`): an `opaque` image becomes the placeholder. */
  readonly pixelSafe?: boolean;
}

export interface ScreenRendererUpdateOptions {
  /** Re-instantiates everything (loaded fonts, for example). */
  readonly force?: boolean;
  /**
   * Index, in the group, of the first instance (the caller may have other children before). Default
   * 0.
   */
  readonly zBase?: number;
  /**
   * Reading direction of the components' interior. When absent, the `screen.direction` applies (the
   * `rtl` screen of `layoutScreen`), otherwise `ltr`; when present, it overrides the screen's.
   * Changing it re-instantiates everything.
   */
  readonly direction?: Direction;
}

interface Mounted {
  instance: Instance;
  readonly node: Konva.Group;
  label: string | undefined;
  /** Remote URLs that the instance's last drawing requested. */
  imageUrls: readonly string[];
  /** Inherited color: the values offered by the ancestors that the last drawing read. */
  provided: ProvidedValues;
  /** What the instance's slot offers its children in the last drawing (`provide`). */
  offers: ProvidedValues | undefined;
  /** Slot box (on the screen) when it has `clip`: the children only appear inside it. */
  slotClip: Box | undefined;
  /**
   * The clip (on the screen) that the children receive: the `slotClip` inside the instance's own
   * clip.
   */
  childClip: Box | undefined;
}

/** The interior direction: the option overrides the screen's; with neither, `ltr`. */
function directionOf(screen: Screen, options: ScreenRendererUpdateOptions): Direction {
  return options.direction ?? screen.direction ?? 'ltr';
}

export class ScreenRenderer {
  private readonly measure: TextMeasurer;
  private readonly palette: RenderPalette;
  private readonly mounted = new Map<string, Mounted>();
  private readonly warningsById = new Map<string, readonly string[]>();
  private order: string[] = [];
  private direction: Direction = 'ltr';
  private library: Library | undefined;
  private typesById: ReadonlyMap<string, TypeDef> = new Map();

  constructor(
    private readonly group: Konva.Group,
    private readonly options: ScreenRendererOptions,
  ) {
    this.measure = options.measure ?? konvaMeasurer;
    this.palette = { ...DEFAULT_PALETTE, ...options.palette };
  }

  /**
   * Diff: creates, updates (only instances whose object changed) and removes; the z-order follows
   * `renderOrder(screen)` from `zBase`. A new library (another object) is equivalent to `force`.
   * Returns true if anything was created, redrawn, removed or reordered.
   */
  update(
    library: Library | undefined,
    screen: Screen,
    options: ScreenRendererUpdateOptions = {},
  ): boolean {
    const zBase = options.zBase ?? 0;
    let force = options.force === true;
    const direction = directionOf(screen, options);
    if (direction !== this.direction) {
      this.direction = direction;
      force = true;
    }
    if (library !== this.library) {
      this.library = library;
      this.typesById = new Map((library?.types ?? []).map((type) => [type.id, type]));
      force = true;
    }
    let changed = false;
    const seen = new Set<string>();
    const order: string[] = [];
    // Inherited color: what each instance's children inherit (what the parent inherited, with what it
    // offers on top), top to bottom in drawing order; one that offers nothing is passed through.
    const scopes = new Map<string, ProvidedValues>();
    renderOrder(screen).forEach((instance, index) => {
      seen.add(instance.id);
      order.push(instance.id);
      if (this.syncInstance(instance, zBase + index, force, scopes)) changed = true;
    });
    for (const [id, entry] of this.mounted) {
      if (seen.has(id)) continue;
      entry.node.destroy();
      this.mounted.delete(id);
      this.warningsById.delete(id);
      changed = true;
    }
    this.order = order;
    return changed;
  }

  /**
   * Creates, redraws or only reorders an instance (the identity diff, plus the inherited color: it
   * is also redrawn when the offered value the component reads changes). Returns true if anything
   * changed.
   */
  private syncInstance(
    instance: Instance,
    z: number,
    force: boolean,
    scopes: Map<string, ProvidedValues>,
  ): boolean {
    const current = this.mounted.get(instance.id);
    const inherited = scopes.get(instance.parentId ?? '') ?? NO_PROVIDED;
    const provided = this.readProvided(instance, inherited);
    if (current && !force && isUpToDate(current, instance, provided)) {
      scopes.set(instance.id, extendProvided(inherited, current.offers));
      const clipped = this.clipByParent(current);
      return this.setZ(current.node, z) || clipped;
    }
    const entry = current ?? this.mount(instance);
    this.renderInto(entry, instance, provided);
    if (!current) this.options.onInstanceCreated?.(instance.id, entry.node);
    scopes.set(instance.id, extendProvided(inherited, entry.offers));
    this.clipByParent(entry);
    this.setZ(entry.node, z);
    return true;
  }

  /**
   * Clips the instance by the clip its parent passes to its children (the slot box with `clip`,
   * inside the clip the parent received; the parent is always drawn first) and stores what this one
   * passes to its own. Returns true if the clip changed.
   */
  private clipByParent(entry: Mounted): boolean {
    const { parentId } = entry.instance;
    const clip =
      parentId === undefined ? undefined : this.mounted.get(parentId)?.childClip;
    entry.childClip = intersectClips(entry.slotClip, clip);
    return applyClip(entry.node, localClip(clip, entry.instance.box));
  }

  /** Of the inherited values, those the instance's component reads (none if it reads nothing). */
  private readProvided(instance: Instance, inherited: ProvidedValues): ProvidedValues {
    const component = this.typesById.get(instance.typeId)?.component;
    return component === undefined ? NO_PROVIDED : pickProvided(inherited, component);
  }

  /** Creates the instance group and registers it (the drawing comes from `renderInto`). */
  private mount(instance: Instance): Mounted {
    const node = new Konva.Group();
    node.setAttr('instanceId', instance.id);
    const entry: Mounted = {
      instance,
      node,
      label: undefined,
      imageUrls: [],
      provided: NO_PROVIDED,
      offers: undefined,
      slotClip: undefined,
      childClip: undefined,
    };
    this.group.add(node);
    this.mounted.set(instance.id, entry);
    return entry;
  }

  private setZ(node: Konva.Group, z: number): boolean {
    if (node.zIndex() === z) return false;
    node.zIndex(z);
    return true;
  }

  /**
   * Re-instantiates ONE instance with temporary data (live resizing in the editor), without
   * touching the screen: the next `update` with the screen's original object undoes the temporary one.
   */
  render(instance: Instance): void {
    const entry = this.mounted.get(instance.id);
    if (entry) this.renderInto(entry, instance);
  }

  /** The instance group (position = `box.x/y`). */
  nodeOf(id: string): Konva.Group | undefined {
    return this.mounted.get(id)?.node;
  }

  /** The last object drawn (includes `render`'s temporary one). */
  instanceOf(id: string): Instance | undefined {
    return this.mounted.get(id)?.instance;
  }

  /** The instance's `instanceLabel(type, values)`; without a type, the type id. */
  labelOf(id: string): string | undefined {
    return this.mounted.get(id)?.label;
  }

  /** Ids in drawing order. */
  ids(): readonly string[] {
    return this.order;
  }

  /** Warnings per instance; only those that have a warning. */
  warnings(): InstanceWarnings {
    return new Map(this.warningsById);
  }

  /**
   * The instance (of this renderer) that owns a Konva node: goes up through the parents looking for the
   * `instanceId` attribute whose group is one of ours.
   */
  instanceIdOf(target: Konva.Node | null | undefined): string | undefined {
    let node: Konva.Node | null | undefined = target;
    while (node) {
      const id: unknown = node.getAttr('instanceId');
      if (typeof id === 'string' && this.mounted.get(id)?.node === node) return id;
      node = node.getParent();
    }
    return undefined;
  }

  /** The topmost instance (the last in drawing order) whose rectangle contains the point. */
  instanceAt(point: { x: number; y: number }): string | undefined {
    for (let i = this.order.length - 1; i >= 0; i -= 1) {
      const id = this.order[i];
      const box = id === undefined ? undefined : this.mounted.get(id)?.instance.box;
      if (
        id !== undefined &&
        box &&
        point.x >= box.x &&
        point.x <= box.x + box.width &&
        point.y >= box.y &&
        point.y <= box.y + box.height
      ) {
        return id;
      }
    }
    return undefined;
  }

  /**
   * Redraws the instances that use the remote URL (the image finished loading, or changed
   * state). Returns true if any was redrawn.
   */
  refreshImage(url: string): boolean {
    let changed = false;
    for (const entry of this.mounted.values()) {
      if (!entry.imageUrls.includes(url)) continue;
      this.renderInto(entry, entry.instance);
      changed = true;
    }
    return changed;
  }

  /** Destroys the instances' groups (the received group is left to the caller). */
  dispose(): void {
    for (const { node } of this.mounted.values()) node.destroy();
    this.mounted.clear();
    this.warningsById.clear();
    this.order = [];
  }

  private renderInto(
    entry: Mounted,
    instance: Instance,
    provided: ProvidedValues = entry.provided,
  ): void {
    const { node } = entry;
    entry.instance = instance;
    entry.imageUrls = [];
    entry.provided = provided;
    entry.offers = undefined;
    entry.slotClip = undefined;
    node.destroyChildren();
    node.position({ x: instance.box.x, y: instance.box.y });
    node.scale({ x: 1, y: 1 });
    node.setAttr('boxSize', { width: instance.box.width, height: instance.box.height });
    const type = this.typesById.get(instance.typeId);
    const local = { x: 0, y: 0, width: instance.box.width, height: instance.box.height };
    if (!type?.component) {
      // Type without a component (or library without the type): the dashed box with the name.
      const { labels } = this.options;
      const { palette } = this;
      node.add(
        new KonvaRect({
          ...local,
          stroke: palette.unknownLine,
          strokeWidth: 1,
          dash: [6, 4],
          strokeScaleEnabled: false,
          fill: palette.unknownFill,
        }),
        new KonvaText({
          ...local,
          text: type
            ? labels.typeWithoutComponent(type.name)
            : labels.unknownType(instance.typeId),
          fontSize: palette.labelFontSize,
          fontFamily: palette.labelFontFamily,
          fill: palette.unknownLine,
          align: 'center',
          verticalAlign: 'middle',
          listening: false,
        }),
      );
      this.warningsById.set(instance.id, [
        type ? labels.warningTypeWithoutComponent : labels.warningUnknownType,
      ]);
      entry.label = type ? instanceLabel(type, instance.values) : instance.typeId;
      node.setAttr('label', entry.label);
      return;
    }
    const result = instantiate(type.component, instance.values as FieldValues, local, {
      measure: this.measure,
      idPrefix: instance.id,
      ...(this.direction === 'rtl' ? { direction: 'rtl' as const } : {}),
      ...(provided === NO_PROVIDED ? {} : { provided }),
    });
    entry.offers = result.provides;
    entry.slotClip = offsetBox(clippedSlotBox(result.root), instance.box);
    const rendered = renderScene(
      { root: result.root, warnings: [] },
      {
        remoteImage: this.options.remoteImage,
        pixelSafe: this.options.pixelSafe,
        palette: this.palette,
      },
    );
    entry.imageUrls = rendered.imageUrls;
    rendered.root.listening(true);
    node.add(rendered.root);
    // Whole click area (even with a transparent background).
    node.add(new KonvaRect({ ...local, fill: HIT_FILL, name: 'hit', listening: true }));
    const all = [
      ...result.warnings,
      ...rendered.warnings.map((w) => this.options.labels.drawWarning(w)),
    ];
    if (all.length > 0) this.warningsById.set(instance.id, all);
    else this.warningsById.delete(instance.id);
    entry.label = instanceLabel(type, instance.values);
    node.setAttr('label', entry.label);
  }
}

/** The box shifted to the instance position (the scene starts at 0,0); a null stays null. */
function offsetBox(box: Box | undefined, origin: Box): Box | undefined {
  return box && { ...box, x: box.x + origin.x, y: box.y + origin.y };
}

/** The parent's clip in the child group's local coordinates (whose origin is `box`). */
function localClip(clip: Box | undefined, box: Box): Box | undefined {
  return (
    clip && {
      x: clip.x - box.x,
      y: clip.y - box.y,
      width: clip.width,
      height: clip.height,
    }
  );
}

/** Applies (or removes) the group's clip; returns true if it changed. */
function applyClip(node: Konva.Group, next: Box | undefined): boolean {
  // Width 0 (a collapsed slot) is also a clip: Konva clips with any number (everything).
  const before =
    typeof node.clipWidth() === 'number'
      ? [node.clipX(), node.clipY(), node.clipWidth(), node.clipHeight()]
      : undefined;
  const after = next && [next.x, next.y, next.width, next.height];
  if (before?.join() === after?.join()) return false;
  node.clipX(next?.x);
  node.clipY(next?.y);
  node.clipWidth(next?.width);
  node.clipHeight(next?.height);
  return true;
}

/** The drawn scene is already that of the instance and the inherited values (nothing to redraw). */
function isUpToDate(
  entry: Mounted,
  instance: Instance,
  provided: ProvidedValues,
): boolean {
  return entry.instance === instance && sameProvided(entry.provided, provided);
}
