/**
 * Component engine (ME4): expansion of the `repeat` node (the drawn table, `formatVersion` 2).
 *
 * `expandRepeats` runs before the engine (`instantiate` and `measureComponent`): it replaces
 * each `repeat` with a frame holding one copy of the `template` per row of the `table` field,
 * and delivers the column values as extra fields with a name of their own for each row
 * (`$r0_1:key`). In the copies, the expressions that cite a column (`$field`, `$has`, `$eq`,
 * `$switch`) come to cite that extra field, which makes the column **shadow** the type's field
 * of the same name without the engine knowing about scope. Pure function: the result only has
 * nodes the engine already knows.
 *
 * Size on the rows axis (`height` in `column`, `width` in `row`):
 * - without `distribute` (or `"none"`): the generated frame is `hug` on that axis and so is each
 *   row, except for what the `repeat` and the `template` say; a `fill` in the `template` counts
 *   as 0 (engine warning);
 * - `layout` (formatVersion 4) in place of `direction` + `gap`: the generated frame takes this
 *   `layout` (`row`, `column` or `grid`) as is. `row`/`column` follow the `direction` rule; the
 *   grid hugs on both axes (the `repeat`'s `width`/`height` rules if present) and each cell is
 *   `fill` in the cell;
 * - `distribute: "fill"` (formatVersion 4): the generated frame is `fill` on that axis (it takes
 *   the parent's) and each row is `fill`, so the rows split the axis equally minus the `gap`s.
 *   An explicit value (px, `hug`, `%`, or `fill` itself) in the `repeat`/`template` counts as
 *   written.
 */
import type {
  ComponentFile,
  Expr,
  FieldRow,
  FieldValue,
  FieldValues,
  FrameTemplate,
  LayoutSpec,
  RepeatTemplate,
  TemplateNode,
} from './componentFormat';
import { templateMessage } from '../messages';
import { textsOf } from '../messages/collector';
import type { ModelMessage } from '../modelMessage';
import {
  INDEX_FIELD,
  evaluate,
  linesCitations,
  linesNodeName,
  referencedFields,
  toNumber,
} from './expressions';

/** Ceiling on the rows of a `repeat` by `count`. */
export const REPEAT_COUNT_LIMIT = 1000;

const INHERITED_KEYS = [
  'visible',
  'opacity',
  'rotation',
  'anchors',
  'minWidth',
  'maxWidth',
  'minHeight',
  'maxHeight',
  'span',
  'weight',
] as const;

/** What the generated frame inherits from the `repeat` (only the keys present). */
function inheritedKeys(node: RepeatTemplate): Partial<FrameTemplate> {
  const out: Record<string, unknown> = {};
  for (const key of INHERITED_KEYS) if (node[key] !== undefined) out[key] = node[key];
  return out;
}

/** The `repeat`'s line wrapping (v4), which the generated frame carries in its `layout` (only the keys present). */
function wrapKeys(node: RepeatTemplate): Partial<LayoutSpec> {
  const out: Record<string, unknown> = {};
  for (const key of ['wrap', 'lineGap', 'maxPerLine', 'maxLines'] as const)
    if (node[key] !== undefined) out[key] = node[key];
  return out;
}

/** The layout of the `repeat`'s rows: that of `layout` (v4, literal; by expression it counts as `column`) or that of `direction`. */
function layoutKind(node: RepeatTemplate): 'row' | 'column' | 'grid' {
  const type = node.layout === undefined ? node.direction : node.layout.type;
  return type === 'row' || type === 'grid' ? type : 'column';
}

/** Does the `repeat` wrap? With `wrap` the rows axis needs a limit to wrap against: it takes the parent's, as with `distribute`. */
function wraps(node: RepeatTemplate): boolean {
  const { wrap } = node.layout ?? node;
  return wrap !== undefined && wrap !== 'none';
}

/** Sizes of the generated frame: the `repeat`'s `width`/`height`, or the axis default (see the top). */
function wrapperSize(
  node: RepeatTemplate,
  kind: 'row' | 'column' | 'grid',
): Pick<FrameTemplate, 'width' | 'height'> {
  // The grid hugs on both axes (the `repeat`'s own `width`/`height` rules if present).
  if (kind === 'grid')
    return { width: node.width ?? 'hug', height: node.height ?? 'hug' };
  const column = kind === 'column';
  const rowsAxis = node.distribute === 'fill' || wraps(node) ? 'fill' : 'hug';
  return {
    width: node.width ?? (column ? 'fill' : rowsAxis),
    height: node.height ?? (column ? rowsAxis : 'fill'),
  };
}

