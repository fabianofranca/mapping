/**
 * Component engine (Library stage): format of the component file (`mapping-component`).
 *
 * A component is the generic drawing of an annotation type of the specialization. Each component
 * lives in its **own file**; the specialization's type only references it
 * (`"component": "components/button.json"`, path relative to the specialization file).
 * The drawing is a `template`: a tree of neutral primitives (frame, rectangle, ellipse, text,
 * path, slot, `repeat` in `formatVersion` 2 and `image` in 3) whose attributes can be **bound to
 * the fields** of the type by expressions (`{"$field": "label"}`, `{"$if": …}`, `{"$switch": …}`).
 * Changing a field's value in the annotation redraws the component.
 *
 * Position: the instance takes the marking's rectangle. Inside the template, each node has a
 * `layout` that says how the children are distributed (`none` with anchors, `row` or `column`), so
 * the drawing adapts to the size of the rectangle.
 */
import type { IconSet } from './icons';
import type { AnchorAlign, AnchorSide } from '../anchorSides';

export const COMPONENT_FORMAT = 'mapping-component';
/** Version in which components without `repeat` are written (the repository's generators write it). */
export const COMPONENT_FORMAT_VERSION = 1;
/** Version 2 adds the `repeat` node (the drawn table); 1 is still accepted and valid without it. */
export const COMPONENT_FORMAT_VERSION_REPEAT = 2;
/**
 * Version 3 adds the `image` node (remote image by `https://` URL); 1 and 2 are still
 * accepted unchanged (and `repeat` is valid in 2 and 3).
 */
export const COMPONENT_FORMAT_VERSION_IMAGE = 3;
/**
 * Version 4 (the "faithful components" stage) gathers the file's new keys: `stroke.cap`,
 * `stroke.join` and `stroke.sides` already here. Every v4 key in an earlier version is the error
 * `only allowed with formatVersion 4`, at the key's path. Variables (`let` on the frame and
 * `{ "$var": … }` in expressions and conditions) are also keys of 4, swapped on reading.
 */
export const COMPONENT_FORMAT_VERSION_FIDELITY = 4;
/** Accepted versions. */
export const COMPONENT_FORMAT_VERSIONS = [1, 2, 3, 4] as const;
export type ComponentFormatVersion = (typeof COMPONENT_FORMAT_VERSIONS)[number];

// ---------------------------------------------------------------------------------------
// Expressions: a literal value or a binding to fields of the annotation
// ---------------------------------------------------------------------------------------

/**
 * A row of a `table` field, as `repeat` reads it: the value of each column (text, number or
 * empty; the `ref` cell arrives as the target's label).
 */
export type FieldRow = Readonly<Record<string, string | number | null | undefined>>;

/**
 * Field value as the annotation saves it: text, number or empty (enum and date are text). A
 * `table` field arrives as the list of rows, which only the `repeat` node reads.
 */
export type FieldValue = string | number | null | undefined | readonly FieldRow[];

/** Values of the instance's fields, by the field's `key`. */
export type FieldValues = Readonly<Record<string, FieldValue>>;

/** Reading direction (v4): left to right (default) or right to left. */
export type Direction = 'ltr' | 'rtl';
export const DIRECTIONS: readonly Direction[] = ['ltr', 'rtl'];

export type Condition =
  /** "True" field: non-empty and different from `"não"`, `"false"`, `"0"`, `"off"`. */
  | { readonly $field: string }
  | { readonly $eq: readonly [field: string, value: string | number] }
  | { readonly $has: string }
  | { readonly $not: Condition }
  /** The node's effective reading direction (v4): `ltr` or `rtl`; valid wherever a condition is. */
  | { readonly $direction: Direction }
  | { readonly $and: readonly Condition[] }
  | { readonly $or: readonly Condition[] }
  /** Numeric comparisons (v4): an operand without a value gives false. */
  | { readonly $gt: readonly [Expr<number>, Expr<number>] }
  | { readonly $gte: readonly [Expr<number>, Expr<number>] }
  | { readonly $lt: readonly [Expr<number>, Expr<number>] }
  | { readonly $lte: readonly [Expr<number>, Expr<number>] };

/**
 * Boolean expression: a literal, an `Expr<boolean>` or a direct condition
 * (`{"$has": "label"}`, `{"$not": …}`). A field cited by `$field` is read by truthiness
 * (`"sim"`/`"não"`, see `truthy` in expressions.ts), never as text.
 */
export type BoolExpr = Expr<boolean> | Condition;

