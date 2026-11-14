import type {
  AnchorAlign,
  AnchorSide,
  ComponentAnchor,
  ComponentFile,
  FieldValues,
} from './componentFormat';
import { ANCHOR_FIELDS } from './expressions';

// Anchor in the component engine (stage #1096, R3): the defaults of the `anchor` at the root of
// the file and the `$anchor.*` pseudo-fields that the instance receives. Pure functions, no DOM.

/**
 * The defaults for how the type snaps, complete and ALREADY in pixels (the file's `offset` is in
 * units). The optional pair in units (what the snap reads) is `AnchorDefaultsUnits`
 * (`anchorPlacement.ts`).
 */
export interface AnchorDefaultsPx {
  readonly side: AnchorSide;
  readonly align: AnchorAlign;
  readonly offset: { readonly main: number; readonly cross: number };
}

/**
 * How the component prefers to snap: the `anchor` at the root of the file, with `side`, `align` and
 * `offset` absent defaulting to `top`, `center` and `{ 0, 0 }`. The `offset` (component units) is
 * multiplied by the container's `density`, and the result is in container pixels, like the `rect`.
 * It is what `snapToAnchor` uses when the marking does not state the side, the alignment or the
 * offset.
 */
export function componentAnchorDefaults(
  file: ComponentFile,
  density: number,
): AnchorDefaultsPx {
  const declared: ComponentAnchor = file.anchor ?? {};
  const offset = declared.offset ?? {};
  return {
    side: declared.side ?? 'top',
    align: declared.align ?? 'center',
    offset: { main: (offset.main ?? 0) * density, cross: (offset.cross ?? 0) * density },
  };
}

/**
 * The anchor as the instance reads it, ALREADY in component units and relative to the instance's
 * box (see `anchorValues`, in `componentValues.ts`, which produces it from the rectangles).
 */
export interface InstanceAnchor {
  /** The declared logical side (`top`, `bottom`, `start`, `end`); the template picks by `$switch`. */
  readonly side: AnchorSide;
  /** The anchor's center (units), relative to the instance's box; may be negative or go past it. */
  readonly centerX: number;
  readonly centerY: number;
  /** The anchor's size (units). */
  readonly width: number;
  readonly height: number;
}

/**
 * The reserved values that the anchor hands to the engine (`$anchor.side`, `.x`, `.y`, `.width`,
 * `.height`). Without an anchor the five come in empty (`null`): the template falls back to the
 * `default` or to the place's default, and a field with the same name in the type's values does
 * not see them (shadowing, like `$index`).
 */
export function anchorFieldValues(anchor: InstanceAnchor | undefined): FieldValues {
  if (anchor === undefined)
    return Object.fromEntries(ANCHOR_FIELDS.map((k) => [k, null]));
  return {
    '$anchor.side': anchor.side,
    '$anchor.x': anchor.centerX,
    '$anchor.y': anchor.centerY,
    '$anchor.width': anchor.width,
    '$anchor.height': anchor.height,
  };
}
