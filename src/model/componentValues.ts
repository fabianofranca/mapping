import type { FieldRow, FieldValue, FieldValues } from './components/componentFormat';
import { isRecord, parseRefValue, resolveRef, tableRows, type ResolvedRef } from './refs';
import type { SpecAnnotationType, SpecColumn, SpecField } from './spec';
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
function simpleValue(
  field: SpecField | SpecColumn | null,
  value: JsonValue | undefined,
): FieldValue {
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
 * As linhas de um campo `table` na forma do motor (`repeat`): uma linha por linha da anotação,
 * com o valor de cada coluna (texto, número ou `null`). A célula de uma coluna `ref` é o texto
 * do alvo, resolvido um nível como o campo `ref` (a linha de tabela pelo `rowLabel`, a tupla
 * livre pelo `value`, o campo simples pelo valor; aviso `referência quebrada: tabela[2].coluna`
 * e os outros). O `_id` não vai.
 */
function tableValue(
  p: Project,
  annotation: Annotation,
  field: Extract<SpecField, { type: 'table' }>,
  value: JsonValue | undefined,
  warnings: string[],
): readonly FieldRow[] {
  return tableRows(value).map((row, index) => {
    const out: Record<string, string | number | null> = {};
    for (const column of field.columns) {
      const cell = row[column.key];
      out[column.key] =
        column.type === 'ref'
          ? cell === undefined || isEmptyValue(cell)
            ? null
            : (refValue(
                p,
                annotation,
                `${field.key}[${index + 1}].${column.key}`,
                cell,
                warnings,
              ) as string | number | null)
          : (simpleValue(column, cell) as string | number | null);
    }
    return out;
  });
}

/**
 * Valores dos campos do tipo para o desenho, na ordem do tipo: `string`/`date`/`enum` como
 * texto (ou `null`), `number` como número, `table` como a lista das linhas (só o nó `repeat`
 * lê), `ref` resolvido um nível
 * (campo → o valor simples do campo alvo; tupla livre → o `value`; linha de tabela → o
 * rótulo da linha). Alvo que é outra `ref` não é seguido (`referência em mais de um nível:
 * <campo>`); alvo na própria anotação é ciclo (`referência em ciclo: <campo>`); alvo que não
 * existe vira `null` (`referência quebrada: <campo>`). O mesmo vale para a célula de uma coluna
 * `ref` de tabela, com o campo escrito `tabela[2].coluna`.
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
      values[field.key] = tableValue(p, annotation, field, value, warnings);
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