/** Expression that produces a value of type `T` (or the literal). */
export type Expr<T> =
  | T
  | { readonly $field: string; readonly default?: T }
  | { readonly $if: Condition; readonly then: Expr<T>; readonly else?: Expr<T> }
  | {
      readonly $switch: string;
      readonly cases: Readonly<Record<string, Expr<T>>>;
      readonly default?: Expr<T>;
    }
  /**
   * Inherited color (v4): the value that an ancestor's slot offers (`SlotTemplate.provide`) with
   * this name, the one from the nearest ancestor that offers it. Without an ancestor that offers
   * it, `default` applies (an expression); without `default`, the place's default.
   */
  | { readonly $provided: string; readonly default?: Expr<T> }
  /** Text only: concatenates the parts (numbers become text). */
  | { readonly $concat: readonly Expr<string | number>[] }
  /**
   * Number only (v4): arithmetic and trigonometric operations (`$sin`/`$cos` in degrees). An
   * operand without a value (empty, non-numeric text, division by zero) makes the operation
   * produce no value.
   */
  | { readonly $add: readonly Expr<number>[] }
  | { readonly $sub: readonly [Expr<number>, Expr<number>] }
  | { readonly $mul: readonly Expr<number>[] }
  | { readonly $div: readonly [Expr<number>, Expr<number>] }
  | { readonly $mod: readonly [Expr<number>, Expr<number>] }
  | { readonly $round: Expr<number> }
  | { readonly $floor: Expr<number> }
  | { readonly $ceil: Expr<number> }
  | { readonly $abs: Expr<number> }
  | { readonly $min: readonly Expr<number>[] }
  | { readonly $max: readonly Expr<number>[] }
  | { readonly $clamp: readonly [Expr<number>, Expr<number>, Expr<number>] }
  | { readonly $sin: Expr<number> }
  | { readonly $cos: Expr<number> }
  /** Number of rows of the `table` field (v4; with no rows, 0). */
  | { readonly $rows: string }
  /** Width or height of the instance in image px (v4; in the drawing proof and in `hug`, the component's `size`). */
  | { readonly $size: 'width' | 'height' }
  /**
   * Number of measured lines of the `text` node of the given name (v4; at most `maxLines`, empty
   * text = 0).
   * The engine lays out in two passes when the template uses `$lines` (decision 8 of #898).
   */
  | { readonly $lines: string }
  /**
   * Named value of the specialization, in the drawing's mode (v4; see `tokens.ts`). In a color
   * position,
   * `alpha` (0 to 1, literal or number `$token`) multiplies the color's alpha, and `over` (name of
   * a color token or literal color) composes the result over that color, which makes it opaque.
   */
  | {
      readonly $token: string;
      readonly alpha?: number | { readonly $token: string };
      readonly over?: string;
    };

// ---------------------------------------------------------------------------------------
// Style
// ---------------------------------------------------------------------------------------

/** CSS color (`#rrggbb`, `#rrggbbaa`, `rgba(...)`) or `"none"`. */
export type Color = string;

export interface GradientSpec {
  readonly type: 'linear';
  /** Angle in degrees (0 = left to right, 90 = top to bottom). */
  readonly angle: number;
  readonly stops: readonly { readonly offset: number; readonly color: Expr<Color> }[];
}

export type FillSpec = Color | GradientSpec;

export interface StrokeSpec {
  readonly color: Expr<Color>;
  readonly width?: Expr<number>;
  readonly align?: 'inside' | 'center' | 'outside';
  /**
   * Dashing: list of numbers ≥ 0. In v4 it accepts an expression (`$switch`/`$if`/`$field` that
   * return the list) and a number `$token` in each item; an invalid resolved value gives the
   * warning `invalid value in stroke.dash` and no dashing.
   */
  readonly dash?: Expr<readonly (number | { readonly $token: string })[]>;
  /**
   * Offset of the stroke from the shape (v4, px ≥ 0, on `frame`, `rect` and `ellipse`): the stroke
   * is drawn on the outline of the shape grown by `offset` on each side (like CSS's
   * `outline-offset`) and `align` is relative to that outline.
   */
  readonly offset?: number | { readonly $token: string };
  /** Stroke end (v4); the default is `butt`. */
  readonly cap?: Expr<'butt' | 'round' | 'square'>;
  /** Stroke corner (v4); the default is `miter`. */
  readonly join?: Expr<'miter' | 'round' | 'bevel'>;
  /** Only these sides have a stroke (v4, on `frame` and `rect`); absent = all four. */
  readonly sides?: Expr<readonly StrokeSide[]>;
  /**
   * Stroke width (v4, literal): `true` (default) scales with the zoom; `false` keeps the width
   * in screen pixels, at any zoom.
   */
  readonly scale?: boolean;
  /**
   * Gap in the outline (v4, on `frame` and `rect`, without `sides`): the side that the box of the
   * node `node` (the first with that name in the template) crosses is interrupted over the span it
   * covers, plus `padding` (px, default 0) on each side: the cut in the `OutlinedTextField` outline.
   */
  readonly gap?: StrokeGapSpec;
}

