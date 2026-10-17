/**
 * Laboratório "Componentes": formato do arquivo de componente (`mapping-component`).
 *
 * Um componente é o desenho genérico de um tipo de anotação da especialização. Cada componente
 * fica no **próprio arquivo**; o tipo da especialização só o referencia
 * (`"component": "components/button.json"`, caminho relativo ao arquivo da especialização).
 * O desenho é um `template`: uma árvore de primitivas neutras (quadro, retângulo, elipse, texto,
 * caminho, slot) cujos atributos podem ser **ligados aos campos** do tipo por expressões
 * (`{"$field": "label"}`, `{"$if": …}`, `{"$switch": …}`). Trocar o valor de um campo na
 * anotação redesenha o componente.
 *
 * Posição: a instância ocupa o retângulo da marcação. Dentro do template, cada nó tem um
 * `layout` que diz como os filhos se distribuem (`none` com âncoras, `row` ou `column`), para o
 * desenho se adaptar ao tamanho do retângulo.
 */

export const COMPONENT_FORMAT = 'mapping-component';
export const COMPONENT_FORMAT_VERSION = 1;

// ---------------------------------------------------------------------------------------
// Expressões: um valor literal ou uma ligação a campos da anotação
// ---------------------------------------------------------------------------------------

/** Valor de campo como a anotação grava: texto, número ou vazio (enum e data são texto). */
export type FieldValue = string | number | null | undefined;

/** Valores dos campos da instância, pela `key` do campo. */
export type FieldValues = Readonly<Record<string, FieldValue>>;

export type Condition =
  /** Campo "verdadeiro": não vazio e diferente de `"não"`, `"false"`, `"0"`, `"off"`. */
  | { readonly $field: string }
  | { readonly $eq: readonly [field: string, value: string | number] }
  | { readonly $has: string }
  | { readonly $not: Condition }
  | { readonly $and: readonly Condition[] }
  | { readonly $or: readonly Condition[] };

/**
 * Expressão booleana: um literal, uma `Expr<boolean>` ou uma condição direta
 * (`{"$has": "label"}`, `{"$not": …}`). Um campo citado por `$field` é lido por veracidade
 * (`"sim"`/`"não"`, ver `truthy` em expressions.ts), nunca como texto.
 */
export type BoolExpr = Expr<boolean> | Condition;

/** Expressão que produz um valor do tipo `T` (ou o literal). */
export type Expr<T> =
  | T
  | { readonly $field: string; readonly default?: T }
  | { readonly $if: Condition; readonly then: Expr<T>; readonly else?: Expr<T> }
  | {
      readonly $switch: string;
      readonly cases: Readonly<Record<string, Expr<T>>>;
      readonly default?: Expr<T>;
    }
  /** Só para texto: concatena as partes (números viram texto). */
  | { readonly $concat: readonly Expr<string | number>[] };

// ---------------------------------------------------------------------------------------
// Estilo
// ---------------------------------------------------------------------------------------

/** Cor CSS (`#rrggbb`, `#rrggbbaa`, `rgba(...)`) ou `"none"`. */
export type Color = string;

export interface GradientSpec {
  readonly type: 'linear';
  /** Ângulo em graus (0 = da esquerda para a direita, 90 = de cima para baixo). */
  readonly angle: number;
  readonly stops: readonly { readonly offset: number; readonly color: Color }[];
}

export type FillSpec = Color | GradientSpec;

export interface StrokeSpec {
  readonly color: Expr<Color>;
  readonly width?: Expr<number>;
  readonly align?: 'inside' | 'center' | 'outside';
  readonly dash?: readonly number[];
}

export interface ShadowSpec {
  readonly color: Expr<Color>;
  readonly x?: number;
  readonly y?: number;
  readonly blur?: number;
}

export interface FontSpec {
  readonly family?: Expr<string>;
  readonly size?: Expr<number>;
  /** 100..900. */
  readonly weight?: Expr<number>;
  readonly italic?: BoolExpr;
  /** Múltiplo do tamanho (1.2) ou px quando > 3. */
  readonly lineHeight?: Expr<number>;
  readonly letterSpacing?: Expr<number>;
  readonly align?: Expr<'left' | 'center' | 'right'>;
  readonly verticalAlign?: Expr<'top' | 'middle' | 'bottom'>;
  readonly decoration?: Expr<'none' | 'underline' | 'line-through'>;
}

// ---------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------

/**
 * Tamanho de um nó em um eixo: px fixos, `"fill"` (ocupa o que sobra no pai; em `row`/`column`
 * divide com os outros `fill`), `"hug"` (do conteúdo: texto medido, ou filhos) ou uma fração
 * do pai (`"50%"`).
 */
