/**
 * Laboratório "Componentes": arrumação por tamanhos (fase L2). Recebe uma tela **sem
 * geometria** (uma árvore de nós com tipo, valores e filhos, mais as raízes ancoradas) e
 * calcula o retângulo de cada instância a partir do dimensionamento dos componentes
 * (`sizing`: px, `fill` ou `hug`). A tela é o container raiz, em coluna. A saída é a descrição
 * neutra de tela (`Screen`), a mesma que o visualizador e o editor desenham. Puro, sem DOM: o
 * texto é medido pelo `TextMeasurer` injetado.
 */
import type { FieldValues } from './componentFormat';
import type { TextMeasurer } from './instantiate';
import type { Library } from './library';
import type { Screen } from './screen';

/** Nó da árvore sem geometria. */
export interface LayoutNode {
  /** Vira o id da instância (único na tela). */
  readonly id: string;
  /** Id do tipo de anotação na biblioteca. */
  readonly typeId: string;
  readonly values: FieldValues;
  /** Vão para o slot do componente, na ordem. */
  readonly children: readonly LayoutNode[];
}

/** Âncora de uma raiz fora do fluxo, na tela (`start`/`end` = esquerda/direita). */
export type ScreenAnchor =
  | 'top-start'
  | 'top'
  | 'top-end'
  | 'start'
  | 'center'
  | 'end'
  | 'bottom-start'
  | 'bottom'
  | 'bottom-end';

export const SCREEN_ANCHORS: readonly ScreenAnchor[] = [
  'top-start',
  'top',
  'top-end',
  'start',
  'center',
  'end',
  'bottom-start',
  'bottom',
  'bottom-end',
];

export interface LayoutRoot {
  readonly node: LayoutNode;
  /** Ausente = no fluxo (coluna da tela); presente = fora do fluxo, ancorada na tela. */
  readonly anchor?: ScreenAnchor;
  /** Distância das bordas da âncora (px; padrão 0). Só com `anchor`. */
  readonly margin?: number;
  /**
   * Tipo de anotação desenhado por baixo da raiz, cobrindo a tela inteira (película de um
   * modal). A instância dele entra logo antes da raiz, com id `<id da raiz>#scrim`.
   */
  readonly scrimTypeId?: string;
}

export interface LayoutScreen {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly background: string;
  /** Ordem de desenho: a primeira raiz fica por baixo. */
  readonly roots: readonly LayoutRoot[];
}

export interface LayoutResult {
  readonly screen: Screen;
  /** `"<id do nó>: <mensagem>"` (ou `"tela: …"`). */
  readonly warnings: readonly string[];
}

export function layoutScreen(
  input: LayoutScreen,
  library: Library,
  measure: TextMeasurer,
): LayoutResult {
  void input;
  void library;
  void measure;
  throw new Error('layoutScreen: ainda não implementado');
}
