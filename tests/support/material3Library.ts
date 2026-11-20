// Helpers for the Material 3 (Compose) library tests: reads the folder, loads the specialization and draws a component.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isFontPath } from '../../src/model/components/library';
import { parseSpecText } from '../../src/model/spec';
import type { Spec, SpecAnnotationType } from '../../src/model/spec';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { resolveTokens } from '../../src/model/components/tokens';
import { defaultValues } from '../../src/model/libraryDrawing';
import type { Paint, SceneNode, TextNode } from '../../src/model/components/scene';

export const ROOT = join(__dirname, '../../libraries/material3-compose');
export const SPEC_FILE = 'material3-compose.spec.json';

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

export const files: { path: string; text?: string; binary?: true }[] = listDisk(ROOT)
  .sort()
  .map((path) =>
    isFontPath(path)
      ? { path, binary: true as const }
      : { path, text: readFileSync(join(ROOT, path), 'utf8') },
  );
export const text = (path: string): string =>
  files.find((f) => f.path === path)?.text ?? '';

function loadSpec(): Spec {
  const parsed = parseSpecText(text(SPEC_FILE));
  if (!parsed.ok) throw new Error('invalid specialization');
  return parsed.spec;
}
export const spec = loadSpec();
export const types: SpecAnnotationType[] = spec.layers.flatMap((l) => l.annotationTypes);
export const typeOf = (id: string): SpecAnnotationType => {
  const t = types.find((x) => x.id === id);
  if (t === undefined) throw new Error(`tipo ${id} ausente`);
  return t;
};

export function findText(node: SceneNode): TextNode | undefined {
  if (node.type === 'text' && node.visible) return node;
  if ('children' in node) {
    for (const child of node.children) {
      const found = findText(child);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export const solid = (paints: readonly Paint[]): string | undefined => {
  const first = paints[0];
  return first?.type === 'solid' ? first.color : undefined;
};

/** The options the tests use to instantiate a library component (approximate measurer, mode tokens, icons). */
export function instantiateOptions(
  catalog: ReturnType<typeof buildCatalog>,
  mode: 'light' | 'dark',
): Parameters<typeof instantiate>[3] {
  const library = catalog.library;
  if (library === null) throw new Error('sem biblioteca');
  return {
    measure: approximateMeasurer,
    tokens: resolveTokens(library.tokens, {}, mode),
    ...(library.icons === undefined ? {} : { icons: library.icons }),
  };
}

export function drawIn(
  catalog: ReturnType<typeof buildCatalog>,
  entry: NonNullable<ReturnType<typeof findEntry>>,
  values: Parameters<typeof instantiate>[1],
  mode: 'light' | 'dark',
) {
  if (entry.component === null) throw new Error('sem biblioteca');
  const box = { x: 0, y: 0, ...entry.component.size };
  return instantiate(
    entry.component,
    { ...defaultValues(entry.type), ...values },
    box,
    instantiateOptions(catalog, mode),
  );
}

/** Components already migrated to format 4 (M1: 4; M2: +19; M3: +9; M4: +9; M5: +9 = 50). Grows with each phase. */
export const MIGRATED = [
  'text',
  'icon',
  'divider',
  'surface',
  'scaffold',
  'box',
  'row',
  'column',
  'lazy-column',
  'lazy-row',
  'lazy-vertical-grid',
  'flow-row',
  'spacer',
  'horizontal-pager',
  'button',
  'fab',
  'extended-fab',
  'icon-button',
  'icon-toggle-button',
  'chip',
  'badge',
  'card',
  'image',
  'checkbox',
  'radio-button',
  'switch',
  'slider',
  'text-field',
  'secure-text-field',
  'search-bar',
  'segmented-button',
  'progress-indicator',
  'top-app-bar',
  'bottom-app-bar',
  'navigation-bar',
  'short-navigation-bar',
  'navigation-rail',
  'navigation-drawer',
  'tabs',
  'list-item',
  'dropdown-menu',
  'alert-dialog',
  'bottom-sheet',
  'snackbar',
  'tooltip',
  'date-picker',
  'time-picker',
  'carousel',
  'pull-to-refresh',
  'swipe-to-dismiss',
];

type Raw = {
  key?: string;
  type?: string;
  name?: string;
  description?: string;
  values?: Record<string, unknown>;
  columns?: Raw[];
};

/**
 * The frozen v1 packages (`tests/fixtures/material3-*-v1.json`) keep the Portuguese text of the old library, while the
 * library is now in English. To compare the STRUCTURE of a type with the fixture (keys, types, options, numbers, enum
 * values, defaults, example count and order), the translated text is replaced by a placeholder on both sides: the
 * `label`, `description`, `name` and `notes` keys, and the values of the free-text (`string`) fields, in the `preview`
 * and in the examples (also the string columns of the table rows).
 */
const TEXT_PLACEHOLDER = '<text>';
const TEXT_KEYS = new Set(['label', 'description', 'name', 'notes']);
function maskKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      TEXT_KEYS.has(k) && typeof v === 'string' ? TEXT_PLACEHOLDER : maskKeys(v),
    ]),
  );
}
function maskCell(columns: readonly Raw[], row: unknown): unknown {
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return row;
  const textKeys = new Set(columns.filter((c) => c.type === 'string').map((c) => c.key));
  return Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      textKeys.has(k) && typeof v === 'string' ? TEXT_PLACEHOLDER : v,
    ]),
  );
}
/** The `values` (of a preview or of an example) with the free-text values replaced by a placeholder. */
export function maskTextValues(
  typeFields: unknown,
  values: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (values === undefined) return undefined;
  const byKey = new Map((typeFields as readonly Raw[]).map((f) => [f.key, f]));
  return Object.fromEntries(
    Object.entries(values).map(([k, v]) => {
      const field = byKey.get(k);
      if (field?.type === 'string' && typeof v === 'string') return [k, TEXT_PLACEHOLDER];
      if (field?.type === 'table' && Array.isArray(v))
        return [k, v.map((row) => maskCell(field.columns ?? [], row))];
      return [k, v];
    }),
  );
}
/** The fields and the examples of a type without the translated text (see `TEXT_PLACEHOLDER`). */
function maskType(fields: readonly Raw[], examples: readonly Raw[]) {
  return {
    fields: maskKeys(fields),
    examples: examples.map((e) => ({
      ...(maskKeys({ name: e.name }) as Raw),
      ...(e.values === undefined ? {} : { values: maskTextValues(fields, e.values) }),
    })),
  };
}