export interface StrokeGapSpec {
  readonly node: string;
  readonly padding?: Expr<number>;
}

export type StrokeSide = 'top' | 'right' | 'bottom' | 'left';
export const STROKE_SIDES: readonly StrokeSide[] = ['top', 'right', 'bottom', 'left'];

/** A corner radius: number ≥ 0 or, in v4, number `$token`. */
type Radius = number | { readonly $token: string };

export interface ShadowSpec {
  readonly color: Expr<Color>;
  /** In v4 each measure also accepts a number `$token`. */
  readonly x?: number | { readonly $token: string };
  readonly y?: number | { readonly $token: string };
  readonly blur?: number | { readonly $token: string };
  /** Grows (or, if negative, shrinks) the shadow's shape on each side (v4, px; literal or `$token`). */
  readonly spread?: number | { readonly $token: string };
}

export interface FontSpec {
  readonly family?: Expr<string>;
  readonly size?: Expr<number>;
  /** 100..900. */
  readonly weight?: Expr<number>;
  readonly italic?: BoolExpr;
  /** Multiple of the size (1.2) or px when > 3. */
  readonly lineHeight?: Expr<number>;
  readonly letterSpacing?: Expr<number>;
  /**
   * `justify` (v4): the text fills the box's width, and the last line of each paragraph stays on
   * the left. `start` (the default) and `end` (v4) follow the reading direction: `left`/`right` in
   * `ltr`, `right`/`left` in `rtl`; `left` and `right` remain physical.
   */
  readonly align?: Expr<'left' | 'center' | 'right' | 'justify' | 'start' | 'end'>;
  /** `cap-middle` centers by the capital letter's height (formatVersion 4 only). */
  readonly verticalAlign?: Expr<'top' | 'middle' | 'bottom' | 'cap-middle'>;
  readonly decoration?: Expr<'none' | 'underline' | 'line-through'>;
  /** `word` (default) wraps by word; `none` is one line per paragraph. formatVersion 4 only. */
  readonly wrap?: Expr<'word' | 'none'>;
  /** Text that does not fit ends in `…` (width with `wrap: none`; height with `maxLines`). v4 only. */
  readonly ellipsis?: BoolExpr;
  /** Maximum lines (integer ≥ 1); the last one takes the `…` (with `ellipsis`) or is cut. v4 only. */
  readonly maxLines?: Expr<number>;
}

// ---------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------

/**
 * The intrinsic measure (v4, decision 17 of #1078): `"min-content"` is the largest unbreakable
 * piece (text: the widest word) and `"max-content"` the size without wrapping (text: the widest
 * line).
 */
export type IntrinsicSize = 'min-content' | 'max-content';

/**
 * Size of a node on one axis: fixed px, `"fill"` (takes what is left in the parent; in
 * `row`/`column` splits it with the other `fill`s), `"hug"` (from the content: measured text, or
 * children), a fraction of the parent (`"50%"`) or, in v4, `"min-content"`/`"max-content"`
 * (`IntrinsicSize`).
 */
export type SizeSpec = number | 'fill' | 'hug' | IntrinsicSize | `${number}%`;

/**
 * Âncoras no pai com `layout: none`: distância da borda, como as constraints do Figma. Na
 * `formatVersion` 4 cada valor pode ser uma expressão; a que não produz número vale como âncora
 * ausente.
 */
export interface Anchors {
  readonly left?: Expr<number>;
  readonly right?: Expr<number>;
  /**
   * Lógicas (v4), no eixo horizontal: `start` é a borda de onde a leitura começa (esquerda em `ltr`,
   * direita em `rtl`) e `end` a oposta. `start` não combina com `left` nem `end` com `right`.
   */
  readonly start?: Expr<number>;
  readonly end?: Expr<number>;
  readonly top?: Expr<number>;
  readonly bottom?: Expr<number>;
  /** Centraliza no eixo (ignora left/right ou top/bottom). */
  readonly centerX?: BoolExpr;
  readonly centerY?: BoolExpr;
}

/** Tipo de layout de um quadro ou slot. */
export type LayoutType = 'none' | 'row' | 'column' | 'grid';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type LayoutJustify =
  | 'start'
  | 'center'
  | 'end'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'
  | 'stretch';
