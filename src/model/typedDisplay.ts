import { findPlatform } from './codeLocations';
import { resolveCode } from './codeVariants';
import {
  DEFAULT_LABEL_TEXTS,
  instanceLabel,
  isRecord,
  parseRefValue,
  refLabel,
  resolveRef,
  tableRows,
  type LabelTexts,
} from './refs';
import type { SpecAnnotationType, SpecColumn, SpecField, SpecSimpleColumn } from './spec';
import { findSpecType, getSpec, ownerTypeIds, typeOfAnnotation } from './specLookup';
import { checkSimpleValue, isEmptyValue, valueText } from './typed';
import type { Annotation, AnnotationTypeRef, JsonValue, Project } from './types';

// How a typed annotation appears in the panel, in the list and in the semantic zoom
// (docs/ARCHITECTURE.md, "Specializations in the project and typed annotations"). Pure functions: the interface passes the translated texts.

export interface DisplayTexts extends LabelTexts {
  /** Empty required field, e.g. `id: —`. */
  readonly empty: string;
  /** Summary of a table in the semantic zoom, e.g. "3 rows". */
  readonly rows: (count: number) => string;
}

export const DEFAULT_DISPLAY_TEXTS: DisplayTexts = {
  ...DEFAULT_LABEL_TEXTS,
  empty: '—',
  rows: (count) => (count === 1 ? '1 row' : `${count} rows`),
};

/** Label of a field or column: `label`, otherwise `key`. */
export function fieldLabel(field: Pick<SpecField, 'key' | 'label'>): string {
  return field.label ?? field.key;
}

/** Name of the typed annotation's type (the `typeId` if the type no longer exists); `null` on a free one. */
export function typeName(p: Project, a: Annotation): string | null {
  if (!a.type) return null;
  return typeOfAnnotation(p, a)?.type.name ?? a.type.typeId;
}

/**
 * Title of the typed annotation: type name + instance label, e.g.:
 * "Button · Buy", "Class · Contact"; without a label, just "Button". On a free one, the `name`.
 */
export function annotationTitle(p: Project, a: Annotation): string | null {
  const type = typeName(p, a);
  if (type === null) return a.name;
  const label = instanceLabel(p, a);
  return label ? `${type} · ${label}` : type;
}

/**
 * Short label of whoever makes a reference (backlinks and source lists), e.g.:
 * "Input input_name": type name + instance label; without a label, the first
 * filled-in text field (usually the `id`). On a free one, the `name` or `texts.untitled`.
 */
export function annotationShortLabel(
  p: Project,
  a: Annotation,
  texts: LabelTexts = DEFAULT_LABEL_TEXTS,
): string {
  const type = typeName(p, a);
  if (type === null) return a.name ?? texts.untitled;
  const label = instanceLabel(p, a);
  if (label) return `${type} ${label}`;
  const fields = typeOfAnnotation(p, a)?.type.fields ?? [];
  for (const f of fields) {
    const value = a.values?.[f.key];
    if (f.type === 'string' && typeof value === 'string' && value !== '') {
      return `${type} ${value}`;
    }
  }
  return type;
}

function cellText(value: JsonValue | undefined): string {
  return value === undefined || value === null ? '' : valueText(value);
}

export interface DisplayValueLine {
  readonly kind: 'value';
  readonly key: string;
  readonly label: string;
  readonly text: string;
  /** In the alert color: empty required field, invalid value or broken reference. */
  readonly alert: boolean;
}

export interface DisplayTableLine {
  readonly kind: 'table';
  readonly key: string;
  readonly label: string;
  readonly columns: readonly { readonly key: string; readonly label: string }[];
  readonly rows: readonly { readonly id: string; readonly cells: readonly string[] }[];
  readonly alert: boolean;
}

export type DisplayLine = DisplayValueLine | DisplayTableLine;

export interface DisplayOptions {
  /** `summary` (semantic zoom): `attributes: 3 rows`; `full` (panel and list): the table. */
  readonly tables: 'summary' | 'full';
  readonly texts?: DisplayTexts;
}

function simpleAlert(field: SpecSimpleColumn, value: JsonValue): boolean {
  return checkSimpleValue(field, value) !== null;
}

/** Text of a cell: `→ User.name` in the `ref` column (broken: `→ (broken reference)`). */
function cellDisplay(
  p: Project,
  column: SpecColumn,
  value: JsonValue | undefined,
  texts: DisplayTexts,
): string {
  if (column.type !== 'ref' || value === undefined || isEmptyValue(value)) {
    return cellText(value);
  }
  const ref = parseRefValue(value);
  return `→ ${ref && resolveRef(p, ref) ? refLabel(p, ref, texts) : texts.broken}`;
}

/** Alert of a filled-in `ref` cell: invalid format or a target that no longer exists. */
function refCellAlert(p: Project, value: JsonValue): boolean {
  const ref = parseRefValue(value);
  return !ref || !resolveRef(p, ref);
}

/** `true` if some row has an empty required column or an invalid value. */
function tableAlert(
  p: Project,
  columns: readonly SpecColumn[],
  value: JsonValue | undefined,
): boolean {
  const rows = Array.isArray(value) ? value : [];
  if (tableRows(value).length !== rows.length) return true;
  return tableRows(value).some((row) =>
    columns.some((c) => {
      const cell = row[c.key];
      if (cell === undefined || isEmptyValue(cell)) return c.required === true;
      return c.type === 'ref' ? refCellAlert(p, cell) : simpleAlert(c, cell);
    }),
  );
}