/**
 * Arrangement fields that lost the `default` (and the preview value) so the default and the explicit `Top`/`Start`
 * can be told apart with `reverseLayout` (CL1, FX5): the description gains the default sentence.
 */
export const V1_NO_DEFAULT: Record<string, string> = {
  'lazy-column': 'verticalArrangement',
  'lazy-row': 'horizontalArrangement',
};

/** Examples that ME2 (#913) added to show known limits, by type. */
export const LIMIT_EXAMPLES: Record<string, string> = {
  button: 'Long label',
  'time-picker': '24 hours, fields',
  'date-picker': 'Range until the end of the month',
};

/**
 * Examples of v1 that L2 (#1078) removed: the `size` of the tooltip (240 × 24) is the `plain` one and does not hold the `rich`, so its
 * example would go past the box (warning `content larger than the box`).
 */
// pt-BR kept: the names of the examples of the FROZEN v1 fixture (tests/fixtures/material3-*-v1.json), which stay in Portuguese
const L2_REMOVED_EXAMPLES: Record<string, string[]> = {
  tooltip: ['Rich com título', 'Rich com ação'],
};

/** Fields and examples that the expressions stage (#897, EX4) added to the date-picker and the time-picker. */
const EX4_FIELDS: Record<string, string[]> = { 'date-picker': ['month', 'year'] };
/** Fields and examples that stage #899 (MF5) added: today's date and the variants as an optional field. */
const MF5_FIELDS: Record<string, string[]> = {
  'date-picker': ['today'],
  chip: ['avatar'],
  divider: ['color', 'insetStart', 'insetEnd'],
  'progress-indicator': ['trackColor', 'strokeCap'],
};
const MF5_EXAMPLES: Record<string, string[]> = {
  // MC5 (#1033): the three-line item by the two-line support (`$lines` of the support)
  'list-item': ['Two-line supporting text'],
  'date-picker': ["Today's day"],
  chip: ['With avatar', 'Long label'],
  // MC5 (#1033, group C): the long label of the extended-fab and the field with support (the height by `sizing`)
  'extended-fab': ['Long label'],
  'text-field': ['Filled with supporting text'],
  'secure-text-field': ['Filled with supporting text'],
  divider: ['Inset per end'],
  'progress-indicator': ['Colored track and butt cap'],
  // MC6 (#1034): the flow-row wrap, the alert-dialog buttons on two lines and the menu width by the widest item
  'flow-row': ['Three per row'],
  'alert-dialog': ['Buttons on two lines'],
  'dropdown-menu': ['Items of different widths'],
};
/**
 * Fields that the import by signature (#1079, S5) added to each type: one per parameter of the `code` sheet
 * (`signatures/`), additively. v1 did not have them.
 */
