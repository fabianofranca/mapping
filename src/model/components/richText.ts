/**
 * Motor dos componentes (etapa #747, CF4): layout puro do texto rico (`runs`).
 *
 * Os trechos de um nó `text` quebram linha como UM texto só, pela palavra. O layout é derivado de
 * qualquer `TextMeasurer`: cada pedaço de uma linha é medido com `measure(pedaço, fonteDoTrecho)`
 * sem `maxWidth` (a largura de uma linha), de modo que o medidor aproximado e o do canvas ganham a
 * medida por trechos sem código duplicado, e o desenho usa o mesmo layout que a medida.
 *
 * Regras:
 * - Oportunidades de quebra: os espaços dentro de trechos **sem fundo** e as bordas de uma caixa
 *   em linha (chip, o trecho com fundo). Uma palavra que atravessa trechos sem espaço entre eles
 *   (`"Pa"` + `"gar"`) é uma palavra só. `\n` num trecho sem fundo força a quebra; num chip vira
 *   espaço.
 * - No começo da linha os espaços de trechos sem fundo são descartados (como no CSS); o texto do
 *   chip não: é desenhado inteiro, com o espaço inicial. Espaços no fim da linha não contam.
 * - Chip: átomo inquebrável de largura `texto + 2·h` e altura `linha do trecho + 2·v`. Maior que a
 *   linha, fica sozinho e passa da largura; que não cabe no resto da linha, vai inteiro para a
 *   linha de baixo. Uma palavra maior que a largura também fica sozinha na linha.
 * - Altura de linha de um trecho = `lineHeight` do nó × (tamanho do trecho / tamanho do nó); a
 *   altura da linha é o máximo entre a `lineHeight` do nó e a altura dos pedaços (o chip inclui o
 *   respiro vertical). Limite: os pedaços ficam centrados verticalmente na linha, não alinhados
 *   pela linha de base.
 * - `wrap: none` só quebra em `\n`; `maxLines` mantém as N primeiras linhas; `ellipsis` (na linha
 *   cortada por `maxLines`, ou na que passa da caixa) tira caracteres do fim do último pedaço de
 *   texto (no meio de um trecho, se preciso; um chip sai inteiro) até a linha mais o `…` caber, e o
 *   `…` usa a fonte do último pedaço que sobrou.
 * - `align` vale por linha, contra a largura da caixa (quando houver).
 *
 * Funções puras, sem DOM. As posições (`x`, `y`) são relativas ao canto da caixa do texto, antes do
 * `verticalAlign` (o desenho aplica o deslocamento vertical).
 */
import type { MeasureFont, TextMeasurer, TextMetrics } from './instantiate';

const EPS = 1e-9;

/** Um trecho já resolvido: o texto, a fonte e, quando tem fundo, o respiro da caixa em linha. */
export interface RichRun {
  readonly text: string;
  /**
   * A fonte do trecho (família, tamanho, peso, itálico e espaçamento entre letras). A
   * `lineHeight`, o `wrap`, o `ellipsis` e o `maxLines` do trecho são ignorados: valem os do nó.
   */
  readonly font: MeasureFont;
  /** Presente = o trecho tem fundo (chip): `padding` é `[vertical, horizontal]` em px. */
  readonly chip?: { readonly padding: readonly [number, number] };
}

/** O que é do nó, não dos trechos. */
export interface RichBase {
  /** Tamanho da fonte do nó (px): a referência da escala da altura de linha dos trechos. */
  readonly size: number;
  /** Altura de linha do nó, em px. */
  readonly lineHeight: number;
  readonly wrap?: 'word' | 'none';
  readonly ellipsis?: boolean;
  /** Inteiro ≥ 1. */
  readonly maxLines?: number;
  /** Alinhamento de cada linha contra a largura da caixa (padrão `left`). */
  readonly align?: 'left' | 'center' | 'right';
}

