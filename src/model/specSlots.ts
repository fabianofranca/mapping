// The slots of a type (stage #1080, SL3, decision 5): the slots of the type's component, each with
// the `accepts` of the specialization resolved like `allowedChildren` (ids and `{ layer, groups? }`
// clauses, by `specChildren.ts`) and the `max`. It is the list that SL4 plugs into the drawing cache
// and into `slotForPlacement`. A slot the type does not declare (or a type that declares none, or a
// specialization or type that is not applied) accepts everything and has no `max`. Pure.
import { componentSlots, slotKey, type PlacementSlot } from './components/slots';
import type { ComponentFile, SlotTemplate } from './components/componentFormat';
import type { Project } from './types';
import { resolveTypeItems } from './specChildren';
import { findTypeInSpec, getSpec } from './specLookup';
import type { SpecSlot } from './spec';

/** A slot of a type: what `slotForPlacement` reads, plus the shown `name`. */
export interface TypeSlot extends PlacementSlot {
  /** The declared `name`, else the slot's literal `label`, else its `id`. */
  readonly name: string;
}

function shownName(
  declared: SpecSlot | undefined,
  slot: SlotTemplate,
  id: string,
): string {
  if (declared?.name !== undefined) return declared.name;
  return typeof slot.label === 'string' && slot.label !== '' ? slot.label : id;
}

/**
 * The slots of `component` (the one of type `typeId` of specialization `specId`), in the template's
 * order. `accepts` is the set of type ids the slot takes (absent: everything) and `max` the number
 * of children it holds (absent: no limit).
 */
export function typeSlots(
  p: Project,
  specId: string,
  typeId: string,
  component: ComponentFile,
): readonly TypeSlot[] {
  const spec = getSpec(p, specId);
  const declared = spec === null ? undefined : findTypeInSpec(spec, typeId)?.type.slots;
  return componentSlots(component).map((slot) => {
    const id = slotKey(slot);
    const own = declared?.find((s) => s.id === id);
    const accepts =
      spec !== null && own?.accepts !== undefined
        ? new Set(resolveTypeItems(spec, own.accepts))
        : undefined;
    return { id, name: shownName(own, slot, id), accepts, max: own?.max };
  });
}
