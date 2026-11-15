import {
  slotParam,
  specTypeSlots,
  type ComponentFile,
  type Marking,
  type Spec,
  type SpecAnnotationType,
} from '../src/model';
import { projectDrawings } from './drawings';
import type { Refs } from './items';

// The named slots in the reads (stage #1080, SL5, decision 12): the slots of a type (with `accepts` resolved, `max`
// and the parameter of each platform) and what a marking holds in them or sits in. A slot without `id` (the
// component of a single slot, as before) shows nothing: the answers stay the ones of before.

type Json = Record<string, unknown>;

/**
 * The slots of a type with an `id`, in the template's order: `{ id, name, description?, accepts, max, parameters? }`.
 * `accepts` is the resolved list of type ids (`null`: any type with a component), `max` the number of children
 * (`null`: no limit) and `parameters` the parameter of each platform that has a `code` for the type. `null`
 * when the component has no slot with an `id`.
 */
export function typeSlotsView(
  spec: Spec,
  type: SpecAnnotationType,
  component: ComponentFile | undefined,
): Json[] | null {
  if (component === undefined) return null;
  const slots = specTypeSlots(spec, type.id, component).filter((slot) => slot.id !== '');
  if (slots.length === 0) return null;
  const platforms = Object.entries(type.code ?? {});
  return slots.map((slot) => ({
    id: slot.id,
    name: slot.name,
    ...(slot.description === undefined ? {} : { description: slot.description }),
    accepts: slot.accepts === undefined ? null : [...slot.accepts],
    max: slot.max ?? null,
    ...(platforms.length === 0
      ? {}
      : {
          parameters: Object.fromEntries(
            platforms.map(([platform, code]) => [platform, slotParam(code, slot.id)]),
          ),
        }),
  }));
}

/**
 * `slots` of the marking that draws a component with named slots: `{ id, name, children, fallback }` per slot,
 * `children` as references in the order of the siblings and `fallback` for "the slot shows its default
 * content". Empty object when the marking has no slot with an `id`.
 */
export function markingSlotsView(refs: Refs, marking: Marking): Json {
  const drawing = projectDrawings(refs.loaded).get(marking.id);
  const slots = drawing?.slots.filter((slot) => slot.id !== '') ?? [];
  if (slots.length === 0) return {};
  return {
    slots: slots.map((slot) => ({
      id: slot.id,
      name: slot.name,
      children: slot.children.map((id) => refs.ref('m', id)),
      fallback: slot.fallback,
    })),
  };
}

/**
 * `slot` of a child marking: `{ id, name }` of the slot its mother holds it in, or `null` when the mother's slot
 * has no `id` or no slot receives the child. Empty object when the mother is not a component with slots.
 */
export function childSlotView(refs: Refs, marking: Marking): Json {
  const drawing =
    marking.parentId === null
      ? undefined
      : projectDrawings(refs.loaded).get(marking.parentId);
  if (drawing === undefined || drawing.slots.length === 0) return {};
  const id = drawing.slotOf.get(marking.id) ?? '';
  const slot = id === '' ? undefined : drawing.slots.find((s) => s.id === id);
  return { slot: slot === undefined ? null : { id: slot.id, name: slot.name } };
}
