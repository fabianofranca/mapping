/**
 * Motor dos componentes (etapa Biblioteca): formato do arquivo de componente (`mapping-component`).
 *
 * Um componente é o desenho genérico de um tipo de anotação da especialização. Cada componente
 * fica no **próprio arquivo**; o tipo da especialização só o referencia
 * (`"component": "components/button.json"`, caminho relativo ao arquivo da especialização).
 * O desenho é um `template`: uma árvore de primitivas neutras (quadro, retângulo, elipse, texto,
 * caminho, slot, na `formatVersion` 2 `repeat` e, na 3, `image`) cujos atributos podem ser **ligados aos campos** do tipo por expressões
 * (`{"$field": "label"}`, `{"$if": …}`, `{"$switch": …}`). Trocar o valor de um campo na
 * anotação redesenha o componente.
 *
 * Posição: a instância ocupa o retângulo da marcação. Dentro do template, cada nó tem um
 * `layout` que diz como os filhos se distribuem (`none` com âncoras, `row` ou `column`), para o
 * desenho se adaptar ao tamanho do retângulo.
 */
import type { IconSet } from './icons';

export const COMPONENT_FORMAT = 'mapping-component';
/** Versão em que os componentes sem `repeat` são escritos (os geradores do repositório a gravam). */
export const COMPONENT_FORMAT_VERSION = 1;
/** A versão 2 acrescenta o nó `repeat` (a tabela desenhada); a 1 continua aceita e vale sem ele. */
export const COMPONENT_FORMAT_VERSION_REPEAT = 2;
/**
 * A versão 3 acrescenta o nó `image` (imagem remota por URL `https://`); a 1 e a 2 continuam
 * aceitas sem mudança (e o `repeat` vale na 2 e na 3).
 */
export const COMPONENT_FORMAT_VERSION_IMAGE = 3;
/**
 * A versão 4 (etapa "componentes fiéis") reúne as chaves novas do arquivo: `stroke.cap`,
 * `stroke.join` e `stroke.sides` já aqui. Toda chave da v4 numa versão anterior é o erro
 * `só é permitido com formatVersion 4`, no caminho da chave.
 */
export const COMPONENT_FORMAT_VERSION_FIDELITY = 4;
/** Versões aceitas. */
export const COMPONENT_FORMAT_VERSIONS = [1, 2, 3, 4] as const;
export type ComponentFormatVersion = (typeof COMPONENT_FORMAT_VERSIONS)[number];

// ---------------------------------------------------------------------------------------
// Expressões: um valor literal ou uma ligação a campos da anotação
// ---------------------------------------------------------------------------------------

/**
 * Uma linha de um campo `table`, como o `repeat` a lê: o valor de cada coluna (texto, número ou
 * vazio; a célula `ref` chega como o rótulo do alvo).
 */
export type FieldRow = Readonly<Record<string, string | number | null | undefined>>;

/**
 * Valor de campo como a anotação grava: texto, número ou vazio (enum e data são texto). Um
 * campo `table` chega como a lista das linhas, que só o nó `repeat` lê.
 */
export type FieldValue = string | number | null | undefined | readonly FieldRow[];

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
  | { readonly $concat: readonly Expr<string | number>[] }
  /** Valor nomeado da especialização, no modo do desenho (v4; ver `tokens.ts`). */
  | { readonly $token: string };

// ---------------------------------------------------------------------------------------
// Estilo
// ---------------------------------------------------------------------------------------

/** Cor CSS (`#rrggbb`, `#rrggbbaa`, `rgba(...)`) ou `"none"`. */
export type Color = string;

export interface GradientSpec {
  readonly type: 'linear';
  /** Ângulo em graus (0 = da esquerda para a direita, 90 = de cima para baixo). */
  readonly angle: number;
  readonly stops: readonly { readonly offset: number; readonly color: Expr<Color> }[];
}

export type FillSpec = Color | GradientSpec;

