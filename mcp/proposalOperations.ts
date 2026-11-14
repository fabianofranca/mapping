import type { JsonValue } from '../src/model';
import type { Operation } from './operations';

/**
 * The operations stored in the proposal are reference only: the `base64` content of the images
 * (already in `proposals/<id>/images/`) is replaced by a marker, so the file does not grow.
 */
export function storedOperations(operations: readonly Operation[]): JsonValue[] {
  return operations.map((op) => {
    const copy = JSON.parse(JSON.stringify(op)) as Record<string, JsonValue>;
    if (typeof copy.base64 === 'string') {
      copy.base64 = `(omitted: ${copy.base64.length} characters)`;
    }
    return copy;
  });
}
