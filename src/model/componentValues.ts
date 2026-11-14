import type { InstanceAnchor } from './components/anchor';
import type {
  AnchorSide,
  FieldRow,
  FieldValue,
  FieldValues,
} from './components/componentFormat';
import { modelMessage, type ModelMessage } from './modelMessage';
import {
  annotationRefLabel,
  DEFAULT_LABEL_TEXTS,
  type LabelTexts,
  isRecord,
  parseRefValue,
  resolveRef,
  tableRows,
  type ResolvedRef,
} from './refs';
import type { SpecAnnotationType, SpecColumn, SpecField } from './spec';
import { isEmptyValue } from './typed';
import type { Annotation, JsonValue, Project, Rect } from './types';

// Drawing values (Library stage, B3): the typed annotation's values in the form the component
// engine reads (`FieldValues`): text, number or empty. `ref` fields are resolved **one level**;
// the rest becomes a warning, never an error. Pure and derived: nothing is saved.

export interface DrawingValues {
  readonly values: FieldValues;
  /** References that did not yield a value: broken, cyclic or through more than one level. */
  readonly warnings: readonly ModelMessage[];
}

/** Simple value (text, number) of a field or column; anything else is empty. */
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
  // string, date and enum are text.
  return typeof value === 'string' ? value : null;
}

/** Text of a table row: the filled `rowLabel` column, otherwise the position (`#2`). */
function rowText(target: Extract<ResolvedRef, { kind: 'row' }>): string {
  const rowLabel = target.field?.type === 'table' ? target.field.rowLabel : undefined;
  const value = rowLabel ? target.row[rowLabel] : null;
  return typeof value === 'string' && value !== '' ? value : `#${target.index + 1}`;
}

/** Value of an already resolved reference for the field's `key`; warnings go to `warnings`. */
function refValue(
  p: Project,
  annotation: Annotation,
  key: string,
  value: JsonValue,
  warnings: ModelMessage[],
  texts: LabelTexts,
): FieldValue {
  const ref = parseRefValue(value);
  const target = ref === null ? null : resolveRef(p, ref);
  if (target === null) {
    warnings.push(modelMessage('value.refBroken', { key }, `broken reference: ${key}`));
    return null;
  }
  if (target.annotation.id === annotation.id) {
    warnings.push(modelMessage('value.refCycle', { key }, `reference cycle: ${key}`));
    return null;
  }
  switch (target.kind) {
    case 'annotation':
      return annotationRefLabel(p, target.annotation, texts);
    case 'entry':
      return target.entry.value === '' ? null : target.entry.value;
    case 'row':
      return rowText(target);
    case 'field': {
      const raw = target.annotation.values?.[target.key];
      // The target is another reference: it is not followed (one level only).
      if (
        target.field?.type === 'ref' ||
        (isRecord(raw) && parseRefValue(raw) !== null)
      ) {
        warnings.push(
          modelMessage(
            'value.refDeep',
            { key },
            `reference through more than one level: ${key}`,
          ),
        );
        return null;
      }
      return simpleValue(target.field, raw);
    }
  }
}

/**
 * The rows of a `table` field in the engine's form (`repeat`): one row per row of the annotation,
 * with the value of each column (text, number or `null`). The cell of a `ref` column is the
 * target's text, resolved one level like the `ref` field (the table row by `rowLabel`, the free
 * tuple by `value`, the simple field by its value; warning `broken reference: table[2].column`
 * and the others). The `_id` is not included.
 */
function tableValue(
  p: Project,
  annotation: Annotation,
  field: Extract<SpecField, { type: 'table' }>,
  value: JsonValue | undefined,
  warnings: ModelMessage[],
  texts: LabelTexts,
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
                texts,
              ) as string | number | null)
          : (simpleValue(column, cell) as string | number | null);
    }
    return out;
  });
}

/**
 * Values of the type's fields for the drawing, in the type's order: `string`/`date`/`enum` as
 * text (or `null`), `number` as a number, `table` as the list of rows (only the `repeat` node
 * reads it), `ref` resolved one level
 * (field → the simple value of the target field; free tuple → the `value`; table row → the
 * row's label). A target that is another `ref` is not followed (`reference through more than one
 * level: <field>`); a target in the annotation itself is a cycle (`reference cycle: <field>`); a
 * target that does not exist becomes `null` (`broken reference: <field>`). The same holds for the
 * cell of a table `ref` column, with the field written `table[2].column`.
 */
export function drawingValues(
  p: Project,
  annotation: Annotation,
  type: SpecAnnotationType,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): DrawingValues {
  const raw = annotation.values ?? {};
  const values: Record<string, FieldValue> = {};
  const warnings: ModelMessage[] = [];
  for (const field of type.fields) {
    const value = raw[field.key];
    if (field.type === 'table') {
      values[field.key] = tableValue(p, annotation, field, value, warnings, texts);
    } else if (field.type === 'ref') {
      values[field.key] =
        value === undefined || isEmptyValue(value)
          ? null
          : refValue(p, annotation, field.key, value, warnings, texts);
    } else {
      values[field.key] = simpleValue(field, value);
    }
  }
  return { values, warnings };
}

/**
 * The anchor of a marking in the form the instance reads (`InstantiateOptions.anchor`, the
 * `$anchor.*` pseudo-fields): the anchor's center and size in component UNITS (pixels ÷ `density`),
 * the center relative to the corner of the marking's box (it can be negative or go past the box).
 * The `side` is the LOGICAL one declared on the marking (`top`, `bottom`, `start`, `end`) or, with
 * no `side` declared, the component's default (`componentAnchorDefaults`): it is not resolved to a
 * physical one, since the template chooses by the logical side and the direction already mirrors
 * whatever is `start`/`end`.
 */
export function anchorValues(input: {
  /** The marking's `rect` (pixels of its own space). */
  readonly rect: Rect;
  /** The `rect` of the anchor marking, in the same space. */
  readonly anchorRect: Rect;
  /** O `side` declarado em `marking.anchor`, se houver. */
  readonly side: AnchorSide | undefined;
  /** The component's default, when the marking does not declare the side. */
  readonly defaults: { readonly side: AnchorSide };
  /** The density of the marking's space (`effectiveDensity`). */
  readonly density: number;
}): InstanceAnchor {
  const { rect, anchorRect, density } = input;
  return {
    side: input.side ?? input.defaults.side,
    centerX: (anchorRect.x + anchorRect.width / 2 - rect.x) / density,
    centerY: (anchorRect.y + anchorRect.height / 2 - rect.y) / density,
    width: anchorRect.width / density,
    height: anchorRect.height / density,
  };
}
