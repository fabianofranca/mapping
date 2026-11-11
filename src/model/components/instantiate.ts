/**
 * Motor dos componentes (etapa Biblioteca): instancia um componente (`mapping-component`) numa caixa e
 * produz a árvore de cena que o renderizador Konva já desenha (`src/model/components/scene.ts`).
 *
 * Passos: (1) avalia as expressões contra os valores dos campos; (2) calcula o tamanho de cada
 * nó (px, %, `fill`, `hug`); (3) posiciona os filhos conforme o `layout` do pai; (4) monta os
 * nós da cena. Funções puras, sem DOM: o texto é medido por um `TextMeasurer` injetado.
 *
 * Regras de tamanho (documentadas aqui para os testes e para quem escreve templates):
 * - Padrão de `width`/`height` omitidos: `'hug'` para texto, `'fill'` para todo o resto, nos
 *   dois eixos. Num pai `none`, um filho sem tamanho e sem âncoras ocupa o pai inteiro.
 * - `width`/`height` aceitam expressão; o valor avaliado precisa ser número finito ≥ 0, texto
 *   numérico puro (`"120"`), `fill`, `hug` ou `"N%"`. Outro valor cai no padrão do tipo, com o
 *   aviso `valor inválido em width: <valor>` (ou `height`). O mesmo vale para `layout.type`,
 *   `layout.align` e `layout.justify` (padrões `none`, `start`, `start`).
 * - px fixos; `"N%"` é fração da área de conteúdo do pai; `'hug'` vem do conteúdo (texto
 *   medido, quadro que abraça os filhos, caminho = `viewBox`, retângulo/elipse/slot = 0; `image` não aceita `hug`).
 * - `'fill'` no eixo principal de `row`/`column` divide o que sobra entre os `fill`; no eixo
 *   cruzado e em `none` é a área de conteúdo toda (menos as âncoras, se houver).
 * - `minWidth`/`maxWidth`/`minHeight`/`maxHeight` (px, aceitam expressão; valor não finito ou
 *   negativo = ausente) valem em qualquer nó, depois de resolvido o tamanho do filho (px, `%`,
 *   `hug`, `fill`). Os `fill` do eixo principal dividem o que sobra como o flexbox: quem bate no
 *   `min` ou no `max` congela e a diferença é repartida entre os outros `fill`. `min` > `max`
 *   vale o `min`. Texto `hug` cortado pelo `maxWidth` mede a altura quebrando na largura cortada.
 *   Os limites da raiz só valem em `measureComponent` num eixo `hug` (com caixa dada a raiz ocupa
 *   a caixa); o `minSize` da instância (`layout.ts`) é aplicado depois deles.
 * - Quadro `hug`, medição em duas passagens (shrink-to-fit do flexbox): primeiro mede-se o
 *   conteúdo dentro do limite disponível (o conteúdo do pai, ou o limite que o próprio pai
 *   recebeu; a raiz usa o `max` dela): um filho `fill` no eixo cruzado (ou em `none`) contribui
 *   com o menor entre o limite e o que ele abraçaria dentro dele (texto quebrado no limite,
 *   quadro medido com o limite, caminho = `viewBox`, o resto 0) e `"N%"` com o limite × N / 100;
 *   sem limite conhecido valem 0. Depois o resultado vira o tamanho do quadro e `fill`/`%` são
 *   resolvidos contra ele (o texto é medido nessa largura). Só o `fill` no eixo principal de um
 *   `hug` avisa ("fill dentro de hug vira 0"), porque ali o resultado é mesmo 0. Texto medido com
 *   largura máxima 0 avisa `texto medido com largura 0: <nome>`. Texto `hug` não quebra.
 * - Âncoras (pai `none`): `left`+`right` (ou `top`+`bottom`) esticam o filho entre elas,
 *   mesmo que ele tenha tamanho fixo (como as constraints do Figma).
 * - `lineHeight` entregue ao `TextMeasurer` já em px.
 * - Nó `slot` com `options.slotContent` (tamanho dos filhos já arrumados mais o padding do
 *   slot, vindo de `layout.ts`): `hug` vale o `slotContent` do eixo; `fill` (ou âncoras nos dois
 *   lados) com o pai sendo medido (`hug`) também, sem o aviso de "fill dentro de hug". Com o pai
 *   já medido, o `fill` divide o que sobra, que então é o próprio `slotContent`. Sem
 *   `slotContent` nada muda (o slot vale 0 ao medir). `measureComponent` mede só o plano da raiz.
 */
import type {
  Anchors,
  BoolExpr,
  Color,
  ComponentFile,
  Expr,
  FieldValues,
  FillSpec,
  FontSpec,
  FrameTemplate,
  LayoutSpec,
  GradientSpec,
  IconTemplate,
  LayoutAlign,
  LayoutJustify,
  LayoutWrap,
  ImageTemplate,
  PathTemplate,
  ShadowSpec,
  SizeSpec,
  StrokeSide,
  StrokeSpec,
  TemplateNode,
  TextRunTemplate,
  TextTemplate,
} from './componentFormat';
import type { Box } from './box';
import { STROKE_SIDES } from './componentFormat';
import { clipBoxOf } from './clipBox';
import { DEFAULT_ICON_VIEWBOX, resolveIcon, type IconPath, type IconSet } from './icons';
import {
  evaluate,
  evaluateBoolean,
  evaluateText,
  linesCitations,
  linesKey,
  linesNodeName,
  providedKey,
  referencedFields,
  sizeKey,
  toNumber,
  type ProvidedValues,
} from './expressions';
import {
  LAYOUT_ALIGNS,
  LAYOUT_JUSTIFIES,
  LAYOUT_TYPES,
  LAYOUT_WRAPS,
  allowedValue,
  describeValue,
  justifySpacing,
  mirrorMain,
  parseSizeSpec,
} from './layoutValues';
import { providingSlot } from './provided';
import { createMessageSet, textsOf, type Params } from '../messages/collector';
import type { ModelMessageTemplateCode } from '../messages';
import type { ModelMessage } from '../modelMessage';
import { expandRepeats } from './repeat';
import { applyGaps } from './strokeGaps';
import { approximateExtents, lineBaseline, type CapMetrics } from './baseline';
import { WRAP_SLACK } from './textWrap';
import {
  applyTokens,
  defaultFontFamily,
  resolveTokens,
  type ResolvedTokens,
} from './tokens';
import { breakLines, stackLines } from './wrapLines';
import {
  layoutRuns,
  measureRichText,
  type RichBase,
  type RichRun,
  type RunLayout,
  dropLastChar,
} from './richText';
import {
  type CornerRadius,
  type FrameNode,
  type Matrix,
  type Paint,
  type PathNode,
  type SceneNode,
  type SceneTextRun,
  type Shadow,
  type Stroke,
  type TextNode,
  type TextStyle,
  baseNode,
  translate,
} from './scene';

const STROKE_CAPS = ['butt', 'round', 'square'] as const;
const STROKE_JOINS = ['miter', 'round', 'bevel'] as const;

export type { Box };

export interface TextMetrics {
  readonly width: number;
  readonly height: number;
  /** As linhas como serão desenhadas (já com o `…`), quando o medidor sabe dizê-las. */
  readonly lines?: readonly string[];
  /**
   * Linha de base da primeira e da última linha, em px a partir do topo da caixa do texto (com o
   * texto no topo), e o número de linhas medidas. O medidor sem fonte pode não informar: o motor
   * usa então a conta do aproximado (decisão 2 da #898).
   */
  readonly firstBaseline?: number;
  readonly lastBaseline?: number;
  readonly lineCount?: number;
}

/** A fonte entregue ao medidor: tamanhos já em px; `wrap`/`ellipsis`/`maxLines` só na v4. */
export interface MeasureFont {
  family: string;
  size: number;
  weight: number;
  italic: boolean;
  lineHeight: number;
  letterSpacing: number;
  /** `none` = uma linha por parágrafo (ausente = `word`). */
  wrap?: 'word' | 'none';
  /** O texto que não cabe (na largura com `wrap: none`, ou além de `maxLines`) termina em `…`. */
  ellipsis?: boolean;
  /** Inteiro ≥ 1; as linhas além dele são cortadas. */
  maxLines?: number;
}

/** Mede um texto com a fonte dada (largura máxima opcional, para quebra de linha). */
export type TextMeasurer = (
  text: string,
  font: MeasureFont,
  maxWidth?: number,
) => TextMetrics;

export interface InstantiateOptions {
  readonly measure: TextMeasurer;
  /** Prefixo dos ids dos nós (ex.: id da instância). */
  readonly idPrefix?: string;
  /**
   * Tamanho do conteúdo do slot (filhos arrumados mais o padding do slot), para medir um
   * componente cujo tamanho depende dos filhos (`hug`). Ver o comentário do topo do arquivo.
   */
  readonly slotContent?: { readonly width: number; readonly height: number };
  /**
   * Tokens do modo de desenho, já resolvidos (`resolveTokens`); `font-sans` é a fonte padrão do
   * texto. Ausente = os do componente (`resolvedTokens`, postos pelo catálogo) ou os embutidos.
   */
  readonly tokens?: ResolvedTokens;
  /**
   * Conjunto de ícones (`icons` da especialização) lido pelo nó `icon`. Ausente = o do componente
   * (`resolvedIcons`, posto pelo catálogo); sem nenhum, todo ícone é desconhecido.
   */
  readonly icons?: IconSet;
  /**
   * Cor herdada (v4): o que os slots dos ancestrais oferecem, já resolvido, pelo nome; o `$provided`
   * do template o lê (com `default` quando falta). Ausente = nenhum ancestral oferece nada.
   */
  readonly provided?: ProvidedValues;
}

export interface Instantiated {
  readonly root: FrameNode;
  /**
   * A primeira linha de base do componente (px a partir do topo da caixa), a do primeiro texto
   * com uma (`baselinePadding.top` incluído); ausente = o componente não tem texto. É o que o
   * `align: "baseline"` do slot do pai lê.
   */
  readonly firstBaseline?: number;
  /**
   * O que o `slot` do componente oferece às filhas (`provide`), resolvido com os campos, os tokens
   * e o modo desta instância; o valor que não produz nada não entra. Ausente = não oferece.
   */
  readonly provides?: ProvidedValues;
  readonly warnings: readonly string[];
  /** Os mesmos avisos com código e parâmetros (a interface os traduz): `warnings` = textos destes. */
  readonly messages: readonly ModelMessage[];
  /**
   * Quanto falta (px) em cada aviso de "não cabe" (`conteúdo maior que a caixa: …`, `texto maior
   * que a caixa: …`), pela mensagem do aviso; o maior, se o mesmo aviso se repete. Ausente = vazio.
   */
  readonly shortfalls?: Readonly<Record<string, number>>;
  /**
   * Os avisos (entre `warnings`) que são "não cabe", em ordem de criação (`warnShort`): é por
   * aqui, e não pelo texto da mensagem, que o desenho reconhece o estouro. Ausente = vazio.
   */
  readonly overflowWarnings?: readonly string[];
}

// ---------------------------------------------------------------------------------------
// Medidor aproximado
// ---------------------------------------------------------------------------------------

