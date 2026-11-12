/**
 * Motor dos componentes: conferência dos valores de layout que chegam por expressão
 * (`formatVersion` 4). Funções puras: o valor já avaliado entra, o valor válido (ou nenhum) sai.
 */
import type {
  IntrinsicSize,
  LayoutAlign,
  LayoutJustify,
  LayoutType,
  LayoutWrap,
  SizeSpec,
} from './componentFormat';

export const LAYOUT_TYPES: readonly LayoutType[] = ['none', 'row', 'column', 'grid'];
export const LAYOUT_ALIGNS: readonly LayoutAlign[] = [
  'start',
  'center',
  'end',
  'stretch',
  'baseline',
];
export const LAYOUT_JUSTIFIES: readonly LayoutJustify[] = [
  'start',
  'center',
  'end',
  'space-between',
  'space-around',
  'space-evenly',
];
/** `align` (eixo vertical) de um quadro `none`: sem `baseline`. */
export const NONE_ALIGNS: readonly LayoutAlign[] = ['start', 'center', 'end', 'stretch'];
/** `justify` (eixo horizontal) de um quadro `none` (v4): só os quatro, `stretch` incluído. */
export const NONE_JUSTIFIES: readonly LayoutJustify[] = [
  'start',
  'center',
  'end',
  'stretch',
];
export const LAYOUT_WRAPS: readonly LayoutWrap[] = ['none', 'wrap', 'wrap-reverse'];

/**
 * Onde começa o primeiro filho (`offset`) e o vão a mais entre filhos (`extra`) no eixo principal,
 * dada a folga `free` (≥ 0) e o número de filhos, como o `justify-content` do flexbox. Um filho
 * só: `space-around` e `space-evenly` o centram, `space-between` o deixa no início.
 */
export function justifySpacing(
  justify: LayoutJustify,
  free: number,
  count: number,
): { offset: number; extra: number } {
  if (count <= 0) return { offset: 0, extra: 0 };
  switch (justify) {
    case 'center':
      return { offset: free / 2, extra: 0 };
    case 'end':
      return { offset: free, extra: 0 };
    case 'space-between':
      return { offset: 0, extra: count > 1 ? free / (count - 1) : 0 };
    case 'space-around':
      return { offset: free / (2 * count), extra: free / count };
    case 'space-evenly':
      return { offset: free / (count + 1), extra: free / (count + 1) };
    default:
      return { offset: 0, extra: 0 };
  }
}

/**
 * Espelha a posição de um filho no eixo principal do `reverse` (`row-reverse`/`column-reverse`):
 * dentro de `[start, start + content]`, o filho de tamanho `size` em `position` passa a ficar à
 * mesma distância do outro extremo.
 */
export function mirrorMain(
  position: number,
  size: number,
  start: number,
  content: number,
): number {
  return 2 * start + content - position - size;
}

const PERCENT = /^\d+(\.\d+)?%$/;
const PLAIN_NUMBER = /^\s*\d+(\.\d+)?\s*$/;

/** `"min-content"` ou `"max-content"` (v4). */
export function isIntrinsicSize(value: unknown): value is IntrinsicSize {
  return value === 'min-content' || value === 'max-content';
}

/** A medida intrínseca que um tamanho pede (`min-content`/`max-content`); outro tamanho = nenhuma. */
export function intrinsicModeOf(spec: unknown): IntrinsicSize | null {
  return isIntrinsicSize(spec) ? spec : null;
}

/**
 * Confere um tamanho: número finito ≥ 0, texto numérico puro (`"120"` → 120), `"fill"`,
 * `"hug"`, `"min-content"`, `"max-content"` ou `"N%"`. Qualquer outra coisa não é um tamanho
 * (`undefined`). A versão do formato quem confere é o chamador.
 */
export function parseSizeSpec(value: unknown): SizeSpec | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  if (value === 'fill' || value === 'hug' || isIntrinsicSize(value)) return value;
  if (PERCENT.test(value)) return value as `${number}%`;
  return PLAIN_NUMBER.test(value) ? Number(value) : undefined;
}

/** O valor se estiver no conjunto permitido; senão nenhum. */
export function allowedValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** O valor como aparece nas mensagens de aviso (objeto vira JSON). */
export function describeValue(value: unknown): string {
  return typeof value === 'object' && value !== null
    ? JSON.stringify(value)
    : String(value);
}
