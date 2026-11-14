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
};

/** Field descriptions that the Material 3 with states stage (#869, ME1) fixed relative to v1 (decision 10). */
/**
 * Arrangement fields that lost the `default` (and the preview value) so the default and the explicit `Top`/`Start`
 * can be told apart with `reverseLayout` (CL1, FX5): the description gains the default sentence.
 */
export const V1_NO_DEFAULT: Record<string, string> = {
  'lazy-column': 'verticalArrangement',
  'lazy-row': 'horizontalArrangement',
};

// pt-BR kept: shared fixture data asserted by tests/model, tests/examples (text of the library files)
const V1_DESCRIPTION_FIXES: Record<string, Record<string, string>> = {
  'date-picker': {
    displayedMonth:
      'Nome do mês e do ano mostrados no calendário, como em Outubro de 2025. É o estado inicial, não um parâmetro: é só o rótulo, e a grade vem de month e year.',
  },
  slider: {
    steps:
      'Número de pontos intermediários entre as pontas (Slider.steps). Vazio, 0 ou menor que 1 = contínuo. Com steps, o valor vai ao passo mais próximo e o desenho mostra exatamente steps marcas, mais as duas pontas.',
  },
  'progress-indicator': {
    progress:
      'Progresso de 0 a 1, exato (o desenho calcula o arco e a largura; valor fora do intervalo é preso a ele). Vazio = indeterminado (o desenho mostra um arco ou uma barra parcial).',
  },
  'short-navigation-bar': {
    arrangement:
      'EqualWeight reparte a largura por igual (telas estreitas); Centered agrupa os itens no centro (telas médias; o desenho ocupa 60%, 70%, 80% ou 90% da largura com 3, 4, 5 ou 6 itens, e cada item cresce até largura/itens quando o conteúdo é maior).',
  },
  carousel: {
    preferredItemWidth:
      'Só no multi-browse (obrigatório no Compose): a largura que os itens grandes querem ter; o carrossel escolhe quantos grandes cabem e ajusta o tamanho deles, do médio e do pequeno (de 40 a 56) à largura da marcação.',
    itemSpacing:
      'Espaço entre os itens em dp (itemSpacing). Vazio = 0 no código; o desenho usa 8. No centered-hero o recuo e a largura dos itens dependem dele.',
  },
  tabs: {
    style:
      'primary (indicador de 3 no tamanho do rótulo), secondary (indicador de 3 na largura da aba) ou a versão rolável de cada um (abas com a largura do conteúdo, no mínimo 90, e recuo inicial de 52).',
  },
  snackbar: {
    actionOnNewLine:
      'true põe a ação abaixo da mensagem, para textos longos (com uma linha de texto a altura do retângulo passa de 48 para 92; os 68 são a linha única de duas linhas).',
  },
};

/** Examples that ME2 (#913) added to show known limits, by type. */
// pt-BR kept: shared fixture data asserted by tests/model, tests/examples (text of the library files)
export const LIMIT_EXAMPLES: Record<string, string> = {
  button: 'Rótulo longo',
  'time-picker': '24 horas, campos',
  'date-picker': 'Intervalo até o fim do mês',
};

/**
 * Examples of v1 that L2 (#1078) removed: the `size` of the tooltip (240 × 24) is the `plain` one and does not hold the `rich`, so its
 * example would go past the box (warning `content larger than the box`).
 */
