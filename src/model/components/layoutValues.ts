/**
 * Motor dos componentes: conferência dos valores de layout que chegam por expressão
 * (`formatVersion` 4). Funções puras: o valor já avaliado entra, o valor válido (ou nenhum) sai.
 */
import type { LayoutAlign, LayoutJustify, LayoutType, SizeSpec } from './componentFormat';

export const LAYOUT_TYPES: readonly LayoutType[] = ['none', 'row', 'column'];
export const LAYOUT_ALIGNS: readonly LayoutAlign[] = [
  'start',
  'center',
  'end',
  'stretch',
];
export const LAYOUT_JUSTIFIES: readonly LayoutJustify[] = [
  'start',
  'center',
  'end',
  'space-between',
];

const PERCENT = /^\d+(\.\d+)?%$/;
const PLAIN_NUMBER = /^\s*\d+(\.\d+)?\s*$/;

/**
 * Confere um tamanho: número finito ≥ 0, texto numérico puro (`"120"` → 120), `"fill"`,
 * `"hug"` ou `"N%"`. Qualquer outra coisa não é um tamanho (`undefined`).
 */
export function parseSizeSpec(value: unknown): SizeSpec | undefined {
  if (typeof value === 'number')
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  if (typeof value !== 'string') return undefined;
  if (value === 'fill' || value === 'hug') return value;
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