/** Quebra um parágrafo por palavras (uma palavra maior que a largura fica sozinha na linha). */
function wrapWords(
  paragraph: string,
  widthOf: (text: string) => number,
  maxWidth: number,
): string[] {
  const words = paragraph.split(' ').filter((word) => word !== '');
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0] ?? '';
  for (const word of words.slice(1)) {
    const candidate = `${current} ${word}`;
    if (widthOf(candidate) > maxWidth + WRAP_SLACK) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

/** Tira letras do fim até `line` + `…` caber em `maxWidth` (sempre sobra ao menos o `…`). */
function withEllipsis(
  line: string,
  widthOf: (text: string) => number,
  maxWidth: number | undefined,
): string {
  let kept = line;
  while (
    maxWidth !== undefined &&
    kept.length > 0 &&
    widthOf(`${kept}…`) > maxWidth + WRAP_SLACK
  )
    kept = dropLastChar(kept).trimEnd();
  return `${kept}…`;
}

/** Aplica `maxLines` e `ellipsis` às linhas já quebradas. */
function clipLines(
  lines: readonly string[],
  font: MeasureFont,
  widthOf: (text: string) => number,
  maxWidth: number | undefined,
): string[] {
  const limit = font.maxLines;
  const cut = limit !== undefined && lines.length > limit;
  const kept = cut ? lines.slice(0, limit) : [...lines];
  if (font.ellipsis !== true) return kept;
  const last = kept.length - 1;
  return kept.map((line, i) => {
    const tooWide = maxWidth !== undefined && widthOf(line) > maxWidth + WRAP_SLACK;
    return (cut && i === last) || tooWide ? withEllipsis(line, widthOf, maxWidth) : line;
  });
}

/**
 * Quebra, corta e mede um texto com uma função de largura qualquer (`widthOf`): `maxWidth`
 * quebra por palavras (uma palavra maior que a largura fica sozinha na linha), `wrap: none` é uma
 * linha por parágrafo, `maxLines` corta e `ellipsis` põe o `…`. É a base do medidor aproximado e
 * do medidor com fonte real do servidor MCP.
 */
export function measureLines(
  text: string,
  font: MeasureFont,
  maxWidth: number | undefined,
  widthOf: (value: string) => number,
  extents: Pick<CapMetrics, 'ascent' | 'descent'> = approximateExtents(font.size),
): TextMetrics {
  const breaks = maxWidth !== undefined && font.wrap !== 'none';
  const raw = text
    .split('\n')
    .flatMap((paragraph) =>
      breaks ? wrapWords(paragraph, widthOf, maxWidth) : [paragraph],
    );
  const lines = clipLines(raw, font, widthOf, maxWidth);
  const widest = lines.reduce((max, line) => Math.max(max, widthOf(line)), 0);
  const count = Math.max(1, lines.length);
  return {
    width: widest,
    height: count * font.lineHeight,
    lines,
    ...lineBaselines(font.lineHeight, count, extents),
  };
}

/** `firstBaseline`, `lastBaseline` e `lineCount` de `count` linhas de altura `lineHeight`. */
export function lineBaselines(
  lineHeight: number,
  count: number,
  extents: Pick<CapMetrics, 'ascent' | 'descent'>,
): Pick<TextMetrics, 'firstBaseline' | 'lastBaseline' | 'lineCount'> {
  return {
    firstBaseline: lineBaseline(0, lineHeight, extents),
    lastBaseline: lineBaseline((count - 1) * lineHeight, lineHeight, extents),
    lineCount: count,
  };
}

/**
 * Medidor aproximado sem canvas (testes e Node sem fonte): largura ≈ 0,55·tamanho por caractere
 * (0,6 se o peso for ≥ 600) mais o espaçamento entre letras; altura = linhas × altura de linha.
 */
export const approximateMeasurer: TextMeasurer = (text, font, maxWidth) => {
  const charWidth = font.size * (font.weight >= 600 ? 0.6 : 0.55) + font.letterSpacing;
  return measureLines(text, font, maxWidth, (value) =>
    Math.max(0, value.length * charWidth),
  );
};

// ---------------------------------------------------------------------------------------
// Utilitários
// ---------------------------------------------------------------------------------------

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Número → todos os lados; `[v, h]`; `[cima, direita, baixo, esquerda]`. */
export function normalizePadding(
  padding: number | readonly number[] | undefined,
): Padding {
  if (padding === undefined) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof padding === 'number')
    return { top: padding, right: padding, bottom: padding, left: padding };
  if (padding.length === 2) {
    const [v = 0, h = 0] = padding;
    return { top: v, right: h, bottom: v, left: h };
  }
  const [top = 0, right = 0, bottom = 0, left = 0] = padding;
  return { top, right, bottom, left };
}

type Axis = 'w' | 'h';

interface Kid {
  readonly node: TemplateNode;
  /** Índice no template (inclui os filhos invisíveis), para o caminho do id. */
  readonly index: number;
}

interface FrameLayout {
  readonly kind: 'none' | 'row' | 'column';
  /** Eixo principal (`null` em `none`). */
  readonly main: Axis | null;
  readonly gap: number;
  readonly pad: Padding;
  readonly align: LayoutAlign;
  readonly justify: LayoutJustify;
  /** Filhos em ordem inversa e `start` no fim (`layout.reverse`). */
  readonly reverse: boolean;
  /** Quebra de fileira (`layout.wrap`); `none` fora do `row`/`column` e na formatVersion < 4. */
  readonly wrap: LayoutWrap;
  readonly lineGap: number;
  readonly maxPerLine?: number | undefined;
  readonly maxLines?: number | undefined;
}

interface Placement {
  readonly kid: Kid;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Espaço de um eixo ao dimensionar os filhos: `content` nulo = o pai está sendo medido (hug). */
interface AxisSpace {
  /** Área de conteúdo do pai, quando já conhecida. */
  readonly content: number | null;
  /** Limite disponível durante a medição (`content` nulo); nulo = sem limite conhecido. */
  readonly bound: number | null;
}

/** Limite disponível por eixo para medir um quadro `hug` (nulo = desconhecido). */
interface Limits {
  readonly w: number | null;
  readonly h: number | null;
}

interface SizeLimit {
  readonly min: number;
  readonly max: number;
}

interface Plan {
  readonly w: number;
  readonly h: number;
  readonly placements: readonly Placement[];
}

const EPS = 0.001;
/** Tolerância (px) do excesso que vem de texto: o DOM e o canvas diferem em frações de pixel. */
const TEXT_TOLERANCE = 1;
const FLEX_EPS = 1e-9;
const NO_SIZE_LIMIT: SizeLimit = { min: 0, max: Infinity };
const NO_LIMITS: Limits = { w: null, h: null };
const NONE_LAYOUT: FrameLayout = {
  kind: 'none',
  main: null,
  gap: 0,
  pad: { top: 0, right: 0, bottom: 0, left: 0 },
  align: 'start',
  justify: 'start',
  reverse: false,
  wrap: 'none',
  lineGap: 0,
};

/** Quanto descer cada filho para as linhas de base ficarem na do mais alto (`align: "baseline"`). */
function baselineShifts(lines: readonly number[]): number[] {
  const above = Math.max(0, ...lines);
  return lines.map((line) => above - line);
}

function isNone(color: string): boolean {
  const c = color.trim().toLowerCase();
  return c === '' || c === 'none';
}

/** O limite só conta num eixo hug (`null`); com o tamanho conhecido não há o que limitar. */
function effectiveBounds(w: number | null, h: number | null, limits: Limits): Limits {
  return { w: w === null ? limits.w : null, h: h === null ? limits.h : null };
}

function planKey(w: number | null, h: number | null, bounds: Limits): string {
  const part = (n: number | null) => n ?? 'n';
  return `${part(w)}x${part(h)}|${part(bounds.w)}x${part(bounds.h)}`;
}

function nodeName(node: TemplateNode): string {
  if (node.type === 'icon') return typeof node.name === 'string' ? node.name : 'icon';
  return node.name ?? node.type;
}

/** As âncoras de um nó em um eixo, já avaliadas: ausente (`undefined`) quando a expressão não dá valor. */
interface ResolvedAnchors {
  start?: number;
  end?: number;
  center: boolean;
}

// ---------------------------------------------------------------------------------------
// Instanciação
// ---------------------------------------------------------------------------------------

/** Os valores herdados como campos reservados do motor (`$provided:<nome>`), onde o `$provided` os lê. */
function providedFields(
  provided: ProvidedValues | undefined,
): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(provided ?? {}))
    out[providedKey(name)] = value;
  return out;
}

/**
 * Monta o "motor" de um componente com seus valores: avaliação, tamanhos e planos dos quadros.
 * `instantiate` e `measureComponent` compartilham este fechamento (e o cache dos planos).
 * `linesSeed`: o número de linhas que cada `$lines` do template vale nesta passagem (a primeira usa
 * 1, a segunda o medido na primeira; ver `withLinesPasses`).
 */
const NO_OPEN_AXES = { width: false, height: false } as const;