// pt-BR kept: shared fixture data asserted by tests/model, tests/examples (text of the library files)
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
  // pt-BR kept: shared fixture data asserted by tests/model, tests/examples (text of the library files)
  'list-item': ['Apoio de duas linhas'],
  'date-picker': ['Dia de hoje'],
  chip: ['Com avatar', 'Rótulo longo'],
  // MC5 (#1033, group C): the long label of the extended-fab and the field with support (the height by `sizing`)
  'extended-fab': ['Rótulo longo'],
  'text-field': ['Preenchido com apoio'],
  'secure-text-field': ['Preenchido com apoio'],
  divider: ['Recuo por ponta'],
  'progress-indicator': ['Trilho colorido e ponta reta'],
  // MC6 (#1034): the flow-row wrap, the alert-dialog buttons on two lines and the menu width by the widest item
  'flow-row': ['Três por linha'],
  'alert-dialog': ['Botões em duas linhas'],
  'dropdown-menu': ['Itens de larguras diferentes'],
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
// pt-BR kept: shared fixture data asserted by tests/model, tests/examples (text of the library files)
const EX4_EXAMPLES: Record<string, string[]> = {
  slider: ['Encaixe no passo'],
  'date-picker': [
    'Fevereiro de 2028 (bissexto)',
    'Mês de 30 dias, 6 linhas',
    'Mês de 28 dias, 4 linhas',
    'Intervalo que atravessa semanas',
  ],
  'time-picker': ['10:37 em 24 horas, minutos', '22:05 em 12 horas (PM)'],
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
 * (the `interaction` field and the examples that use it, and the examples of the ME2 limits) and with the descriptions fixed by `V1_DESCRIPTION_FIXES`.
 */
export function v1WithEstados(
  id: string,
  nowType: unknown,
  beforeType: unknown,
): { actual: unknown; expected: unknown } {
  const now = nowType as { fields: Raw[]; examples?: Raw[] };
  const before = beforeType as { fields: Raw[]; examples?: Raw[] };
  const fixes = V1_DESCRIPTION_FIXES[id] ?? {};
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
    return f.key !== undefined && fixes[f.key] !== undefined
      ? { ...f, description: fixes[f.key] }
      : f;
  });
  const isState = (e: Raw): boolean => e.values?.interaction !== undefined;
  return {
    actual: {
      fields: now.fields
        .filter(
          (f) =>
            f.key !== 'interaction' &&
            !EX4_FIELDS[id]?.includes(f.key as string) &&
            !MF5_FIELDS[id]?.includes(f.key as string) &&
            !IMPORTED_FIELDS[id]?.includes(f.key as string),
        )
        .map((f) => withoutImportNotices(withoutAddedColumns(id, f))),
      examples: (now.examples ?? [])
        .filter(
          (e) =>
            !isState(e) &&
            e.name !== LIMIT_EXAMPLES[id] &&
            !EX4_EXAMPLES[id]?.includes(e.name as string) &&
            !MF5_EXAMPLES[id]?.includes(e.name as string),
        )
        .map((e) => withoutTableValues(now.fields, e)),
    },
    expected: {
      fields: expectedFields,
      examples:
        id === 'slider'
          ? (before.examples ?? []).map((e) => ({ ...e, values: toNumbers(e.values) }))
          : (before.examples ?? []).filter(
              (e) => !L2_REMOVED_EXAMPLES[id]?.includes(e.name as string),
            ),
    },
  };
}

/**
 * PROVISIONAL (coordinator decision, #1079 S5; owner decision pending in bug #1774; curation in #1134).
 * `parameter outside the signature` warnings that the import leaves: the `params` of the base (or the inherited one) cites a parameter that the
 * sheet of the case (`variants`) does not have (`removed` no longer leaves it: the importer takes the parameter out of `params`, CL1/S5-a). Each item is `<type>[.<case>] <field>=<parameter>`.
 * Any other warning, or error, keeps failing; a known warning that disappears does too (the list only shrinks).
 */
