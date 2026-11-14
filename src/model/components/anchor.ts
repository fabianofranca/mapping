import type {
  AnchorAlign,
  AnchorSide,
  ComponentAnchor,
  ComponentFile,
  FieldValues,
} from './componentFormat';
import { ANCHOR_FIELDS } from './expressions';

// Anchor in the component engine (stage #1096, R3): the defaults of the root `anchor` of the file and the
// `$anchor.*` pseudo-fields that the instance receives. Pure functions, no DOM.

 * The defaults of how the type attaches, complete and ALREADY in pixels (the file's `offset`
 * is in units). The optional counterpart in units (what the attachment reads) is
 * `AnchorDefaultsUnits` (`anchorPlacement.ts`).
 */
export interface AnchorDefaultsPx {
  readonly side: AnchorSide;
  readonly align: AnchorAlign;
  readonly offset: { readonly main: number; readonly cross: number };
}

 * How the component prefers to attach: the root `anchor` of the file, with `side`, `align` and `offset`
 * missing meaning `top`, `center` and `{ 0, 0 }`. The `offset` (component units) is multiplied
 * by the container's `density`, and the result is in container pixels, like the `rect`. It is what
 * `snapToAnchor` uses when the marking does not state the side, the alignment or the offset.
 * `snapToAnchor` usa quando a marcação não diz o lado, o alinhamento ou o deslocamento.
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
 * The anchor as the instance reads it, ALREADY in component units and relative to the instance's box
 * (see `anchorValues`, in `componentValues.ts`, which produces it from the rectangles).
 * A âncora como a instância a lê, JÁ em unidades do componente e relativa à caixa da instância
 * (ver `anchorValues`, em `componentValues.ts`, que a produz a partir dos retângulos).
  /** The declared logical side (`top`, `bottom`, `start`, `end`): what the template picks by `$switch`. */
  /** The anchor's center (units), relative to the instance's box; may be negative or go past it. */
  /** O lado lógico declarado (`top`, `bottom`, `start`, `end`): é o que o molde escolhe por `$switch`. */
  readonly side: AnchorSide;
  /** The anchor's size (units). */
  readonly centerX: number;
  readonly centerY: number;
  /** O tamanho da âncora (unidades). */
  readonly width: number;
 * The reserved values that the anchor hands to the engine (`$anchor.side`, `.x`, `.y`, `.width`,
 * `.height`). Without an anchor the five come in empty (`null`): the template falls back to the `default` or the
 * place's default, and a field of the same name in the type's values does not see them (shadowing, like `$index`).
/**
 * Os valores reservados que a âncora entrega ao motor (`$anchor.side`, `.x`, `.y`, `.width`,
 * `.height`). Sem âncora os cinco entram vazios (`null`): o molde cai no `default` ou no padrão do
 * lugar, e um campo de mesmo nome nos valores do tipo não os vê (sombreamento, como o `$index`).
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
