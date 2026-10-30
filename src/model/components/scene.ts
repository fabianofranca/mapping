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
      readonly fit?: 'cover' | 'contain' | 'fill';
      readonly opacity?: number;
    };

export interface Stroke {
  readonly paints: readonly Paint[];
  readonly width: number;
  /** Figma alinha o traço por dentro, no centro ou por fora; SVG é sempre `center`. */
  readonly align: 'inside' | 'center' | 'outside';
  readonly dash?: readonly number[];
  readonly cap?: 'butt' | 'round' | 'square';
  readonly join?: 'miter' | 'round' | 'bevel';
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
  readonly verticalAlign: 'top' | 'middle' | 'bottom';
  readonly decoration?: 'underline' | 'line-through';
}

interface NodeBase {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  /** 0..1, do nó inteiro (filhos incluídos). */
  readonly opacity: number;
  readonly transform: Matrix;
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

export interface TextNode extends NodeBase {
  readonly type: 'text';
  readonly text: string;
  readonly style: TextStyle;
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

export function countNodes(node: SceneNode): number {
  let n = 0;
  for (const found of walk(node)) if (found) n++;
  return n;
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

export interface AbsoluteBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Caixa de cada nó no espaço da raiz, compondo só as translações (rotação e escala são
 * ignoradas: servem os quadros e slots de um template, que não giram).
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