export const KNOWN_PARAM_WARNINGS: readonly string[] = [
  'top-app-bar.center subtitle=subtitle',
  'top-app-bar.medium subtitle=subtitle',
  'top-app-bar.large subtitle=subtitle',
  'chip.filter leadingIconContentColor=colors.leadingIconContentColor',
  'chip.filter trailingIconContentColor=colors.trailingIconContentColor',
  'chip.filter disabledLeadingIconContentColor=colors.disabledLeadingIconContentColor',
  'chip.filter disabledTrailingIconContentColor=colors.disabledTrailingIconContentColor',
  'chip.filter-elevated leadingIconContentColor=colors.leadingIconContentColor',
  'chip.filter-elevated trailingIconContentColor=colors.trailingIconContentColor',
  'chip.filter-elevated disabledLeadingIconContentColor=colors.disabledLeadingIconContentColor',
  'chip.filter-elevated disabledTrailingIconContentColor=colors.disabledTrailingIconContentColor',
  'chip.input leadingIconContentColor=colors.leadingIconContentColor',
  'chip.input trailingIconContentColor=colors.trailingIconContentColor',
  'chip.input disabledLeadingIconContentColor=colors.disabledLeadingIconContentColor',
  'chip.input disabledTrailingIconContentColor=colors.disabledTrailingIconContentColor',
  'chip.suggestion leadingIconContentColor=colors.leadingIconContentColor',
  'chip.suggestion trailingIconContentColor=colors.trailingIconContentColor',
  'chip.suggestion disabledLeadingIconContentColor=colors.disabledLeadingIconContentColor',
  'chip.suggestion disabledTrailingIconContentColor=colors.disabledTrailingIconContentColor',
  'chip.suggestion-elevated leadingIconContentColor=colors.leadingIconContentColor',
  'chip.suggestion-elevated trailingIconContentColor=colors.trailingIconContentColor',
  'chip.suggestion-elevated disabledLeadingIconContentColor=colors.disabledLeadingIconContentColor',
  'chip.suggestion-elevated disabledTrailingIconContentColor=colors.disabledTrailingIconContentColor',
  'card.elevated borderWidth=border.width',
  'card.elevated color=border.color',
  'bottom-sheet.standard sheetGesturesEnabled=sheetGesturesEnabled',
  'bottom-sheet.standard shape=shape',
  'bottom-sheet.standard tonalElevation=tonalElevation',
  'bottom-sheet.standard scrimColor=scrimColor',
  'tooltip.rich contentColor=contentColor',
  'tooltip.rich containerColor=containerColor',
  'progress-indicator.linear strokeWidth=strokeWidth',
  'alert-dialog.basic confirmButton=confirmButton',
  'alert-dialog.basic shape=shape',
  'alert-dialog.basic containerColor=containerColor',
  'alert-dialog.basic iconContentColor=iconContentColor',
  'alert-dialog.basic titleContentColor=titleContentColor',
  'alert-dialog.basic textContentColor=textContentColor',
  'alert-dialog.basic tonalElevation=tonalElevation',
  'alert-dialog.basic dismissButton=dismissButton',
  'alert-dialog.basic title=title',
  'alert-dialog.basic text=text',
  'dropdown-menu.exposed shape=shape',
  'dropdown-menu.exposed containerColor=containerColor',
  'dropdown-menu.exposed tonalElevation=tonalElevation',
  'dropdown-menu.exposed shadowElevation=shadowElevation',
  'dropdown-menu.exposed width=border.width',
  'dropdown-menu.exposed color=border.color',
  'navigation-rail.wide containerColor=containerColor',
  'navigation-rail.wide contentColor=contentColor',
  'navigation-rail.modal-wide containerColor=containerColor',
  'navigation-rail.modal-wide contentColor=contentColor',
  'navigation-drawer.dismissible scrimColor=scrimColor',
  'navigation-drawer.permanent gesturesEnabled=gesturesEnabled',
  'navigation-drawer.permanent scrimColor=scrimColor',
  'carousel.uncontained preferredItemWidth=preferredItemWidth',
  'carousel.uncontained minSmallItemWidth=minSmallItemWidth',
  'carousel.uncontained maxSmallItemWidth=maxSmallItemWidth',
  'carousel.centered-hero preferredItemWidth=preferredItemWidth',
];

/** Compares the library validation warnings with the known set: only `parameter outside the signature`, and exactly those. */
export function unknownWarnings(warnings: readonly { path: string; message: string }[]): {
  unexpected: string[];
  missing: string[];
} {
  const seen = new Set<string>();
  const unexpected: string[] = [];
  const re =
    /^layers\[(\d+)\]\.annotationTypes\[(\d+)\]\.code\.compose\.(?:variants\.cases\.([^.]+)\.)?params\.(.+)$/;
  for (const w of warnings) {
    const m = re.exec(w.path);
    const param = /^parameter outside the signature: "(.+)"$/.exec(w.message)?.[1];
    const id =
      m === null
        ? undefined
        : spec.layers[Number(m[1])]?.annotationTypes[Number(m[2])]?.id;
    if (m === null || param === undefined || id === undefined) {
      unexpected.push(`${w.path}: ${w.message}`);
      continue;
    }
    const key = `${id}${m[3] === undefined ? '' : `.${m[3]}`} ${m[4]}=${param}`;
    seen.add(key);
    if (!KNOWN_PARAM_WARNINGS.includes(key)) unexpected.push(key);
  }
  return { unexpected, missing: KNOWN_PARAM_WARNINGS.filter((k) => !seen.has(k)) };
}