export type SizeSpec = number | 'fill' | 'hug' | `${number}%`;

/** Âncoras no pai com `layout: none`: distância fixa da borda, como as constraints do Figma. */
export interface Anchors {
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
  /** Centraliza no eixo (ignora left/right ou top/bottom). */
  readonly centerX?: boolean;
  readonly centerY?: boolean;
}

export type LayoutSpec =
  | { readonly type: 'none' }
  | {
      readonly type: 'row' | 'column';
      readonly gap?: Expr<number>;
      /** Um valor, [vertical, horizontal] ou [cima, direita, baixo, esquerda]. */
      readonly padding?: Expr<
        number | readonly [number, number] | readonly [number, number, number, number]
      >;
      /** No eixo cruzado. */
      readonly align?: 'start' | 'center' | 'end' | 'stretch';
      /** No eixo principal. */
      readonly justify?: 'start' | 'center' | 'end' | 'space-between';
    };

// ---------------------------------------------------------------------------------------
// Nós do template
// ---------------------------------------------------------------------------------------

interface TemplateNodeBase {
  /** Nome do nó (aparece na árvore e no hover); opcional. */
  readonly name?: string;
  readonly visible?: BoolExpr;
  readonly opacity?: Expr<number>;
  readonly width?: SizeSpec;
  readonly height?: SizeSpec;
  /** Só com pai `layout: none`. */
  readonly anchors?: Anchors;
  readonly fill?: Expr<FillSpec>;
  readonly stroke?: StrokeSpec;
  readonly shadow?: ShadowSpec;
  readonly cornerRadius?: Expr<number | readonly [number, number, number, number]>;
}

export interface FrameTemplate extends TemplateNodeBase {
  readonly type: 'frame';
  readonly clip?: boolean;
  readonly layout?: LayoutSpec;
  readonly children?: readonly TemplateNode[];
}

export interface RectTemplate extends TemplateNodeBase {
  readonly type: 'rect';
}

export interface EllipseTemplate extends TemplateNodeBase {
  readonly type: 'ellipse';
}

export interface TextTemplate extends TemplateNodeBase {
  readonly type: 'text';
  readonly text: Expr<string | number>;
  readonly font?: FontSpec;
  /** Cor do texto (`fill` do nó). Padrão: `#000000`. */
  readonly color?: Expr<Color>;
}

export interface PathTemplate extends TemplateNodeBase {
  readonly type: 'path';
  /** Dados SVG, desenhados numa caixa `viewBox` e escalados para a caixa do nó. */
  readonly d: Expr<string>;
  readonly viewBox: readonly [number, number];
  readonly fillRule?: 'nonzero' | 'evenodd';
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
   * Como as instâncias filhas se organizam dentro do slot (container): `row`/`column`
   * posicionam os filhos pela ordem entre irmãos e gravam os retângulos deles; `none` (ou
   * ausente) deixa cada filho no próprio retângulo. `gap` e `padding` podem vir de campos.
   */
  readonly layout?: LayoutSpec;
}

export type TemplateNode =
  | FrameTemplate
  | RectTemplate
  | EllipseTemplate
  | TextTemplate
  | PathTemplate
  | SlotTemplate;

// ---------------------------------------------------------------------------------------
// Arquivo
// ---------------------------------------------------------------------------------------

/**
 * Como a instância se dimensiona quando chega **sem retângulo** (tela a partir de um JSON
 * externo, arrumada por `layoutScreen` em `layout.ts`): px fixos, `"fill"` (ocupa o espaço que
 * o pai dá nesse eixo) ou `"hug"` (do conteúdo: o template medido, ou os filhos do slot). Eixo
 * ausente = px de `size`. Não vale para instâncias com retângulo (editor, `*.screen.json`).
 */
export type InstanceSizeSpec = number | 'fill' | 'hug';

export interface ComponentSizing {
  readonly width?: InstanceSizeSpec;
  readonly height?: InstanceSizeSpec;
}

export interface ComponentFile {
  readonly format: typeof COMPONENT_FORMAT;
  readonly formatVersion: typeof COMPONENT_FORMAT_VERSION;
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
  /**
   * Valores de pré-visualização dos campos (biblioteca e instância nova): os campos vêm do
   * tipo da especialização; aqui só os valores de exemplo.
   */
  readonly preview?: FieldValues;
  /** Raiz do desenho: ocupa o retângulo inteiro da instância. */
  readonly template: FrameTemplate;
}

/** Como o tipo da especialização referencia o componente (chave nova, formatVersion 4 do spec). */
export interface ComponentRef {
  /** Caminho do arquivo relativo ao da especialização, ex.: `components/button.json`. */
  readonly component: string;
}