/** Um pedaço de uma linha: texto de um só trecho (ou a caixa inteira de um chip). */
export interface RunPiece {
  /** Índice do trecho na lista de origem. */
  readonly run: number;
  /** O texto a desenhar (no chip, inclui o espaço inicial, se houver). */
  readonly text: string;
  /** Posição horizontal na caixa do texto (com o `align` aplicado). */
  readonly x: number;
  /** Largura do pedaço; no chip, a da caixa (texto + 2·h). */
  readonly width: number;
  /** Altura do pedaço; no chip, a da caixa (linha do trecho + 2·v). */
  readonly height: number;
  /** `true` = caixa em linha (desenha o fundo; o texto fica `padding` horizontal para dentro). */
  readonly chip: boolean;
}

export interface RunLine {
  /** Topo da linha na caixa do texto. */
  readonly y: number;
  readonly height: number;
  /** Largura do conteúdo da linha (sem espaços do fim). */
  readonly width: number;
  readonly pieces: readonly RunPiece[];
}

export interface RunLayout {
  /** A linha mais larga. */
  readonly width: number;
  /** Soma das alturas das linhas. */
  readonly height: number;
  readonly lines: readonly RunLine[];
}

// ---------------------------------------------------------------------------------------
// Contexto de medida
// ---------------------------------------------------------------------------------------

/** Um segmento de texto de um trecho com a largura já medida (no chip, a da caixa). */
interface Seg {
  readonly run: number;
  readonly text: string;
  readonly width: number;
  readonly chip: boolean;
}

type Atom =
  | { readonly kind: 'break' }
  | { readonly kind: 'space'; readonly seg: Seg }
  | { readonly kind: 'word'; readonly segs: readonly Seg[]; readonly width: number };

interface Context {
  readonly runs: readonly RichRun[];
  readonly base: RichBase;
  /** Altura de linha do trecho (com o respiro vertical do chip). */
  readonly heightOf: (run: number) => number;
  /** Largura do texto do trecho numa linha só (sem o respiro do chip). */
  readonly textWidth: (run: number, text: string) => number;
  readonly seg: (run: number, text: string) => Seg;
}

/** A altura de linha de um trecho: a do nó escalada pelo tamanho do trecho. */
function runLineHeight(base: RichBase, font: MeasureFont): number {
  return base.size > 0 ? (base.lineHeight * font.size) / base.size : base.lineHeight;
}

function createContext(
  runs: readonly RichRun[],
  base: RichBase,
  measure: TextMeasurer,
): Context {
  const cache = new Map<string, number>();
  const fontOf = (run: number): MeasureFont => {
    const font = runs[run]?.font as MeasureFont;
    return {
      family: font.family,
      size: font.size,
      weight: font.weight,
      italic: font.italic,
      letterSpacing: font.letterSpacing,
      lineHeight: runLineHeight(base, font),
    };
  };
  const textWidth = (run: number, text: string): number => {
    const key = `${run}\u0000${text}`;
    let width = cache.get(key);
    if (width === undefined) {
      width = measure(text, fontOf(run)).width;
      cache.set(key, width);
    }
    return width;
  };
  const padding = (run: number): readonly [number, number] =>
    runs[run]?.chip?.padding ?? [0, 0];
  const heightOf = (run: number): number =>
    runLineHeight(base, runs[run]?.font as MeasureFont) +
    (runs[run]?.chip ? 2 * padding(run)[0] : 0);
  const seg = (run: number, text: string): Seg => {
    const chip = runs[run]?.chip !== undefined;
    const width = textWidth(run, text) + (chip ? 2 * padding(run)[1] : 0);
    return { run, text, width, chip };
  };
  return { runs, base, heightOf, textWidth, seg };
}

// ---------------------------------------------------------------------------------------
// Átomos: palavras, espaços, quebras forçadas e chips
// ---------------------------------------------------------------------------------------

/** Pedaços de um texto sem fundo: `\n`, sequência de espaços ou sequência de não-espaços. */
const TOKEN = /\n|[ \t]+|[^ \t\n]+/g;