/** Quebra de fileira (v4): `none` (padrão), `wrap` ou `wrap-reverse`, como o `flex-wrap` do CSS. */
export type LayoutWrap = 'none' | 'wrap' | 'wrap-reverse';

/**
 * Layout dos filhos. Na `formatVersion` 4, `type`, `align` e `justify` aceitam expressão (o valor
 * resolvido é conferido no desenho: fora do conjunto, cai no padrão com o aviso
 * `valor inválido em layout.<chave>: <valor>`); com `type` literal `"none"` valem só `type`,
 * `align` (eixo vertical) e `justify` (eixo horizontal), com `start` (padrão), `center`, `end` e
 * `stretch` (v4): alinham os filhos sem âncora naquele eixo; a âncora do filho vence. O
 * `justify: "stretch"` vale só no `none`; em `row`/`column` é inválido.
 */
export interface LayoutSpec {
  readonly type: Expr<LayoutType>;
  readonly gap?: Expr<number>;
  /** Um valor, [vertical, horizontal] ou [cima, direita, baixo, esquerda]. */
  readonly padding?: Expr<
    number | readonly [number, number] | readonly [number, number, number, number]
  >;
  /**
   * No eixo cruzado. `baseline` (v4, só em `row`): os filhos se alinham pela primeira linha de
   * base, como o `alignByBaseline` do Compose e o `align-items: baseline` do CSS.
   */
  readonly align?: Expr<LayoutAlign>;
  /** No eixo principal (`space-around` e `space-evenly` só na v4). */
  readonly justify?: Expr<LayoutJustify>;
  /**
   * Os filhos em ordem inversa no eixo principal e o `start` passa a ser o fim, como
   * `row-reverse`/`column-reverse` do CSS (v4; booleano ou expressão; padrão `false`).
   */
  readonly reverse?: BoolExpr;
  /**
   * Quebra de fileira (v4; só em `row`/`column`): com `wrap` ou `wrap-reverse`, o filho que não
   * cabe no que resta do eixo principal vai para a linha seguinte, como o `flex-wrap` do CSS (o
   * `FlowRow`/`FlowColumn` do Compose). `wrap-reverse` empilha as linhas no sentido contrário do
   * eixo cruzado. Padrão `none`.
   */
  readonly wrap?: Expr<LayoutWrap>;
  /** Espaço entre as linhas, em px (v4; só com `wrap`; padrão 0). O `gap` fica entre os filhos da linha. */
  readonly lineGap?: Expr<number>;
  /** Filhos por linha, no máximo (v4; só com `wrap`; inteiro ≥ 1; o `maxItemsInEachRow` do Compose). */
  readonly maxPerLine?: Expr<number>;
  /** Linhas, no máximo (v4; só com `wrap`; inteiro ≥ 1): os filhos além da última não são desenhados. */
  readonly maxLines?: Expr<number>;
  /**
   * Grade (`type: "grid"`, v4; exatamente uma das quatro trilhas, números ou expressão): `columns`
   * (inteiro ≥ 1) é o `GridCells.Fixed` do Compose e o `repeat(n, 1fr)` do CSS; `minColumnWidth`
   * (> 0) o `GridCells.Adaptive` e o `repeat(auto-fit, minmax(x, 1fr))`; `rows` e `minRowHeight` os
   * mesmos na grade horizontal (que preenche colunas, o `LazyHorizontalGrid`). O `gap` fica entre
   * as trilhas e o `lineGap` entre as linhas de fluxo.
   */
  readonly columns?: Expr<number>;
  readonly minColumnWidth?: Expr<number>;
  readonly rows?: Expr<number>;
  readonly minRowHeight?: Expr<number>;
}

// ---------------------------------------------------------------------------------------
// Nós do template
// ---------------------------------------------------------------------------------------