function createEngine(
  original: ComponentFile,
  sourceValues: FieldValues,
  options: InstantiateOptions,
  instanceSize: { readonly width: number; readonly height: number },
  linesSeed?: ReadonlyMap<string, number>,
  openAxes: { readonly width: boolean; readonly height: boolean } = NO_OPEN_AXES,
) {
  // Os `$token` viram o valor do modo antes de tudo (vale também dentro do `repeat`).
  const tokens =
    options.tokens ?? original.resolvedTokens ?? resolveTokens(undefined, {});
  const source = applyTokens(original, tokens);
  // O `repeat` vira quadros com os valores de cada linha antes de o motor começar.
  // `$size`: o tamanho da instância entra como dois valores reservados (sem DOM), já na expansão,
  // para o `count` de um `repeat` também poder segui-lo.
  const {
    component,
    values: expandedValues,
    messages: expansionMessages,
  } = expandRepeats(source, {
    ...sourceValues,
    ...providedFields(options.provided),
    [sizeKey('width')]: instanceSize.width,
    [sizeKey('height')]: instanceSize.height,
  });
  // `$lines`: o número de linhas de cada nó citado entra nos valores (1 na primeira passagem).
  const citedLines = linesCitations(component.template);
  const values: FieldValues =
    citedLines.size === 0
      ? expandedValues
      : {
          ...expandedValues,
          ...Object.fromEntries(
            [...citedLines].map((key) => [linesKey(key), linesSeed?.get(key) ?? 1]),
          ),
        };
  /** As linhas medidas de cada nó citado por `$lines`, no tamanho final dele (a base da passagem seguinte). */
  const lineCounts = new Map<string, number>();
  const messageSet = createMessageSet(expansionMessages);
  const warn = (code: ModelMessageTemplateCode, params?: Params) =>
    messageSet.add(code, params);
  const shortfalls = new Map<string, number>();
  /** Aviso de "não cabe": a mensagem de sempre e quanto falta, para a prova de desenho dizer. */
  const warnShort = (code: ModelMessageTemplateCode, name: string, missing: number) => {
    const { text } = warn(code, { name });
    shortfalls.set(text, Math.max(shortfalls.get(text) ?? 0, missing));
  };
  const prefix = options.idPrefix ?? 'c';

  for (const key of referencedFields(component.template))
    if (!(key in values)) warn('engine.fieldMissing', { key });

  // --- avaliação de expressões ----------------------------------------------------------

  const ev = <T>(expr: Expr<T> | undefined, fallback: T): T =>
    expr === undefined ? fallback : evaluate(expr, values, fallback);

  const num = (expr: Expr<number> | undefined, fallback: number): number => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, fallback);
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isFinite(n) ? n : fallback;
  };

  const str = (expr: Expr<string> | undefined, fallback: string): string => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, fallback);
    return value === null || value === undefined ? fallback : String(value);
  };

  /** Booleano (`visible`, `italic`): um `$field` com "não" é falso, via `evaluateBoolean`. */
  const bool = (expr: BoolExpr | undefined, fallback: boolean): boolean =>
    expr === undefined ? fallback : evaluateBoolean(expr, values, fallback);

  /** Um valor de âncora: o número, ou nenhum (expressão sem valor vale como âncora ausente). */
  const anchorNumber = (expr: Expr<number> | undefined): number | undefined =>
    expr === undefined
      ? undefined
      : toNumber(ev<unknown>(expr as Expr<unknown>, undefined));

  const anchorsOf = (node: TemplateNode, axis: Axis): ResolvedAnchors => {
    const a: Anchors | undefined = node.anchors;
    if (!a) return { center: false };
    return axis === 'w'
      ? {
          start: anchorNumber(a.left),
          end: anchorNumber(a.right),
          center:
            a.centerX === true ||
            (typeof a.centerX === 'object' && bool(a.centerX, false)),
        }
      : {
          start: anchorNumber(a.top),
          end: anchorNumber(a.bottom),
          center:
            a.centerY === true ||
            (typeof a.centerY === 'object' && bool(a.centerY, false)),
        };
  };

  const oneOf = <T extends string>(
    expr: Expr<T> | undefined,
    allowed: readonly T[],
    fallback: T,
  ): T => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, fallback);
    return allowed.includes(value as T) ? (value as T) : fallback;
  };

  const isVisible = (node: TemplateNode) => bool(node.visible, true);

  // --- texto ----------------------------------------------------------------------------

  /** `wrap`, `ellipsis` e `maxLines` do nó; só entram quando diferem do padrão. */
  const textWrapping = (font: FontSpec): Partial<MeasureFont> => {
    const maxLines = Math.floor(num(font.maxLines, 0));
    return {
      ...(oneOf(font.wrap, ['word', 'none'], 'word') === 'none' ? { wrap: 'none' } : {}),
      ...(bool(font.ellipsis, false) ? { ellipsis: true } : {}),
      ...(maxLines >= 1 ? { maxLines } : {}),
    };
  };

  const textFont = (node: TextTemplate): MeasureFont => {
    const font: FontSpec = node.font ?? {};
    const size = Math.max(0, num(font.size, 14));
    const lh = num(font.lineHeight, 1.2);
    return {
      ...textWrapping(font),
      family: str(font.family, defaultFontFamily(tokens)),
      size,
      weight: num(font.weight, 400),
      italic: bool(font.italic, false),
      lineHeight: lh <= 3 ? lh * size : lh,
      letterSpacing: num(font.letterSpacing, 0),
    };
  };

  // --- texto rico (runs) ------------------------------------------------------------------

  /** `[vertical, horizontal]` do respiro de um chip (número = os dois eixos). */
  const runPadding = (run: TextRunTemplate): readonly [number, number] => {
    const value = ev<unknown>(run.padding as Expr<unknown> | undefined, 0);
    const clean = (n: unknown): number => (typeof n === 'number' && n > 0 ? n : 0);
    if (Array.isArray(value)) return [clean(value[0]), clean(value[1])];
    return [clean(value), clean(value)];
  };

  /** O estilo resolvido de um trecho: o que ele declara sobre o `font` e o `color` do nó. */
  const resolveRun = (
    run: TextRunTemplate,
    node: TextTemplate,
    font: MeasureFont,
  ): SceneTextRun => {
    const decoration = oneOf(
      run.decoration ?? node.font?.decoration,
      ['none', 'underline', 'line-through'],
      'none',
    );
    const background = str(run.background, 'none');
    return {
      // Texto literal vale como está, também só de espaços (o vão entre trechos); o de campo vazio cai no fallback.
      text: typeof run.text === 'string' ? run.text : evaluateText(run.text, values, ''),
      fontFamily: str(run.family, font.family),
      fontSize: Math.max(0, num(run.size, font.size)),
      fontWeight: num(run.weight, font.weight),
      italic: bool(run.italic, font.italic),
      color: str(run.color, str(node.color, '#000000')),
      ...(decoration === 'none' ? {} : { decoration }),
      ...(isNone(background)
        ? {}
        : {
            background,
            radius: Math.max(0, num(run.radius, 0)),
            padding: runPadding(run),
          }),
    };
  };

  /** Os trechos do nó, na forma da cena e na do layout (a mesma lista, índice por índice). */
  const richRuns = (
    node: TextTemplate,
    font: MeasureFont,
  ): { scene: SceneTextRun[]; runs: RichRun[] } => {
    const scene = (node.runs ?? []).map((run) => resolveRun(run, node, font));
    const runs = scene.map((run): RichRun => ({
      text: run.text,
      font: {
        family: run.fontFamily,
        size: run.fontSize,
        weight: run.fontWeight,
        italic: run.italic,
        lineHeight: font.lineHeight,
        letterSpacing: font.letterSpacing,
      },
      ...(run.padding ? { chip: { padding: run.padding } } : {}),
    }));
    return { scene, runs };
  };

  /** O `align` do layout do texto rico (sem `justify`). */
  const richAlign = (align: string): 'left' | 'center' | 'right' =>
    align === 'center' || align === 'right' ? align : 'left';

  /** O que é do nó (e não dos trechos) no layout do texto rico. */
  const richBase = (node: TextTemplate, font: MeasureFont): RichBase => ({
    size: font.size,
    lineHeight: font.lineHeight,
    // O texto rico (com `runs`) ainda não justifica: `justify` cai em `left`.
    align: richAlign(
      oneOf(node.font?.align, ['left', 'center', 'right', 'justify'], 'left'),
    ),
    ...(font.wrap === 'none' ? { wrap: 'none' as const } : {}),
    ...(font.ellipsis === true ? { ellipsis: true } : {}),
    ...(font.maxLines !== undefined ? { maxLines: font.maxLines } : {}),
  });

  /** O texto do nó sem `runs`. */
  const plainText = (node: TextTemplate): string =>
    node.text === undefined ? '' : evaluateText(node.text, values, '');

  const measureText = (node: TextTemplate, maxWidth?: number): TextMetrics => {
    if (maxWidth !== undefined && maxWidth <= EPS)
      warn('engine.textZeroWidth', { name: nodeName(node) });
    const font = textFont(node);
    if (node.runs === undefined) return options.measure(plainText(node), font, maxWidth);
    const rich = richRuns(node, font);
    return measureRichText(rich.runs, richBase(node, font), options.measure, maxWidth);
  };

  // --- linha de base (decisões 2 a 5 da #898) ------------------------------------------------

  interface TextBaselines {
    readonly height: number;
    readonly first: number;
    readonly last: number;
  }

  /** `baselinePadding` do nó (px ≥ 0 por lado); ausente = nenhum dos dois. */
  const baselinePaddingOf = (
    node: TextTemplate,
  ): { top?: number; bottom?: number } | undefined => {
    const spec = node.baselinePadding;
    if (spec === undefined) return undefined;
    return { top: limitValue(spec.top), bottom: limitValue(spec.bottom) };
  };

  /** As linhas de base do texto de uma linha só ou do texto rico (a da fonte base em cada linha). */
  const richBaselines = (node: TextTemplate, maxWidth?: number): TextBaselines => {
    const font = textFont(node);
    const rich = richRuns(node, font);
    const layout = layoutRuns(rich.runs, richBase(node, font), options.measure, maxWidth);
    const probe = options.measure('H', font);
    const extent =
      (probe.firstBaseline ??
        lineBaseline(0, font.lineHeight, approximateExtents(font.size))) -
      font.lineHeight / 2;
    const baseline = (line: { y: number; height: number }): number =>
      line.y + line.height / 2 + extent;
    const first = layout.lines[0];
    const last = layout.lines[layout.lines.length - 1];
    return {
      height: layout.height,
      first: first ? baseline(first) : extent + font.lineHeight / 2,
      last: last ? baseline(last) : extent + font.lineHeight / 2,
    };
  };

  /** Altura e linhas de base (primeira e última) do texto do nó, no topo da caixa. */
  const baselinesOf = (node: TextTemplate, maxWidth?: number): TextBaselines => {
    if (node.runs !== undefined) return richBaselines(node, maxWidth);
    const font = textFont(node);
    const m = options.measure(plainText(node), font, maxWidth);
    const count = m.lineCount ?? Math.max(1, m.lines?.length ?? 1);
    const first =
      m.firstBaseline ?? lineBaseline(0, font.lineHeight, approximateExtents(font.size));
    return {
      height: m.height,
      first,
      last: m.lastBaseline ?? first + (count - 1) * font.lineHeight,
    };
  };

  /**
   * A altura do texto no `hug` com `baselinePadding`: `max(top, primeira) + (última − primeira) +
   * max(bottom, altura − última)`; sem o lado, vale a distância da própria fonte.
   */
  const paddedTextHeight = (
    node: TextTemplate,
    height: number,
    wrap?: number,
  ): number => {
    const padding = baselinePaddingOf(node);
    if (padding === undefined) return height;
    const b = baselinesOf(node, wrap);
    const top = Math.max(padding.top ?? 0, b.first);
    const bottom = Math.max(padding.bottom ?? 0, b.height - b.last);
    return top + (b.last - b.first) + bottom;
  };

  /** Onde fica a primeira linha de base do texto numa caixa de altura `h` (largura `w`). */
  const textBaselineIn = (node: TextTemplate, w: number, h: number): number => {
    const b = baselinesOf(node, w);
    const top = baselinePaddingOf(node)?.top;
    if (top !== undefined) return Math.max(top, b.first);
    const align = verticalAlignOf(node);
    if (align === 'top') return b.first;
    const free = h - b.height;
    return (align === 'bottom' ? free : free / 2) + b.first;
  };

  /** A primeira linha de base de um nó na caixa `w` × `h`; `undefined` = sem linha de base. */
  const kidBaseline = (node: TemplateNode, w: number, h: number): number | undefined => {
    if (node.type === 'text') return textBaselineIn(node, w, h);
    if (node.type !== 'frame') return undefined;
    for (const placed of planFrame(node, w, h).placements) {
      const inner = kidBaseline(placed.kid.node, placed.w, placed.h);
      if (inner !== undefined) return placed.y + inner;
    }
    return undefined;
  };

  /** A linha de base de cada filho (o fundo da caixa quando ele não tem uma). */
  const kidBaselines = (
    kids: readonly Kid[],
    widths: readonly number[],
    heights: readonly number[],
  ): number[] =>
    kids.map((kid, i) => {
      const h = heights[i] ?? 0;
      return kidBaseline(kid.node, widths[i] ?? 0, h) ?? h;
    });

  /** A altura de uma `row` alinhada pela linha de base: do topo mais alto ao fundo mais baixo. */
  const baselineExtent = (
    kids: readonly Kid[],
    widths: readonly number[],
    heights: readonly number[],
  ): number => {
    const lines = kidBaselines(kids, widths, heights);
    const above = Math.max(0, ...lines);
    const below = Math.max(0, ...heights.map((h, i) => h - (lines[i] ?? h)));
    return above + below;
  };

  // --- valores conferidos (tamanho e layout) ----------------------------------------------

  const invalidValue = (label: string, value: unknown) =>
    warn('engine.invalidValue', { label, value: describeValue(value) });

  /** Valor de um conjunto fechado; sem valor = padrão; fora do conjunto = padrão com aviso. */
  const checked = <T extends string>(
    expr: Expr<T> | undefined,
    allowed: readonly T[],
    fallback: T,
    label: string,
  ): T => {
    const value =
      expr === undefined ? undefined : ev<unknown>(expr as Expr<unknown>, undefined);
    if (value === undefined || value === null) return fallback;
    const valid = allowedValue(value, allowed);
    if (valid === undefined) invalidValue(label, value);
    return valid ?? fallback;
  };

  // --- tamanhos -------------------------------------------------------------------------

  const sizeMemo = new Map<TemplateNode, Partial<Record<Axis, SizeSpec>>>();

  const resolveSpec = (node: TemplateNode, axis: Axis): SizeSpec => {
    const fallback: SizeSpec = node.type === 'text' ? 'hug' : 'fill';
    const expr = axis === 'w' ? node.width : node.height;
    const value =
      expr === undefined ? undefined : ev<unknown>(expr as Expr<unknown>, undefined);
    if (value === undefined || value === null) return fallback;
    const spec = parseSizeSpec(value);
    if (spec === undefined) invalidValue(axis === 'w' ? 'width' : 'height', value);
    return spec ?? fallback;
  };

  const specOf = (node: TemplateNode, axis: Axis): SizeSpec => {
    let perNode = sizeMemo.get(node);
    if (!perNode) {
      perNode = {};
      sizeMemo.set(node, perNode);
    }
    return (perNode[axis] ??= resolveSpec(node, axis));
  };

  /**
   * Limite em px; não finito ou negativo = ausente. Na medida de um eixo `hug`, o `$size` dele
   * vale infinito aqui: o tamanho do tipo não limita o que se mede (um `maxWidth` de rótulo por
   * `$size` − folga ficaria em 2 linhas).
   */
  const limitValues: FieldValues =
    openAxes.width || openAxes.height
      ? {
          ...values,
          ...(openAxes.width ? { [sizeKey('width')]: Infinity } : {}),
          ...(openAxes.height ? { [sizeKey('height')]: Infinity } : {}),
        }
      : values;
  const limitValue = (expr: Expr<number> | undefined): number | undefined => {
    if (expr === undefined) return undefined;
    const raw = evaluate<unknown>(expr as Expr<unknown>, limitValues, Number.NaN);
    const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const limitMemo = new Map<TemplateNode, Partial<Record<Axis, SizeLimit>>>();

  const limitOf = (node: TemplateNode, axis: Axis): SizeLimit => {
    let perNode = limitMemo.get(node);
    if (!perNode) {
      perNode = {};
      limitMemo.set(node, perNode);
    }
    return (perNode[axis] ??=
      axis === 'w'
        ? {
            min: limitValue(node.minWidth) ?? 0,
            max: limitValue(node.maxWidth) ?? Infinity,
          }
        : {
            min: limitValue(node.minHeight) ?? 0,
            max: limitValue(node.maxHeight) ?? Infinity,
          });
  };

  /** Aplica `min`/`max`; `min` > `max` vale o `min`. */
  const clampTo = (limit: SizeLimit, size: number): number =>
    Math.max(limit.min, Math.min(size, limit.max));

  const clampSize = (node: TemplateNode, axis: Axis, size: number): number =>
    clampTo(limitOf(node, axis), size);

  /** `padding` (também de `$field`): texto numérico vira número, o resto vira 0, piso em 0. */
  const paddingOf = (expr: LayoutSpec['padding']): Padding => {
    const value: unknown = evaluate(expr, values, 0);
    const side = (v: unknown) => Math.max(0, num(v as Expr<number>, 0));
    return normalizePadding(Array.isArray(value) ? value.map(side) : side(value));
  };

  /** `baseline` só vale em `row` e na formatVersion 4; fora disso, vindo de expressão, é valor inválido. */
  const alignsFor = (kind: 'row' | 'column'): readonly LayoutAlign[] =>
    kind === 'row' && original.formatVersion >= 4
      ? LAYOUT_ALIGNS
      : LAYOUT_ALIGNS.filter((value) => value !== 'baseline');

  /** `maxPerLine`/`maxLines`: inteiro ≥ 1; outro valor cai em "sem limite" com o aviso de valor inválido. */
  const countOf = (expr: Expr<number> | undefined, label: string): number | undefined => {
    const value = ev<unknown>(expr as Expr<unknown> | undefined, undefined);
    if (value === undefined || value === null) return undefined;
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (Number.isInteger(n) && n >= 1) return n;
    invalidValue(label, value);
    return undefined;
  };

  /** A quebra de fileira de um quadro `row`/`column` (v4); sem `wrap` (ou `none`) as outras três chaves não valem. */
  const wrapOf = (
    spec: LayoutSpec,
  ): Pick<FrameLayout, 'wrap' | 'lineGap' | 'maxPerLine' | 'maxLines'> => {
    const none = { wrap: 'none', lineGap: 0 } as const;
    if (original.formatVersion < 4) return none;
    const wrap = checked(spec.wrap, LAYOUT_WRAPS, 'none', 'layout.wrap');
    if (wrap === 'none') return none;
    return {
      wrap,
      lineGap: Math.max(0, num(spec.lineGap, 0)),
      maxPerLine: countOf(spec.maxPerLine, 'layout.maxPerLine'),
      maxLines: countOf(spec.maxLines, 'layout.maxLines'),
    };
  };

  const layoutOf = (frame: FrameTemplate): FrameLayout => {
    const spec = frame.layout;
    const kind = checked(spec?.type, LAYOUT_TYPES, 'none', 'layout.type');
    if (!spec || kind === 'none') return NONE_LAYOUT;
    return {
      kind,
      main: kind === 'row' ? 'w' : 'h',
      gap: Math.max(0, num(spec.gap, 0)),
      pad: paddingOf(spec.padding),
      align: checked(spec.align, alignsFor(kind), 'start', 'layout.align'),
      justify: checked(spec.justify, LAYOUT_JUSTIFIES, 'start', 'layout.justify'),
      reverse: bool(spec.reverse, false),
      ...wrapOf(spec),
    };
  };

  const visibleKids = (frame: FrameTemplate): Kid[] =>
    (frame.children ?? [])
      .map((node, index) => ({ node, index }))
      .filter((kid) => isVisible(kid.node));

  const planCache = new Map<FrameTemplate, Map<string, Plan>>();

  /** O texto `hug` tem `maxWidth` menor que a largura natural (a largura será cortada)? */
  const isCutByMax = (node: TextTemplate): boolean => {
    const { max } = limitOf(node, 'w');
    return Number.isFinite(max) && measureText(node).width > max + EPS;
  };

  const textHeight = (node: TextTemplate, otherSize: number | undefined): number => {
    const hug = specOf(node, 'w') === 'hug';
    const wrap =
      hug && !(otherSize !== undefined && isCutByMax(node)) ? undefined : otherSize;
    return paddedTextHeight(node, measureText(node, wrap).height, wrap);
  };

  const frameHug = (
    node: FrameTemplate,
    axis: Axis,
    otherSize: number | undefined,
    bound: number | null,
  ): number =>
    axis === 'w'
      ? planFrame(node, null, null, { w: bound, h: null }).w
      : planFrame(node, otherSize ?? null, null, { w: null, h: bound }).h;

  /**
   * Tamanho do conteúdo de um nó num eixo (`otherSize`: a largura já resolvida, para a altura;
   * `bound`: o limite disponível no eixo, para medir quadros com filhos `fill`).
   */
  const hugSize = (
    node: TemplateNode,
    axis: Axis,
    otherSize: number | undefined,
    bound: number | null,
  ): number => {
    switch (node.type) {
      case 'text':
        return axis === 'w' ? measureText(node).width : textHeight(node, otherSize);
      case 'frame':
        return frameHug(node, axis, otherSize, bound);
      case 'path':
        return node.viewBox[axis === 'w' ? 0 : 1];
      case 'icon':
        return iconBox(node)[axis === 'w' ? 0 : 1];
      default:
        return 0;
    }
  };

  /** Quanto um filho `fill` pede ao pai que está sendo medido: o que abraçaria, até o limite. */
  const fillContribution = (
    node: TemplateNode,
    axis: Axis,
    bound: number,
    otherSize: number | undefined,
  ): number => {
    const natural =
      node.type === 'text' && axis === 'w'
        ? measureText(node, bound).width
        : hugSize(node, axis, otherSize, bound);
    return Math.min(bound, Math.max(0, natural));
  };

  const isStretchAnchored = (anchors: ResolvedAnchors | undefined): boolean =>
    anchors !== undefined &&
    !anchors.center &&
    anchors.start !== undefined &&
    anchors.end !== undefined;

  /** Âncoras nos dois lados esticam o filho entre elas (com o pai já medido). */
  const anchoredSize = (
    anchors: ResolvedAnchors | undefined,
    content: number | null,
  ): number | undefined =>
    isStretchAnchored(anchors) && content !== null
      ? Math.max(0, content - (anchors?.start ?? 0) - (anchors?.end ?? 0))
      : undefined;

  /** Nó `slot` com `slotContent`: o tamanho dos filhos arrumados (ver o topo do arquivo). */
  const slotSize = (
    node: TemplateNode,
    spec: SizeSpec,
    axis: Axis,
    content: number | null,
    anchors: ResolvedAnchors | undefined,
  ): number | undefined => {
    if (node.type !== 'slot' || !options.slotContent) return undefined;
    const inner = options.slotContent[axis === 'w' ? 'width' : 'height'];
    const takesContent =
      spec === 'hug' ||
      (content === null && (spec === 'fill' || isStretchAnchored(anchors)));
    return takesContent ? Math.max(0, inner) : undefined;
  };

  const hugKid = (
    node: TemplateNode,
    axis: Axis,
    space: AxisSpace,
    otherSize: number | undefined,
    layout: FrameLayout,
  ): number => {
    const stretched =
      layout.main !== axis && layout.kind !== 'none' && layout.align === 'stretch';
    if (stretched && space.content !== null) return space.content;
    return Math.max(0, hugSize(node, axis, otherSize, space.content ?? space.bound));
  };

  const fillKid = (
    node: TemplateNode,
    axis: Axis,
    space: AxisSpace,
    otherSize: number | undefined,
    anchors: ResolvedAnchors | undefined,
  ): number => {
    const edge = (anchors?.start ?? 0) + (anchors?.end ?? 0);
    if (space.content !== null) return Math.max(0, space.content - edge);
    // Pai hug sem limite: o filho `fill` (ou esticado por âncoras) pede o que abraçaria, não 0.
    if (space.bound === null) return Math.max(0, hugSize(node, axis, otherSize, null));
    return fillContribution(node, axis, Math.max(0, space.bound - edge), otherSize);
  };

  const percentKid = (spec: SizeSpec, space: AxisSpace): number => {
    const percent = parseFloat(String(spec));
    const base = space.content ?? space.bound;
    return base === null || !Number.isFinite(percent) ? 0 : (base * percent) / 100;
  };

  const kidSize = (
    kid: Kid,
    axis: Axis,
    space: AxisSpace,
    otherSize: number | undefined,
    layout: FrameLayout,
  ): number | 'fill' => {
    const { node } = kid;
    const spec = specOf(node, axis);
    const anchors = layout.kind === 'none' ? anchorsOf(node, axis) : undefined;
    const early =
      anchoredSize(anchors, space.content) ??
      (typeof spec === 'number' ? spec : undefined) ??
      slotSize(node, spec, axis, space.content, anchors);
    if (early !== undefined) return early;
    if (spec === 'hug') return hugKid(node, axis, space, otherSize, layout);
    if (spec === 'fill')
      return layout.main === axis
        ? 'fill'
        : fillKid(node, axis, space, otherSize, anchors);
    return percentKid(spec, space);
  };

  /**
   * Reparte `free` entre os `fill` (um `SizeLimit` cada) como o flexbox: calcula a violação
   * total dos limites; sem violação, está pronto; com violação positiva congela quem bateu no
   * `min`, com negativa quem bateu no `max`, e repete com o resto.
   */
  const distributeFill = (limits: readonly SizeLimit[], free: number): number[] => {
    const sizes = limits.map(() => 0);
    let active = limits.map((_, i) => i);
    let space = free;
    while (active.length > 0) {
      const share = space / active.length;
      const clamped = active.map((i) => clampTo(limits[i] ?? NO_SIZE_LIMIT, share));
      const violation = clamped.reduce((sum, c) => sum + c - share, 0);
      const frozen = active.filter((_, k) =>
        violation > 0 ? (clamped[k] ?? share) > share : (clamped[k] ?? share) < share,
      );
      if (Math.abs(violation) < FLEX_EPS || frozen.length === 0) {
        active.forEach((i, k) => (sizes[i] = clamped[k] ?? share));
        break;
      }
      active.forEach((i, k) => {
        if (frozen.includes(i)) {
          sizes[i] = clamped[k] ?? share;
          space -= clamped[k] ?? share;
        }
      });
      active = active.filter((i) => !frozen.includes(i));
    }
    return sizes;
  };

  /** Tamanhos no eixo principal: os fixos já vêm prontos e os `fill` dividem o que sobra. */
  const resolveMain = (
    frame: FrameTemplate,
    layout: FrameLayout,
    sizes: readonly (number | 'fill')[],
    limits: readonly SizeLimit[],
    content: number | null,
    tolerance: number,
  ): number[] => {
    const fills = sizes.filter((s) => s === 'fill').length;
    const fixed = sizes.reduce<number>((sum, s) => sum + (s === 'fill' ? 0 : s), 0);
    let free = 0;
    if (content === null) {
      if (fills > 0) warn('engine.fillInHug');
    } else {
      const remaining = content - fixed - layout.gap * Math.max(0, sizes.length - 1);
      if (remaining < -tolerance)
        warnShort('engine.contentTooBig', nodeName(frame), -remaining);
      free = Math.max(0, remaining);
    }
    const shares = distributeFill(
      limits.filter((_, i) => sizes[i] === 'fill'),
      free,
    );
    let next = 0;
    return sizes.map((s) => (s === 'fill' ? (shares[next++] ?? 0) : s));
  };

  /** Tamanhos dos filhos num eixo; `space.content` nulo = o pai está sendo medido (hug). */
  const resolveAxis = (
    frame: FrameTemplate,
    layout: FrameLayout,
    kids: readonly Kid[],
    axis: Axis,
    space: AxisSpace,
    others: readonly number[] | null,
  ): number[] => {
    const limits = kids.map((kid) => limitOf(kid.node, axis));
    const sizes = kids.map((kid, i): number | 'fill' => {
      const size = kidSize(kid, axis, space, others?.[i], layout);
      return size === 'fill' ? size : clampTo(limits[i] ?? NO_SIZE_LIMIT, size);
    });
    const tolerance = kids.some((kid) => kid.node.type === 'text') ? TEXT_TOLERANCE : EPS;
    if (layout.main === axis)
      return resolveMain(frame, layout, sizes, limits, space.content, tolerance);
    const numbers = sizes.map((s) => (s === 'fill' ? 0 : s));
    if (layout.kind !== 'none' && space.content !== null) {
      const content = space.content;
      const widest = Math.max(...numbers);
      if (widest > content + tolerance)
        warnShort('engine.contentTooBig', nodeName(frame), widest - content);
    }
    return numbers;
  };

  /** Tamanho do quadro num eixo a partir dos filhos (`hug`), com o padding. */
  const hugTotal = (
    layout: FrameLayout,
    kids: readonly Kid[],
    axis: Axis,
    sizes: readonly number[],
    padding: number,
  ): number => {
    if (sizes.length === 0) return padding;
    if (layout.kind === 'none') {
      let edge = 0;
      kids.forEach((kid, i) => {
        const a = anchorsOf(kid.node, axis);
        const size = sizes[i] ?? 0;
        edge = Math.max(edge, a.center ? size : (a.start ?? 0) + size + (a.end ?? 0));
      });
      return edge + padding;
    }
    if (layout.main === axis)
      return (
        sizes.reduce((sum, s) => sum + s, 0) + layout.gap * (sizes.length - 1) + padding
      );
    return Math.max(...sizes) + padding;
  };

  /** Posição (relativa ao pai) de cada filho num eixo. */
  const positionAxis = (
    layout: FrameLayout,
    kids: readonly Kid[],
    axis: Axis,
    sizes: readonly number[],
    total: number,
  ): number[] => {
    const startPad = axis === 'w' ? layout.pad.left : layout.pad.top;
    const endPad = axis === 'w' ? layout.pad.right : layout.pad.bottom;
    const content = total - startPad - endPad;
    if (layout.kind === 'none') {
      return kids.map((kid, i) => {
        const a = anchorsOf(kid.node, axis);
        const size = sizes[i] ?? 0;
        if (a.center) return (content - size) / 2;
        if (a.start !== undefined) return a.start;
        if (a.end !== undefined) return content - a.end - size;
        return 0;
      });
    }
    if (layout.main === axis) {
      const used =
        sizes.reduce((sum, s) => sum + s, 0) + layout.gap * Math.max(0, sizes.length - 1);
      const free = Math.max(0, content - used);
      const { offset, extra } = justifySpacing(layout.justify, free, sizes.length);
      let cursor = startPad + offset;
      return sizes.map((size) => {
        const position = cursor;
        cursor += size + layout.gap + extra;
        return layout.reverse ? mirrorMain(position, size, startPad, content) : position;
      });
    }
    return sizes.map((size) => {
      if (layout.align === 'center') return startPad + (content - size) / 2;
      if (layout.align === 'end') return startPad + content - size;
      return startPad;
    });
  };

  // --- quebra de fileira (`layout.wrap`) ----------------------------------------------------

  /** Os filhos de um quadro com `wrap`, o eixo principal, o cruzado e o espaço nos dois. */
  interface WrapSpace {
    readonly frame: FrameTemplate;
    readonly layout: FrameLayout;
    readonly kids: readonly Kid[];
    readonly main: Axis;
    readonly cross: Axis;
    /** A área de conteúdo do eixo principal (nulo = `hug`: uma linha só). */
    readonly mainContent: number | null;
    /** O limite do eixo cruzado quando o quadro é medido (nulo = desconhecido). */
    readonly crossBound: number | null;
    /** O tamanho conhecido do quadro por eixo (nulo = `hug`). */
    readonly known: { readonly w: number | null; readonly h: number | null };
  }

  const maxOf = (values: readonly number[]): number =>
    values.reduce((m, v) => Math.max(m, v), 0);

  const padAxis = (layout: FrameLayout, axis: Axis): number =>
    axis === 'w'
      ? layout.pad.left + layout.pad.right
      : layout.pad.top + layout.pad.bottom;

  /** Tamanho dos filhos no eixo principal antes de dividir os `fill` (`'fill'` fica), na ordem dos `kids`. */
  const wrapMainSizes = (space: WrapSpace): (number | 'fill')[] => {
    const { frame, layout, kids, main, cross } = space;
    const crossSizes =
      main === 'h'
        ? resolveAxis(
            frame,
            layout,
            kids,
            cross,
            {
              content:
                space.known[cross] === null
                  ? null
                  : Math.max(0, (space.known[cross] ?? 0) - padAxis(layout, cross)),
              bound: space.crossBound,
            },
            null,
          )
        : null;
    return kids.map((kid, i) => {
      const size = kidSize(
        kid,
        main,
        { content: space.mainContent, bound: null },
        crossSizes?.[i],
        layout,
      );
      return size === 'fill' ? size : clampTo(limitOf(kid.node, main), size);
    });
  };

  /** A base de cada filho para decidir as linhas: o `fill` vale o que abraçaria. */
  const wrapBases = (space: WrapSpace, sizes: readonly (number | 'fill')[]): number[] =>
    sizes.map((size, i) => {
      if (size !== 'fill') return size;
      const kid = space.kids[i] as Kid;
      const natural = hugSize(kid.node, space.main, undefined, space.mainContent);
      return clampTo(limitOf(kid.node, space.main), Math.max(0, natural));
    });

  /** Uma linha já resolvida: filhos, tamanhos e posições nos dois eixos (relativos ao quadro). */
  interface WrappedLine {
    readonly kids: readonly Kid[];
    readonly main: readonly number[];
    readonly mainPos: readonly number[];
    readonly cross: readonly number[];
    /** A extensão da linha no eixo cruzado. */
    readonly extent: number;
    /** O deslocamento de cada filho dentro da linha, no eixo cruzado. */
    readonly offsets: readonly number[];
  }

  /** O deslocamento de um filho dentro da linha, no eixo cruzado (`center`/`end`; `start` e `stretch` 0). */
  const crossOffset = (align: LayoutAlign, size: number, extent: number): number => {
    if (align === 'center') return (extent - size) / 2;
    if (align === 'end') return extent - size;
    return 0;
  };

  /** A linha com os tamanhos do eixo cruzado e os deslocamentos dentro dela. */
  const crossOfLine = (
    space: WrapSpace,
    lineKids: readonly Kid[],
    mainSizes: readonly number[],
  ): Pick<WrappedLine, 'cross' | 'extent' | 'offsets'> => {
    const { frame, layout, cross } = space;
    const natural = resolveAxis(
      frame,
      layout,
      lineKids,
      cross,
      { content: null, bound: space.crossBound },
      mainSizes,
    );
    const baselined = layout.kind === 'row' && layout.align === 'baseline';
    const lines = baselined ? kidBaselines(lineKids, mainSizes, natural) : [];
    const extent = baselined
      ? baselineExtent(lineKids, mainSizes, natural)
      : maxOf(natural);
    const sizes = resolveAxis(
      frame,
      layout,
      lineKids,
      cross,
      { content: extent, bound: null },
      mainSizes,
    );
    const shifts = baselined ? baselineShifts(lines) : [];
    return {
      cross: sizes,
      extent,
      offsets: sizes.map((size, i) =>
        baselined ? (shifts[i] ?? 0) : crossOffset(layout.align, size, extent),
      ),
    };
  };

  /** As linhas do quadro com `wrap`: quebra, divide os `fill` de cada uma, mede o eixo cruzado e posiciona. */
  const wrapLines = (
    space: WrapSpace,
    mainTotal: (used: number) => number,
  ): { lines: WrappedLine[]; total: number } => {
    const { frame, layout, kids } = space;
    const sizes = wrapMainSizes(space);
    const bases = wrapBases(space, sizes);
    const broken = breakLines(bases, space.mainContent, {
      gap: layout.gap,
      maxPerLine: layout.maxPerLine,
      maxLines: layout.maxLines,
    });
    if (broken.dropped > 0)
      warn('engine.childrenOutsideMaxLines', {
        count: broken.dropped,
        name: nodeName(frame),
      });
    const tolerance = kids.some((kid) => kid.node.type === 'text') ? TEXT_TOLERANCE : EPS;
    const resolved = broken.lines.map((indices) => {
      const lineSizes = indices.map((i) =>
        sizes[i] === 'fill' && space.mainContent === null
          ? (bases[i] ?? 0)
          : (sizes[i] ?? 0),
      );
      return resolveMain(
        frame,
        layout,
        lineSizes,
        indices.map((i) => limitOf((kids[i] as Kid).node, space.main)),
        space.mainContent,
        tolerance,
      );
    });
    const usedOf = (line: readonly number[]) =>
      line.reduce((sum, v) => sum + v, 0) + layout.gap * Math.max(0, line.length - 1);
    const total = mainTotal(maxOf(resolved.map(usedOf)));
    const lines = broken.lines.map((indices, k): WrappedLine => {
      const lineKids = indices.map((i) => kids[i] as Kid);
      const main = resolved[k] ?? [];
      return {
        kids: lineKids,
        main,
        mainPos: positionAxis(layout, lineKids, space.main, main, total),
        ...crossOfLine(space, lineKids, main),
      };
    });
    return { lines, total };
  };

  /** O plano de um quadro `row`/`column` com `wrap` (ver `layout.wrap` no `docs/COMPONENT-FORMAT.md`). */
  const planWrapped = (
    frame: FrameTemplate,
    layout: FrameLayout,
    kids: readonly Kid[],
    w: number | null,
    h: number | null,
    bounds: Limits,
  ): Plan => {
    const row = layout.kind === 'row';
    const main: Axis = row ? 'w' : 'h';
    const cross: Axis = row ? 'h' : 'w';
    const known = { w, h };
    const mainKnown = known[main];
    const crossBound = bounds[cross];
    const space: WrapSpace = {
      frame,
      layout,
      kids,
      main,
      cross,
      mainContent:
        mainKnown === null ? null : Math.max(0, mainKnown - padAxis(layout, main)),
      crossBound:
        crossBound === null ? null : Math.max(0, crossBound - padAxis(layout, cross)),
      known,
    };
    const { lines, total: mainSize } = wrapLines(
      space,
      (used) => mainKnown ?? used + padAxis(layout, main),
    );
    const stacked = stackLines(
      lines.map((line) => line.extent),
      layout.lineGap,
      layout.wrap === 'wrap-reverse',
    );
    const crossStart = row ? layout.pad.top : layout.pad.left;
    const crossSize = known[cross] ?? stacked.total + padAxis(layout, cross);
    const placements = lines.flatMap((line, k) =>
      line.kids.map((kid, i): Placement => {
        const m = line.main[i] ?? 0;
        const c = line.cross[i] ?? 0;
        const mainPos = line.mainPos[i] ?? 0;
        const crossPos = crossStart + (stacked.tops[k] ?? 0) + (line.offsets[i] ?? 0);
        return row
          ? { kid, x: mainPos, y: crossPos, w: m, h: c }
          : { kid, x: crossPos, y: mainPos, w: c, h: m };
      }),
    );
    return row
      ? { w: mainSize, h: crossSize, placements }
      : { w: crossSize, h: mainSize, placements };
  };

  /** Guarda o plano do quadro na chave do cache e o devolve. */
  const remember = (frame: FrameTemplate, key: string, plan: Plan): Plan => {
    let perFrame = planCache.get(frame);
    if (!perFrame) {
      perFrame = new Map();
      planCache.set(frame, perFrame);
    }
    perFrame.set(key, plan);
    return plan;
  };

  /**
   * Plano de um quadro: `null` num eixo = `hug` (o quadro abraça os filhos). `limits` é o
   * limite disponível por eixo hug, para os filhos `fill`/`%` contribuírem na medição.
   */
  const planFrame = (
    frame: FrameTemplate,
    w: number | null,
    h: number | null,
    limits: Limits = NO_LIMITS,
  ): Plan => {
    const bounds = effectiveBounds(w, h, limits);
    const key = planKey(w, h, bounds);
    const cached = planCache.get(frame)?.get(key);
    if (cached) return cached;

    const layout = layoutOf(frame);
    const kids = visibleKids(frame);
    if (layout.wrap !== 'none')
      return remember(frame, key, planWrapped(frame, layout, kids, w, h, bounds));
    const padW = layout.pad.left + layout.pad.right;
    const padH = layout.pad.top + layout.pad.bottom;
    const baselined = layout.kind === 'row' && layout.align === 'baseline';

    const solve = (
      axis: Axis,
      known: number | null,
      others: readonly number[] | null,
    ): { total: number; sizes: number[] } => {
      const pad = axis === 'w' ? padW : padH;
      let total = known;
      if (total === null) {
        const limit = bounds[axis];
        const space: AxisSpace = {
          content: null,
          bound: limit === null ? null : Math.max(0, limit - pad),
        };
        const preliminary = resolveAxis(frame, layout, kids, axis, space, others);
        total =
          baselined && axis === 'h'
            ? baselineExtent(kids, others ?? [], preliminary) + pad
            : hugTotal(layout, kids, axis, preliminary, pad);
      }
      const space: AxisSpace = { content: Math.max(0, total - pad), bound: null };
      return { total, sizes: resolveAxis(frame, layout, kids, axis, space, others) };
    };

    const horizontal = solve('w', w, null);
    const vertical = solve('h', h, horizontal.sizes);
    const xs = positionAxis(layout, kids, 'w', horizontal.sizes, horizontal.total);
    const ys = positionAxis(layout, kids, 'h', vertical.sizes, vertical.total);
    if (baselined)
      baselineShifts(kidBaselines(kids, horizontal.sizes, vertical.sizes)).forEach(
        (offset, i) => (ys[i] = layout.pad.top + offset),
      );
    const plan: Plan = {
      w: horizontal.total,
      h: vertical.total,
      placements: kids.map((kid, i) => ({
        kid,
        x: xs[i] ?? 0,
        y: ys[i] ?? 0,
        w: horizontal.sizes[i] ?? 0,
        h: vertical.sizes[i] ?? 0,
      })),
    };
    return remember(frame, key, plan);
  };

  // --- estilo ---------------------------------------------------------------------------

  /**
   * Gradiente linear pela convenção SVG/Figma (não a do CSS `linear-gradient`): o ângulo cresce no
   * sentido horário com o eixo y para baixo (0° = esquerda→direita, 90° = cima→baixo); a linha
   * passa pelo centro da caixa, com comprimento que cobre os cantos.
   */
  const gradientPaint = (gradient: GradientSpec, w: number, h: number): Paint => {
    const rad = (gradient.angle * Math.PI) / 180;
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    const length = Math.abs(w * dx) + Math.abs(h * dy);
    const cx = w / 2;
    const cy = h / 2;
    return {
      type: 'linear',
      start: { x: cx - (dx * length) / 2, y: cy - (dy * length) / 2 },
      end: { x: cx + (dx * length) / 2, y: cy + (dy * length) / 2 },
      stops: gradient.stops.map((stop) => ({
        offset: stop.offset,
        color: ev<Color>(stop.color, 'none'),
      })),
    };
  };

  const fillsOf = (fill: Expr<FillSpec> | undefined, w: number, h: number): Paint[] => {
    const value = ev<FillSpec>(fill, 'none');
    if (typeof value === 'string')
      return isNone(value) ? [] : [{ type: 'solid', color: value }];
    if (typeof value === 'object' && value !== null && value.type === 'linear')
      return value.stops.length > 0 ? [gradientPaint(value, w, h)] : [];
    return [];
  };

  const strokeOf = (
    spec: StrokeSpec | undefined,
    defaultAlign: 'inside' | 'center',
    scale: number,
  ): Stroke | undefined => {
    if (!spec) return undefined;
    const color = str(spec.color, 'none');
    if (isNone(color)) return undefined;
    const width = Math.max(0, num(spec.width, 1));
    const dash = dashOf(spec.dash);
    const offset = offsetOf(spec.offset);
    return {
      paints: [{ type: 'solid', color }],
      width: width / scale,
      align: spec.align ?? defaultAlign,
      ...(dash ? { dash } : {}),
      ...(offset > 0 ? { offset: offset / scale } : {}),
      ...strokeStyleOf(spec),
    };
  };

  /** `stroke.dash` (lista, ou expressão que devolve a lista): inválido = sem tracejado, com aviso. */
  const dashOf = (expr: StrokeSpec['dash']): readonly number[] | undefined => {
    if (expr === undefined) return undefined;
    const value = ev<unknown>(expr as Expr<unknown>, undefined);
    if (value === undefined || value === null) return undefined;
    const valid =
      Array.isArray(value) &&
      value.every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
    if (!valid) invalidValue('stroke.dash', value);
    return valid ? (value as readonly number[]) : undefined;
  };

  /** `stroke.offset` em px: negativo (vindo de um token) cai em 0 com aviso. */
  const offsetOf = (expr: StrokeSpec['offset']): number => {
    if (expr === undefined) return 0;
    const value = num(expr as Expr<number>, 0);
    if (value < 0) invalidValue('stroke.offset', value);
    return Math.max(0, value);
  };

  /** `cap`, `join` e `sides` (formato 4): só entram na cena quando a chave existe e é válida. */
  const strokeStyleOf = (
    spec: StrokeSpec,
  ): Pick<Stroke, 'cap' | 'join' | 'sides' | 'scale'> => {
    const cap = pick(spec.cap, STROKE_CAPS);
    const join = pick(spec.join, STROKE_JOINS);
    const sides = sidesOf(spec.sides);
    return {
      ...(cap ? { cap } : {}),
      ...(join ? { join } : {}),
      ...(sides ? { sides } : {}),
      ...(spec.scale === false ? { scale: false } : {}),
    };
  };

  const pick = <T extends string>(
    expr: Expr<T> | undefined,
    allowed: readonly T[],
  ): T | undefined => {
    if (expr === undefined) return undefined;
    const value = str(expr as Expr<string>, '');
    return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
  };

  const sidesOf = (
    expr: Expr<readonly StrokeSide[]> | undefined,
  ): StrokeSide[] | undefined => {
    if (expr === undefined) return undefined;
    const value = ev<unknown>(expr as Expr<unknown>, undefined);
    if (!Array.isArray(value)) return undefined;
    const sides = STROKE_SIDES.filter((side) => value.includes(side));
    // Os quatro lados são o contorno inteiro, com o raio dos cantos: a cena não traz `sides`.
    return sides.length > 0 && sides.length < STROKE_SIDES.length ? sides : undefined;
  };

  /** Uma sombra da lista (ou a única): cor `none` não dá sombra; `spread` só entra quando não é 0. */
  const shadowOf = (shadow: ShadowSpec, scale: number): Shadow[] => {
    const color = str(shadow.color, 'none');
    if (isNone(color)) return [];
    const blur = num(shadow.blur as Expr<number> | undefined, 0);
    if (blur < 0) invalidValue('shadow.blur', blur);
    const spread = num(shadow.spread as Expr<number> | undefined, 0) / scale;
    return [
      {
        color,
        offset: {
          x: num(shadow.x as Expr<number> | undefined, 0) / scale,
          y: num(shadow.y as Expr<number> | undefined, 0) / scale,
        },
        blur: Math.max(0, blur) / scale,
        ...(spread !== 0 ? { spread } : {}),
      },
    ];
  };

  /** As sombras do nó, na ordem da lista (a primeira fica por cima). */
  const effectsOf = (node: TemplateNode, scale: number): Shadow[] => {
    const shadow = node.shadow;
    if (!shadow) return [];
    const list: readonly ShadowSpec[] = Array.isArray(shadow)
      ? (shadow as readonly ShadowSpec[])
      : [shadow as ShadowSpec];
    return list.flatMap((spec) => shadowOf(spec, scale));
  };

  // --- vão no contorno (`stroke.gap`) --------------------------------------------------------

  /** Os nós que abrem vão e os nós montados por nó do template: o vão se resolve no fim. */
  const gapNeeds: { id: string; name: string; padding: number }[] = [];
  const builtIds = new Map<TemplateNode, string>();

  const registerGap = (
    node: TemplateNode,
    id: string,
    stroke: Stroke | undefined,
  ): void => {
    const gap =
      node.type === 'frame' || node.type === 'rect' ? node.stroke?.gap : undefined;
    if (gap && stroke)
      gapNeeds.push({ id, name: gap.node, padding: num(gap.padding, 0) });
  };

  /** O primeiro nó do template com esse nome (a ordem do template, em profundidade). */
  const firstNamed = (node: TemplateNode, name: string): TemplateNode | undefined => {
    if (nodeName(node) === name) return node;
    if (node.type !== 'frame') return undefined;
    for (const child of node.children ?? []) {
      const found = firstNamed(child, name);
      if (found) return found;
    }
    return undefined;
  };

  const withGaps = (root: FrameNode): FrameNode =>
    applyGaps(
      root,
      gapNeeds.map((need) => {
        const target = firstNamed(component.template, need.name);
        return {
          id: need.id,
          target: target && builtIds.get(target),
          padding: need.padding,
        };
      }),
    );

  const radiusOf = (node: TemplateNode): CornerRadius => {
    const value = ev<unknown>(node.cornerRadius as Expr<unknown> | undefined, 0);
    if (Array.isArray(value) && value.length === 4) {
      const [a, b, c, d] = value.map((v) => Math.max(0, Number(v) || 0));
      return [a ?? 0, b ?? 0, c ?? 0, d ?? 0];
    }
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  };

  // --- montagem dos nós -----------------------------------------------------------------

  /** A `rotation` avaliada (graus); sem valor, 0 ou não finita, o nó não gira. */
  const rotationOf = (node: TemplateNode): { rotation?: number } => {
    const degrees = num(node.rotation, 0);
    return degrees === 0 ? {} : { rotation: degrees };
  };

  const common = (
    node: TemplateNode,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ) => ({
    ...baseNode({ id, name: nodeName(node) }),
    opacity: Math.min(1, Math.max(0, num(node.opacity, 1))),
    transform: translate(x, y),
    ...rotationOf(node),
    width: w,
    height: h,
    fills: fillsOf(node.fill, w, h),
    effects: effectsOf(node, 1),
  });

  const buildFrame = (
    frame: FrameTemplate,
    path: string,
    x: number,
    y: number,
    w: number,
    h: number,
    isRoot: boolean,
  ): FrameNode => {
    const plan = planFrame(frame, w, h);
    const stroke = strokeOf(frame.stroke, 'inside', 1);
    builtIds.set(frame, `${prefix}/${path}`);
    registerGap(frame, `${prefix}/${path}`, stroke);
    const children = plan.placements.map((p) =>
      buildNode(p.kid.node, `${path}.${p.kid.index}`, p.x, p.y, p.w, p.h),
    );
    const base = {
      ...common(frame, `${prefix}/${path}`, x, y, w, h),
      ...(stroke ? { stroke } : {}),
      type: 'frame' as const,
      clip: frame.clip ?? isRoot,
      cornerRadius: radiusOf(frame),
      children,
    };
    const clipBox = base.clip ? clipBoxOf(base) : undefined;
    return clipBox ? { ...base, clipBox } : base;
  };

  const buildPath = (
    node: PathTemplate,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const [vbW, vbH] = node.viewBox;
    const sx = vbW > 0 ? w / vbW : 1;
    const sy = vbH > 0 ? h / vbH : 1;
    if (Math.abs(sx - sy) > 1e-6 * Math.max(1, Math.abs(sx), Math.abs(sy))) {
      warn('engine.iconStretched');
    }
    const scale = (Math.abs(sx) + Math.abs(sy)) / 2 || 1;
    const stroke = strokeOf(node.stroke, 'center', scale);
    const transform: Matrix = [sx, 0, 0, sy, x, y];
    return {
      ...common(node, id, x, y, vbW, vbH),
      transform,
      effects: effectsOf(node, scale),
      ...(stroke ? { stroke } : {}),
      type: 'path',
      d: str(node.d, ''),
      fillRule: node.fillRule ?? 'nonzero',
    };
  };

  const icons = options.icons ?? original.resolvedIcons;

  /** O nome do ícone do nó, já avaliado. */
  const iconName = (node: IconTemplate): string => str(node.name, '');

  /** A caixa do `viewBox` do ícone do nó (a do conjunto quando o nome é desconhecido); sem avisar. */
  const iconBox = (node: IconTemplate): readonly [number, number] =>
    resolveIcon(icons, iconName(node))?.viewBox ?? icons?.viewBox ?? DEFAULT_ICON_VIEWBOX;

  /** Cor do traço ou do preenchimento de um caminho: `true` e ausente valem a cor do nó. */
  const iconPaint = (
    value: boolean | string | undefined,
    nodeColor: string,
  ): string | undefined => {
    if (value === false) return undefined;
    return typeof value === 'string' ? value : nodeColor;
  };

  /** Preenchimento do caminho: `fill` explícito, senão a cor do nó, a menos que ele só tenha traço. */
  const iconFills = (iconPath: IconPath, nodeColor: string): Paint[] => {
    const wanted = iconPath.fill ?? iconPath.stroke === undefined;
    const color = iconPaint(wanted, nodeColor);
    return color === undefined || isNone(color) ? [] : [{ type: 'solid', color }];
  };

  /** Traço do caminho (`stroke`), com a largura do nó quando ele a troca. */
  const iconStroke = (
    iconPath: IconPath,
    nodeColor: string,
    strokeWidth: number | undefined,
  ): Stroke | undefined => {
    if (iconPath.stroke === undefined) return undefined;
    const color = iconPaint(iconPath.stroke, nodeColor);
    if (color === undefined || isNone(color)) return undefined;
    return {
      paints: [{ type: 'solid', color }],
      width: strokeWidth ?? iconPath.width ?? 1,
      align: 'center',
      ...(iconPath.cap ? { cap: iconPath.cap } : {}),
      ...(iconPath.join ? { join: iconPath.join } : {}),
    };
  };

  const iconPathNode = (
    iconPath: IconPath,
    id: string,
    box: readonly [number, number],
    nodeColor: string,
    strokeWidth: number | undefined,
  ): PathNode => {
    const stroke = iconStroke(iconPath, nodeColor, strokeWidth);
    return {
      ...baseNode({ id, name: 'icon-path' }),
      width: box[0],
      height: box[1],
      fills: iconFills(iconPath, nodeColor),
      ...(stroke ? { stroke } : {}),
      type: 'path',
      d: iconPath.d,
      fillRule: 'nonzero',
    };
  };

  /** O ícone vira um grupo com um caminho por traçado, escalado do `viewBox` para a caixa do nó. */
  const buildIcon = (
    node: IconTemplate,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const name = iconName(node);
    const found = resolveIcon(icons, name);
    const base = { ...common(node, id, x, y, w, h), name: name || 'icon' };
    if (found === undefined) {
      warn('engine.iconUnknown', { name });
      return { ...base, type: 'unknown', sourceType: 'icon' };
    }
    const [vbW, vbH] = found.viewBox;
    const sx = vbW > 0 ? w / vbW : 1;
    const sy = vbH > 0 ? h / vbH : 1;
    if (Math.abs(sx - sy) > 1e-6 * Math.max(1, Math.abs(sx), Math.abs(sy)))
      warn('engine.iconStretched');
    const color = str(node.color, '#000000');
    const strokeWidth =
      node.strokeWidth === undefined ? undefined : Math.max(0, num(node.strokeWidth, 1));
    const children = found.def.paths.map((iconPath, i) => ({
      ...iconPathNode(iconPath, `${id}/${i}`, found.viewBox, color, strokeWidth),
      transform: [sx, 0, 0, sy, 0, 0] as Matrix,
    }));
    return { ...base, type: 'group', children };
  };

  /** A chave do `$lines` que cita este nó: o nome, com o escopo da linha quando está num `repeat`. */
  const linesKeyOf = (node: TextTemplate): string =>
    node.name === undefined
      ? ''
      : node.linesScope === undefined
        ? node.name
        : `${node.linesScope}:${node.name}`;
  const recordLines = (node: TextTemplate, count: number): void => {
    lineCounts.set(linesKeyOf(node), count);
  };
  const measuredLines = (m: TextMetrics): number =>
    m.lineCount ?? Math.max(1, m.lines?.length ?? 1);

  /** Vale conferir se o texto passa da altura? Não, se `maxLines`/`ellipsis` o cortam de propósito. */
  const checksOverflow = (font: MeasureFont, w: number): boolean =>
    font.maxLines === undefined && font.ellipsis !== true && w > EPS;

  /** As linhas quebradas passam da altura do nó e nada as corta (`maxLines`/`ellipsis`)? */
  const warnTextTooTall = (
    node: TextTemplate,
    height: (() => number) | number,
    font: MeasureFont,
    w: number,
    h: number,
  ): void => {
    if (!checksOverflow(font, w)) return;
    const measured = typeof height === 'number' ? height : height();
    if (measured > h + TEXT_TOLERANCE)
      warnShort('engine.textTooBig', nodeName(node), measured - h);
  };

  /** O texto da cena e, com `runs`, os trechos resolvidos e o layout deles na caixa. */
  const textContent = (
    node: TextTemplate,
    font: MeasureFont,
    w: number,
    h: number,
  ): { text: string; extra: { runs?: SceneTextRun[]; runLayout?: RunLayout } } => {
    const cited = citedLines.has(linesKeyOf(node));
    if (node.runs === undefined) {
      const text = plainText(node);
      warnTextTooTall(node, () => options.measure(text, font, w).height, font, w, h);
      if (cited)
        recordLines(
          node,
          text === '' ? 0 : measuredLines(options.measure(text, font, w)),
        );
      return { text, extra: {} };
    }
    const rich = richRuns(node, font);
    const runLayout = layoutRuns(rich.runs, richBase(node, font), options.measure, w);
    warnTextTooTall(node, runLayout.height, font, w, h);
    const text = rich.scene.map((run) => run.text).join('');
    if (cited) recordLines(node, text === '' ? 0 : runLayout.lines.length);
    return { text, extra: { runs: rich.scene, runLayout } };
  };

  /** O `align` da cena. O texto rico (`runs`) não justifica: a cena diz `left`, que é o que se arrumou. */
  const styleAlign = (
    node: TextTemplate,
    align: FontSpec['align'],
  ): TextStyle['align'] => {
    const allowed: readonly TextStyle['align'][] =
      original.formatVersion >= 4
        ? ['left', 'center', 'right', 'justify']
        : ['left', 'center', 'right'];
    const value = oneOf(align, allowed, 'left');
    return value === 'justify' && node.runs !== undefined ? 'left' : value;
  };

  const verticalAlignOf = (node: TextTemplate): TextStyle['verticalAlign'] =>
    oneOf(
      node.font?.verticalAlign,
      // `cap-middle` só existe na formatVersion 4; antes, vindo de expressão, é valor fora do conjunto.
      original.formatVersion >= 4
        ? ['top', 'middle', 'bottom', 'cap-middle']
        : ['top', 'middle', 'bottom'],
      'top',
    );

  /** `baselinePadding.top` do nó na caixa de largura `w`: nunca menor que a linha de base da fonte. */
  const baselineTopOf = (node: TextTemplate, w: number): number | undefined => {
    const top = baselinePaddingOf(node)?.top;
    return top === undefined ? undefined : Math.max(top, baselinesOf(node, w).first);
  };

  const buildText = (
    node: TextTemplate,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const font = textFont(node);
    const font0: FontSpec = node.font ?? {};
    const baselineTop = baselineTopOf(node, w);
    const decoration = oneOf(
      font0.decoration,
      ['none', 'underline', 'line-through'],
      'none',
    );
    const style: TextStyle = {
      fontFamily: font.family,
      fontSize: font.size,
      fontWeight: font.weight,
      italic: font.italic,
      lineHeight: font.lineHeight,
      letterSpacing: font.letterSpacing,
      // `justify` só existe na formatVersion 4; antes, vindo de expressão, é valor fora do conjunto.
      align: styleAlign(node, font0.align),
      // Com `baselinePadding.top` o `verticalAlign` deixa de valer (a primeira linha de base manda).
      verticalAlign: baselineTop === undefined ? verticalAlignOf(node) : 'top',
      ...(baselineTop === undefined ? {} : { baselineTop }),
      ...(decoration === 'none' ? {} : { decoration }),
      ...(font.wrap === 'none' ? { wrap: 'none' as const } : {}),
      ...(font.ellipsis === true ? { ellipsis: true } : {}),
      ...(font.maxLines !== undefined ? { maxLines: font.maxLines } : {}),
    };
    const { text, extra } = textContent(node, font, w, h);
    const color = str(node.color, '#000000');
    const stroke = strokeOf(node.stroke, 'inside', 1);
    const result: TextNode = {
      ...common(node, id, x, y, w, h),
      fills: isNone(color) ? [] : [{ type: 'solid', color }],
      ...(stroke ? { stroke } : {}),
      type: 'text',
      text,
      style,
      ...extra,
    };
    return result;
  };

  /**
   * `image` vira um retângulo: o `fill` do nó é o fundo e, por cima, o paint `image` com a URL
   * (o literal, ou o valor do campo se for texto não vazio). O modelo não baixa a imagem nem
   * aplica a política de URL (quem desenha decide); o layout não depende dela.
   */
  const buildImage = (
    node: ImageTemplate,
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const raw = typeof node.src === 'string' ? node.src : ev<unknown>(node.src, '');
    const url = typeof raw === 'string' ? raw.trim() : '';
    const stroke = strokeOf(node.stroke, 'inside', 1);
    const base = common(node, id, x, y, w, h);
    return {
      ...base,
      fills: [
        ...base.fills,
        { type: 'image', fit: node.fit ?? 'cover', ...(url === '' ? {} : { url }) },
      ],
      ...(stroke ? { stroke } : {}),
      type: 'rect',
      cornerRadius: radiusOf(node),
    };
  };

  const buildNode = (
    node: TemplateNode,
    path: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): SceneNode => {
    const id = `${prefix}/${path}`;
    builtIds.set(node, id);
    switch (node.type) {
      case 'frame':
        return buildFrame(node, path, x, y, w, h, false);
      case 'path':
        return buildPath(node, id, x, y, w, h);
      case 'icon':
        return buildIcon(node, id, x, y, w, h);
      case 'text':
        return buildText(node, id, x, y, w, h);
      case 'slot': {
        const label = str(node.label, node.name ?? 'slot');
        return {
          ...common(node, id, x, y, w, h),
          name: label,
          type: 'unknown',
          sourceType: 'slot',
        };
      }
      case 'rect': {
        const stroke = strokeOf(node.stroke, 'inside', 1);
        registerGap(node, id, stroke);
        return {
          ...common(node, id, x, y, w, h),
          ...(stroke ? { stroke } : {}),
          type: 'rect',
          cornerRadius: radiusOf(node),
        };
      }
      case 'ellipse': {
        const stroke = strokeOf(node.stroke, 'inside', 1);
        return {
          ...common(node, id, x, y, w, h),
          ...(stroke ? { stroke } : {}),
          type: 'ellipse',
        };
      }
      case 'image':
        return buildImage(node, id, x, y, w, h);
      case 'repeat':
        // `expandRepeats` já trocou todo `repeat` por um quadro: nunca chega aqui.
        throw new Error('repeat não expandido');
    }
  };

  /** O que o slot oferece às filhas: cada `provide` avaliado com os valores desta instância. */
  const provides = (): ProvidedValues | undefined => {
    const offered = providingSlot(component)?.provide;
    if (offered === undefined) return undefined;
    const out: Record<string, string | number> = {};
    for (const [name, expr] of Object.entries(offered)) {
      const value = ev<unknown>(expr as Expr<unknown>, undefined);
      if (typeof value === 'number' && Number.isFinite(value)) out[name] = value;
      else if (typeof value === 'string' && value.trim() !== '') out[name] = value;
    }
    return Object.keys(out).length === 0 ? undefined : out;
  };

  const buildRoot = (box: Box): FrameNode =>
    withGaps(
      buildFrame(component.template, 'root', box.x, box.y, box.width, box.height, true),
    );

  return {
    messages: messageSet.list,
    shortfalls,
    provides,
    planFrame,
    buildRoot,
    /** A primeira linha de base do componente na caixa `box` (o que o `align: "baseline"` do pai lê). */
    rootBaseline: (box: Box): number | undefined =>
      kidBaseline(component.template, box.width, box.height),
    template: component.template,
    limitOf,
    clampSize,
    citedLines,
    lineCounts,
    /** O número de linhas de um nó mudou entre as duas passagens: fica o da segunda (decisão 8). */
    warnLinesUnstable: (key: string) =>
      warn('engine.linesUnstable', { name: linesNodeName(key) }),
  };
}

