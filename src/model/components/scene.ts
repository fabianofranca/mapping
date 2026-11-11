/**
 * Motor dos componentes (etapa Biblioteca): cena.
 *
 * Modelo de cena: o que `instantiate` produz a partir de um template de componente e o
 * que o renderizador Konva consome. É um subconjunto pequeno e neutro de um modelo de
 * design, só com o que dá para desenhar no canvas sem rede:
 * nada de fontes remotas, imagens por `imageRef` ou efeitos que o canvas 2D não tem.
 *
 * Convenções:
 * - Unidades em px do design, sem nenhuma conversão de tela.
 * - `transform` é a matriz 2D do nó **relativa ao pai** (a, b, c, d, e, f, como no CSS/SVG:
 *   x' = a·x + c·y + e; y' = b·x + d·y + f). A geometria do nó (`width`/`height`, `d`,
 *   `points`) fica no espaço local, com origem no canto superior esquerdo do nó.
 * - Cores em CSS (`#rrggbb`, `#rrggbbaa` ou `rgba(...)`). A opacidade de um `Paint` é
 *   separada da do nó.
 */

import type { Box } from './box';
import type { ImageFit } from './componentFormat';
import type { RunLayout } from './richText';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Matriz 2D [a, b, c, d, e, f]. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m · n` (aplica `n` primeiro, depois `m`). */
export function multiply(m: Matrix, n: Matrix): Matrix {
  const [a, b, c, d, e, f] = m;
  const [a2, b2, c2, d2, e2, f2] = n;
  return [
    a * a2 + c * b2,
    b * a2 + d * b2,
    a * c2 + c * d2,
    b * c2 + d * d2,
    a * e2 + c * f2 + e,
    b * e2 + d * f2 + f,
  ];
}

export function translate(x: number, y: number): Matrix {
  return [1, 0, 0, 1, x, y];
}

/**
 * A matriz que leva o espaço local do nó ao do pai: `transform` mais a `rotation` em volta do
 * centro da caixa. Sem `rotation` é o próprio `transform`.
 */
export function nodeMatrix(node: {
  readonly transform: Matrix;
  readonly rotation?: number;
  readonly width: number;
  readonly height: number;
}): Matrix {
  if (!node.rotation) return node.transform;
  const rad = (node.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = node.width / 2;
  const cy = node.height / 2;
  // translate(c) · rotate · translate(-c)
  const turn: Matrix = [
    cos,
    sin,
    -sin,
    cos,
    cx - cos * cx + sin * cy,
    cy - sin * cx - cos * cy,
  ];
  return multiply(node.transform, turn);
}

export interface GradientStop {
  /** 0..1 ao longo do gradiente. */
  readonly offset: number;
  readonly color: string;
}

export type Paint =
  | { readonly type: 'solid'; readonly color: string; readonly opacity?: number }
  | {
      readonly type: 'linear';
      /** Pontos no espaço local do nó (px). */
      readonly start: Point;
      readonly end: Point;
      readonly stops: readonly GradientStop[];
      readonly opacity?: number;
    }
  | {
      readonly type: 'radial';
      readonly center: Point;
      readonly radius: number;
      readonly stops: readonly GradientStop[];
      readonly opacity?: number;
    }
  | {
      /**
       * Imagem, com duas origens que não se misturam. `src` é só a imagem embutida (`data:`),
       * herança do laboratório e dos conversores Figma/SVG. `url` é a URL remota vinda do nó
       * `image` do componente: o modelo nunca a baixa nem aplica a política (quem desenha
       * decide). Sem imagem pronta ou liberada, o renderizador desenha um reservado.
       */
      readonly type: 'image';
      readonly src?: string;
      readonly url?: string;
      /** Como a imagem ocupa a caixa (ausente = `cover`). */
      readonly fit?: ImageFit;
      readonly opacity?: number;
    };

export interface Stroke {
  readonly paints: readonly Paint[];
  readonly width: number;
  /** Figma alinha o traço por dentro, no centro ou por fora; SVG é sempre `center`. */
  readonly align: 'inside' | 'center' | 'outside';
  readonly dash?: readonly number[];
  /**
   * Afastamento do traço da forma (px > 0; ausente = 0): o traço é desenhado sobre o contorno da
   * forma crescida de `offset` de cada lado, com o raio de cada canto + `offset`, e o `align` vale
   * em relação a esse contorno. Com `sides`, vale só nos lados pedidos.
   */
  readonly offset?: number;
  readonly cap?: 'butt' | 'round' | 'square';
  readonly join?: 'miter' | 'round' | 'bevel';
  /** `false`: a largura é em pixels de tela, em qualquer zoom; ausente = escala com o zoom. */
  readonly scale?: boolean;
  /**
   * Só estes lados da caixa têm traço (`frame` e `rect`), na ordem de `STROKE_SIDES`; ausente = os
   * quatro, em contorno. A cena nunca traz os quatro lados aqui: o `instantiate` os normaliza para
   * ausente, e quem desenha lê `sides` direto.
   */
  readonly sides?: readonly ('top' | 'right' | 'bottom' | 'left')[];
  /**
   * Vãos do contorno (`frame` e `rect`, sem `sides`), já calculados pela arrumação: no lado `side`,
   * o trecho de `from` a `to` (px ao longo do lado, no espaço local do nó; x em cima e embaixo, y
   * nos lados) não tem traço. Quem desenha só interrompe o contorno (ver `gapOutlines`).
   */
  readonly gaps?: readonly StrokeGap[];
}

export interface StrokeGap {
  readonly side: 'top' | 'right' | 'bottom' | 'left';
  readonly from: number;
  readonly to: number;
}

/** Retângulo no espaço local do nó (px): o recorte ampliado de um quadro. */
export interface ClipBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Shadow {
  readonly color: string;
  readonly offset: Point;
  readonly blur: number;
  readonly spread?: number;
  /** Sombra interna: o canvas 2D não tem; o renderizador ignora e avisa. */
  readonly inner?: boolean;
}

export interface TextStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  /** 100..900. */
  readonly fontWeight: number;
  readonly italic: boolean;
  /** Altura de linha em px (ausente = automática). */
  readonly lineHeight?: number;
  /** Espaçamento entre letras em px. */
  readonly letterSpacing?: number;
  readonly align: 'left' | 'center' | 'right' | 'justify';
  readonly verticalAlign: 'top' | 'middle' | 'bottom' | 'cap-middle';
  readonly decoration?: 'underline' | 'line-through';
  /** `none` = uma linha por parágrafo (ausente = quebra por palavra). */
  readonly wrap?: 'none';
  /** O texto que não cabe termina em `…`. */
  readonly ellipsis?: true;
  /** Máximo de linhas desenhadas. */
  readonly maxLines?: number;
  /**
   * `baselinePadding.top` resolvido (px): a primeira linha de base fica a esta distância do topo
   * do nó, com o texto posto pela fonte de quem desenha (`verticalAlign` é `top`). Ausente = o
   * `verticalAlign` do estilo decide.
   */
  readonly baselineTop?: number;
}

interface NodeBase {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  /** 0..1, do nó inteiro (filhos incluídos). */
  readonly opacity: number;
  readonly transform: Matrix;
  /**
   * Rotação em graus, sentido horário, em volta do centro da caixa (`width` × `height`) do nó,
   * aplicada no espaço local antes de `transform` (ver `nodeMatrix`). Ausente = não gira. Os
   * filhos giram junto e o recorte do quadro também; a caixa e o layout não mudam.
   */
  readonly rotation?: number;
  /** Caixa local do nó (px); em `path` e `line` é a caixa dos pontos, informativa. */
  readonly width: number;
  readonly height: number;
  readonly fills: readonly Paint[];
  readonly stroke?: Stroke;
  readonly effects: readonly Shadow[];
}

export interface FrameNode extends NodeBase {
  readonly type: 'frame';
  /** Recorta os filhos na própria caixa (Figma: `clipsContent`). */
  readonly clip: boolean;
  /**
   * Recorte maior que a caixa, quando o traço `outside`/`center` ou a sombra do quadro (ou de um
   * filho que passa da caixa só por eles) sai dela; ausente = o recorte é a própria caixa. Só
   * vale com `clip`. O conteúdo (formas e texto) segue recortado na caixa.
   */
  readonly clipBox?: ClipBox;
  readonly cornerRadius: CornerRadius;
  readonly children: readonly SceneNode[];
}

export interface GroupNode extends NodeBase {
  readonly type: 'group';
  readonly children: readonly SceneNode[];
}

/** Um raio ou [superior-esquerdo, superior-direito, inferior-direito, inferior-esquerdo]. */
export type CornerRadius = number | readonly [number, number, number, number];

export interface RectNode extends NodeBase {
  readonly type: 'rect';
  readonly cornerRadius: CornerRadius;
}

export interface EllipseNode extends NodeBase {
  readonly type: 'ellipse';
}

export interface LineNode extends NodeBase {
  readonly type: 'line';
  /** Pontos no espaço local; `closed` fecha o polígono. */
  readonly points: readonly Point[];
  readonly closed: boolean;
}

export interface PathNode extends NodeBase {
  readonly type: 'path';
  /** Dados SVG (`d`), no espaço local do nó. */
  readonly d: string;
  readonly fillRule: 'nonzero' | 'evenodd';
}

/** Estilo resolvido de um trecho de texto rico (o texto e o que o desenho precisa dele). */
export interface SceneTextRun {
  readonly text: string;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontWeight: number;
  readonly italic: boolean;
  readonly color: string;
  readonly decoration?: 'underline' | 'line-through';
  /** Cor de fundo da caixa em linha; com ela o trecho é um bloco inquebrável. */
  readonly background?: string;
  readonly radius?: number;
  /** Respiro da caixa em linha: [vertical, horizontal]. */
  readonly padding?: readonly [number, number];
}

export interface TextNode extends NodeBase {
  readonly type: 'text';
  readonly text: string;
  readonly style: TextStyle;
  /**
   * Texto rico (`runs` do componente v4): o estilo resolvido de cada trecho; `text` é a
   * concatenação deles. Ausente = texto de um estilo só (`style`).
   */
  readonly runs?: readonly SceneTextRun[];
  /** As linhas dos trechos na largura do nó (posições antes do `verticalAlign`); com `runs`. */
  readonly runLayout?: RunLayout;
}

/** Nó que o conversor reconheceu, mas não sabe desenhar: vira só a caixa (e um aviso). */
export interface UnknownNode extends NodeBase {
  readonly type: 'unknown';
  /** Tipo de origem (ex.: `BOOLEAN_OPERATION`, `<foreignObject>`). */
  readonly sourceType: string;
}

export type SceneNode =
  | FrameNode
  | GroupNode
  | RectNode
  | EllipseNode
  | LineNode
  | PathNode
  | TextNode
  | UnknownNode;

export interface Scene {
  /** Raiz: um `frame` (do tamanho do design) ou `group` com os nós de nível superior. */
  readonly root: SceneNode;
  /** O que ficou de fora ou foi aproximado, para o painel do laboratório mostrar. */
  readonly warnings: readonly string[];
}

export function hasChildren(node: SceneNode): node is FrameNode | GroupNode {
  return node.type === 'frame' || node.type === 'group';
}

/** Percorre a árvore em pré-ordem. */
export function* walk(node: SceneNode): Generator<SceneNode> {
  yield node;
  if (hasChildren(node)) for (const child of node.children) yield* walk(child);
}

/** Valores padrão para montar nós sem repetir campos nos conversores e nos testes. */
export function baseNode(
  partial: Partial<NodeBase> & Pick<NodeBase, 'id' | 'name'>,
): NodeBase {
  return {
    visible: true,
    opacity: 1,
    transform: IDENTITY,
    width: 0,
    height: 0,
    fills: [],
    effects: [],
    ...partial,
  };
}

export type AbsoluteBox = Box;

/**
 * Caixa de cada nó no espaço da raiz, compondo só as translações (a `rotation` e a
 * escala são ignoradas de propósito: a `rotation` é só desenho, então a caixa de um quadro ou
 * slot é a sem giro, a que a arrumação e o conteúdo do slot usam; ver `nodeMatrix` para a
 * matriz que desenha).
 */
export function absoluteBoxes(root: SceneNode): ReadonlyMap<string, AbsoluteBox> {
  const out = new Map<string, AbsoluteBox>();
  const visit = (node: SceneNode, ox: number, oy: number) => {
    const x = ox + node.transform[4];
    const y = oy + node.transform[5];
    out.set(node.id, { x, y, width: node.width, height: node.height });
    if (hasChildren(node)) for (const child of node.children) visit(child, x, y);
  };
  visit(root, 0, 0);
  return out;
}