interface TemplateNodeBase {
  /** Nome do nó (aparece na árvore e no hover); opcional. */
  readonly name?: string;
  readonly visible?: BoolExpr;
  readonly opacity?: Expr<number>;
  /**
   * `formatVersion` 4: gira o nó (e os filhos de um quadro, com o `clip` dele) em graus, no
   * sentido horário, em volta do centro da caixa. É só desenho, como o `transform` do CSS: não
   * muda layout, medida, `hug` nem a caixa do nó. Não vale na raiz. Sem valor, ou 0, não gira.
   */
  readonly rotation?: Expr<number>;
  /**
   * `formatVersion` 4: fixa a direção de leitura da subárvore (literal `ltr` ou `rtl`), em vez de
   * seguir a do container: um número de telefone, um trecho de código. O nó é posto pelo pai na
   * direção dele; o que está dentro do nó segue a que ele fixa.
   */
  readonly direction?: Direction;
  /** Tamanho no eixo; aceita expressão na `formatVersion` 4 (valor inválido cai no padrão, com aviso). */
  readonly width?: Expr<SizeSpec>;
  readonly height?: Expr<SizeSpec>;
  /**
   * Limites do tamanho (px, `formatVersion` 4; aceitam expressão), aplicados depois do
   * `fill`/`hug`/`%` e antes do `minSize` da instância. Um `fill` que bate no `max` devolve a
   * sobra aos outros `fill` do mesmo pai, como o flexbox.
   */
  readonly minWidth?: Expr<number>;
  readonly maxWidth?: Expr<number>;
  readonly minHeight?: Expr<number>;
  readonly maxHeight?: Expr<number>;
  /**
   * Trilhas que o nó ocupa num pai `layout: grid` (v4; inteiro ≥ 1, expressão; limitado ao número
   * de trilhas; padrão 1), como o `GridItemSpan` do Compose e o `grid-column: span n` do CSS.
   */
  readonly span?: Expr<number>;
  /**
   * Peso do nó `fill` no eixo principal de um pai `row`/`column` (v4; número > 0, expressão; padrão
   * 1): o que sobra é repartido na proporção dos pesos, como o `Modifier.weight` do Compose e o
   * `flex-grow` do CSS.
   */
  readonly weight?: Expr<number>;
  /** Só com pai `layout: none`. */
  readonly anchors?: Anchors;
  readonly fill?: Expr<FillSpec>;
  readonly stroke?: StrokeSpec;
  /** Uma sombra, ou (v4) de 1 a 4: a primeira fica por cima, como o `box-shadow` do CSS. */
  readonly shadow?: ShadowSpec | readonly ShadowSpec[];
  /** Na v4 cada item da lista também aceita `$token` de número. */
  readonly cornerRadius?: Expr<number | readonly [Radius, Radius, Radius, Radius]>;
}

export interface FrameTemplate extends TemplateNodeBase {
  readonly type: 'frame';
  /** Recorta os filhos pela caixa (padrão: só a raiz recorta). Expressão só na v4. */
  readonly clip?: BoolExpr;
  readonly layout?: LayoutSpec;
  readonly children?: readonly TemplateNode[];
  /**
   * Variáveis do quadro (v4, só no arquivo escrito): nome → expressão, usadas com
   * `{ "$var": "nome" }` neste quadro e nos descendentes. O `parseComponent` troca os `$var` pelo
   * conteúdo e devolve o quadro **sem** `let`: quem usa o componente lido (motor, raster,
   * visualizador, Catálogo) nunca o vê (`variables.ts`).
   */
  readonly let?: Readonly<Record<string, unknown>>;
}

export interface RectTemplate extends TemplateNodeBase {
  readonly type: 'rect';
}

export interface EllipseTemplate extends TemplateNodeBase {
  readonly type: 'ellipse';
}

/**
 * Um trecho de um texto rico (`runs`, `formatVersion` 4). Os trechos de um nó quebram linha como
 * UM texto só, pela palavra; cada chave aceita expressão e o `text` é avaliado como o `text` do
 * nó. `weight`, `italic`, `family`, `size` e `decoration` sobrepõem os do `font` do nó, e
 * `color` o `color` do nó; `lineHeight`, `letterSpacing`, `align`, `verticalAlign`, `wrap`,
 * `ellipsis` e `maxLines` continuam só do nó. Com `background`, o trecho vira uma caixa em linha
 * (o "chip"): um bloco inquebrável de `padding` (número para os dois eixos ou `[vertical,
 * horizontal]`) e `radius` de canto. `padding` e `radius` sem `background` não têm efeito.
 */
export interface TextRunTemplate {
  readonly text: Expr<string | number>;
  readonly weight?: Expr<number>;
  readonly italic?: BoolExpr;
  readonly color?: Expr<Color>;
  readonly decoration?: Expr<'none' | 'underline' | 'line-through'>;
  readonly family?: Expr<string>;
  readonly size?: Expr<number>;
  /** Cor de fundo da caixa em linha (`none` = sem caixa). */
  readonly background?: Expr<Color>;
  readonly radius?: Expr<number>;
  readonly padding?: Expr<number | readonly [number, number]>;
}

/**
 * Texto do nó: `text` (um estilo só) **ou** `runs` (trechos com estilo próprio, só na
 * `formatVersion` 4); os dois juntos não valem, e um deles é obrigatório.
 */