export const IMPORTED_FIELDS: Record<string, string[]> = {
  'alert-dialog': [
    'shape',
    'containerColor',
    'iconContentColor',
    'titleContentColor',
    'textContentColor',
    'tonalElevation',
  ],
  badge: ['containerColor', 'contentColor'],
  'bottom-app-bar': [
    'containerColor',
    'contentColor',
    'tonalElevation',
    'horizontal',
    'vertical',
  ],
  'bottom-sheet': [
    'sheetMaxWidth',
    'sheetGesturesEnabled',
    'shape',
    'containerColor',
    'contentColor',
    'tonalElevation',
    'scrimColor',
    'sheetShape',
    'sheetContainerColor',
    'sheetContentColor',
    'sheetTonalElevation',
    'sheetShadowElevation',
    'sheetSwipeEnabled',
  ],
  box: ['propagateMinConstraints'],
  button: [
    'shape',
    'containerColor',
    'contentColor',
    'disabledContainerColor',
    'disabledContentColor',
    'defaultElevation',
    'pressedElevation',
    'focusedElevation',
    'hoveredElevation',
    'disabledElevation',
    'borderWidth',
    'color',
    'horizontal',
    'vertical',
  ],
  card: [
    'shape',
    'containerColor',
    'contentColor',
    'disabledContainerColor',
    'disabledContentColor',
    'defaultElevation',
    'pressedElevation',
    'focusedElevation',
    'hoveredElevation',
    'draggedElevation',
    'disabledElevation',
    'borderWidth',
    'color',
  ],
  carousel: [
    'userScrollEnabled',
    'minSmallItemWidth',
    'maxSmallItemWidth',
    'horizontal',
    'vertical',
    'maxItemWidth',
  ],
  checkbox: [
    'checkedColor',
    'uncheckedColor',
    'checkmarkColor',
    'disabledCheckedColor',
    'disabledUncheckedColor',
    'disabledIndeterminateColor',
  ],
  chip: [
    'shape',
    'containerColor',
    'labelColor',
    'leadingIconContentColor',
    'trailingIconContentColor',
    'disabledContainerColor',
    'disabledLabelColor',
    'disabledLeadingIconContentColor',
    'disabledTrailingIconContentColor',
    'elevation',
    'pressedElevation',
    'focusedElevation',
    'hoveredElevation',
    'draggedElevation',
    'disabledElevation',
    'width',
    'color',
    'iconColor',
    'disabledLeadingIconColor',
    'disabledTrailingIconColor',
    'selectedContainerColor',
    'disabledSelectedContainerColor',
    'selectedLabelColor',
    'selectedLeadingIconColor',
    'selectedTrailingIconColor',
    'leadingIconColor',
    'trailingIconColor',
    'iconContentColor',
    'disabledIconContentColor',
  ],
  'date-picker': [
    'containerColor',
    'titleContentColor',
    'headlineContentColor',
    'weekdayContentColor',
    'subheadContentColor',
    'navigationContentColor',
    'yearContentColor',
    'disabledYearContentColor',
    'currentYearContentColor',
    'selectedYearContentColor',
    'disabledSelectedYearContentColor',
    'selectedYearContainerColor',
    'disabledSelectedYearContainerColor',
    'dayContentColor',
    'disabledDayContentColor',
    'selectedDayContentColor',
    'disabledSelectedDayContentColor',
    'selectedDayContainerColor',
    'disabledSelectedDayContainerColor',
    'todayContentColor',
    'todayDateBorderColor',
    'dayInSelectionRangeContentColor',
    'dayInSelectionRangeContainerColor',
    'dividerColor',
  ],
  'dropdown-menu': [
    'shape',
    'containerColor',
    'tonalElevation',
    'shadowElevation',
    'width',
    'color',
  ],
  'extended-fab': [
    'shape',
    'contentColor',
    'defaultElevation',
    'pressedElevation',
    'focusedElevation',
    'hoveredElevation',
  ],
  fab: [
    'shape',
    'contentColor',
    'defaultElevation',
    'pressedElevation',
    'focusedElevation',
    'hoveredElevation',
  ],
  'horizontal-pager': ['horizontal', 'vertical', 'beyondViewportPageCount'],
  'icon-button': ['shape', 'width', 'color'],
  'icon-toggle-button': ['shape', 'width', 'color'],
  image: ['alpha'],
  'lazy-column': ['horizontal', 'vertical', 'userScrollEnabled'],
  'lazy-row': ['horizontal', 'vertical', 'userScrollEnabled'],
  'lazy-vertical-grid': ['horizontal', 'vertical', 'reverseLayout', 'userScrollEnabled'],
  'list-item': [
    'containerColor',
    'headlineColor',
    'leadingIconColor',
    'overlineColor',
    'supportingColor',
    'trailingIconColor',
    'disabledHeadlineColor',
    'disabledLeadingIconColor',
    'disabledTrailingIconColor',
    'tonalElevation',
    'shadowElevation',
  ],
  'navigation-bar': ['containerColor', 'contentColor', 'tonalElevation'],
  'navigation-drawer': ['gesturesEnabled', 'scrimColor'],
  'navigation-rail': [
    'containerColor',
    'contentColor',
    'shape',
    'colorsContainerColor',
    'colorsContentColor',
    'modalContainerColor',
    'modalScrimColor',
    'modalContentColor',
    'hideOnCollapse',
    'collapsedShape',
    'expandedShape',
    'colorsContainerColor2',
    'colorsContentColor2',
    'expandedHeaderTopPadding',
  ],
  'progress-indicator': ['color', 'strokeWidth', 'gapSize'],
  'radio-button': [
    'selectedColor',
    'unselectedColor',
    'disabledSelectedColor',
    'disabledUnselectedColor',
  ],
  scaffold: ['contentColor'],
  'search-bar': [
    'shape',
    'containerColor',
    'dividerColor',
    'tonalElevation',
    'shadowElevation',
  ],
  'secure-text-field': ['shape', 'horizontal', 'vertical', 'prefix', 'suffix'],
  'segmented-button': ['space'],
  'short-navigation-bar': ['containerColor', 'contentColor'],
  slider: [
    'thumbColor',
    'activeTrackColor',
    'activeTickColor',
    'inactiveTrackColor',
    'inactiveTickColor',
    'disabledThumbColor',
    'disabledActiveTrackColor',
    'disabledActiveTickColor',
    'disabledInactiveTrackColor',
    'disabledInactiveTickColor',
  ],
  snackbar: [
    'shape',
    'containerColor',
    'contentColor',
    'actionContentColor',
    'dismissActionContentColor',
  ],
  surface: ['contentColor', 'shadowElevation', 'borderWidth', 'borderColor'],
  'swipe-to-dismiss': ['gesturesEnabled'],
  switch: [
    'checkedThumbColor',
    'checkedTrackColor',
    'checkedBorderColor',
    'checkedIconColor',
    'uncheckedThumbColor',
    'uncheckedTrackColor',
    'uncheckedBorderColor',
    'uncheckedIconColor',
    'disabledCheckedThumbColor',
    'disabledCheckedTrackColor',
    'disabledCheckedBorderColor',
    'disabledCheckedIconColor',
    'disabledUncheckedThumbColor',
    'disabledUncheckedTrackColor',
    'disabledUncheckedBorderColor',
    'disabledUncheckedIconColor',
  ],
  tabs: [
    'selectedTabIndex',
    'containerColor',
    'contentColor',
    'edgePadding',
    'minTabWidth',
  ],
  text: ['fontSize', 'letterSpacing', 'lineHeight', 'softWrap', 'minLines'],
  'text-field': ['readOnly', 'minLines', 'shape', 'prefix', 'suffix'],
  'time-picker': [
    'clockDialColor',
    'clockDialSelectedContentColor',
    'clockDialUnselectedContentColor',
    'selectorColor',
    'containerColor',
    'periodSelectorBorderColor',
    'periodSelectorSelectedContainerColor',
    'periodSelectorUnselectedContainerColor',
    'periodSelectorSelectedContentColor',
    'periodSelectorUnselectedContentColor',
    'timeSelectorSelectedContainerColor',
    'timeSelectorUnselectedContainerColor',
    'timeSelectorSelectedContentColor',
    'timeSelectorUnselectedContentColor',
  ],
  tooltip: [
    'maxWidth',
    'shape',
    'contentColor',
    'containerColor',
    'tonalElevation',
    'shadowElevation',
    'colorsContainerColor',
    'colorsContentColor',
    'titleContentColor',
    'actionContentColor',
  ],
  'top-app-bar': [
    'subtitle',
    'expandedHeight',
    'containerColor',
    'scrolledContainerColor',
    'navigationIconContentColor',
    'titleContentColor',
    'actionIconContentColor',
    'subtitleContentColor',
    'collapsedHeight',
  ],
};
/** The value fields of the slider (EX6): they were `enum` in tenths in v1 and became `number`. */
const SLIDER_NUMBERS: Record<string, number> = {
  value: 0.5,
  valueStart: 0.2,
  valueEnd: 0.8,
};
const toNumbers = (values: Record<string, unknown> | undefined) =>
  values === undefined
    ? undefined
    : Object.fromEntries(
        Object.entries(values).map(([k, v]) =>
          k in SLIDER_NUMBERS && typeof v === 'string' ? [k, Number(v)] : [k, v],
        ),
      );