/**
 * Size of a row on the rows axis: the `template`'s, or `hug` (`fill` with `distribute`).
 * In the grid the cell is `fill` in the cell (the frame's default): nothing to add.
 */
function rowSize(
  copy: FrameTemplate,
  kind: 'row' | 'column' | 'grid',
  distribute: boolean,
): Pick<FrameTemplate, 'width' | 'height'> {
  if (kind === 'grid') return {};
  const column = kind === 'column';
  const fallback = distribute ? 'fill' : 'hug';
  return column ? { height: copy.height ?? fallback } : { width: copy.width ?? fallback };
}

/** Does the template have any `repeat` node? */
export function hasRepeat(node: TemplateNode): boolean {
  if (node.type === 'repeat') return true;
  return node.type === 'frame' && (node.children ?? []).some(hasRepeat);
}

/** The rows of the `table` field as the engine receives them (non-object items are left out). */
export function rowsOf(value: FieldValue): readonly FieldRow[] {
  if (!Array.isArray(value)) return [];
  return (value as readonly unknown[]).filter(
    (row): row is FieldRow =>
      typeof row === 'object' && row !== null && !Array.isArray(row),
  );
}

/** Columns seen in the rows (the union of the keys, without `_id`), in the order they appear. */
export function columnsOf(rows: readonly FieldRow[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) if (key !== '_id') columns.add(key);
  }
  return [...columns];
}

/** The names of the `template`'s text nodes that a `$lines` of the same `template` cites (the node on the same row). */
function linesNames(template: unknown): ReadonlySet<string> {
  const cited = new Set([...linesCitations(template)].map(linesNodeName));
  const names = new Set<string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== 'object' || node === null) return;
    const record = node as Record<string, unknown>;
    if (
      record.type === 'text' &&
      typeof record.name === 'string' &&
      cited.has(record.name)
    )
      names.add(record.name);
    Object.values(record).forEach(walk);
  };
  walk(template);
  return names;
}

/** Replaces the field key that is a column with the row's extra field (`$field`, `$has`, `$switch`, `$eq`). */
function scopedFieldEntry(
  key: string,
  item: unknown,
  columns: ReadonlySet<string>,
  scope: string,
): unknown {
  const rename = (name: string): string =>
    columns.has(name) ? `${scope}:${name}` : name;
  if (
    (key === '$field' || key === '$has' || key === '$switch') &&
    typeof item === 'string'
  )
    return rename(item);
  if (key === '$eq' && Array.isArray(item) && typeof item[0] === 'string')
    return [rename(item[0]), ...item.slice(1)];
  return undefined;
}

/** An entry of the JSON in the row's scope: replaces the field key that is a column with the extra field. */
function scopedEntry(
  key: string,
  item: unknown,
  columns: ReadonlySet<string>,
  scope: string,
  lines: ReadonlySet<string>,
): unknown {
  const field = scopedFieldEntry(key, item, columns, scope);
  if (field !== undefined) return field;
  // A `$lines` of a node on the same row comes to cite its count, with the row's scope.
  if (key === '$lines' && typeof item === 'string' && lines.has(linesNodeName(item)))
    return `${scope}:${linesNodeName(item)}`;
  return scoped(item, columns, scope, lines);
}

/** Copies the JSON replacing the field keys that are columns with the row's extra field. */
function scoped(
  value: unknown,
  columns: ReadonlySet<string>,
  scope: string,
  lines: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value))
    return value.map((item) => scoped(item, columns, scope, lines));
  if (typeof value !== 'object' || value === null) return value;
  // In a nested `repeat` the `template`'s `$index` is the innermost one's: this scope does not touch it.
  const record = value as { type?: unknown; name?: unknown };
  const isRepeat = record.type === 'repeat';
  const inner = (): ReadonlySet<string> => {
    const set = new Set(columns);
    set.delete(INDEX_FIELD);
    return set;
  };
  const copy = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      scopedEntry(
        key,
        item,
        isRepeat && key === 'template' ? inner() : columns,
        scope,
        lines,
      ),
    ]),
  );
  const cited =
    record.type === 'text' && typeof record.name === 'string' && lines.has(record.name);
  return cited ? { ...copy, linesScope: scope } : copy;
}