export interface TextTemplate extends TemplateNodeBase {
  readonly type: 'text';
  readonly text?: Expr<string | number>;
  readonly runs?: readonly TextRunTemplate[];
  readonly font?: FontSpec;
  /** Cor do texto (`fill` do nó). Padrão: `#000000`. */
  readonly color?: Expr<Color>;
  /**
   * Distâncias pela linha de base (v4), como o `Modifier.paddingFromBaseline(top, bottom)` do
   * Compose (px ≥ 0): `top` do topo da caixa do nó à primeira linha de base; `bottom`, da última
   * linha de base ao fundo da caixa.
   */
  readonly baselinePadding?: BaselinePadding;
  /**
   * Escopo da linha de um `repeat` (`$r0_1`), posto pela expansão no nó cuja contagem de linhas um
   * `$lines` da mesma linha cita; nunca vem do arquivo (o parser recusa a chave).
   */
  readonly linesScope?: string;
}

export interface BaselinePadding {
  readonly top?: Expr<number>;
  readonly bottom?: Expr<number>;
}

export interface PathTemplate extends TemplateNodeBase {
  readonly type: 'path';
  /** Dados SVG, desenhados numa caixa `viewBox` e escalados para a caixa do nó. */
  readonly d: Expr<string>;
  readonly viewBox: readonly [number, number];
  readonly fillRule?: 'nonzero' | 'evenodd';
  /** Espelha o desenho na horizontal quando a direção do nó é `rtl` (v4; padrão `false`). */
  readonly mirror?: BoolExpr;
}

/**
 * Espaço reservado para outro componente (ex.: o ícone de um botão, o conteúdo de um cartão).
 * No laboratório desenha só um contorno tracejado com o nome; na app, seria preenchido pela
 * marcação filha.
 */
export interface SlotTemplate extends TemplateNodeBase {
  readonly type: 'slot';
  readonly label?: Expr<string>;
  /**
   * Como as instâncias filhas se organizam dentro do slot (componente com slot): `row`/`column`
   * posicionam os filhos pela ordem entre irmãos e gravam os retângulos deles; `none` (ou
   * ausente) deixa cada filho no próprio retângulo. `gap` e `padding` podem vir de campos.
   */
  readonly layout?: LayoutSpec;
  /**
   * Recorta as marcações filhas pela caixa do slot (v4; booleano ou expressão; padrão `false`):
   * o desenho da filha só aparece dentro dela.
   */
  readonly clip?: BoolExpr;
  /**
   * Cor herdada (v4): valores que o slot oferece às marcações filhas, pelo nome (livre, sem nome de
   * plataforma). Cada valor é resolvido no pai (campos, tokens e modo dele) e a filha o lê com
   * `{ "$provided": "<nome>", "default": … }`, como o `CompositionLocal` do Compose. Valor que não
   * produz nada não oferece: o ancestral mais acima vale.
   */
  readonly provide?: Readonly<Record<string, Expr<string | number>>>;
}

/**
 * Tabela desenhada (`formatVersion` 2): repete o `template` (o desenho de **uma** linha) por
 * linha do campo `table` do tipo. Dentro do `template`, `{ "$field": "<coluna>" }` (e `$has`,
 * `$eq`, `$switch`) lê a coluna da linha; uma coluna **sombreia** o campo do tipo de mesmo nome
 * (o campo continua valendo para o que não é coluna). As linhas se empilham em `direction`
 * (`column`, o padrão, ou `row`) com `gap`. O nó se comporta como um quadro `hug` no eixo das
 * linhas e `fill` no outro, e o `template` é `hug` no eixo das linhas, se não disser o contrário.
 * Sem linhas, o nó fica vazio. Não pode ter `repeat` nem `slot` dentro. Só `name`, `visible`,
 * `opacity`, `width`, `height` e `anchors` valem no nó: o desenho (fundo, borda, cantos) é do
 * `template` de cada linha ou do quadro que envolve o `repeat`.
 */