/** The v1 preview as EX6 records it (the slider stores a number). */
export function v1Preview(id: string, preview: unknown): unknown {
  return id === 'slider'
    ? toNumbers(preview as Record<string, unknown> | undefined)
    : preview;
}
const EX4_EXAMPLES: Record<string, string[]> = {
  slider: ['Snap to step'],
  'date-picker': [
    'February 2028 (leap year)',
    '30-day month, 6 rows',
    '28-day month, 4 rows',
    'Range that crosses weeks',
  ],
  'time-picker': ['10:37 in 24 hours, minutes', '22:05 in 12 hours (PM)'],
};

/** Sizes that ME2 (#913) raised to the Compose ones (decision 9); the rest stay the v1 ones. */
export const COMPOSE_SIZES: Record<string, { width: number; height: number }> = {
  'top-app-bar': { width: 412, height: 152 },
  'date-picker': { width: 360, height: 512 },
  'time-picker': { width: 328, height: 528 },
  'alert-dialog': { width: 312, height: 248 },
  slider: { width: 328, height: 48 },
};

/** Table columns that the stage added to a type (ME4 gave `selected` to the items of the `dropdown-menu`). */
const ADDED_COLUMNS: Record<string, Record<string, string[]>> = {
  'dropdown-menu': { items: ['selected'] },
  // A4 (#1129): the description of the icon of each row (accessibility)
  'navigation-bar': { items: ['iconDescription'] },
  'short-navigation-bar': { items: ['iconDescription'] },
  'navigation-rail': { items: ['iconDescription'] },
  'navigation-drawer': { items: ['iconDescription'] },
  tabs: { items: ['iconDescription'] },
  'segmented-button': { options: ['iconDescription'] },
};

