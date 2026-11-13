import type {
  AnchorAlign,
  AnchorSide,
  ComponentAnchor,
  ComponentFile,
  FieldValues,
} from './componentFormat';
import { ANCHOR_FIELDS } from './expressions';

// Âncora no motor dos componentes (etapa #1096, R3): os padrões do `anchor` da raiz do arquivo e os
// pseudo-campos `$anchor.*` que a instância recebe. Funções puras, sem DOM.

/** Os padrões de como o tipo encosta, JÁ em pixels (o `offset` do arquivo é em unidades). */
export interface AnchorDefaults {
  readonly side: AnchorSide;
  readonly align: AnchorAlign;
  readonly offset: { readonly main: number; readonly cross: number };
}

/**
 * Como o componente prefere encostar: o `anchor` da raiz do arquivo, com `side`, `align` e `offset`
 * ausentes valendo `top`, `center` e `{ 0, 0 }`. O `offset` (unidades do componente) é multiplicado
 * pela `density` do container, e o resultado está em pixels do container, como o `rect`. É o que o
 * `snapToAnchor` usa quando a marcação não diz o lado, o alinhamento ou o deslocamento.
 */
export function componentAnchorDefaults(
  file: ComponentFile,
  density: number,
): AnchorDefaults {
  const declared: ComponentAnchor = file.anchor ?? {};
  const offset = declared.offset ?? {};
  return {
    side: declared.side ?? 'top',
    align: declared.align ?? 'center',
    offset: { main: (offset.main ?? 0) * density, cross: (offset.cross ?? 0) * density },
  };
}

/**
 * A âncora como a instância a lê, JÁ em unidades do componente e relativa à caixa da instância
 * (ver `anchorValues`, em `componentValues.ts`, que a produz a partir dos retângulos).
 */
export interface InstanceAnchor {
  /** O lado lógico declarado (`top`, `bottom`, `start`, `end`): é o que o molde escolhe por `$switch`. */
  readonly side: AnchorSide;
  /** O centro da âncora (unidades), relativo à caixa da instância; pode ser negativo ou passar dela. */
  readonly centerX: number;
  readonly centerY: number;
  /** O tamanho da âncora (unidades). */
  readonly width: number;
  readonly height: number;
}

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
