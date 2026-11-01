// Biblioteca Material 3 (Compose) (`libraries/material3-compose/`, pronta para uso e aplicada pela pessoa):
// a especialização (`formatVersion` 9) com as estruturas de layout e conteúdo e os componentes do
// Material 3 do Jetpack Compose, 50 tipos em três camadas, cada um com `code.compose` (símbolo e arquivo no
// androidx, no commit fixado), componente que desenha, documento e exemplos. As variantes que trocam o
// símbolo (`variants`) e os ícones por `suggestions` seguem o padrão da biblioteca.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';
import type { Spec, SpecAnnotationType, SpecField } from '../../src/model/spec';
import { resolveCode } from '../../src/model/codeVariants';
import { buildCatalog, drawEntry, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';

const ROOT = join(__dirname, '../../libraries/material3-compose');
const SPEC_FILE = 'material3-compose.spec.json';
const COMMIT = '5113b82a4ed6416d6344efa50e41db8cb65928ff';

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

const ICONS = [
  ...['Home', 'Search', 'Person', 'Menu', 'MoreVert', 'Add', 'Check', 'Close'],
  ...['ArrowBack', 'Favorite', 'Edit', 'Delete', 'Share', 'Notifications'],
  ...['Settings', 'Info', 'Star', 'Email', 'Phone', 'Place', 'DateRange'],
  ...['ShoppingCart', 'AccountCircle', 'KeyboardArrowRight', 'KeyboardArrowDown'],
  ...['Refresh', 'Clear', 'Done', 'Lock', 'List'],
];
const ICON_KEYS = [
  ...['icon', 'imageVector', 'navigationIcon', 'actionIcon1', 'actionIcon2'],
  ...['actionIcon3', 'actionIcon4', 'floatingActionButton'],
  ...['leadingIcon', 'trailingIcon'],
];

const MATERIAL = 'androidx.compose.material3.';
const CAROUSEL = 'androidx.compose.material3.carousel.';
/** tipo → campo da variante e valor → símbolo esperado (o valor ausente cai no `default` do campo). */
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

/**
 * Avisos que a biblioteca aceita (arquivo, caminho, mensagem): as duas fontes que não vêm no
 * pacote. Os campos que só o `code` usa (modificadores, `contentDescription`) não avisam: o
 * validador os conta como usados pelo `code`.
 */
const FIXED_WARNINGS: [string, string, string][] = [
  [
    SPEC_FILE,
    'fonts[0].file',
    'arquivo da fonte "Roboto" não encontrado: fonts/Roboto-Regular.ttf; o desenho usa a fonte do sistema',
  ],
  [
    SPEC_FILE,
    'fonts[1].file',
    'arquivo da fonte "Roboto" não encontrado: fonts/Roboto-Medium.ttf; o desenho usa a fonte do sistema',
  ],
];

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';

function loadSpec(): Spec {
  const parsed = parseSpecText(text(SPEC_FILE));
  if (!parsed.ok) throw new Error('especialização inválida');
  return parsed.spec;
}
const spec = loadSpec();
const types: SpecAnnotationType[] = spec.layers.flatMap((l) => l.annotationTypes);
const typeOf = (id: string): SpecAnnotationType => {
  const t = types.find((x) => x.id === id);
  if (t === undefined) throw new Error(`tipo ${id} ausente`);
  return t;
};
const key3 = (w: readonly [string, string, string]): string => w.join('\u0000');

describe('biblioteca Material 3 (Compose)', () => {
  it('tem a especialização, as fontes, um componente e um documento por tipo', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'fonts/LEIA-ME.txt',
        ...ALL_TYPES.map((id) => `components/${id}.json`),
        ...ALL_TYPES.map((id) => `docs/${id}.md`),
      ].sort(),
    );
  });

  it('tem 50 tipos nas camadas layout, content e components, na ordem', () => {
    expect(spec.layers.map((l) => l.id)).toEqual(Object.keys(LAYERS));
    for (const layer of spec.layers) {
      expect(layer.annotationTypes.map((t) => t.id)).toEqual(LAYERS[layer.id]);
    }
    expect(types).toHaveLength(50);
  });

  it('valida sem erro nos três níveis, com os avisos conhecidos', () => {
    expect(
      validateLibrary({ files, specPath: SPEC_FILE }).warnings.filter((w) =>
        w.message.includes('não é usado pelo desenho'),
      ),
    ).toEqual([]);
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      level: 3,
      types: 50,
      components: 50,
      docs: 50,
    });
    const all = report.warnings.map((w): [string, string, string] => [
      w.file,
      w.path,
      w.message,
    ]);
    const fixedKeys = new Set(FIXED_WARNINGS.map(key3));
    // As duas fontes ausentes; nenhum campo fica sem uso (o desenho ou o `code` o usa).
    expect(
      all
        .filter((w) => fixedKeys.has(key3(w)))
        .map(key3)
        .sort(),
    ).toEqual(FIXED_WARNINGS.map(key3).sort());
    // O resto é só tamanho mínimo aproximado; nenhum aviso no tamanho inicial.
    const rest = all.filter((w) => !fixedKeys.has(key3(w)));
    for (const [, , message] of rest) {
      expect(message).toContain('tamanho mínimo');
      expect(message.endsWith('(aproximado)')).toBe(true);
    }
    expect(all.some(([, , m]) => m.includes('tamanho inicial'))).toBe(false);
  });

  it('é a formatVersion 9 com a plataforma compose no androidx fixado no commit', () => {
    expect(spec).toMatchObject({
      formatVersion: 9,
      id: 'material3-compose',
      version: 1,
    });
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

  it('todo tipo tem code.compose com símbolo do androidx e arquivo em compose/', () => {
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

  it('toda variants resolve para um símbolo, para cada opção do campo', () => {
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
    '%s resolve cada valor para o símbolo certo',
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
      // Valor ausente cai no default do campo.
      const absent = resolveCode(code!, {}, type.fields);
      const dflt = field?.type === 'enum' ? field.default : undefined;
      const dfltSymbol = expected.symbols[dflt ?? '']!;
      expect(absent.symbol).toBe(
        dfltSymbol.includes('.') ? dfltSymbol : MATERIAL + dfltSymbol,
      );
    },
  );

  it('o checkbox indeterminado soma params e values da base', () => {
    const type = typeOf('checkbox');
    const base = resolveCode(type.code!.compose!, { state: 'checked' }, type.fields);
    expect(base.params?.state).toBe('checked');
    expect(base.values?.state).toMatchObject({ checked: 'true', unchecked: 'false' });
    const tri = resolveCode(type.code!.compose!, { state: 'indeterminate' }, type.fields);
    expect(tri.symbol).toBe(`${MATERIAL}TriStateCheckbox`);
    expect(tri.params?.state).toBe('state');
    expect(tri.values?.state?.indeterminate).toBe('ToggleableState.Indeterminate');
  });

  it('todo campo de ícone é string com a mesma lista de sugestões', () => {
    let checked = 0;
    const check = (f: SpecField, where: string): void => {
      if (!ICON_KEYS.includes(f.key)) return;
      expect(f.type, where).toBe('string');
      expect(f.type === 'string' ? f.suggestions : undefined, where).toEqual(ICONS);
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
    '%s desenha o preview e os exemplos sem aviso no tamanho inicial',
    (id) => {
      const catalog = buildCatalog(files);
      expect(catalog.report.errors).toEqual([]);
      const entry = findEntry(catalog, id);
      expect(entry?.component).not.toBeNull();
      const preview = drawEntry(entry!, entry?.previewValues ?? {}, approximateMeasurer);
      expect(preview?.warnings, `${id} preview`).toEqual([]);
      for (const example of entry?.examples ?? []) {
        if (example.mode !== 'values') continue;
        const drawing = drawEntry(entry!, example.values ?? {}, approximateMeasurer);
        expect(drawing?.warnings, `${id}: ${example.name}`).toEqual([]);
      }
    },
  );

  it('imagem remota é campo string e o componente é formatVersion 3', () => {
    const catalog = buildCatalog(files);
    for (const [id, key] of [
      ['image', 'url'],
      ['card', 'media'],
      ['list-item', 'leadingImage'],
    ] as const) {
      expect(typeOf(id).fields.find((f) => f.key === key)?.type, id).toBe('string');
      expect(findEntry(catalog, id)?.component?.formatVersion, id).toBe(3);
    }
  });

  it('navigation-bar e bottom-sheet repetem as linhas da tabela (componente com repeat)', () => {
    const catalog = buildCatalog(files);
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
});
