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
  ImageTemplate,
  PathTemplate,
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
import { evaluate, evaluateBoolean, evaluateText, referencedFields } from './expressions';
import {
  LAYOUT_ALIGNS,
  LAYOUT_JUSTIFIES,
  LAYOUT_TYPES,
  allowedValue,
  describeValue,
  parseSizeSpec,
} from './layoutValues';
import { expandRepeats } from './repeat';
import {
  applyTokens,
  defaultFontFamily,
  resolveTokens,
  type ResolvedTokens,
} from './tokens';
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
}

export interface Instantiated {
  readonly root: FrameNode;
  readonly warnings: readonly string[];
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
    if (widthOf(candidate) > maxWidth + 1e-9) {
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
    widthOf(`${kept}…`) > maxWidth + 1e-9
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
    const tooWide = maxWidth !== undefined && widthOf(line) > maxWidth + 1e-9;
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
): TextMetrics {
  const breaks = maxWidth !== undefined && font.wrap !== 'none';
  const raw = text
    .split('\n')
    .flatMap((paragraph) =>
      breaks ? wrapWords(paragraph, widthOf, maxWidth) : [paragraph],
    );
  const lines = clipLines(raw, font, widthOf, maxWidth);
  const widest = lines.reduce((max, line) => Math.max(max, widthOf(line)), 0);
  return { width: widest, height: Math.max(1, lines.length) * font.lineHeight, lines };
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
  readonly align: 'start' | 'center' | 'end' | 'stretch';
  readonly justify: 'start' | 'center' | 'end' | 'space-between';
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
};

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

function anchorsOf(
  node: TemplateNode,
  axis: Axis,
): { start?: number; end?: number; center: boolean } {
  const a: Anchors | undefined = node.anchors;
  if (!a) return { center: false };
  return axis === 'w'
    ? { start: a.left, end: a.right, center: a.centerX === true }
    : { start: a.top, end: a.bottom, center: a.centerY === true };
}

// ---------------------------------------------------------------------------------------
// Instanciação
// ---------------------------------------------------------------------------------------

/**
 * Monta o "motor" de um componente com seus valores: avaliação, tamanhos e planos dos quadros.
 * `instantiate` e `measureComponent` compartilham este fechamento (e o cache dos planos).
 */
function createEngine(
  original: ComponentFile,
  sourceValues: FieldValues,
  options: InstantiateOptions,
) {
  // Os `$token` viram o valor do modo antes de tudo (vale também dentro do `repeat`).
  const tokens =
    options.tokens ?? original.resolvedTokens ?? resolveTokens(undefined, {});
  const source = applyTokens(original, tokens);
  // O `repeat` vira quadros com os valores de cada linha antes de o motor começar.
  const {
    component,
    values,
    warnings: expansionWarnings,
  } = expandRepeats(source, sourceValues);
  const warnings = new Set<string>(expansionWarnings);
  const warn = (message: string) => warnings.add(message);
  const shortfalls = new Map<string, number>();
  /** Aviso de "não cabe": a mensagem de sempre e quanto falta, para a prova de desenho dizer. */
  const warnShort = (message: string, missing: number) => {
    warn(message);
    shortfalls.set(message, Math.max(shortfalls.get(message) ?? 0, missing));
  };
  const prefix = options.idPrefix ?? 'c';

  for (const key of referencedFields(component.template))
    if (!(key in values)) warn(`campo não informado: ${key}`);

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

  /** O que é do nó (e não dos trechos) no layout do texto rico. */
  const richBase = (node: TextTemplate, font: MeasureFont): RichBase => ({
    size: font.size,
    lineHeight: font.lineHeight,
    align: oneOf<'left' | 'center' | 'right'>(
      node.font?.align,
      ['left', 'center', 'right'],
      'left',
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
      warn(`texto medido com largura 0: ${nodeName(node)}`);
    const font = textFont(node);
    if (node.runs === undefined) return options.measure(plainText(node), font, maxWidth);
    const rich = richRuns(node, font);
    return measureRichText(rich.runs, richBase(node, font), options.measure, maxWidth);
  };

  // --- valores conferidos (tamanho e layout) ----------------------------------------------

  const invalidValue = (label: string, value: unknown) =>
    warn(`valor inválido em ${label}: ${describeValue(value)}`);

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

  /** Limite em px; não finito ou negativo = ausente. */
  const limitValue = (expr: Expr<number> | undefined): number | undefined => {
    if (expr === undefined) return undefined;
    const n = num(expr, Number.NaN);
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

  const layoutOf = (frame: FrameTemplate): FrameLayout => {
    const spec = frame.layout;
    const kind = checked(spec?.type, LAYOUT_TYPES, 'none', 'layout.type');
    if (!spec || kind === 'none') return NONE_LAYOUT;
    return {
      kind,
      main: kind === 'row' ? 'w' : 'h',
      gap: Math.max(0, num(spec.gap, 0)),
      pad: paddingOf(spec.padding),
      align: checked(spec.align, LAYOUT_ALIGNS, 'start', 'layout.align'),
      justify: checked(spec.justify, LAYOUT_JUSTIFIES, 'start', 'layout.justify'),
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
    return measureText(node, wrap).height;
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

  const isStretchAnchored = (
    anchors: ReturnType<typeof anchorsOf> | undefined,
  ): boolean =>
    anchors !== undefined &&
    !anchors.center &&
    anchors.start !== undefined &&
    anchors.end !== undefined;

  /** Âncoras nos dois lados esticam o filho entre elas (com o pai já medido). */
  const anchoredSize = (
    anchors: ReturnType<typeof anchorsOf> | undefined,
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
    anchors: ReturnType<typeof anchorsOf> | undefined,
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
    anchors: ReturnType<typeof anchorsOf> | undefined,
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
      if (fills > 0) warn('fill dentro de hug vira 0');
    } else {
      const remaining = content - fixed - layout.gap * Math.max(0, sizes.length - 1);
      if (remaining < -tolerance)
        warnShort(`conteúdo maior que a caixa: ${nodeName(frame)}`, -remaining);
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
        warnShort(`conteúdo maior que a caixa: ${nodeName(frame)}`, widest - content);
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
      let offset = 0;
      let extra = 0;
      if (layout.justify === 'center') offset = free / 2;
      else if (layout.justify === 'end') offset = free;
      else if (layout.justify === 'space-between' && sizes.length > 1)
        extra = free / (sizes.length - 1);
      let cursor = startPad + offset;
      return sizes.map((size) => {
        const position = cursor;
        cursor += size + layout.gap + extra;
        return position;
      });
    }
    return sizes.map((size) => {
      if (layout.align === 'center') return startPad + (content - size) / 2;
      if (layout.align === 'end') return startPad + content - size;
      return startPad;
    });
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
    const padW = layout.pad.left + layout.pad.right;
    const padH = layout.pad.top + layout.pad.bottom;

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
        total = hugTotal(layout, kids, axis, preliminary, pad);
      }
      const space: AxisSpace = { content: Math.max(0, total - pad), bound: null };
      return { total, sizes: resolveAxis(frame, layout, kids, axis, space, others) };
    };

    const horizontal = solve('w', w, null);
    const vertical = solve('h', h, horizontal.sizes);
    const xs = positionAxis(layout, kids, 'w', horizontal.sizes, horizontal.total);
    const ys = positionAxis(layout, kids, 'h', vertical.sizes, vertical.total);
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
    let perFrame = planCache.get(frame);
    if (!perFrame) {
      perFrame = new Map();
      planCache.set(frame, perFrame);
    }
    perFrame.set(key, plan);
    return plan;
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
    return {
      paints: [{ type: 'solid', color }],
      width: width / scale,
      align: spec.align ?? defaultAlign,
      ...(spec.dash ? { dash: spec.dash } : {}),
      ...strokeStyleOf(spec),
    };
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
    return sides.length > 0 ? sides : undefined;
  };

  const effectsOf = (node: TemplateNode, scale: number): Shadow[] => {
    const shadow = node.shadow;
    if (!shadow) return [];
    const color = str(shadow.color, 'none');
    if (isNone(color)) return [];
    return [
      {
        color,
        offset: { x: (shadow.x ?? 0) / scale, y: (shadow.y ?? 0) / scale },
        blur: (shadow.blur ?? 0) / scale,
      },
    ];
  };

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
      warn('ícone esticado: escala diferente nos dois eixos');
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
      warn(`ícone desconhecido: ${name}`);
      return { ...base, type: 'unknown', sourceType: 'icon' };
    }
    const [vbW, vbH] = found.viewBox;
    const sx = vbW > 0 ? w / vbW : 1;
    const sy = vbH > 0 ? h / vbH : 1;
    if (Math.abs(sx - sy) > 1e-6 * Math.max(1, Math.abs(sx), Math.abs(sy)))
      warn('ícone esticado: escala diferente nos dois eixos');
    const color = str(node.color, '#000000');
    const strokeWidth =
      node.strokeWidth === undefined ? undefined : Math.max(0, num(node.strokeWidth, 1));
    const children = found.def.paths.map((iconPath, i) => ({
      ...iconPathNode(iconPath, `${id}/${i}`, found.viewBox, color, strokeWidth),
      transform: [sx, 0, 0, sy, 0, 0] as Matrix,
    }));
    return { ...base, type: 'group', children };
  };

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
      warnShort(`texto maior que a caixa: ${nodeName(node)}`, measured - h);
  };