export interface ExpandedComponent {
  readonly component: ComponentFile;
  readonly values: FieldValues;
  /** Warnings from the expansion (the `repeat`'s `table` field was not provided). */
  readonly warnings: readonly string[];
  /** The same warnings with code and parameters (`warnings` = the texts of these). */
  readonly messages: readonly ModelMessage[];
}

/**
 * The component without `repeat` and the values with the rows' extra fields. Without a `repeat`
 * in the template it returns the same objects. Each row's `template` is `hug` on the rows axis
 * unless it says otherwise; the node becomes a frame that is `hug` on that axis and `fill` on
 * the other.
 */
export function expandRepeats(
  component: ComponentFile,
  values: FieldValues,
): ExpandedComponent {
  if (!hasRepeat(component.template))
    return { component, values, warnings: [], messages: [] };

  const extra: Record<string, FieldValue> = {};
  const messages: ModelMessage[] = [];
  let counter = 0;

  /** The rows of a `repeat` by `count`: one per index, empty, up to the ceiling. */
  const countRows = (node: RepeatTemplate): FieldRow[] => {
    const expr = node.count as Expr<number>;
    const wanted =
      typeof expr === 'number'
        ? expr
        : toNumber(evaluate<unknown>(expr, { ...values, ...extra }, undefined));
    const count = Math.max(0, Math.floor(wanted ?? 0));
    if (count > REPEAT_COUNT_LIMIT)
      messages.push(
        templateMessage('engine.repeatLimited', {
          limit: REPEAT_COUNT_LIMIT,
          name: node.name ?? 'repeat',
        }),
      );
    return Array.from(
      { length: Math.min(count, REPEAT_COUNT_LIMIT) },
      (): FieldRow => ({}),
    );
  };

  /** The `repeat`'s rows: the list of a `table` field or, by `count`, one per index. */
  const rowsFor = (
    node: RepeatTemplate,
  ): { rows: readonly FieldRow[]; columns: Set<string> } => {
    if (node.count !== undefined) return { rows: countRows(node), columns: new Set() };
    const field = node.field ?? '';
    if (!(field in values))
      messages.push(templateMessage('engine.fieldMissing', { key: field }));
    const rows = rowsOf(values[field]);
    // A column that the `template` cites, is not a field of the type and no row carries (a row
    // saved before the column existed) is also a column: it stays empty, instead of becoming
    // "field not provided".
    const columns = new Set(columnsOf(rows));
    if (rows.length > 0) {
      for (const key of referencedFields(node.template))
        if (!(key in values)) columns.add(key);
    }
    return { rows, columns };
  };

  const expandRepeat = (node: RepeatTemplate): FrameTemplate => {
    const n = counter++;
    const { rows, columns } = rowsFor(node);
    columns.add(INDEX_FIELD);
    const lines = linesNames(node.template);
    const kind = layoutKind(node);
    const children = rows.map((row, i): FrameTemplate => {
      const scope = `$r${n}_${i}`;
      for (const name of columns)
        extra[`${scope}:${name}`] = name === INDEX_FIELD ? i : (row[name] ?? null);
      // The `template` may carry a `repeat` (the engine accepts it, the validator does not): expand the copy.
      const copy = expand(
        scoped(node.template, columns, scope, lines) as TemplateNode,
      ) as FrameTemplate;
      return { ...copy, ...rowSize(copy, kind, node.distribute === 'fill') };
    });
    return {
      type: 'frame',
      name: node.name ?? 'repeat',
      ...inheritedKeys(node),
      ...wrapperSize(node, kind),
      layout: node.layout ?? {
        type: node.direction ?? 'column',
        gap: node.gap ?? 0,
        ...wrapKeys(node),
      },
      children,
    };
  };

  function expand(node: TemplateNode): TemplateNode {
    if (node.type === 'repeat') return expandRepeat(node);
    if (node.type !== 'frame' || node.children === undefined) return node;
    return { ...node, children: node.children.map(expand) };
  }

  const template = expand(component.template) as FrameTemplate;
  return {
    component: { ...component, template },
    values: { ...values, ...extra },
    warnings: textsOf(messages),
    messages,
  };
}
