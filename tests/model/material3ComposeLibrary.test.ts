// Material 3 (Compose) library (`libraries/material3-compose/`, ready to use and applied by the person):
// the specialization (`formatVersion` 15, library v2: light and dark tokens and an icon set) with the layout and content structures and the
// Jetpack Compose Material 3 components, 50 types in three layers, each with `code.compose` (symbol and file in
// androidx, at the pinned commit), a component that draws, a document and examples. The variants that swap the
// symbol (`variants`) and the icons by `suggestions` follow the library's pattern.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import type { Spec, SpecField } from '../../src/model/spec';
import { resolveCode } from '../../src/model/codeVariants';
import { buildCatalog, findEntry } from '../../src/model/catalog';
import { resolveTokens } from '../../src/model/components/tokens';
import { missingMigrations } from '../../src/model/specVersions';
import reference from '../fixtures/material3-tokens-reference.json';
import {
  MIGRATED,
  SPEC_FILE,
  unknownWarnings,
  drawIn,
  files,
  instantiateOptions,
  findText,
  solid,
  spec,
  text,
  typeOf,
  types,
} from '../support/material3Library';
import { drawFitted } from '../support/material3Fitted';
import autoMirroredFixture from '../fixtures/material3-automirrored-filled.json';
import { instantiate } from '../../src/model/components/instantiate';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import { componentAnchorDefaults } from '../../src/model/components/anchor';
import { defaultValues } from '../../src/model/libraryDrawing';

const COMMIT = '5113b82a4ed6416d6344efa50e41db8cb65928ff';

/** The catalog is built once, at collection: building it inside each test took them to ~4 s (limit of 5 s) with coverage on in CI. */
const sharedCatalog = buildCatalog(files);

const LAYERS: Record<string, string[]> = {
  layout: [
    ...['scaffold', 'surface', 'box', 'row', 'column', 'lazy-column', 'lazy-row'],
    ...['lazy-vertical-grid', 'flow-row', 'spacer', 'horizontal-pager'],
  ],
  content: ['text', 'icon', 'image'],
  components: [
    ...['top-app-bar', 'button', 'fab', 'extended-fab', 'text-field', 'switch'],
    ...['checkbox', 'chip', 'card', 'list-item', 'navigation-bar', 'bottom-sheet'],
    ...[
      'icon-button',
      'icon-toggle-button',
      'segmented-button',
      'radio-button',
      'slider',
    ],
    ...['search-bar', 'date-picker', 'time-picker', 'badge', 'snackbar', 'tooltip'],
    ...['progress-indicator', 'secure-text-field'],
    ...['divider', 'alert-dialog', 'dropdown-menu', 'navigation-rail'],
    ...['short-navigation-bar', 'navigation-drawer', 'tabs', 'bottom-app-bar'],
    ...['carousel', 'pull-to-refresh', 'swipe-to-dismiss'],
  ],
};
const ALL_TYPES = Object.values(LAYERS).flat();

/** The 30 suggestions of library v1: all of them remain in the v2 subset (decision 11). */
const V1_ICONS = [
  ...['Home', 'Search', 'Person', 'Menu', 'MoreVert', 'Add', 'Check', 'Close'],
  ...['ArrowBack', 'Favorite', 'Edit', 'Delete', 'Share', 'Notifications'],
  ...['Settings', 'Info', 'Star', 'Email', 'Phone', 'Place', 'DateRange'],
  ...['ShoppingCart', 'AccountCircle', 'KeyboardArrowRight', 'KeyboardArrowDown'],
  ...['Refresh', 'Clear', 'Done', 'Lock', 'List'],
];
/** The icons the components still draw on their own and that the subset must have. */
const SELF_DRAWN_ICONS = [
  ...['arrow_drop_down', 'check', 'close', 'schedule', 'calendar_today', 'search'],
  ...['menu', 'more_vert', 'edit', 'keyboard', 'keyboard_arrow_left'],
  ...['keyboard_arrow_right', 'keyboard_arrow_down'],
];
/** The four components migrated in M1 (format 4, no literal color, no `family`). */
const ICON_KEYS = [
  ...['icon', 'imageVector', 'navigationIcon', 'actionIcon1', 'actionIcon2'],
  ...['actionIcon3', 'actionIcon4', 'floatingActionButton'],
  ...['leadingIcon', 'trailingIcon'],
];

const MATERIAL = 'androidx.compose.material3.';
const CAROUSEL = 'androidx.compose.material3.carousel.';
/** type → variant field and value → expected symbol (an absent value falls back to the field's `default`). */
const VARIANT_SYMBOLS: Record<
  string,
  { field: string; symbols: Record<string, string> }
