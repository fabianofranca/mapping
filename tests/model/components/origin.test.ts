// Laboratório Componentes: declaração de origem executável (`origins` + `sources`).
import { describe, expect, it } from 'vitest';
import settings from '../../../lab/components/sdui/settings.sdui.json';
import {
  formatPath,
  parseFieldSources,
  parseOrigins,
  parsePath,
  readPath,
  translateSource,
  screenFromSource,
} from '../../../src/model/components/origin';
import type { LayoutNode } from '../../../src/model/components/layout';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary, type TextFile } from '../../../src/model/components/library';
import { M3_FILES } from '../../../lab/components/samplesMaterial3';

describe('caminhos', () => {
  it('lê chaves, índices e aninhamento', () => {
    const parsed = parsePath('a.b[0].c');
    expect(parsed).toEqual({ ok: true, segments: ['a', 'b', 0, 'c'] });
    expect(formatPath(['a', 'b', 0, 'c'])).toBe('a.b[0].c');
    expect(formatPath(['floating', null])).toBe('floating[*]');
    const doc = { a: { b: [{ c: 'x' }, { c: 'y' }] }, n: null, z: 0 };
    expect(readPath(doc, 'a.b[1].c')).toEqual({ found: true, value: 'y' });
    expect(readPath(doc, 'a.b[2].c')).toEqual({ found: false });
    expect(readPath(doc, 'n')).toEqual({ found: false });
    expect(readPath(doc, 'z')).toEqual({ found: true, value: 0 });
    expect(readPath(doc, 'a.b[*]')).toEqual({ found: false });
    expect(readPath(doc, 'a..b')).toEqual({ found: false });
  });

  it('recusa caminhos malformados', () => {
    for (const bad of ['', '.a', 'a.', 'a..b', 'a[', 'a[x]', 'a[0]b', '[0]', 'a]']) {
      expect(parsePath(bad).ok, bad).toBe(false);
    }
    expect(parsePath('a[*]')).toEqual({ ok: true, segments: ['a', null] });
  });
});

const NODE = { type: 'type', props: 'props', children: 'children' };
const SCREEN = {
  width: { path: 'w' },
  height: { path: 'h' },
  roots: [{ path: 'content' }],
};
const ORIGIN = { system: 'sdui', node: NODE, screen: SCREEN };