export interface StrokeSpec {
  readonly color: Expr<Color>;
  readonly width?: Expr<number>;
  readonly align?: 'inside' | 'center' | 'outside';
  readonly dash?: readonly number[];
  /** Ponta do traço (v4); o padrão é `butt`. */
  readonly cap?: Expr<'butt' | 'round' | 'square'>;
  /** Canto do traço (v4); o padrão é `miter`. */
  readonly join?: Expr<'miter' | 'round' | 'bevel'>;
  /** Só estes lados têm traço (v4, em `frame` e `rect`); ausente = os quatro. */
  readonly sides?: Expr<readonly StrokeSide[]>;
  /**
   * Largura do traço (v4, literal): `true` (padrão) escala com o zoom; `false` mantém a largura
   * em pixels de tela, em qualquer zoom.
   */
  readonly scale?: boolean;
}

export type StrokeSide = 'top' | 'right' | 'bottom' | 'left';
export const STROKE_SIDES: readonly StrokeSide[] = ['top', 'right', 'bottom', 'left'];

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
  /** `cap-middle` centra pela altura da maiúscula (só formatVersion 4). */
  readonly verticalAlign?: Expr<'top' | 'middle' | 'bottom' | 'cap-middle'>;
  readonly decoration?: Expr<'none' | 'underline' | 'line-through'>;
  /** `word` (padrão) quebra por palavra; `none` é uma linha por parágrafo. Só formatVersion 4. */
  readonly wrap?: Expr<'word' | 'none'>;
  /** Texto que não cabe termina em `…` (largura com `wrap: none`; altura com `maxLines`). Só v4. */
  readonly ellipsis?: BoolExpr;
  /** Máximo de linhas (inteiro ≥ 1); a última leva o `…` (com `ellipsis`) ou é cortada. Só v4. */
  readonly maxLines?: Expr<number>;
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

/** Tipo de layout de um quadro ou slot. */
export type LayoutType = 'none' | 'row' | 'column';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch';
export type LayoutJustify = 'start' | 'center' | 'end' | 'space-between';

/**
 * Layout dos filhos. Na `formatVersion` 4, `type`, `align` e `justify` aceitam expressão (o valor
 * resolvido é conferido no desenho: fora do conjunto, cai no padrão com o aviso
 * `valor inválido em layout.<chave>: <valor>`); com `type` literal `"none"`, só `type` vale.
 */
export interface LayoutSpec {
  readonly type: Expr<LayoutType>;
  readonly gap?: Expr<number>;
  /** Um valor, [vertical, horizontal] ou [cima, direita, baixo, esquerda]. */
  readonly padding?: Expr<
    number | readonly [number, number] | readonly [number, number, number, number]
  >;
  /** No eixo cruzado. */
  readonly align?: Expr<LayoutAlign>;
  /** No eixo principal. */
  readonly justify?: Expr<LayoutJustify>;
}

// ---------------------------------------------------------------------------------------
// Nós do template
// ---------------------------------------------------------------------------------------

interface TemplateNodeBase {
  /** Nome do nó (aparece na árvore e no hover); opcional. */
  readonly name?: string;
  readonly visible?: BoolExpr;
  readonly opacity?: Expr<number>;
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
   * Como as instâncias filhas se organizam dentro do slot (componente com slot): `row`/`column`
   * posicionam os filhos pela ordem entre irmãos e gravam os retângulos deles; `none` (ou
   * ausente) deixa cada filho no próprio retângulo. `gap` e `padding` podem vir de campos.
   */
  readonly layout?: LayoutSpec;
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
export interface RepeatTemplate extends TemplateNodeBase {
  readonly type: 'repeat';
  /** Chave do campo `table` do tipo cujas linhas se repetem. */
  readonly field: string;
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
  /** O desenho de uma linha. */
  readonly template: FrameTemplate;
}

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
  readonly fit?: 'cover' | 'contain' | 'fill';
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
 * o pai dá nesse eixo) ou `"hug"` (do conteúdo: o template medido, ou os filhos do slot). Eixo
 * ausente = px de `size`. Não vale para instâncias com retângulo (editor, `*.screen.json`).
 */
export type InstanceSizeSpec = number | 'fill' | 'hug';

export interface ComponentSizing {
  readonly width?: InstanceSizeSpec;
  readonly height?: InstanceSizeSpec;
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