type Engine = ReturnType<typeof createEngine>;

/**
 * Roda `run` no motor e, se o template usa `$lines`, em duas passagens (decisão 8 da #898): a
 * primeira com 1 linha em cada `$lines`, a segunda com as linhas medidas na primeira. `run` monta os
 * nós de um texto citado (é neles que as linhas são medidas, na largura final). Se a segunda medir outro número num nó citado, fica o da segunda e o
 * motor avisa `$lines instável: <nó>` (sem terceira passagem). Sem `$lines`, uma passagem só.
 */
function withLinesPasses<R>(
  component: ComponentFile,
  values: FieldValues,
  options: InstantiateOptions,
  size: { readonly width: number; readonly height: number },
  run: (engine: Engine) => R,
  openAxes?: { readonly width: boolean; readonly height: boolean },
): { engine: Engine; result: R } {
  const first = createEngine(component, values, options, size, undefined, openAxes);
  if (first.citedLines.size === 0) return { engine: first, result: run(first) };
  run(first);
  const seed = new Map(
    [...first.citedLines].map((key) => [key, first.lineCounts.get(key) ?? 0]),
  );
  const second = createEngine(component, values, options, size, seed, openAxes);
  const result = run(second);
  for (const [key, count] of second.lineCounts)
    if (count !== (seed.get(key) ?? 0)) second.warnLinesUnstable(key);
  return { engine: second, result };
}