function wordAtom(segs: readonly Seg[]): Atom {
  return { kind: 'word', segs, width: segs.reduce((sum, seg) => sum + seg.width, 0) };
}

/** Quebra os trechos em átomos; a palavra que atravessa trechos vira um átomo só. */
function toAtoms(ctx: Context): Atom[] {
  const atoms: Atom[] = [];
  let word: Seg[] = [];
  const flush = (): void => {
    if (word.length > 0) atoms.push(wordAtom(word));
    word = [];
  };
  ctx.runs.forEach((run, index) => {
    if (run.text === '') return;
    if (run.chip) {
      flush();
      atoms.push(wordAtom([ctx.seg(index, run.text.replace(/\n/g, ' '))]));
      return;
    }
    for (const token of run.text.match(TOKEN) ?? []) {
      if (token === '\n') {
        flush();
        atoms.push({ kind: 'break' });
      } else if (token.trim() === '') {
        flush();
        atoms.push({ kind: 'space', seg: ctx.seg(index, token) });
      } else {
        word.push(ctx.seg(index, token));
      }
    }
  });
  flush();
  return atoms;
}

// ---------------------------------------------------------------------------------------
// Quebra de linhas
// ---------------------------------------------------------------------------------------

/** Distribui os átomos em linhas (guloso); `limit` infinito = só as quebras forçadas. */
function breakLines(atoms: readonly Atom[], limit: number): Seg[][] {
  const lines: Seg[][] = [];
  let line: Seg[] = [];
  let width = 0;
  let pending: Seg[] = [];
  let pendingWidth = 0;
  const endLine = (): void => {
    lines.push(line);
    line = [];
    width = 0;
    pending = [];
    pendingWidth = 0;
  };
  for (const atom of atoms) {
    if (atom.kind === 'break') {
      endLine();
    } else if (atom.kind === 'space') {
      // espaço no começo da linha é descartado; os demais esperam a palavra seguinte
      if (line.length > 0) {
        pending.push(atom.seg);
        pendingWidth += atom.seg.width;
      }
    } else {
      if (line.length > 0 && width + pendingWidth + atom.width > limit + EPS) endLine();
      line.push(...pending, ...atom.segs);
      width += pendingWidth + atom.width;
      pending = [];
      pendingWidth = 0;
    }
  }
  lines.push(line);
  return lines;
}

// ---------------------------------------------------------------------------------------
// maxLines e ellipsis
// ---------------------------------------------------------------------------------------

const sumWidths = (segs: readonly Seg[]): number =>
  segs.reduce((sum, seg) => sum + seg.width, 0);

const isBlank = (seg: Seg | undefined): boolean =>
  seg !== undefined && !seg.chip && seg.text.trim() === '';

/** Tira o último ponto de código (emoji e pares substitutos saem inteiros). */
export function dropLastChar(text: string): string {
  return [...text].slice(0, -1).join('');
}

/**
 * Tira do fim da linha (chips inteiros, letras do último texto) até a linha + `…` caber em
 * `limit`; o `…` usa a fonte do último pedaço que sobrou.
 */
function ellipsize(line: readonly Seg[], ctx: Context, limit: number): Seg[] {
  const kept = [...line];
  let run = line[line.length - 1]?.run ?? 0;
  while (kept.length > 0) {
    while (isBlank(kept[kept.length - 1])) kept.pop();
    const tail = kept[kept.length - 1];
    if (tail === undefined) break;
    run = tail.run;
    if (sumWidths(kept) + ctx.textWidth(run, '…') <= limit + EPS) break;
    kept.pop();
    const shorter = tail.chip ? '' : dropLastChar(tail.text).trimEnd();
    if (shorter !== '') kept.push(ctx.seg(tail.run, shorter));
  }
  return [...kept, { run, text: '…', width: ctx.textWidth(run, '…'), chip: false }];
}