  /** O texto da cena e, com `runs`, os trechos resolvidos e o layout deles na caixa. */
  const textContent = (
    node: TextTemplate,
    font: MeasureFont,
    w: number,
    h: number,
  ): { text: string; extra: { runs?: SceneTextRun[]; runLayout?: RunLayout } } => {
    if (node.runs === undefined) {
      const text = plainText(node);
      warnTextTooTall(node, () => options.measure(text, font, w).height, font, w, h);
      return { text, extra: {} };
    }
    const rich = richRuns(node, font);
    const runLayout = layoutRuns(rich.runs, richBase(node, font), options.measure, w);
    warnTextTooTall(node, runLayout.height, font, w, h);
    const text = rich.scene.map((run) => run.text).join('');
    return { text, extra: { runs: rich.scene, runLayout } };
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
      align: oneOf(font0.align, ['left', 'center', 'right'], 'left'),
      verticalAlign: oneOf(
        font0.verticalAlign,
        // `cap-middle` só existe na formatVersion 4; antes, vindo de expressão, é valor fora do conjunto.
        original.formatVersion >= 4
          ? ['top', 'middle', 'bottom', 'cap-middle']
          : ['top', 'middle', 'bottom'],
        'top',
      ),
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

  const buildRoot = (box: Box): FrameNode =>
    buildFrame(component.template, 'root', box.x, box.y, box.width, box.height, true);

  return {
    warnings,
    shortfalls,
    planFrame,
    buildRoot,
    template: component.template,
    limitOf,
    clampSize,
  };
}

export function instantiate(
  component: ComponentFile,
  values: FieldValues,
  box: Box,
  options: InstantiateOptions,
): Instantiated {
  const engine = createEngine(component, values, options);
  const root = engine.buildRoot(box);
  return {
    root,
    warnings: [...engine.warnings],
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
): { width: number; height: number; warnings: readonly string[] } {
  const engine = createEngine(component, values, options);
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
  const plan =
    width === first.w ? first : engine.planFrame(template, width, size.height, limits);
  const height = size.height ?? engine.clampSize(template, 'h', plan.h);
  return { width, height, warnings: [...engine.warnings] };
}