> = {
  button: {
    field: 'style',
    symbols: {
      filled: 'Button',
      tonal: 'FilledTonalButton',
      outlined: 'OutlinedButton',
      text: 'TextButton',
      elevated: 'ElevatedButton',
    },
  },
  'top-app-bar': {
    field: 'style',
    symbols: {
      small: 'TopAppBar',
      center: 'CenterAlignedTopAppBar',
      medium: 'MediumTopAppBar',
      large: 'LargeTopAppBar',
    },
  },
  fab: {
    field: 'size',
    symbols: {
      small: 'SmallFloatingActionButton',
      regular: 'FloatingActionButton',
      large: 'LargeFloatingActionButton',
    },
  },
  'text-field': {
    field: 'style',
    symbols: { filled: 'TextField', outlined: 'OutlinedTextField' },
  },
  checkbox: {
    field: 'state',
    symbols: {
      unchecked: 'Checkbox',
      checked: 'Checkbox',
      indeterminate: 'TriStateCheckbox',
    },
  },
  chip: {
    field: 'style',
    symbols: {
      assist: 'AssistChip',
      'assist-elevated': 'ElevatedAssistChip',
      filter: 'FilterChip',
      'filter-elevated': 'ElevatedFilterChip',
      input: 'InputChip',
      suggestion: 'SuggestionChip',
      'suggestion-elevated': 'ElevatedSuggestionChip',
    },
  },
  card: {
    field: 'style',
    symbols: { filled: 'Card', elevated: 'ElevatedCard', outlined: 'OutlinedCard' },
  },
  'bottom-sheet': {
    field: 'style',
    symbols: { modal: 'ModalBottomSheet', standard: 'BottomSheetScaffold' },
  },
  'icon-button': {
    field: 'style',
    symbols: {
      standard: 'IconButton',
      filled: 'FilledIconButton',
      tonal: 'FilledTonalIconButton',
      outlined: 'OutlinedIconButton',
    },
  },
  'icon-toggle-button': {
    field: 'style',
    symbols: {
      standard: 'IconToggleButton',
      filled: 'FilledIconToggleButton',
      tonal: 'FilledTonalIconToggleButton',
      outlined: 'OutlinedIconToggleButton',
    },
  },
  'segmented-button': {
    field: 'selection',
    symbols: {
      single: 'SingleChoiceSegmentedButtonRow',
      multi: 'MultiChoiceSegmentedButtonRow',
    },
  },
  slider: { field: 'type', symbols: { single: 'Slider', range: 'RangeSlider' } },
  'search-bar': {
    field: 'style',
    symbols: { bar: 'SearchBar', docked: 'DockedSearchBar' },
  },
  'date-picker': {
    field: 'selection',
    symbols: { single: 'DatePicker', range: 'DateRangePicker' },
  },
  'time-picker': { field: 'mode', symbols: { picker: 'TimePicker', input: 'TimeInput' } },
  badge: { field: 'style', symbols: { small: 'Badge', large: 'Badge' } },
  tooltip: { field: 'style', symbols: { plain: 'PlainTooltip', rich: 'RichTooltip' } },
  'progress-indicator': {
    field: 'shape',
    symbols: { circular: 'CircularProgressIndicator', linear: 'LinearProgressIndicator' },
  },
  'secure-text-field': {
    field: 'style',
    symbols: { filled: 'SecureTextField', outlined: 'OutlinedSecureTextField' },
  },
  divider: {
    field: 'orientation',
    symbols: { horizontal: 'HorizontalDivider', vertical: 'VerticalDivider' },
  },
  'alert-dialog': {
    field: 'style',
    symbols: { standard: 'AlertDialog', basic: 'BasicAlertDialog' },
  },
  'dropdown-menu': {
    field: 'style',
    symbols: { menu: 'DropdownMenu', exposed: 'ExposedDropdownMenuBox' },
  },
  'navigation-rail': {
    field: 'style',
    symbols: {
      rail: 'NavigationRail',
      wide: 'WideNavigationRail',
      'modal-wide': 'ModalWideNavigationRail',
    },
  },
  'navigation-drawer': {
    field: 'style',
    symbols: {
      modal: 'ModalNavigationDrawer',
      dismissible: 'DismissibleNavigationDrawer',
      permanent: 'PermanentNavigationDrawer',
    },
  },
  tabs: {
    field: 'style',
    symbols: {
      primary: 'PrimaryTabRow',
      secondary: 'SecondaryTabRow',
      'primary-scrollable': 'PrimaryScrollableTabRow',
      'secondary-scrollable': 'SecondaryScrollableTabRow',
    },
  },
  carousel: {
    field: 'style',
    symbols: {
      'multi-browse': CAROUSEL + 'HorizontalMultiBrowseCarousel',
      uncontained: CAROUSEL + 'HorizontalUncontainedCarousel',
      'centered-hero': CAROUSEL + 'HorizontalCenteredHeroCarousel',
    },
  },
};

/** The signature sheets that `code.compose` and the `variants` cases cite (S5 of #1079). */
function signatureFiles(): string[] {
  const paths: string[] = [];
  for (const type of types) {
    const code = type.code?.compose;
    if (code?.signature !== undefined) paths.push(code.signature);
    for (const kase of Object.values(code?.variants?.cases ?? {}))
      if (kase.signature !== undefined) paths.push(kase.signature);
  }
  return paths;
}