export interface RepeatTemplate extends Omit<TemplateNodeBase, 'direction'> {
  readonly type: 'repeat';
  /** Chave do campo `table` do tipo cujas linhas se repetem (exatamente um de `field` e `count`). */
  readonly field?: string;
  /**
   * `formatVersion` 4: o `template` se repete `max(0, floor(count))` vezes, até 1000 (acima, 1000
   * com o aviso `repeat limitado a 1000 linhas: <nó>`). Dentro dele, `{ "$field": "$index" }` é o
   * índice da linha (0, 1, …), também no `repeat` por `field`; o do `repeat` mais interno vale.
   */
  readonly count?: Expr<number>;
  readonly direction?: 'column' | 'row';
  /** Espaço entre as linhas (px). */
  readonly gap?: Expr<number>;
  /**
   * `formatVersion` 4: `"fill"` faz o `repeat` ocupar o eixo do pai (como um filho `fill`) e
   * dividir o eixo das linhas igualmente entre elas, menos os `gap`s; o tamanho `fill` (ou
   * omitido) do `template` no eixo das linhas vale a fração. `"none"` (padrão): o `repeat` é
   * `hug` no eixo das linhas.
   */
  readonly distribute?: 'none' | 'fill';
  /**
   * `formatVersion` 4: o layout das linhas (`row`, `column` ou `grid`, completo) no lugar de
   * `direction` + `gap`; os dois juntos não valem. Sem ele, nada muda. `distribute: "fill"` não
   * combina com `grid`.
   */
  readonly layout?: LayoutSpec;
  /**
   * `formatVersion` 4: quebra do `repeat` em linha (`direction: "row"`; em `column`, as colunas), com
   * o mesmo sentido de `layout.wrap`, `lineGap`, `maxPerLine` e `maxLines` de um quadro (o `repeat`
   * não tem `layout`).
   */
  readonly wrap?: Expr<LayoutWrap>;
  readonly lineGap?: Expr<number>;
  readonly maxPerLine?: Expr<number>;
  readonly maxLines?: Expr<number>;
  /** O desenho de uma linha. */
  readonly template: FrameTemplate;
}

/** Como a imagem ocupa a caixa. `fill-width`, `fill-height`, `scale-down` e `none` são da `formatVersion` 4. */
export type ImageFit =
  'cover' | 'contain' | 'fill' | 'fill-width' | 'fill-height' | 'scale-down' | 'none';

/** Os valores de `ImageFit` que só existem na `formatVersion` 4. */
export const IMAGE_FITS_V4: readonly ImageFit[] = [
  'fill-width',
  'fill-height',
  'scale-down',
  'none',
];

/**
 * Imagem remota (`formatVersion` 3). O `src` é a URL `https://` da imagem e é **restrito**: só um
 * texto literal ou exatamente `{ "$field": "<campo>" }` (campo `string` do tipo, ou coluna
 * `string` dentro de um `repeat`). Nenhuma outra expressão (`$concat`, `$switch`, `$if`) vale,
 * para o componente não montar a URL com dados de outros campos e enviá-los ao servidor de quem
 * escreveu a especialização. `fit` (padrão `cover`) diz como a imagem ocupa a caixa. O `fill` do
 * nó é o **fundo** atrás da imagem. `width`/`height` não aceitam `hug`: a arrumação nunca
 * depende da imagem baixada. O modelo nunca baixa a imagem; quem desenha decide (o reservado
 * aparece enquanto não houver imagem pronta ou liberada).
 */
export interface ImageTemplate extends TemplateNodeBase {
  readonly type: 'image';
  readonly src: string | { readonly $field: string };
  readonly fit?: ImageFit;
}

/**
 * Ícone do conjunto da biblioteca (`formatVersion` 4; `icons` da especialização). `name` é o
 * nome no conjunto (literal ou expressão); `color` pinta os caminhos sem cor própria e os que
 * pedem a cor do nó (`fill`/`stroke` `true`); `strokeWidth` (unidades do `viewBox`) troca a
 * largura de todos os traços. O `name` é o do ícone (não há nome de nó). `hug` mede o `viewBox` do ícone. Nome fora do conjunto: reservado
 * com o aviso `ícone desconhecido: <nome>`; um nome literal fora do conjunto é erro da biblioteca.
 */
export interface IconTemplate extends Omit<TemplateNodeBase, 'name'> {
  readonly type: 'icon';
  readonly name: Expr<string>;
  readonly color?: Expr<Color>;
  readonly strokeWidth?: Expr<number>;
  /**
   * Espelha o ícone na horizontal quando a direção do nó é `rtl` (v4). Ausente vale o `mirror` do
   * ícone no conjunto (`mapping-icons` formatVersion 2), que por sua vez vale `false`.
   */
  readonly mirror?: BoolExpr;
}

export type TemplateNode =
  | FrameTemplate
  | RectTemplate
  | EllipseTemplate
  | TextTemplate
  | PathTemplate
  | SlotTemplate
  | RepeatTemplate
  | ImageTemplate
  | IconTemplate;

// ---------------------------------------------------------------------------------------
// Arquivo
// ---------------------------------------------------------------------------------------

/**
 * Como a instância se dimensiona quando chega **sem retângulo** (tela a partir de um JSON
 * externo, arrumada por `layoutScreen` em `layout.ts`): px fixos, `"fill"` (ocupa o espaço que
 * o pai dá nesse eixo), `"hug"` (do conteúdo: o template medido, ou os filhos do slot) ou, na v4,
 * `"min-content"`/`"max-content"` (a medida intrínseca). Eixo ausente = px de `size`. Não vale para
 * instâncias com retângulo (editor, `*.screen.json`).
 */
