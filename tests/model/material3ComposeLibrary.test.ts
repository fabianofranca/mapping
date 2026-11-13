// Biblioteca Material 3 (Compose) (`libraries/material3-compose/`, pronta para uso e aplicada pela pessoa):
// a especialização (`formatVersion` 15, biblioteca v2: tokens claro e escuro e conjunto de ícones) com as estruturas de layout e conteúdo e os componentes do
// Material 3 do Jetpack Compose, 50 tipos em três camadas, cada um com `code.compose` (símbolo e arquivo no
// androidx, no commit fixado), componente que desenha, documento e exemplos. As variantes que trocam o
// símbolo (`variants`) e os ícones por `suggestions` seguem o padrão da biblioteca.
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
  findText,
  solid,
  spec,
  text,
  typeOf,
  types,
} from '../support/material3Library';
import { drawFitted } from '../support/material3Fitted';

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

/** As 30 sugestões da biblioteca v1: continuam todas no subconjunto da v2 (decisão 11). */
const V1_ICONS = [
  ...['Home', 'Search', 'Person', 'Menu', 'MoreVert', 'Add', 'Check', 'Close'],
  ...['ArrowBack', 'Favorite', 'Edit', 'Delete', 'Share', 'Notifications'],
  ...['Settings', 'Info', 'Star', 'Email', 'Phone', 'Place', 'DateRange'],
  ...['ShoppingCart', 'AccountCircle', 'KeyboardArrowRight', 'KeyboardArrowDown'],
  ...['Refresh', 'Clear', 'Done', 'Lock', 'List'],
];
/** Os ícones que os componentes ainda desenham por conta própria e que o subconjunto precisa ter. */
const SELF_DRAWN_ICONS = [
  ...['arrow_drop_down', 'check', 'close', 'schedule', 'calendar_today', 'search'],
  ...['menu', 'more_vert', 'edit', 'keyboard', 'keyboard_arrow_left'],
  ...['keyboard_arrow_right', 'keyboard_arrow_down'],
];
/** Os quatro componentes migrados na M1 (formato 4, sem cor literal, sem `family`). */
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

/** As fichas de assinatura que o `code.compose` e os casos de `variants` citam (S5 da #1079). */
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