describe('parseOrigins', () => {
  it('lê a origem completa', () => {
    const { origins, problems } = parseOrigins([
      {
        ...ORIGIN,
        name: 'SDUI',
        screen: {
          ...SCREEN,
          id: { path: 'screen.id' },
          name: 'Tela',
          background: { path: 'bg', values: { surface: '#FEF7FF' }, default: '#FFF' },
          roots: [
            { path: 'content' },
            {
              path: 'floating[*]',
              anchor: { path: 'anchor' },
              margin: { path: 'margin' },
            },
            { path: 'modal', anchor: 'bottom', scrim: 'x' },
          ],
        },
        booleans: { true: 'sim', false: 'não' },
      },
    ]);
    expect(problems).toEqual([]);
    expect(origins).toHaveLength(1);
    expect(origins[0]?.screen.roots[2]).toEqual({
      path: 'modal',
      anchor: 'bottom',
      scrim: 'x',
    });
    expect(origins[0]?.booleans).toEqual({ true: 'sim', false: 'não' });
  });

  it('sem origens: lista vazia e nenhum problema', () => {
    expect(parseOrigins(undefined)).toEqual({ origins: [], problems: [] });
  });

  it('aponta cada problema com o caminho', () => {
    const cases: [unknown, string][] = [
      ['x', 'origins: esperava uma lista'],
      [[3], 'origins[0]: esperava um objeto'],
      [[{ ...ORIGIN, system: '' }], 'origins[0].system'],
      [[{ ...ORIGIN, extra: 1 }], 'origins[0].extra: chave desconhecida'],
      [
        [{ ...ORIGIN, node: { type: 'type', props: 'props' } }],
        'origins[0].node.children',
      ],
      [
        [{ ...ORIGIN, node: { ...NODE, key: 'k' } }],
        'origins[0].node.key: chave desconhecida',
      ],
      [[{ system: 'a', node: NODE }], 'origins[0].screen: obrigatório'],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, width: undefined } }],
        'origins[0].screen.width: obrigatório',
      ],
      [[{ ...ORIGIN, screen: { ...SCREEN, roots: [] } }], 'origins[0].screen.roots'],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, roots: [{ path: 'a[*]x' }] } }],
        'origins[0].screen.roots[0].path: caminho inválido',
      ],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, width: { path: 'a[*]' } } }],
        'origins[0].screen.width.path: "[*]" só vale em roots[].path',
      ],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, roots: [{ path: 'a', anchor: 'meio' }] } }],
        'origins[0].screen.roots[0].anchor: âncora inválida: meio',
      ],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, roots: [{ path: 'a', scrim: '' }] } }],
        'origins[0].screen.roots[0].scrim',
      ],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, roots: [{ path: 'a', color: 1 }] } }],
        'origins[0].screen.roots[0].color: chave desconhecida',
      ],
      [
        [
          {
            ...ORIGIN,
            screen: { ...SCREEN, background: { path: 'b', values: { a: 1 } } },
          },
        ],
        'origins[0].screen.background.values.a: esperava texto',
      ],
      [[{ ...ORIGIN, booleans: { true: 'sim' } }], 'origins[0].booleans.false'],
      [[ORIGIN, ORIGIN], 'origins[1].system: origem repetida: sdui'],
    ];
    for (const [raw, expected] of cases) {
      const { problems } = parseOrigins(raw);
      expect(
        problems.some((p) => p.includes(expected)),
        `${expected} em ${JSON.stringify(problems)}`,
      ).toBe(true);
    }
  });

  it('descarta a origem com problema e mantém as outras; aceita outro prefixo de caminho', () => {
    const { origins, problems } = parseOrigins(
      [
        { ...ORIGIN, system: 'ruim', extra: 1 },
        { ...ORIGIN, system: 'ok' },
      ],
      'spec.origins',
    );
    expect(origins.map((o) => o.system)).toEqual(['ok']);
    expect(problems[0]).toMatch(/^spec\.origins\[0\]\.extra/);
  });
});

// ---------------------------------------------------------------------------------------
// Tradução: uma biblioteca pequena e uma maior (o contrato do Material 3)
// ---------------------------------------------------------------------------------------

const BUTTON = {
  format: 'mapping-component',
  formatVersion: 1,
  id: 'btn',
  name: 'Botão',
  size: { width: 100, height: 40 },
  template: { type: 'frame', name: 'btn', layout: { type: 'none' } },
};
const BOX = {
  ...BUTTON,
  id: 'box',
  name: 'Caixa',
  template: {
    type: 'frame',
    name: 'box',
    layout: { type: 'none' },
    children: [{ type: 'slot', name: 'conteudo' }],
  },
};

function files(spec: Record<string, unknown>): TextFile[] {
  return [
    { path: 'spec.json', text: JSON.stringify(spec) },
    { path: 'components/btn.json', text: JSON.stringify(BUTTON) },
    { path: 'components/box.json', text: JSON.stringify(BOX) },
  ];
}

const MINI_ORIGIN = {
  system: 'sdui',
  node: NODE,
  screen: {
    id: { path: 'screen.id' },
    name: { path: 'screen.title', default: 'Tela' },
    width: { path: 'screen.w' },
    height: { path: 'screen.h' },
    background: { path: 'screen.bg', values: { dark: '#000' }, default: '#FFFFFF' },
    roots: [
      { path: 'content' },
      { path: 'bar', anchor: 'bottom', scrim: 'btn' },
      { path: 'floating[*]', anchor: { path: 'anchor' }, margin: { path: 'margin' } },
    ],
  },
  booleans: { true: 'sim', false: 'não' },
};