export type InstanceSizeSpec = number | 'fill' | 'hug' | IntrinsicSize;

/**
 * `sizing` por eixo: o valor literal ou, na v4, uma expressão que dá número ≥ 0, `"fill"` ou `"hug"`,
 * avaliada com os valores da instância (`$size` e `$lines` não valem aqui).
 */
export interface ComponentSizing {
  readonly width?: Expr<InstanceSizeSpec>;
  readonly height?: Expr<InstanceSizeSpec>;
}

/** Pontos de ancoragem do desenho em pixels de tela (`screen.anchor`). */
export const SCREEN_ANCHORS = [
  'center',
  'top-left',
  'top',
  'top-right',
  'left',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;
export type ScreenAnchor = (typeof SCREEN_ANCHORS)[number];

/**
 * Desenho em pixels de tela (v4, só na raiz do arquivo): o template é desenhado no `size` do
 * componente em pixels de tela, em qualquer zoom, ancorado no ponto `anchor` do retângulo da
 * marcação (que continua em pixels da imagem). O desenho pode passar do retângulo.
 */
export interface ScreenSpec {
  readonly anchor?: ScreenAnchor;
}

// Os lados e o alinhamento da âncora têm uma só definição, em `../types` (o formato do projeto, que
// não importa daqui): o arquivo do componente os reexporta.
export {
  ANCHOR_ALIGNS,
  ANCHOR_SIDES,
  type AnchorAlign,
  type AnchorSide,
} from '../anchorSides';

/**
 * Como o tipo prefere encostar na âncora (v4, só na raiz do arquivo): os padrões de `side`, `align`
 * e `offset` de uma marcação que declara âncora sem dizê-los. Tudo opcional: ausentes valem `top`,
 * `center` e `{ main: 0, cross: 0 }`. O `offset` é em UNIDADES do componente (a densidade do
 * container o converte em pixels ao aplicar); ver `componentAnchorDefaults`.
 */
export interface ComponentAnchor {
  readonly side?: AnchorSide;
  readonly align?: AnchorAlign;
  readonly offset?: { readonly main?: number; readonly cross?: number };
}

export interface ComponentFile {
  readonly format: typeof COMPONENT_FORMAT;
  readonly formatVersion: ComponentFormatVersion;
  /** Id do componente (único na especialização); o tipo da especialização aponta para o arquivo. */
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Tamanho inicial da instância ao ser criada (px). */
  readonly size: { readonly width: number; readonly height: number };
  /** Tamanho mínimo (px), para o redimensionar não quebrar o desenho. */
  readonly minSize?: { readonly width: number; readonly height: number };
  /** Dimensionamento sem retângulo (ver `ComponentSizing`); ausente = `size` nos dois eixos. */
  readonly sizing?: ComponentSizing;
  /** Desenho em pixels de tela ancorado no retângulo da marcação (v4); ver `ScreenSpec`. */
  readonly screen?: ScreenSpec;
  /** Como o tipo prefere encostar na âncora (v4); ver `ComponentAnchor`. */
  readonly anchor?: ComponentAnchor;
  /**
   * Valores de pré-visualização dos campos (biblioteca e instância nova): os campos vêm do
   * tipo da especialização; aqui só os valores de exemplo.
   */
  readonly preview?: FieldValues;
  /** Raiz do desenho: ocupa o retângulo inteiro da instância. */
  readonly template: FrameTemplate;
  /**
   * Tokens do modo de desenho (nome → valor), postos pelo catálogo ao carregar a especialização;
   * nunca vêm do arquivo (o parser recusa a chave). Ver `tokens.ts`.
   */
  readonly resolvedTokens?: Readonly<Record<string, string | number>>;
  /**
   * Os tokens de cada modo declarado (`tokens.modes`), postos pelo catálogo: o desenho escolhe a
   * tabela do modo efetivo da marcação sem recarregar o componente. Ausente = só `resolvedTokens`.
   */
  readonly resolvedTokensByMode?: Readonly<
    Record<string, Readonly<Record<string, string | number>>>
  >;
  /** Conjunto de ícones da especialização (`icons`), posto pelo catálogo; nunca vem do arquivo. */
  readonly resolvedIcons?: IconSet;
}

/** Como o tipo da especialização referencia o componente (chave nova, formatVersion 4 do spec). */
export interface ComponentRef {
  /** Caminho do arquivo relativo ao da especialização, ex.: `components/button.json`. */
  readonly component: string;
}
