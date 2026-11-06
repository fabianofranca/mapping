import type { JsonValue } from '../src/model';
import type { Operation } from './operations';

/**
 * As operações guardadas na proposta são só referência: o conteúdo `base64` das imagens (que
 * já está em `proposals/<id>/images/`) é trocado por um marcador, para o arquivo não crescer.
 */
export function storedOperations(operations: readonly Operation[]): JsonValue[] {
  return operations.map((op) => {
    const copy = JSON.parse(JSON.stringify(op)) as Record<string, JsonValue>;
    if (typeof copy.base64 === 'string') {
      copy.base64 = `(omitido: ${copy.base64.length} caracteres)`;
    }
    return copy;
  });
}