export function instantiate(
  component: ComponentFile,
  values: FieldValues,
  box: Box,
  options: InstantiateOptions,
): Instantiated {
  const { engine, result: root } = withLinesPasses(component, values, options, box, (e) =>
    e.buildRoot(box),
  );
  const provides = engine.provides();
  const messages = engine.messages();
  const firstBaseline = engine.rootBaseline(box);
  return {
    root,
    ...(firstBaseline === undefined ? {} : { firstBaseline }),
    ...(provides === undefined ? {} : { provides }),
    warnings: textsOf(messages),
    messages,
    shortfalls: Object.fromEntries(engine.shortfalls),
    overflowWarnings: [...engine.shortfalls.keys()],
  };
}

/**
 * Mede o componente sem montar nós: o plano da raiz do template, com `null` = `hug` naquele
 * eixo (o quadro abraça os filhos; com `slotContent`, o slot vale o tamanho dos filhos).
 */
export function measureComponent(
  component: ComponentFile,
  values: FieldValues,
  size: { readonly width: number | null; readonly height: number | null },
  options: InstantiateOptions,
): {
  width: number;
  height: number;
  warnings: readonly string[];
  messages: readonly ModelMessage[];
} {
  const start = {
    width: size.width ?? component.size.width,
    height: size.height ?? component.size.height,
  };
  // Eixo hug: o `$size` dele não limita os `min`/`max` por expressão (infinito = ausente).
  const open = { width: size.width === null, height: size.height === null };
  const plan = (engine: Engine): { width: number; height: number } => {
    const { template } = engine;
    // Num eixo hug o `max` da raiz é o limite disponível; depois do plano, o min/max da raiz
    // se aplica (a largura primeiro: a altura é medida já na largura limitada).
    const finiteMax = (axis: Axis) => {
      const { max } = engine.limitOf(template, axis);
      return Number.isFinite(max) ? max : null;
    };
    const limits: Limits = {
      w: size.width === null ? finiteMax('w') : null,
      h: size.height === null ? finiteMax('h') : null,
    };
    const first = engine.planFrame(template, size.width, size.height, limits);
    const width = size.width ?? engine.clampSize(template, 'w', first.w);
    const planned =
      width === first.w ? first : engine.planFrame(template, width, size.height, limits);
    return { width, height: size.height ?? engine.clampSize(template, 'h', planned.h) };
  };
  // Com `$lines`, as duas passagens também montam os nós (é neles que se medem as linhas de cada texto).
  const { engine, result } = withLinesPasses(
    component,
    values,
    options,
    start,
    (e) => {
      const measured = plan(e);
      if (e.citedLines.size > 0) e.buildRoot({ x: 0, y: 0, ...measured });
      return measured;
    },
    open,
  );
  const { width, height } = result;
  const messages = engine.messages();
  return { width, height, warnings: textsOf(messages), messages };
}