/** The `<field>Description` fields that A4 (#1129) added next to the icon fields (accessibility); v1 did not have them. */
const A4_FIELDS: Record<string, string[]> = {
  'top-app-bar': ['navigationIcon', 'actionIcon1', 'actionIcon2'],
  'bottom-app-bar': [
    ...['actionIcon1', 'actionIcon2', 'actionIcon3', 'actionIcon4'],
    'floatingActionButton',
  ],
  'text-field': ['leadingIcon', 'trailingIcon'],
  'secure-text-field': ['leadingIcon', 'trailingIcon'],
  'search-bar': ['leadingIcon', 'trailingIcon'],
  chip: ['leadingIcon', 'trailingIcon'],
  switch: ['thumbIcon'],
  'swipe-to-dismiss': ['icon'],
};
const a4Keys = (id: string): string[] =>
  (A4_FIELDS[id] ?? []).map((k) => `${k}Description`);
/** The examples that A4 added (labeled and unlabeled actions of the top app bar, for the accessibility script). */
const A4_EXAMPLES: Record<string, string[]> = {
  'top-app-bar': ['Labeled actions', 'Actions without a label'],
};
/** The notices that the import by signature (#1079, S5) put on the fields (`diverges`): v1 did not have them. */
function withoutImportNotices(field: Raw): Raw {
  const { notices: _notices, ...rest } = field as Raw & { notices?: unknown };
  void _notices;
  return rest;
}
function withoutAddedColumns(id: string, field: Raw): Raw {
  const drop = field.key === undefined ? undefined : ADDED_COLUMNS[id]?.[field.key];
  const columns = (field as { columns?: Raw[] }).columns;
  if (drop === undefined || columns === undefined) return field;
  return {
    ...field,
    columns: columns.filter((c) => !drop.includes(c.key as string)),
  } as Raw;
}