describe('biblioteca Material 3 (Compose)', () => {
  it('tem a especialização, as fontes, um componente e um documento por tipo', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
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

  it('todo documento fala a Fidelidade em unidades do componente (decisão 11 da #1085)', () => {
    const docs = files.filter((f) => f.path.startsWith('docs/'));
    expect(docs).toHaveLength(50);
    for (const doc of docs) {
      const body = text(doc.path);
      expect(body, doc.path).toContain(
        '1 dp = 1 unidade do componente; a densidade do container converte para pixels da imagem',
      );
      expect(body, doc.path).not.toContain('1 dp = 1 px do componente');
    }
  });

  it('tem 50 tipos nas camadas layout, content e components, na ordem', () => {
    expect(spec.layers.map((l) => l.id)).toEqual(Object.keys(LAYERS));
    for (const layer of spec.layers) {
      expect(layer.annotationTypes.map((t) => t.id)).toEqual(LAYERS[layer.id]);
    }
    expect(types).toHaveLength(50);
  });

  it('valida sem erro nos três níveis, com os avisos conhecidos', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      level: 3,
      types: 50,
      components: 50,
      docs: 50,
    });
    // Só os avisos conhecidos `parâmetro fora da ficha` (provisório: decisão do dono pendente no bug #1774; curadoria
    // na #1134): as fontes vêm no pacote e o `code` cobre os campos que o desenho não usa. O conjunto não pode crescer
    // nem ficar com item que sumiu.
    const known = unknownWarnings(report.warnings);
    expect(known.unexpected).toEqual([]);
    expect(known.missing).toEqual([]);
  });

  it('é a formatVersion 16, versão 12, com tokens nos modos light e dark e a plataforma compose no androidx fixado no commit', () => {
    expect(spec).toMatchObject({
      formatVersion: 16,
      id: 'material3-compose',
      version: 12,
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
    '%s desenha o preview e os exemplos sem aviso no tamanho inicial, nos modos light e dark',
    (id) => {
      const catalog = buildCatalog(files);
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

  it('imagem remota é campo string e o componente é formatVersion 3 ou 4', () => {
    const catalog = buildCatalog(files);
    for (const [id, key] of [
      ['image', 'url'],
      ['card', 'media'],
      ['list-item', 'leadingImage'],
    ] as const) {
      expect(typeOf(id).fields.find((f) => f.key === key)?.type, id).toBe('string');
      expect([3, 4], id).toContain(findEntry(catalog, id)?.component?.formatVersion);
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

  it('todo exemplo de values de um tipo com repeat sobre um campo table traz as linhas (decisão 25 da #897)', () => {
    /** Os campos `table` que o componente repete (`repeat.field`), em qualquer profundidade. */
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
            `${type.id}, exemplo ${i} "${example.name}": o campo "${field}" sem linhas`,
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

// --- M1 da etapa "Material 3 fiel": tokens, ícones e o padrão de migração -------------------

type Rec = Record<string, unknown>;
const specRaw = JSON.parse(text(SPEC_FILE)) as Rec;
const tokenValues = (specRaw.tokens as { values: Rec } | undefined)?.values ?? {};
const snake = (name: string): string =>
  name.replace(/(?<!^)([A-Z])/g, '_$1').toLowerCase();
const iconSet = JSON.parse(text('icons/material-icons.json') || '{"icons":{}}') as {
  format: string;
  formatVersion: number;
  icons: Record<string, { paths: { d: string }[] }>;
};

describe('tokens da biblioteca Material 3 (Compose) v2', () => {
  it('tem todo papel de cor do ColorLightTokens e do ColorDarkTokens, com os dois modos e o valor do .kt', () => {
    const roles = Object.keys(reference.colors);
    expect(roles).toHaveLength(48);
    for (const role of roles) {
      const expected = reference.colors[role as keyof typeof reference.colors];
      expect(tokenValues[role], role).toEqual({
        light: expected.light,
        dark: expected.dark,
      });
    }
    // O `shadow` não vem do ColorLightTokens: é o ColorSchemeKeyTokens.Shadow (preto) nos dois modos.
    expect(tokenValues.shadow).toEqual({ light: '#000000', dark: '#000000' });
  });

  it('tem as 15 escalas de tipografia com size, line-height, weight e tracking, e a font-sans Roboto', () => {
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

  it('tem forma, elevação e estado', () => {
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

  it('resolve o primary para cores diferentes em light e dark', () => {
    const light = resolveTokens(spec.tokens, {}, 'light');
    const dark = resolveTokens(spec.tokens, {}, 'dark');
    expect(light.primary).toBe('#6750A4');
    expect(dark.primary).toBe('#D0BCFF');
    expect(light.primary).not.toBe(dark.primary);
  });
});

describe('conjunto de ícones da biblioteca Material 3 (Compose) v2', () => {
  it('é um mapping-icons válido (a biblioteca valida com 0 erros e só os avisos conhecidos (provisório, #1774) nos três níveis)', () => {
    expect(iconSet.format).toBe('mapping-icons');
    expect(iconSet.formatVersion).toBe(1);
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(unknownWarnings(report.warnings).unexpected).toEqual([]);
    expect(report.summary.level).toBe(3);
  });

  it('cobre toda sugestão (no nome do Compose) pelo $switch do nó icon, e o que os componentes desenham sozinhos', () => {
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

  it('o nome de ícone fora da lista vira o reservado, com o aviso', () => {
    const catalog = buildCatalog(files);
    const entry = findEntry(catalog, 'icon')!;
    const drawing = drawIn(catalog, entry, { imageVector: 'NaoExiste' }, 'light');
    expect(drawing.warnings.join('|')).toMatch(/ícone desconhecido/);
  });
});

describe('componentes migrados na M1 (text, icon, divider, surface)', () => {
  it.each(MIGRATED)('%s é formato 4, sem cor literal e sem family literal', (id) => {
    const raw = text(`components/${id}.json`);
    const component = JSON.parse(raw) as Rec;
    expect(component.formatVersion).toBe(4);
    expect(raw).not.toMatch(/"family"/);
    // nenhum #hex nem rgb()/rgba() no arquivo (cor só por `$token` ou `none`; layout puro não tem cor)
    expect(raw).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(raw).not.toMatch(/rgba?\(/);
  });

  it('o text tira a family e usa os tokens de tipografia e de cor', () => {
    const catalog = buildCatalog(files);
    const entry = findEntry(catalog, 'text')!;
    const light = drawIn(catalog, entry, { text: 'Olá', style: 'titleMedium' }, 'light');
    const dark = drawIn(catalog, entry, { text: 'Olá', style: 'titleMedium' }, 'dark');
    const textNode = (d: typeof light) => findText(d.root);
    expect(textNode(light)?.style.fontSize).toBe(16);
    expect(textNode(light)?.style.fontWeight).toBe(500);
    expect(textNode(light)?.style.lineHeight).toBe(24);
    expect(textNode(light)?.style.letterSpacing).toBe(0.2);
    expect(solid(textNode(light)?.fills ?? [])).toBe('#1D1B20');
    expect(solid(textNode(dark)?.fills ?? [])).toBe('#E6E0E9');
    expect(textNode(light)?.style.fontFamily).toMatch(/Roboto/);
  });

  it('o surface muda de cor entre light e dark e só põe a elevação tonal sobre a cor surface', () => {
    const catalog = buildCatalog(files);
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
      d.root.children.find((c) => c.name === 'elevação tonal');
    expect(tonal(other)?.visible ?? false).toBe(false);
    expect(tonal(light)?.visible).toBe(true);
  });
});

describe('atualização da biblioteca Material 3 (Compose) com o slider numérico', () => {
  it('a quebra do slider (enum → number) tem migração em toda versão anterior', () => {
    // As versões 1 a 5 tinham os mesmos tipos; só o `value`, o `valueStart` e o `valueEnd` do
    // slider eram `enum` em décimos. A versão atual os declara `number` e cobre com `fill-field`.
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
      [1, 12],
      [2, 12],
      [3, 12],
      [4, 12],
      [5, 12],
    ]);
    const report = validateLibrary({ files, specPath: SPEC_FILE, previous });
    expect(report.errors).toEqual([]);
  });
});

describe('MC5 (#1033): todo exemplo desenha sem aviso no size e no tamanho ajustado', () => {
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
    'cada exemplo, no size e no tamanho ajustado, sem aviso (%s)',
    (mode) => {
      expect(cases.length).toBeGreaterThan(100);
      for (const { id, name, values } of cases) {
        const entry = findEntry(catalog, id)!;
        const atSize = drawIn(catalog, entry, values, mode);
        expect(atSize.warnings, `${id} / ${name} no size`).toEqual([]);
        const fitted = drawFitted(id, values, mode);
        expect(
          fitted.drawing.warnings,
          `${id} / ${name} em ${fitted.box.width}×${fitted.box.height}`,
        ).toEqual([]);
      }
    },
  );
});
