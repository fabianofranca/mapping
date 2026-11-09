import type { JsonValue } from './types';

/**
 * Objeto simples (não nulo, não lista). Única definição no modelo; `refs.ts` a reexporta.
 * Os valores saem como `JsonValue`: o modelo só lê dados que vieram de JSON.
 */
export function isRecord(value: unknown): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