/** Aplica `maxLines` e `ellipsis` às linhas já quebradas. */
function clipLines(
  lines: readonly Seg[][],
  ctx: Context,
  boxWidth: number,
): readonly (readonly Seg[])[] {
  const { maxLines, ellipsis } = ctx.base;
  const cut = maxLines !== undefined && lines.length > maxLines;
  const kept = cut ? lines.slice(0, maxLines) : lines;
  if (ellipsis !== true) return kept;
  const last = kept.length - 1;
  return kept.map((line, i) =>
    (cut && i === last) || sumWidths(line) > boxWidth + EPS
      ? ellipsize(line, ctx, boxWidth)
      : line,
  );
}

// ---------------------------------------------------------------------------------------
// Saída
// ---------------------------------------------------------------------------------------

/** Junta os segmentos vizinhos do mesmo trecho (sem fundo) num pedaço só, já medido. */
function mergePieces(line: readonly Seg[], ctx: Context): Omit<RunPiece, 'x'>[] {
  const groups: { run: number; text: string; chip: boolean; width: number }[] = [];
  for (const seg of line) {
    const prev = groups[groups.length - 1];
    if (prev && !prev.chip && !seg.chip && prev.run === seg.run) prev.text += seg.text;
    else groups.push({ run: seg.run, text: seg.text, chip: seg.chip, width: seg.width });
  }
  return groups.map((g) => ({
    run: g.run,
    text: g.text,
    chip: g.chip,
    width: g.chip ? g.width : ctx.textWidth(g.run, g.text),
    height: ctx.heightOf(g.run),
  }));
}

/** Deslocamento horizontal da linha contra a largura da caixa. */
function alignOffset(
  align: RichBase['align'],
  boxWidth: number,
  lineWidth: number,
): number {
  if (!Number.isFinite(boxWidth) || align === undefined || align === 'left') return 0;
  const free = Math.max(0, boxWidth - lineWidth);
  return align === 'center' ? free / 2 : free;
}

function buildLayout(
  lines: readonly (readonly Seg[])[],
  ctx: Context,
  boxWidth: number,
): RunLayout {
  let y = 0;
  let widest = 0;
  const out: RunLine[] = lines.map((line) => {
    const merged = mergePieces(line, ctx);
    const width = merged.reduce((sum, piece) => sum + piece.width, 0);
    const height = merged.reduce(
      (max, piece) => Math.max(max, piece.height),
      ctx.base.lineHeight,
    );
    let x = alignOffset(ctx.base.align, boxWidth, width);
    const pieces = merged.map((piece): RunPiece => {
      const placed = { ...piece, x };
      x += piece.width;
      return placed;
    });
    const result: RunLine = { y, height, width, pieces };
    y += height;
    widest = Math.max(widest, width);
    return result;
  });
  return { width: widest, height: y, lines: out };
}

/**
 * O layout dos trechos numa caixa de largura `maxWidth` (ausente = sem limite: só as quebras
 * forçadas). `measure` é qualquer `TextMeasurer`; ele só é chamado sem `maxWidth`.
 */
export function layoutRuns(
  runs: readonly RichRun[],
  base: RichBase,
  measure: TextMeasurer,
  maxWidth?: number,
): RunLayout {
  const ctx = createContext(runs, base, measure);
  const boxWidth = maxWidth ?? Infinity;
  const limit = base.wrap === 'none' ? Infinity : boxWidth;
  const lines = breakLines(toAtoms(ctx), limit);
  return buildLayout(clipLines(lines, ctx, boxWidth), ctx, boxWidth);
}

/**
 * Mede o texto rico como um `TextMeasurer` mede um texto: largura da linha mais larga, altura
 * somada e o texto de cada linha (os pedaços juntados, já com o `…`).
 */
export function measureRichText(
  runs: readonly RichRun[],
  base: RichBase,
  measure: TextMeasurer,
  maxWidth?: number,
): TextMetrics {
  const layout = layoutRuns(runs, base, measure, maxWidth);
  return {
    width: layout.width,
    height: layout.height,
    lines: layout.lines.map((line) => line.pieces.map((piece) => piece.text).join('')),
  };
}
