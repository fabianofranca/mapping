import type { JsonValue } from './types';

/**
 * Plain object (not null, not an array). The single definition in the model; `refs.ts` re-exports it.
 * Values come out as `JsonValue`: the model only reads data that came from JSON.
 */
export function isRecord(value: unknown): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
