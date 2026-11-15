// The slots of an instance as `assignSlots` reads them, in one place for the three callers (the drawing, Arrange
// and the creation of a marking): the visible slots keep the boxes of the probe (the instance drawn with the
// slots empty) and a slot hidden by its `visible` joins with the box it would have if visible, from a second
// pass of `instantiate` with `revealSlots` (#1978, option A). Pure: no DOM.
import { instantiate, type InstantiateOptions } from './components/instantiate';
import type { FrameNode } from './components/scene';
import type { Rect } from './types';
import { slotsOfScene } from './components/arrange';
import { componentSlots, slotKey, slotGrows, type SlotInput } from './components/slots';
import type { ComponentFile, FieldValues } from './components/componentFormat';
import type { UnitSpace } from './density';

/** What the type declares about a slot (`accepts` and `max`), by slot id. */
export interface SlotDef {
  readonly id: string;
  readonly accepts?: ReadonlySet<string> | undefined;
  readonly max?: number | undefined;
}

/** A slot hidden by `visible`: the box it would have if visible (image pixels) and its label. */
export interface RevealedSlot {
  readonly box: Rect;
  readonly name: string;
}

export interface SlotInputs {
  /** Every slot of the component that has a box, in the order visible then hidden; hidden ones carry `hidden`. */
  readonly inputs: readonly SlotInput[];
  /** The hidden slots, by id. Empty when the component has no children or no hidden slot. */
  readonly revealed: ReadonlyMap<string, RevealedSlot>;
}

const NO_REVEALED: ReadonlyMap<string, RevealedSlot> = new Map();

/**
 * The inputs of `assignSlots`. `probe` is the scene drawn with the slots empty; the revealed pass (`target` and
 * `options` are the probe's) runs only when `hasKids` and some slot of the component is missing from the probe
 * (a repeat has no slots, and a component with every slot visible costs nothing extra).
 */
export function slotInputsOf(args: {
  readonly component: ComponentFile;
  readonly values: FieldValues;
  readonly target: Rect;
  readonly options: InstantiateOptions;
  readonly probe: FrameNode;
  readonly space: UnitSpace;
  readonly defs: ReadonlyMap<string, SlotDef>;
  readonly hasKids: boolean;
}): SlotInputs {
  const { component, space, defs } = args;
  const templates = componentSlots(component);
  const grows = new Map(templates.map((slot) => [slotKey(slot), slotGrows(slot)]));
  const seen = slotsOfScene(args.probe);
  const input = (id: string, box: Rect, hidden: boolean): SlotInput => ({
    id,
    box: space.toPixels(box),
    accepts: defs.get(id)?.accepts,
    max: defs.get(id)?.max,
    grows: grows.get(id) ?? false,
    ...(hidden ? { hidden: true } : {}),
  });
  const inputs = [...seen].map(([id, slot]) => input(id, slot.box, false));
  const missing = templates.filter((slot) => !seen.has(slotKey(slot)));
  if (!args.hasKids || missing.length === 0) return { inputs, revealed: NO_REVEALED };
  const scene = slotsOfScene(
    instantiate(component, args.values, args.target, {
      ...args.options,
      revealSlots: true,
    }).root,
  );
  const revealed = new Map<string, RevealedSlot>();
  for (const template of missing) {
    const id = slotKey(template);
    const slot = scene.get(id);
    if (slot === undefined) continue;
    inputs.push(input(id, slot.box, true));
    revealed.set(id, { box: space.toPixels(slot.box), name: slot.name });
  }
  return { inputs, revealed: revealed.size === 0 ? NO_REVEALED : revealed };
}