function miniSpec(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'mini',
    name: 'Mini',
    version: 1,
    origins: [MINI_ORIGIN],
    layers: [
      {
        id: 'l',
        name: 'L',
        annotationTypes: [
          {
            id: 'btn',
            name: 'Botão',
            component: 'components/btn.json',
            sources: [{ system: 'sdui', name: 'Button', ignore: ['hint'] }],
            fields: [
              {
                key: 'label',
                type: 'string',
                sources: [{ system: 'sdui', path: 'text' }],
              },
              {
                key: 'style',
                type: 'enum',
                options: ['filled', 'text'],
                default: 'filled',
                sources: [
                  { system: 'sdui', path: 'kind', values: { Primary: 'filled' } },
                ],
              },
              {
                key: 'on',
                type: 'enum',
                options: ['sim', 'não', 'x'],
                sources: [{ system: 'sdui', path: 'on', values: { true: 'x' } }],
              },
              {
                key: 'off',
                type: 'enum',
                options: ['sim', 'não'],
                default: 'não',
                sources: [{ system: 'sdui', path: 'off' }],
              },
              {
                key: 'count',
                type: 'number',
                sources: [{ system: 'sdui', path: 'count' }],
              },
              {
                key: 'step',
                type: 'enum',
                options: ['1', '2', '3'],
                sources: [
                  {
                    system: 'sdui',
                    path: 'step',
                    values: { '0': '1', '1': '2', '2': '3' },
                  },
                ],
              },
              {
                key: 'inner',
                type: 'string',
                sources: [{ system: 'sdui', path: 'avatar.initials' }],
              },
              {
                key: 'second',
                type: 'string',
                sources: [{ system: 'sdui', path: 'items[1].label' }],
              },
              { key: 'solto', type: 'string', default: 'padrão' },
            ],
          },
          {
            id: 'box',
            name: 'Caixa',
            component: 'components/box.json',
            sources: [{ system: 'sdui', name: 'Box', slot: 'conteudo' }],
            fields: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

const DOC = {
  screen: { id: 's1', title: 'Início', w: 400, h: 800, bg: 'dark' },
  content: {
    type: 'Box',
    id: 'ignorado',
    binding: { a: 1 },
    actions: { onClick: {} },
    route: '/x',
    children: [
      {
        type: 'Button',
        props: {
          text: 'Entrar',
          kind: 'Primary',
          on: true,
          off: false,
          count: 3,
          step: 2,
          avatar: { initials: 'MS', color: 'red' },
          items: [{ label: 'a', route: '/a' }, { label: 'b' }],
          hint: 'aceita',
        },
      },
    ],
  },
};

function translate(doc: unknown, spec = miniSpec(), system?: string) {
  const library = loadLibrary(files(spec));
  expect(library.problems).toEqual([]);
  return translateSource(library, doc, system ? { system } : {});
}

describe('translateSource', () => {
  it('traduz tela, valores, booleanos, values, default, aninhado e índice', () => {
    const result = translate(DOC);
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    const layout = result.layout!;
    expect(layout).toMatchObject({
      id: 's1',
      name: 'Início',
      width: 400,
      height: 800,
      background: '#000',
    });
    expect(layout.roots).toHaveLength(1);
    const box = layout.roots[0]!.node;
    expect(box).toMatchObject({ id: 'content', typeId: 'box' });
    const button = box.children[0] as LayoutNode;
    expect(button.id).toBe('content.children[0]');
    expect(button.typeId).toBe('btn');
    expect(button.values).toEqual({
      label: 'Entrar',
      style: 'filled',
      on: 'x', // `values` do campo vence `booleans`
      off: 'não', // booleans da origem
      count: 3,
      step: '3', // selectedIndex 2 → "3"
      inner: 'MS',
      second: 'b',
      solto: 'padrão', // sem fonte: default do campo
    });
  });

  it('usa o default da origem quando o caminho falta, e o padrão sem default', () => {
    const doc = { screen: { w: 10, h: 20 }, content: { type: 'Box' } };
    const { layout, warnings } = translate(doc);
    expect(warnings).toEqual([]);
    expect(layout).toMatchObject({ id: 'tela', name: 'Tela', background: '#FFFFFF' });
  });

  it('props desconhecidas avisam; ignore, actions, binding, id e route não', () => {
    const doc = structuredClone(DOC);
    const props = doc.content.children[0]!.props as Record<string, unknown>;
    props.foo = 1;
    props.bar = { a: 1 };
    const { warnings } = translate(doc);
    expect(warnings).toEqual([
      'content.children[0].props.foo: propriedade desconhecida em Button',
      'content.children[0].props.bar: propriedade desconhecida em Button',
    ]);
  });

  it('tipo externo desconhecido avisa e deixa o nó e a subárvore de fora', () => {
    const doc = {
      screen: { w: 10, h: 20 },
      content: {
        type: 'Box',
        children: [
          { type: 'Foo', children: [{ type: 'Button', props: {} }] },
          { type: 'Button' },
        ],
      },
    };
    const { layout, warnings } = translate(doc);
    expect(warnings).toEqual([
      'content.children[0].type: tipo externo sem tipo de anotação: Foo',
    ]);
    const box = layout!.roots[0]!.node;
    expect(box.children.map((c) => c.id)).toEqual(['content.children[1]']);
  });

  it('valor fora das opções avisa e mantém o valor; objeto no lugar de valor simples avisa e vira nulo', () => {
    const doc = {
      screen: { w: 10, h: 20 },
      content: {
        type: 'Button',
        props: { kind: 'Danger', text: { a: 1 }, step: 7 },
      },
    };
    const { layout, warnings } = translate(doc);
    expect(warnings).toEqual([
      'content.props.text: esperava valor simples',
      'content.props.kind: valor fora das opções de style: Danger',
      'content.props.step: valor fora das opções de step: 7',
    ]);
    const values = layout!.roots[0]!.node.values;
    expect(values.label).toBeNull();
    expect(values.style).toBe('Danger');
    expect(values.step).toBe('7');
  });

  it('raiz ausente é ignorada sem aviso; [*] vira uma raiz por elemento, com âncora e margem do nó', () => {
    const doc = {
      screen: { w: 10, h: 20 },
      bar: { type: 'Button', props: {} },
      floating: [
        { type: 'Button', anchor: 'bottom-end', margin: 16, props: {} },
        { type: 'Button', anchor: 'center' },
        { type: 'Button' },
      ],
    };
    const { layout, warnings } = translate(doc);
    expect(warnings).toEqual([]);
    expect(layout!.roots.map((r) => r.node.id)).toEqual([
      'bar',
      'floating[0]',
      'floating[1]',
      'floating[2]',
    ]);
    expect(layout!.roots[0]).toMatchObject({ anchor: 'bottom', scrimTypeId: 'btn' });
    expect(layout!.roots[1]).toMatchObject({ anchor: 'bottom-end', margin: 16 });
    expect(layout!.roots[2]).toMatchObject({ anchor: 'center' });
    expect(layout!.roots[2]?.margin).toBeUndefined();
    // Sem valor de âncora no nó, a raiz fica ancorada no canto.
    expect(layout!.roots[3]).toMatchObject({ anchor: 'top-start' });
  });

  it('âncora inválida avisa e usa top-start', () => {
    const doc = {
      screen: { w: 10, h: 20 },
      floating: [{ type: 'Button', anchor: 'meio', margin: 'muito' }],
    };
    const { layout, warnings } = translate(doc);
    expect(warnings).toEqual([
      'floating[0].anchor: âncora inválida: meio; usando top-start',
      'floating[0].margin: esperava número maior ou igual a 0',
    ]);
    expect(layout!.roots[0]).toMatchObject({ anchor: 'top-start' });
  });

  it('scrim vira scrimTypeId da raiz', () => {
    const doc = { screen: { w: 10, h: 20 }, bar: { type: 'Button' } };
    expect(translate(doc).layout!.roots[0]?.scrimTypeId).toBe('btn');
  });

  it('sem largura ou altura numéricas é erro, sem tela', () => {
    const noWidth = translate({ screen: { h: 20 }, content: { type: 'Box' } });
    expect(noWidth.layout).toBeUndefined();
    expect(noWidth.error).toMatch(/largura da tela.*screen\.w/);
    const badHeight = translate({ screen: { w: 10, h: 'alto' } });
    expect(badHeight.error).toMatch(/altura da tela.*screen\.h/);
    expect(translate({ screen: { w: 0, h: 5 } }).error).toMatch(/largura/);
  });

  it('documento que não é objeto não lança', () => {
    for (const doc of [null, 7, 'x', [], undefined]) {
      const result = translate(doc);
      expect(result.error, String(doc)).toBeDefined();
    }
  });

  it('biblioteca sem origens ou com sistema desconhecido: error', () => {
    const none = translate(DOC, miniSpec({ origins: undefined }));
    expect(none.error).toMatch(/não declara origens/);
    expect(none.layout).toBeUndefined();
    const other = translate(DOC, miniSpec(), 'figma');
    expect(other.error).toMatch(/figma/);
    expect(translate(DOC, miniSpec(), 'sdui').error).toBeUndefined();
  });

  it('vários tipos com o mesmo nome externo: vale o primeiro', () => {
    const spec = miniSpec();
    const layer = (spec.layers as { annotationTypes: Record<string, unknown>[] }[])[0]!;
    layer.annotationTypes.push({
      id: 'outro',
      name: 'Outro',
      sources: [{ system: 'sdui', name: 'Button' }],
      fields: [],
    });
    const { layout } = translate(DOC, spec);
    expect(layout!.roots[0]!.node.children[0]?.typeId).toBe('btn');
  });

  it('screenFromSource nunca lança: a falha vira error, com os avisos da tradução', () => {
    const library = loadLibrary(files(miniSpec()));
    const bad = screenFromSource(
      library,
      { screen: {} },
      { measure: approximateMeasurer },
    );
    expect(bad.screen).toBeUndefined();
    expect(bad.error).toMatch(/largura/);
    expect(bad.warnings).toEqual([]);
  });
});

describe('parseFieldSources: path', () => {
  const parse = (raw: unknown) => {
    const problems: string[] = [];
    const sources = parseFieldSources(raw, 'f.sources', problems);
    return { sources, problems };
  };

  it('lê path e name juntos, ou só um dos dois', () => {
    const { sources, problems } = parse([
      { system: 'sdui', path: 'a.b[0]', name: 'Rótulo' },
      { system: 'sdui', path: 'c' },
      { system: 'figma', name: 'Kind' },
    ]);
    expect(problems).toEqual([]);
    expect(sources).toEqual([
      { system: 'sdui', name: 'Rótulo', path: 'a.b[0]' },
      { system: 'sdui', path: 'c' },
      { system: 'figma', name: 'Kind' },
    ]);
  });

  it('recusa path com sintaxe inválida ou com [*], e entrada sem name nem path', () => {
    const { sources, problems } = parse([
      { system: 'sdui', path: 'a..b' },
      { system: 'sdui', path: 'a[*]' },
      { system: 'sdui', path: '' },
      { system: 'sdui' },
      { system: 'sdui', path: 'ok' },
    ]);
    expect(sources).toEqual([{ system: 'sdui', path: 'ok' }]);
    expect(problems).toEqual([
      'f.sources[0].path: caminho inválido "a..b" (segmento vazio)',
      'f.sources[1].path: "[*]" só vale em roots[].path',
      'f.sources[2].path: esperava um caminho (texto não vazio)',
      'f.sources[3]: precisa de name ou path',
    ]);
  });
});

describe('translateSource: o caminho do campo vem de path, nunca de name', () => {
  const specWithField = (source: Record<string, unknown>) => {
    const spec = miniSpec();
    const layer = (spec.layers as { annotationTypes: { fields: unknown[] }[] }[])[0]!;
    layer.annotationTypes[0]!.fields = [
      { key: 'label', type: 'string', sources: [source] },
    ];
    return spec;
  };
  const labelOf = (spec: Record<string, unknown>) => {
    const library = loadLibrary(files(spec));
    const result = translateSource(library, DOC);
    return {
      library,
      result,
      label: result.layout!.roots[0]!.node.children[0]!.values.label,
    };
  };

  it('name e path convivem: lê o valor de path e ignora name', () => {
    const { library, label } = labelOf(
      specWithField({ system: 'sdui', name: 'kind', path: 'text' }),
    );
    expect(library.problems).toEqual([]);
    expect(label).toBe('Entrar');
  });

  it('name que parece um caminho existente não é lido sem path', () => {
    const { library, result, label } = labelOf(
      specWithField({ system: 'sdui', name: 'text' }),
    );
    expect(library.problems).toEqual([
      'btn.fields[0].sources[0].path: obrigatório em sistema declarado em origins',
    ]);
    expect(label).toBeNull();
    // `text` não é lido como campo: vira propriedade desconhecida.
    expect(result.warnings).toContain(
      'content.children[0].props.text: propriedade desconhecida em Button',
    );
  });
});

describe('contrato: Material 3 e o SDUI de configurações', () => {
  it('traduz settings.sdui.json sem nenhum aviso e com a árvore esperada', () => {
    const library = loadLibrary(M3_FILES);
    expect(library.problems).toEqual([]);
    expect(library.origins.map((o) => o.system)).toEqual(['sdui']);
    const result = translateSource(library, settings);
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    const layout = result.layout!;
    expect(layout).toMatchObject({
      id: 'settings',
      name: 'Settings',
      width: 412,
      height: 917,
      background: '#FEF7FF',
    });
    expect(layout.roots.map((r) => [r.node.id, r.node.typeId, r.anchor ?? null])).toEqual(
      [
        ['content', 'm3-column', null],
        ['bottomBar', 'm3-navigation-bar', 'bottom'],
        ['floating[0]', 'm3-fab', 'bottom-end'],
        ['modal', 'm3-bottom-sheet', 'bottom'],
      ],
    );
    expect(layout.roots[2]?.margin).toBe(16);
    expect(layout.roots[3]?.scrimTypeId).toBe('m3-scrim');

    const content = layout.roots[0]!.node;
    expect(content.values).toMatchObject({ spacing: 0, padding: 0, background: 'none' });
    expect(content.children.map((c) => c.typeId)).toEqual([
      'm3-top-app-bar',
      'm3-column',
      'm3-list-item',
      'm3-list-item',
      'm3-list-item',
      'm3-column',
    ]);
    const [appBar, form] = content.children;
    expect(appBar?.values).toMatchObject({
      title: 'Settings',
      navigation: 'back',
      action: 'search',
      align: 'start',
    });
    expect(form?.values).toMatchObject({ padding: 16, spacing: 16 });
    const [field, chips, card] = form!.children;
    expect(field?.values).toMatchObject({ label: 'Search settings', state: 'enabled' });
    expect(chips?.children.map((c) => c.values.selected)).toEqual(['sim', 'não', 'não']);
    expect(card?.typeId).toBe('m3-card');
    expect(card?.values).toMatchObject({
      headline: 'Storage almost full',
      variant: 'filled',
    });
    const action = card?.children[0];
    expect(action).toMatchObject({
      id: 'content.children[1].children[2].children[0]',
      typeId: 'm3-button',
    });
    expect(action?.values).toMatchObject({ label: 'Clean up', variant: 'text' });
    const avatar = content.children[4];
    expect(avatar?.values).toMatchObject({ headline: 'Maria Souza', initials: 'MS' });
    const toggles = content.children[5]!.children;
    expect(toggles[0]?.values).toMatchObject({
      label: 'Dark theme',
      selected: 'sim',
      icon: 'sim',
    });
    expect(toggles[1]?.values).toMatchObject({ selected: 'não', icon: 'não' });
    expect(toggles[2]?.values).toMatchObject({ checked: 'sim', error: 'não' });
    expect(toggles[3]?.children.map((c) => c.values.label)).toEqual([
      'Reset options',
      'Save',
    ]);
    expect(layout.roots[1]?.node.values).toMatchObject({
      label1: 'Home',
      icon2: 'search',
      label3: 'Profile',
      active: '3',
    });
    expect(layout.roots[2]?.node.values).toMatchObject({
      icon: 'edit',
      color: 'primary',
    });
    expect(layout.roots[3]?.node.values).toMatchObject({
      title: 'Sort by',
      handle: 'sim',
      item2: 'Date modified',
      icon3: 'settings',
    });
  });
});
