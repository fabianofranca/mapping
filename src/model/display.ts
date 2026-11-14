import { projectIndex } from './projectIndex';
import type { Layer, Project } from './types';

// How markings appear according to the annotations in the
// visible layers. Pure functions: the canvas only applies the result.

/** Display modes of the markings (device preference, outside the JSON). */
export const MARKING_DISPLAY_MODES = ['all', 'dim', 'hide'] as const;
export type MarkingDisplayMode = (typeof MARKING_DISPLAY_MODES)[number];

/** A layer with an annotation of its own on the marking. */
export interface LayerDot {
  readonly layer: Layer;
}

/**
 * Visible layers with an annotation of their own on each marking, in `layers` order. Markings with
 * none do not appear on the map. Arrows (v13) come in like markings, by their id.
 */
export function layerDotsByMarking(
  p: Project,
  layers: readonly Layer[],
): Map<string, LayerDot[]> {
  const order = new Map(layers.map((l, i) => [l.id, i]));
  const own = new Map<string, Set<number>>();
  for (const a of p.annotations) {
    const index = order.get(a.layerId);
    if (index === undefined) continue;
    const set = own.get(a.markingId) ?? new Set<number>();
    set.add(index);
    own.set(a.markingId, set);
  }

  const result = new Map<string, LayerDot[]>();
  for (const owner of [...p.markings, ...p.arrows]) {
    const ownSet = own.get(owner.id);
    if (!ownSet) continue;
    const indexes = [...ownSet].sort((a, b) => a - b);
    result.set(
      owner.id,
      indexes.map((i) => ({ layer: layers[i] as Layer })),
    );
  }
  return result;
}

const NO_ALWAYS_SHOWN: ReadonlySet<string> = new Set();

/**
 * `full`: drawn normally. `dim`: faded. `outline`: only the faded border,
 * without text or indicators (ancestor of a visible marking, in Hide mode).
 * `hidden`: does not appear nor receive touch.
 */
export type MarkingVisibility = 'full' | 'dim' | 'outline' | 'hidden';

/**
 * Visibility of each marking according to the mode. "Without annotation" = without an annotation
 * of its own or inherited in any visible layer: `dots` comes from `layerDotsByMarking` with
 * the visible layers. The selected one
 * always appears whole. In Hide mode, the ancestor without annotation of a
 * marking that appears is left with only the border, to keep the context. `alwaysShown`: markings
 * that draw a component are screen content, not "without annotation": the filter does not
 * fade or hide them (they stay `full`, like the selected ones).
 */
export function markingVisibility(
  p: Project,
  dots: ReadonlyMap<string, readonly LayerDot[]>,
  mode: MarkingDisplayMode,
  selectedMarkingId: string | null,
  alwaysShown: ReadonlySet<string> = NO_ALWAYS_SHOWN,
): Map<string, MarkingVisibility> {
  const result = new Map<string, MarkingVisibility>();
  const shown = (id: string) =>
    dots.has(id) || id === selectedMarkingId || alwaysShown.has(id);
  const absent = mode === 'hide' ? 'hidden' : 'dim';
  for (const m of p.markings) {
    result.set(m.id, mode === 'all' || shown(m.id) ? 'full' : absent);
  }
  if (mode !== 'hide') return result;

  const byId = projectIndex(p).markings;
  for (const m of p.markings) {
    if (!shown(m.id)) continue;
    let parentId = m.parentId;
    // Stops on finding an already resolved ancestor (the rest of the chain is too).
    while (parentId !== null && result.get(parentId) === 'hidden') {
      result.set(parentId, 'outline');
      parentId = byId.get(parentId)?.parentId ?? null;
    }
  }
  return result;
}