/**
 * The example without the rows of the `table` fields (EX5 of #897 put those of the `preview` in every example
 * of a type with a table; v1 did not have it, because the example did not accept rows).
 */
function withoutA4Values(id: string, example: Raw): Raw {
  // The `fab` already had `contentDescription`; A4 only filled it in its examples (no label pending).
  const drop = [...a4Keys(id), ...(id === 'fab' ? ['contentDescription'] : [])];
  if (example.values === undefined || drop.length === 0) return example;
  return {
    ...example,
    values: Object.fromEntries(
      Object.entries(example.values).filter(([k]) => !drop.includes(k)),
    ),
  };
}
function withoutTableValues(fields: readonly Raw[], example: Raw): Raw {
  if (example.values === undefined) return example;
  const tables = new Set(fields.filter((f) => f.type === 'table').map((f) => f.key));
  return {
    ...example,
    values: Object.fromEntries(
      Object.entries(example.values).filter(([k]) => !tables.has(k)),
    ),
  };
}

/**
 * Compares the fields and the examples of a type with those of v1, without what the Material 3 with states stage added
 * (the `interaction` field and the examples that use it, and the examples of the ME2 limits) (the text is compared masked, see `TEXT_PLACEHOLDER`).
 */
export function v1WithEstados(
  id: string,
  nowType: unknown,
  beforeType: unknown,
): { actual: unknown; expected: unknown } {
  const now = nowType as { fields: Raw[]; examples?: Raw[] };
  const before = beforeType as { fields: Raw[]; examples?: Raw[] };
  const noDefault = V1_NO_DEFAULT[id];
  const expectedFields = before.fields.map((f) => {
    if (id === 'slider' && f.key !== undefined && f.key in SLIDER_NUMBERS) {
      const nowField = now.fields.find((n) => n.key === f.key);
      return {
        key: f.key,
        label: (f as Raw & { label?: string }).label,
        type: 'number',
        default: SLIDER_NUMBERS[f.key],
        description: nowField?.description,
      };
    }
    if (f.key !== undefined && f.key === noDefault) {
      const { default: _dropped, ...rest } = f as Raw & { default?: unknown };
      void _dropped;
      const nowField = now.fields.find((n) => n.key === f.key);
      return { ...rest, description: nowField?.description };
    }
    return f;
  });
  const isState = (e: Raw): boolean => e.values?.interaction !== undefined;
  const actualFields = now.fields
    .filter(
      (f) =>
        f.key !== 'interaction' &&
        !EX4_FIELDS[id]?.includes(f.key as string) &&
        !MF5_FIELDS[id]?.includes(f.key as string) &&
        !IMPORTED_FIELDS[id]?.includes(f.key as string) &&
        !a4Keys(id).includes(f.key as string),
    )
    .map((f) => withoutImportNotices(withoutAddedColumns(id, f)));
  const actualExamples = (now.examples ?? [])
    .filter(
      (e) =>
        !isState(e) &&
        e.name !== LIMIT_EXAMPLES[id] &&
        !EX4_EXAMPLES[id]?.includes(e.name as string) &&
        !MF5_EXAMPLES[id]?.includes(e.name as string) &&
        !A4_EXAMPLES[id]?.includes(e.name as string),
    )
    .map((e) => withoutA4Values(id, withoutTableValues(now.fields, e)));
  const expectedExamples =
    id === 'slider'
      ? (before.examples ?? []).map((e) => ({ ...e, values: toNumbers(e.values) }))
      : (before.examples ?? [])
          .filter((e) => !L2_REMOVED_EXAMPLES[id]?.includes(e.name as string))
          .map((e) => withoutA4Values(id, e));
  return {
    actual: maskType(actualFields, actualExamples),
    expected: maskType(expectedFields, expectedExamples),
  };
}