describe('Material 3 (Compose) library', () => {
  it('has the specialization, the fonts, a component and a document per type', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        // pt-BR kept: file names of the library package (libraries/material3-compose/), outside this phase
        'fonts/LEIA-ME.txt',
        'fonts/LICENSE-Roboto.txt',
        'fonts/Roboto-Medium.woff2',
        'fonts/Roboto-Regular.woff2',
        'icons/LEIA-ME.txt',
        'icons/LICENSE-material-icons.txt',
        'icons/material-icons.json',
        ...ALL_TYPES.map((id) => `components/${id}.json`),
        ...ALL_TYPES.map((id) => `docs/${id}.md`),
        ...signatureFiles(),
      ].sort(),
    );
  });

  it('every document states Fidelity in component units (decision 11 of #1085)', () => {
    const docs = files.filter((f) => f.path.startsWith('docs/'));
    expect(docs).toHaveLength(50);
    for (const doc of docs) {
      const body = text(doc.path);
      // pt-BR kept: Portuguese text of the library docs (docs/*.md in libraries/material3-compose/), outside this phase
      expect(body, doc.path).toContain(
        '1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem',
      );
      expect(body, doc.path).not.toContain('1 dp = 1 px do componente');
    }
  });

  it('has 50 types in the layout, content and components layers, in order', () => {
    expect(spec.layers.map((l) => l.id)).toEqual(Object.keys(LAYERS));
    for (const layer of spec.layers) {
      expect(layer.annotationTypes.map((t) => t.id)).toEqual(LAYERS[layer.id]);
    }
    expect(types).toHaveLength(50);
  });

  it('validates with no error at the three levels, with the known warnings', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      level: 3,
      types: 50,
      components: 50,
      docs: 50,
    });
    // pt-BR kept: 'parâmetro fora da ficha' is the pt-BR text of the model.library.paramOutsideSignature warning
    // Only the known `parâmetro fora da ficha` warnings (provisional: owner decision pending in bug #1774; curation
    // in #1134): the fonts come in the package and `code` covers the fields the drawing does not use. The set cannot grow
    // or keep an item that disappeared.
    const known = unknownWarnings(report.warnings);
    expect(known.unexpected).toEqual([]);
    expect(known.missing).toEqual([]);
  }, 30_000);

  it('is formatVersion 16, version 14, with tokens in light and dark modes and the compose platform in androidx pinned at the commit', () => {
    expect(spec).toMatchObject({
      formatVersion: 16,
      id: 'material3-compose',
      version: 14,
      icons: 'icons/material-icons.json',
    });
    expect(spec.tokens?.modes).toEqual(['light', 'dark']);
    expect(spec.platforms).toHaveLength(1);
    expect(spec.platforms?.[0]).toMatchObject({
      id: 'compose',
      repo: {
        url: 'https://github.com/androidx/androidx',
        ref: COMMIT,
        urlTemplate: `https://github.com/androidx/androidx/blob/${COMMIT}/{path}`,
      },
    });
  });

  it('every type has code.compose with an androidx symbol and a file in compose/', () => {
    for (const type of types) {
      const code = type.code?.compose;
      expect(code, type.id).toBeDefined();
      expect(code?.symbol.startsWith('androidx.compose.'), type.id).toBe(true);
      expect(code?.path?.startsWith('compose/'), type.id).toBe(true);
      expect(code?.path?.endsWith('.kt'), type.id).toBe(true);
      for (const [value, kase] of Object.entries(code?.variants?.cases ?? {})) {
        expect(
          kase.symbol?.startsWith('androidx.compose.'),
          `${type.id}/${value}`,
        ).not.toBe(false);
        if (kase.path !== undefined) {
          expect(kase.path.startsWith('compose/'), `${type.id}/${value}`).toBe(true);
          expect(kase.path.endsWith('.kt'), `${type.id}/${value}`).toBe(true);
        }
      }
    }
  });

  it('every variants resolves to a symbol, for each option of the field', () => {
    let withVariants = 0;
    for (const type of types) {
      const code = type.code?.compose;
      if (code?.variants === undefined) continue;
      withVariants += 1;
      const field = type.fields.find((f) => f.key === code.variants?.field);
      expect(field?.type, type.id).toBe('enum');
      if (field?.type !== 'enum') continue;
      for (const option of field.options) {
        const resolved = resolveCode(code, { [field.key]: option }, type.fields);
        expect(resolved.symbol, `${type.id}/${option}`).not.toBe('');
        expect(resolved.variants, `${type.id}/${option}`).toBeUndefined();
      }
    }
    expect(withVariants).toBe(Object.keys(VARIANT_SYMBOLS).length);
  });

  it.each(Object.keys(VARIANT_SYMBOLS))(
    '%s resolves each value to the right symbol',
    (id) => {
      const type = typeOf(id);
      const code = type.code?.compose;
      const expected = VARIANT_SYMBOLS[id]!;
      expect(code).toBeDefined();
      const field = type.fields.find((f) => f.key === expected.field);
      expect(field?.type).toBe('enum');
      expect(field?.type === 'enum' ? [...field.options].sort() : []).toEqual(
        Object.keys(expected.symbols).sort(),
      );
      for (const [value, symbol] of Object.entries(expected.symbols)) {
        const resolved = resolveCode(code!, { [expected.field]: value }, type.fields);
        expect(resolved.symbol, `${id}/${value}`).toBe(
          symbol.includes('.') ? symbol : MATERIAL + symbol,
        );
      }
      // An absent value falls back to the field's default.
      const absent = resolveCode(code!, {}, type.fields);
      const dflt = field?.type === 'enum' ? field.default : undefined;
      const dfltSymbol = expected.symbols[dflt ?? '']!;
      expect(absent.symbol).toBe(
        dfltSymbol.includes('.') ? dfltSymbol : MATERIAL + dfltSymbol,
      );
    },
  );

  it('the indeterminate checkbox adds params and values of the base', () => {
    const type = typeOf('checkbox');
    const base = resolveCode(type.code!.compose!, { state: 'checked' }, type.fields);
    expect(base.params?.state).toBe('checked');
    expect(base.values?.state).toMatchObject({ checked: 'true', unchecked: 'false' });
    const tri = resolveCode(type.code!.compose!, { state: 'indeterminate' }, type.fields);
    expect(tri.symbol).toBe(`${MATERIAL}TriStateCheckbox`);
    expect(tri.params?.state).toBe('state');
    expect(tri.values?.state?.indeterminate).toBe('ToggleableState.Indeterminate');
  });

  it('every icon field is a string with the same suggestions list', () => {
    const imageVectorField = typeOf('icon').fields.find((f) => f.key === 'imageVector');
    expect(imageVectorField?.type).toBe('string');
    const suggestions =
      imageVectorField?.type === 'string' ? imageVectorField.suggestions : undefined;
    expect(suggestions?.length).toBeGreaterThanOrEqual(100);
    expect(suggestions?.length).toBeLessThanOrEqual(170);
    for (const name of V1_ICONS) expect(suggestions, name).toContain(name);
    let checked = 0;
    const check = (f: SpecField, where: string): void => {
      if (!ICON_KEYS.includes(f.key)) return;
      expect(f.type, where).toBe('string');
      expect(f.type === 'string' ? f.suggestions : undefined, where).toEqual(suggestions);
      checked += 1;
    };
    for (const type of types) {
      for (const f of type.fields) {
        check(f, `${type.id}.${f.key}`);
        if (f.type === 'table') {
          for (const c of f.columns) check(c, `${type.id}.${f.key}.${c.key}`);
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(12);
  });

  it.each(ALL_TYPES)(
    '%s draws the preview and the examples without warnings at the initial size, in light and dark modes',
    (id) => {
      const catalog = sharedCatalog;
      expect(catalog.report.errors).toEqual([]);
      const entry = findEntry(catalog, id);
      expect(entry?.component).not.toBeNull();
      for (const mode of ['light', 'dark'] as const) {
        const preview = drawIn(catalog, entry!, entry?.previewValues ?? {}, mode);
        expect(preview.warnings, `${id} ${mode} preview`).toEqual([]);
        for (const example of entry?.examples ?? []) {
          if (example.mode !== 'values') continue;
          const drawing = drawIn(catalog, entry!, example.values ?? {}, mode);
          expect(drawing.warnings, `${id} ${mode}: ${example.name}`).toEqual([]);
        }
      }
    },
  );

  it('a remote image is a string field and the component is formatVersion 3 or 4', () => {
    const catalog = sharedCatalog;
    for (const [id, key] of [
      ['image', 'url'],
      ['card', 'media'],
      ['list-item', 'leadingImage'],
    ] as const) {
      expect(typeOf(id).fields.find((f) => f.key === key)?.type, id).toBe('string');
      expect([3, 4], id).toContain(findEntry(catalog, id)?.component?.formatVersion);
    }
  });

  it('navigation-bar and bottom-sheet repeat the table rows (component with repeat)', () => {
    const catalog = sharedCatalog;
    for (const id of [
      ...['navigation-bar', 'bottom-sheet', 'dropdown-menu', 'navigation-rail'],
      ...['short-navigation-bar', 'navigation-drawer', 'tabs', 'carousel'],
    ]) {
      expect(findEntry(catalog, id)?.component?.formatVersion, id).toBeGreaterThanOrEqual(
        2,
      );
      expect(text(`components/${id}.json`), id).toContain('"type": "repeat"');
    }
  });

  it('every values example of a type with repeat over a table field brings the rows (decision 25 of #897)', () => {
    /** The `table` fields the component repeats (`repeat.field`), at any depth. */
    const repeated = (node: unknown, out = new Set<string>()): Set<string> => {
      if (Array.isArray(node)) node.forEach((n) => repeated(n, out));
      else if (typeof node === 'object' && node !== null) {
        const n = node as Record<string, unknown>;
        if (n.type === 'repeat' && typeof n.field === 'string') out.add(n.field);
        Object.values(n).forEach((v) => repeated(v, out));
      }
      return out;
    };
    const checked: string[] = [];
    for (const type of types) {
      if (type.component === undefined) continue;
      const component = JSON.parse(text(type.component)) as { template: unknown };
      const tables = new Set(
        type.fields.filter((f) => f.type === 'table').map((f) => f.key),
      );
      const fields = [...repeated(component.template)].filter((f) => tables.has(f));
      if (fields.length === 0) continue;
      checked.push(type.id);
      (type.examples ?? []).forEach((example, i) => {
        if (example.values === undefined) return;
        for (const field of fields) {
          const rows = example.values[field];
          expect(
            Array.isArray(rows) && rows.length >= 1,
            `${type.id}, example ${i} "${example.name}": the field "${field}" has no rows`,
          ).toBe(true);
        }
      });
    }
    expect(checked.sort()).toEqual(
      [
        ...['bottom-sheet', 'carousel', 'dropdown-menu', 'navigation-bar'],
        ...['navigation-drawer', 'navigation-rail', 'segmented-button'],
        ...['short-navigation-bar', 'tabs'],
      ].sort(),
    );
  });
});

// --- M1 of the "faithful Material 3" stage: tokens, icons and the migration pattern -------------------

type Rec = Record<string, unknown>;
const specRaw = JSON.parse(text(SPEC_FILE)) as Rec;
const tokenValues = (specRaw.tokens as { values: Rec } | undefined)?.values ?? {};
const snake = (name: string): string =>
  name.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase();
const iconSet = JSON.parse(text('icons/material-icons.json') || '{"icons":{}}') as {
  format: string;
  formatVersion: number;
  icons: Record<string, { mirror?: boolean; paths: { d: string }[] }>;
};

describe('Material 3 (Compose) library v2 tokens', () => {
  it('has every color role of ColorLightTokens and ColorDarkTokens, with both modes and the .kt value', () => {
    const roles = Object.keys(reference.colors);
    expect(roles).toHaveLength(48);
    for (const role of roles) {
      const expected = reference.colors[role as keyof typeof reference.colors];
      expect(tokenValues[role], role).toEqual({
        light: expected.light,
        dark: expected.dark,
      });
    }
    // `shadow` does not come from ColorLightTokens: it is ColorSchemeKeyTokens.Shadow (black) in both modes.
    expect(tokenValues.shadow).toEqual({ light: '#000000', dark: '#000000' });
  });

  it('has the 15 typography scales with size, line-height, weight and tracking, and the Roboto font-sans', () => {
    const scales = Object.keys(reference.typography);
    expect(scales).toHaveLength(15);
    for (const scale of scales) {
      const expected = reference.typography[scale as keyof typeof reference.typography];
      for (const prop of ['size', 'line-height', 'weight', 'tracking'] as const) {
        expect(tokenValues[`${scale}-${prop}`], `${scale}-${prop}`).toBe(expected[prop]);
      }
    }
    expect(tokenValues['body-large-size']).toBe(16);
    expect(String(tokenValues['font-sans'])).toMatch(/^Roboto\b/);
  });

  it('has shape, elevation and state', () => {
    for (const [name, value] of Object.entries(reference.shapes)) {
      expect(tokenValues[name], name).toBe(value);
    }
    expect(tokenValues['corner-full']).toBeGreaterThanOrEqual(1000);
    for (let n = 1; n <= 5; n++) {
      expect(typeof tokenValues[`elevation-${n}-blur`], `elevation-${n}-blur`).toBe(
        'number',
      );
      expect(typeof tokenValues[`elevation-${n}-y`], `elevation-${n}-y`).toBe('number');
    }
    expect(tokenValues['elevation-1-blur']).toBeLessThan(
      Number(tokenValues['elevation-5-blur']),
    );
    expect(tokenValues['state-disabled-content']).toBe(0.38);
    expect(tokenValues['state-disabled-container']).toBe(0.12);
  });

  it('resolves primary to different colors in light and dark', () => {
    const light = resolveTokens(spec.tokens, {}, 'light');
    const dark = resolveTokens(spec.tokens, {}, 'dark');
    expect(light.primary).toBe('#6750A4');
    expect(dark.primary).toBe('#D0BCFF');
    expect(light.primary).not.toBe(dark.primary);
  });
});

describe('Material 3 (Compose) library v2 icon set', () => {
  it('is a valid mapping-icons (the library validates with 0 errors and only the known warnings (provisional, #1774) at the three levels)', () => {
    expect(iconSet.format).toBe('mapping-icons');
    expect(iconSet.formatVersion).toBe(2);
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
    expect(report.summary.level).toBe(3);
  }, 30_000);

  it('covers every suggestion (by Compose name) through the $switch of the icon node, and what the components draw on their own', () => {
    const field = typeOf('icon').fields.find((f) => f.key === 'imageVector');
    const suggestions = field?.type === 'string' ? (field.suggestions ?? []) : [];
    expect(suggestions.length).toBeGreaterThan(0);
    const iconComponent = JSON.parse(text('components/icon.json')) as {
      template: { children: { type: string; name: { cases: Record<string, string> } }[] };
    };
    const node = iconComponent.template.children[0]!;
    expect(node.type).toBe('icon');
    for (const name of suggestions) {
      expect(node.name.cases[name], name).toBe(snake(name));
      expect(iconSet.icons[snake(name)], name).toBeDefined();
    }
    for (const name of SELF_DRAWN_ICONS) expect(iconSet.icons[name], name).toBeDefined();
  });

  it('an icon name outside the list becomes the placeholder, with the warning', () => {
    const catalog = sharedCatalog;
    const entry = findEntry(catalog, 'icon')!;
    const drawing = drawIn(catalog, entry, { imageVector: 'DoesNotExist' }, 'light');
    expect(drawing.warnings.join('|')).toMatch(/unknown icon/);
  });
});

describe('components migrated in M1 (text, icon, divider, surface)', () => {
  it.each(MIGRATED)(
    '%s is format 4, with no literal color and no literal family',
    (id) => {
      const raw = text(`components/${id}.json`);
      const component = JSON.parse(raw) as Rec;
      expect(component.formatVersion).toBe(4);
      expect(raw).not.toMatch(/"family"/);
      // no #hex or rgb()/rgba() in the file (color only through `$token` or `none`; pure layout has no color)
      expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(raw).not.toMatch(/rgba?\(/);
    },
  );

  it('text drops the family and uses the typography and color tokens', () => {
    const catalog = sharedCatalog;
    const entry = findEntry(catalog, 'text')!;
    const light = drawIn(
      catalog,
      entry,
      { text: 'Hello', style: 'titleMedium' },
      'light',
    );
    const dark = drawIn(catalog, entry, { text: 'Hello', style: 'titleMedium' }, 'dark');
    const textNode = (d: typeof light) => findText(d.root);
    expect(textNode(light)?.style.fontSize).toBe(16);
    expect(textNode(light)?.style.fontWeight).toBe(500);
    expect(textNode(light)?.style.lineHeight).toBe(24);
    expect(textNode(light)?.style.letterSpacing).toBe(0.2);
    expect(solid(textNode(light)?.fills ?? [])).toBe('#1D1B20');
    expect(solid(textNode(dark)?.fills ?? [])).toBe('#E6E0E9');
    expect(textNode(light)?.style.fontFamily).toMatch(/Roboto/);
  });

  it('surface changes color between light and dark and only applies tonal elevation over the surface color', () => {
    const catalog = sharedCatalog;
    const entry = findEntry(catalog, 'surface')!;
    const light = drawIn(
      catalog,
      entry,
      { color: 'surface', tonalElevation: 3 },
      'light',
    );
    const dark = drawIn(catalog, entry, { color: 'surface', tonalElevation: 3 }, 'dark');
    expect(solid(light.root.fills)).toBe('#FEF7FF');
    expect(solid(dark.root.fills)).toBe('#141218');
    const other = drawIn(
      catalog,
      entry,
      { color: 'primary', tonalElevation: 3 },
      'light',
    );
    expect(solid(other.root.fills)).toBe('#6750A4');
    const tonal = (d: typeof light) =>
      // pt-BR kept: node name of the material3-compose library (libraries/*.json, outside this phase)
      d.root.children.find((c) => c.name === 'elevação tonal');
    expect(tonal(other)?.visible ?? false).toBe(false);
    expect(tonal(light)?.visible).toBe(true);
  });
});

describe('Material 3 (Compose) library update with the numeric slider', () => {
  it('the slider break (enum → number) has a migration in every earlier version', () => {
    // Versions 1 to 5 had the same types; only the slider's `value`, `valueStart` and `valueEnd`
    // were `enum` in tenths. The current version declares them `number` and covers them with `fill-field`.
    const tenths = Array.from({ length: 11 }, (_, i) => String(i / 10));
    const previous = JSON.parse(JSON.stringify(spec)) as Spec;
    (previous as { version: number }).version = 5;
    (previous as { formatVersion: number }).formatVersion = 9;
    delete (previous as { migrations?: unknown }).migrations;
    for (const layer of previous.layers)
      for (const type of layer.annotationTypes)
        if (type.id === 'slider')
          type.fields = type.fields.map((f) =>
            ['value', 'valueStart', 'valueEnd'].includes(f.key)
              ? ({
                  key: f.key,
                  type: 'enum',
                  options: tenths,
                  default: '0.5',
                } as typeof f)
              : f,
          );
    expect(missingMigrations(previous, spec)).toEqual([]);
    expect(spec.migrations?.map((m) => [m.from, m.to])).toEqual([
      [1, 14],
      [2, 14],
      [3, 14],
      [4, 14],
      [5, 14],
    ]);
    const report = validateLibrary({ files, specPath: SPEC_FILE, previous });
    expect(report.errors).toEqual([]);
  }, 30_000);
});

describe('MC5 (#1033): every example draws without warnings at the size and at the fitted size', () => {
  const catalog = buildCatalog(files);
  const cases = ALL_TYPES.flatMap((id) => {
    const entry = findEntry(catalog, id)!;
    return entry.examples.map((example) => ({
      id,
      name: example.name,
      values: example.values ?? {},
    }));
  });

  it.each(['light', 'dark'] as const)(
    'each example, at the size and at the fitted size, without warnings (%s)',
    (mode) => {
      expect(cases.length).toBeGreaterThan(100);
      for (const { id, name, values } of cases) {
        const entry = findEntry(catalog, id)!;
        const atSize = drawIn(catalog, entry, values, mode);
        expect(atSize.warnings, `${id} / ${name} at size`).toEqual([]);
        const fitted = drawFitted(id, values, mode);
        expect(
          fitted.drawing.warnings,
          `${id} / ${name} at ${fitted.box.width}×${fitted.box.height}`,
        ).toEqual([]);
      }
    },
  );
});

// R5 (#1110, decisions 16 and 20 of #1096): Material 3 adopts the reading direction and the anchor.
describe('reading direction and anchor in the Material 3 (Compose) library (R5, #1110)', () => {
  const autoMirrored = new Set<string>(
    (autoMirroredFixture as { names: string[] }).names,
  );
  const pascal = (name: string): string =>
    name
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  const catalog = buildCatalog(files);

  it('the icon set is formatVersion 2 and the specialization is at version 14', () => {
    expect(iconSet.formatVersion).toBe(2);
    expect(spec.version).toBe(14);
  });

  it('every androidx AutoMirrored icon has mirror: true in the set, and no other does', () => {
    const marked: string[] = [];
    for (const [name, icon] of Object.entries(iconSet.icons)) {
      const expected = autoMirrored.has(pascal(name));
      expect(icon.mirror === true, `${name}: mirror`).toBe(expected);
      if (!expected) expect(icon.mirror, `${name}: without the key`).toBeUndefined();
      if (expected) marked.push(name);
    }
    for (const name of [
      ...['arrow_back', 'arrow_forward', 'keyboard_arrow_left', 'keyboard_arrow_right'],
      ...['list', 'send', 'help'],
    ])
      expect(marked, name).toContain(name);
    expect(marked.length).toBeGreaterThanOrEqual(24);
  });

  /** The instance's anchor (units): the center relative to the box and the logical side. */
  const anchorOf = (
    side: 'top' | 'bottom' | 'start' | 'end',
    centerX: number,
    centerY: number,
  ) => ({ side, centerX, centerY, width: 40, height: 40 });

  type Values = Parameters<typeof instantiate>[1];
  function drawWith(
    id: string,
    values: Values,
    extra: {
      mode?: 'light' | 'dark';
      direction?: 'ltr' | 'rtl';
      anchor?: ReturnType<typeof anchorOf>;
      box?: { width: number; height: number };
    } = {},
  ) {
    const entry = findEntry(catalog, id)!;
    const component = entry.component!;
    const box = { x: 0, y: 0, ...(extra.box ?? component.size) };
    const result = instantiate(
      component,
      { ...defaultValues(entry.type), ...values },
      box,
      {
        ...instantiateOptions(catalog, extra.mode ?? 'light'),
        ...(extra.direction === undefined ? {} : { direction: extra.direction }),
        ...(extra.anchor === undefined ? {} : { anchor: extra.anchor }),
      },
    );
    const boxes = absoluteBoxes(result.root);
    const nodes = [...walk(result.root)];
    return { ...result, boxes, nodes, box };
  }

  /** The visible arrows drawn by the tooltip. */
  const carets = (drawn: ReturnType<typeof drawWith>) =>
    drawn.nodes.filter((n) => n.name === 'seta' && n.visible);

  describe('the anchored tooltip draws the arrow under the center of the anchor', () => {
    // The 120 × 24 plain tooltip and the 40 × 40 anchor 4 apart (Compose's spacing).
    const W = 120;
    const H = 24;
    const box = { width: W, height: H };
    const cases = [
      {
        side: 'top',
        anchor: anchorOf('top', 50, H + 4 + 20),
        x: 50 - 8,
        y: H,
        w: 16,
        h: 8,
      },
      {
        side: 'bottom',
        anchor: anchorOf('bottom', 70, -4 - 20),
        x: 70 - 8,
        y: -8,
        w: 16,
        h: 8,
      },
      {
        side: 'start',
        anchor: anchorOf('start', W + 4 + 20, 10),
        x: W,
        y: 10 - 8,
        w: 8,
        h: 16,
      },
      {
        side: 'end',
        anchor: anchorOf('end', -4 - 20, 16),
        x: -8,
        y: 16 - 8,
        w: 8,
        h: 16,
      },
    ] as const;

    it.each(cases)(
      'side $side (ltr): the 16 × 8 arrow on the edge facing the anchor, at its center',
      ({ anchor, x, y, w, h }) => {
        const drawn = drawWith('tooltip', { text: 'Help' }, { anchor, box });
        expect(drawn.warnings).toEqual([]);
        const [caret, ...rest] = carets(drawn);
        expect(rest).toEqual([]);
        const at = drawn.boxes.get(caret!.id)!;
        expect({ x: at.x, y: at.y, w: caret!.width, h: caret!.height }).toEqual({
          x,
          y,
          w,
          h,
        });
        expect(caret!.type).toBe('path');
      },
    );

    it('in rtl, start and end swap edges and the arrow flips to keep pointing at the anchor', () => {
      const start = drawWith(
        'tooltip',
        { text: 'Help' },
        { anchor: cases[2].anchor, box, direction: 'rtl' },
      );
      const end = drawWith(
        'tooltip',
        { text: 'Help' },
        { anchor: cases[3].anchor, box, direction: 'rtl' },
      );
      // `start` in rtl: the anchor is to the left of the tooltip, and the arrow comes out of the left edge.
      const startCaret = carets(start)[0]!;
      const endCaret = carets(end)[0]!;
      const horizontalExtent = (n: typeof startCaret) => {
        const tx = n.transform[4];
        return n.transform[0] < 0 ? [tx - n.width, tx] : [tx, tx + n.width];
      };
      expect(horizontalExtent(startCaret)).toEqual([-8, 0]);
      expect(horizontalExtent(endCaret)).toEqual([W, W + 8]);
      // Mirrored (rtl): the horizontal scale is negative on both.
      expect(startCaret.transform[0]).toBeLessThan(0);
      expect(endCaret.transform[0]).toBeLessThan(0);
    });

    it('in rtl, top and bottom follow the physical center of the anchor (the x of the pseudo-field does not mirror)', () => {
      for (const anchorCase of [cases[0], cases[1]]) {
        const ltr = drawWith(
          'tooltip',
          { text: 'Help' },
          { anchor: anchorCase.anchor, box },
        );
        const rtl = drawWith(
          'tooltip',
          { text: 'Help' },
          { anchor: anchorCase.anchor, box, direction: 'rtl' },
        );
        const at = (d: typeof ltr) => d.boxes.get(carets(d)[0]!.id)!;
        expect(at(rtl).x, anchorCase.side).toBe(at(ltr).x);
        expect(at(rtl).y, anchorCase.side).toBe(anchorCase.y);
        expect(carets(rtl)[0]!.transform[0]).toBeGreaterThan(0);
        expect(rtl.warnings).toEqual([]);
      }
    });

    it('without an anchor, no arrow, and no warning (as today)', () => {
      const drawn = drawWith('tooltip', { text: 'Help' }, { box });
      expect(carets(drawn)).toEqual([]);
      expect(drawn.warnings).toEqual([]);
    });

    it('the rich tooltip also gets the arrow, in the card color, in light and dark', () => {
      for (const mode of ['light', 'dark'] as const) {
        const drawn = drawWith(
          'tooltip',
          { style: 'rich', text: 'Rich tooltip text', title: 'Title' },
          { anchor: cases[0].anchor, box: { width: 200, height: 80 }, mode },
        );
        expect(drawn.warnings, mode).toEqual([]);
        const [caret] = carets(drawn);
        expect(caret, mode).toBeDefined();
        const tokens = resolveTokens(spec.tokens, {}, mode);
        expect(solid(caret!.fills), mode).toBe(tokens['surface-container']);
      }
    });

    it('the plain arrow is inverse-surface and follows the center of the anchor off the center of the tooltip', () => {
      const drawn = drawWith(
        'tooltip',
        { text: 'Help' },
        { anchor: anchorOf('top', 100, 48), box },
      );
      const [caret] = carets(drawn);
      expect(drawn.boxes.get(caret!.id)!.x).toBe(100 - 8);
      expect(solid(caret!.fills)).toBe(
        resolveTokens(spec.tokens, {}, 'light')['inverse-surface'],
      );
    });
  });

  describe('anchor on the root of the tooltip, the badge and the dropdown-menu (the numbers of the commit)', () => {
    const rootAnchor = (id: string) => findEntry(catalog, id)!.component!.anchor;

    it('tooltip: top/center, 4 of spacing (SpacingBetweenTooltipAndAnchor)', () => {
      expect(rootAnchor('tooltip')).toEqual({
        side: 'top',
        align: 'center',
        offset: { main: 4, cross: 0 },
      });
    });

    it('badge: end/start, the 6 dot over the edge (BadgeOffset)', () => {
      expect(rootAnchor('badge')).toEqual({
        side: 'end',
        align: 'start',
        offset: { main: -6, cross: 0 },
      });
    });

    it('dropdown-menu: bottom/start, no offset (DropdownMenu offset 0, 0)', () => {
      expect(rootAnchor('dropdown-menu')).toEqual({
        side: 'bottom',
        align: 'start',
        offset: { main: 0, cross: 0 },
      });
    });

    it('the three defaults come out in pixels through the density of the container', () => {
      const file = findEntry(catalog, 'tooltip')!.component!;
      expect(componentAnchorDefaults(file, 3).offset).toEqual({ main: 12, cross: 0 });
    });
  });

  describe('the rtl screen: top-app-bar, list-item and icon arrow-back draw mirrored', () => {
    /** The horizontal `transform` of the first path of the `name` icon. */
    const iconScale = (drawn: ReturnType<typeof drawWith>, name: string): number => {
      const group = drawn.nodes.find((n) => n.type === 'group' && n.name === name) as
        { children: { transform: number[] }[] } | undefined;
      expect(group, `icon ${name}`).toBeDefined();
      return group!.children[0]!.transform[0]!;
    };

    it('the ArrowBack icon flips in rtl and not in ltr', () => {
      const values = { imageVector: 'ArrowBack', contentDescription: 'Back' };
      expect(iconScale(drawWith('icon', values), 'arrow_back')).toBeGreaterThan(0);
      expect(
        iconScale(drawWith('icon', values, { direction: 'rtl' }), 'arrow_back'),
      ).toBeLessThan(0);
    });

    it('the rtl top-app-bar mirrors the back arrow and keeps it in ltr', () => {
      const values = { title: 'Profile', style: 'center', navigationIcon: 'ArrowBack' };
      expect(iconScale(drawWith('top-app-bar', values), 'arrow_back')).toBeGreaterThan(0);
      const rtl = drawWith('top-app-bar', values, { direction: 'rtl' });
      expect(iconScale(rtl, 'arrow_back')).toBeLessThan(0);
      expect(rtl.warnings).toEqual([]);
    });

    it('the rtl list-item flips the trailing chevron and puts the leading icon on the right', () => {
      const values = {
        headlineContent: 'Meeting',
        leadingIcon: 'DateRange',
        trailingIcon: 'KeyboardArrowRight',
      };
      const ltr = drawWith('list-item', values);
      const rtl = drawWith('list-item', values, { direction: 'rtl' });
      expect(iconScale(ltr, 'keyboard_arrow_right')).toBeGreaterThan(0);
      expect(iconScale(rtl, 'keyboard_arrow_right')).toBeLessThan(0);
      const lead = (d: typeof ltr) =>
        d.boxes.get(d.nodes.find((n) => n.name === 'date_range')!.id)!.x;
      expect(lead(ltr)).toBeLessThan(ltr.box.width / 2);
      expect(lead(rtl)).toBeGreaterThan(rtl.box.width / 2);
      expect(rtl.warnings).toEqual([]);
    });

    it('the "Voltar" example of the icon and the top-app-bar one exist and cover the back arrow', () => {
      // pt-BR kept: name of an example of the material3-compose library (libraries/*.json, outside this phase)
      const icon = typeOf('icon').examples?.find((e) => e.name === 'Voltar');
      expect(icon?.values).toMatchObject({ imageVector: 'ArrowBack' });
      const bar = typeOf('top-app-bar').examples?.some(
        (e) => (e.values as Record<string, unknown>)?.navigationIcon === 'ArrowBack',
      );
      expect(bar).toBe(true);
    });
  });

  describe('every example draws without warnings in light and dark, in ltr and in rtl', () => {
    const cases = ALL_TYPES.flatMap((id) =>
      (findEntry(catalog, id)?.examples ?? []).map((example) => ({
        id,
        name: example.name,
        values: (example.values ?? {}) as Values,
      })),
    );

    it.each([
      ['light', 'ltr'],
      ['light', 'rtl'],
      ['dark', 'ltr'],
      ['dark', 'rtl'],
    ] as const)('mode %s, direction %s', (mode, direction) => {
      expect(cases.length).toBeGreaterThan(100);
      for (const { id, name, values } of cases) {
        const drawn = drawWith(id, values, { mode, direction });
        expect(drawn.warnings, `${id} / ${name}`).toEqual([]);
      }
    });
  });
});
