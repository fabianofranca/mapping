import type { FieldValue, FieldValues } from './components/componentFormat';
import { isRecord, parseRefValue, resolveRef, type ResolvedRef } from './refs';
import type { SpecAnnotationType, SpecField } from './spec';
import { isEmptyValue } from './typed';
import type { Annotation, JsonValue, Project } from './types';

// Valores do desenho (etapa Biblioteca, B3): os valores da anotação tipada na forma que o
// motor dos componentes lê (`FieldValues`): texto, número ou vazio. Os campos `ref` são
// resolvidos **um nível**; o resto vira aviso, nunca erro. Puro e derivado: nada é gravado.

export interface DrawingValues {
  readonly values: FieldValues;
  /** Referências que não deram valor: quebrada, em ciclo ou em mais de um nível. */
  readonly warnings: readonly string[];
}

/** Valor simples (texto, número) de um campo ou coluna; qualquer outra coisa é vazio. */
function simpleValue(field: SpecField | null, value: JsonValue | undefined): FieldValue {
  if (value === undefined || isEmptyValue(value)) return null;
  const kind = field?.type;
  if (kind === 'table' || kind === 'ref') return null;
  if (kind === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  if (kind === undefined) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    return typeof value === 'string' ? value : null;
  }
  // string, date e enum são texto.
  return typeof value === 'string' ? value : null;
}

/** Texto da linha de uma tabela: a coluna `rowLabel` preenchida, senão a posição (`#2`). */
function rowText(target: Extract<ResolvedRef, { kind: 'row' }>): string {
  const rowLabel = target.field?.type === 'table' ? target.field.rowLabel : undefined;
  const value = rowLabel ? target.row[rowLabel] : null;
  return typeof value === 'string' && value !== '' ? value : `#${target.index + 1}`;
}

/** Valor de uma referência já resolvida para o `key` do campo; avisos vão para `warnings`. */
function refValue(
  p: Project,
  annotation: Annotation,
  key: string,
  value: JsonValue,
  warnings: string[],
): FieldValue {
  const ref = parseRefValue(value);
  const target = ref === null ? null : resolveRef(p, ref);
  if (target === null) {
    warnings.push(`referência quebrada: ${key}`);
    return null;
  }
  if (target.annotation.id === annotation.id) {
    warnings.push(`referência em ciclo: ${key}`);
    return null;
  }
  switch (target.kind) {
    case 'entry':
      return target.entry.value === '' ? null : target.entry.value;
    case 'row':
      return rowText(target);
    case 'field': {
      const raw = target.annotation.values?.[target.key];
      // O alvo é outra referência: não se segue (um nível só).
      if (
        target.field?.type === 'ref' ||
        (isRecord(raw) && parseRefValue(raw) !== null)
      ) {
        warnings.push(`referência em mais de um nível: ${key}`);
        return null;
      }
      return simpleValue(target.field, raw);
    }
  }
}

/**
 * Valores dos campos do tipo para o desenho, na ordem do tipo: `string`/`date`/`enum` como
 * texto (ou `null`), `number` como número, `table` sempre `null`, `ref` resolvido um nível
 * (campo → o valor simples do campo alvo; tupla livre → o `value`; linha de tabela → o
 * rótulo da linha). Alvo que é outra `ref` não é seguido (`referência em mais de um nível:
 * <campo>`); alvo na própria anotação é ciclo (`referência em ciclo: <campo>`); alvo que não
 * existe vira `null` (`referência quebrada: <campo>`).
 */
export function drawingValues(
  p: Project,
  annotation: Annotation,
  type: SpecAnnotationType,
): DrawingValues {
  const raw = annotation.values ?? {};
  const values: Record<string, FieldValue> = {};
  const warnings: string[] = [];
  for (const field of type.fields) {
    const value = raw[field.key];
    if (field.type === 'table') {
      // O motor não lê tabelas.
      values[field.key] = null;
    } else if (field.type === 'ref') {
      values[field.key] =
        value === undefined || isEmptyValue(value)
          ? null
          : refValue(p, annotation, field.key, value, warnings);
    } else {
      values[field.key] = simpleValue(field, value);
    }
  }
  return { values, warnings };
}