/**
 * Values of the typed annotation in the order of the fields, with the `label`: empty
 * optional ones omitted; empty required ones as `id: —` (alert); `ref` as
 * `data: → User.name` (broken: `→ (broken reference)`, alert). Empty on a
 * free annotation or one of a nonexistent type.
 */
export function typedDisplayLines(
  p: Project,
  a: Annotation,
  options: DisplayOptions,
): DisplayLine[] {
  const texts = options.texts ?? DEFAULT_DISPLAY_TEXTS;
  const resolved = typeOfAnnotation(p, a);
  const type = resolved?.type;
  if (!resolved || !type || !a.values) return [];
  const values = a.values;
  const lines: DisplayLine[] = [];
  for (const field of type.fields) {
    const { key } = field;
    const label = fieldLabel(field);
    const value = values[key];
    if (field.type === 'table') {
      const rows = tableRows(value);
      const alert = tableAlert(p, field.columns, value);
      if (rows.length === 0) {
        if (field.required) {
          lines.push({ kind: 'value', key, label, text: texts.empty, alert: true });
        } else if (alert) {
          lines.push({ kind: 'value', key, label, text: texts.rows(0), alert });
        }
        continue;
      }
      if (options.tables === 'summary') {
        lines.push({ kind: 'value', key, label, text: texts.rows(rows.length), alert });
        continue;
      }
      lines.push({
        kind: 'table',
        key,
        label,
        columns: field.columns.map((c) => ({ key: c.key, label: fieldLabel(c) })),
        rows: rows.map((row) => ({
          id: row._id,
          cells: field.columns.map((c) => cellDisplay(p, c, row[c.key], texts)),
        })),
        alert,
      });
      continue;
    }
    if (value === undefined || isEmptyValue(value)) {
      if (field.required) {
        lines.push({ kind: 'value', key, label, text: texts.empty, alert: true });
      }
      continue;
    }
    if (field.type === 'ref') {
      const ref = parseRefValue(value);
      const target = ref ? resolveRef(p, ref) : null;
      lines.push({
        kind: 'value',
        key,
        label,
        text: `→ ${ref && target ? refLabel(p, ref, texts) : texts.broken}`,
        alert: !target,
      });
      continue;
    }
    lines.push({
      kind: 'value',
      key,
      label,
      text: cellText(value),
      alert: simpleAlert(field, value),
    });
  }
  return lines;
}

/** File name: the last segment of the path. */
function fileNameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** "Definition" of a type on a platform: the file that defines the `code` symbol. */
export interface CodeDefinition {
  /** Specialization that owns the type: its `repo` gives the file link (`codeLink`). */
  readonly specId: string;
  /** Platform id. */
  readonly platform: string;
  /** Platform name declared by the specialization (the id if nobody declares it). */
  readonly platformName: string;
  /** `code.<platform>.path`, relative to the repository root. */
  readonly path: string;
  /** Last segment of the path (the file name). */
  readonly fileName: string;
  /** `code.<platform>.symbol`. */
  readonly symbol: string;
}

/**
 * "Definition" of a type: one entry per platform whose `code` has `path` (the file that
 * defines the symbol), in `code` order. `specId` is the specialization that owns the type. With
 * `values` (the annotation's), the `path` and `symbol` are those of the `variants` case that they
 * choose (`resolveCode`); without `values`, the field's `default` or the base apply.
 */
export function typeCodeDefinitions(
  p: Project,
  specId: string,
  type: Pick<SpecAnnotationType, 'code'> & Partial<Pick<SpecAnnotationType, 'fields'>>,
  values?: Readonly<Record<string, JsonValue>> | null,
): CodeDefinition[] {
  return Object.entries(type.code ?? {}).flatMap(([platform, own]) => {
    const code = resolveCode(own, values, type.fields ?? []);
    return code.path === undefined
      ? []
      : [
          {
            specId,
            platform,
            platformName: findPlatform(p, platform)?.name ?? platform,
            path: code.path,
            fileName: fileNameOf(code.path),
            symbol: code.symbol,
          },
        ];
  });
}

/** Raw values of an annotation of a nonexistent type (read-only). */
export function rawValueLines(a: Annotation): { key: string; text: string }[] {
  if (!a.values) return [];
  return Object.entries(a.values)
    .filter(([, value]) => !isEmptyValue(value))
    .map(([key, value]) => ({
      key,
      text:
        isRecord(value) || Array.isArray(value) ? JSON.stringify(value) : cellText(value),
    }));
}

/**
 * Types of the same specialization that accept `child` in `allowedChildren` (by id or by
 * clause; to explain what to create before a type with `requiresOwner`, e.g. Button or Image).
 */
export function ownerTypesOf(p: Project, child: AnnotationTypeRef): SpecAnnotationType[] {
  const spec = getSpec(p, child.specId);
  if (!spec) return [];
  const owners: SpecAnnotationType[] = [];
  for (const typeId of ownerTypeIds(spec, child.typeId)) {
    const owner = findSpecType(p, { specId: child.specId, typeId });
    if (owner) owners.push(owner.type);
  }
  return owners;
}
