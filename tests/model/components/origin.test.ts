// Components Lab: executable origin declaration (`origins` + `sources`).
import { describe, expect, it } from 'vitest';
import settings from '../../../viewer/samples/settings.sdui.json';
import {
  formatPath,
  originProblemText,
  parseFieldSources,
  parseOrigins,
  parsePath,
  readPath,
  translateSource,
  screenFromSource,
  type OriginProblem,
} from '../../../src/model/components/origin';
import type { LayoutNode } from '../../../src/model/components/layout';
import { approximateMeasurer } from '../../../src/model/components/instantiate';
import { loadLibrary, type TextFile } from '../../../src/model/components/library';
import { M3_FILES } from '../../../viewer/samples/samplesMaterial3';

describe('paths', () => {
  it('reads keys, indices and nesting', () => {
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

  it('rejects malformed paths', () => {
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
  it('reads the complete origin', () => {
    const { origins, problems } = parseOrigins([
      {
        ...ORIGIN,
        name: 'SDUI',
        screen: {
          ...SCREEN,
          id: { path: 'screen.id' },
          name: 'Screen',
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
        booleans: { true: 'yes', false: 'no' },
      },
    ]);
    expect(problems).toEqual([]);
    expect(origins).toHaveLength(1);
    expect(origins[0]?.screen.roots[2]).toEqual({
      path: 'modal',
      anchor: 'bottom',
      scrim: 'x',
    });
    expect(origins[0]?.booleans).toEqual({ true: 'yes', false: 'no' });
  });

  it('without origins: empty list and no problem', () => {
    expect(parseOrigins(undefined)).toEqual({ origins: [], problems: [] });
  });

  it('reports each problem with the path', () => {
    const cases: [unknown, string][] = [
      ['x', 'origins: expected a list'],
      [[3], 'origins[0]: expected an object'],
      [[{ ...ORIGIN, system: '' }], 'origins[0].system'],
      [[{ ...ORIGIN, extra: 1 }], 'origins[0].extra: unknown key'],
      [
        [{ ...ORIGIN, node: { type: 'type', props: 'props' } }],
        'origins[0].node.children',
      ],
      [[{ ...ORIGIN, node: { ...NODE, key: 'k' } }], 'origins[0].node.key: unknown key'],
      [[{ system: 'a', node: NODE }], 'origins[0].screen: required'],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, width: undefined } }],
        'origins[0].screen.width: required',
      ],
      [[{ ...ORIGIN, screen: { ...SCREEN, roots: [] } }], 'origins[0].screen.roots'],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, roots: [{ path: 'a[*]x' }] } }],
        'origins[0].screen.roots[0].path: invalid path',
      ],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, width: { path: 'a[*]' } } }],
        'origins[0].screen.width.path: "[*]" is only valid in roots[].path',
      ],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, roots: [{ path: 'a', anchor: 'middle' }] } }],
        'origins[0].screen.roots[0].anchor: invalid anchor: middle',
      ],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, roots: [{ path: 'a', margin: 8 }] } }],
        'origins[0].screen.roots[0].margin: margin is only valid with anchor',
      ],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, roots: [{ path: 'a', scrim: '' }] } }],
        'origins[0].screen.roots[0].scrim',
      ],
      [
        [{ ...ORIGIN, screen: { ...SCREEN, roots: [{ path: 'a', color: 1 }] } }],
        'origins[0].screen.roots[0].color: unknown key',
      ],
      [
        [
          {
            ...ORIGIN,
            screen: { ...SCREEN, background: { path: 'b', values: { a: 1 } } },
          },
        ],
        'origins[0].screen.background.values.a: expected text',
      ],
      [[{ ...ORIGIN, booleans: { true: 'yes' } }], 'origins[0].booleans.false'],
      [[ORIGIN, ORIGIN], 'origins[1].system: repeated origin: sdui'],
    ];
    for (const [raw, expected] of cases) {
      const problems = parseOrigins(raw).problems.map(originProblemText);
      expect(
        problems.some((p) => p.includes(expected)),
        `${expected} in ${JSON.stringify(problems)}`,
      ).toBe(true);
    }
  });

  it('discards the origin with a problem and keeps the others; accepts another path prefix', () => {
    const { origins, problems } = parseOrigins(
      [
        { ...ORIGIN, system: 'bad', extra: 1 },
        { ...ORIGIN, system: 'ok' },
      ],
      'spec.origins',
    );
    expect(origins.map((o) => o.system)).toEqual(['ok']);
    expect(originProblemText(problems[0]!)).toMatch(/^spec\.origins\[0\]\.extra/);
  });
});

// ---------------------------------------------------------------------------------------
// Translation: a small library and a larger one (the Material 3 contract)
// ---------------------------------------------------------------------------------------

const BUTTON = {
  format: 'mapping-component',
  formatVersion: 1,
  id: 'btn',
  name: 'Button',
  size: { width: 100, height: 40 },
  template: { type: 'frame', name: 'btn', layout: { type: 'none' } },
};
const BOX = {
  ...BUTTON,
  id: 'box',
  name: 'Box',
  template: {
    type: 'frame',
    name: 'box',
    layout: { type: 'none' },
    children: [{ type: 'slot', name: 'content' }],
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
    name: { path: 'screen.title', default: 'Screen' },
    width: { path: 'screen.w' },
    height: { path: 'screen.h' },
    background: { path: 'screen.bg', values: { dark: '#000' }, default: '#FFFFFF' },
    roots: [
      { path: 'content' },
      { path: 'bar', anchor: 'bottom', scrim: 'btn' },
      { path: 'floating[*]', anchor: { path: 'anchor' }, margin: { path: 'margin' } },
    ],
  },
  booleans: { true: 'yes', false: 'no' },
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
            name: 'Button',
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
                options: ['yes', 'no', 'x'],
                sources: [{ system: 'sdui', path: 'on', values: { true: 'x' } }],
              },
              {
                key: 'off',
                type: 'enum',
                options: ['yes', 'no'],
                default: 'no',
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
              { key: 'loose', type: 'string', default: 'default' },
            ],
          },
          {
            id: 'box',
            name: 'Box',
            component: 'components/box.json',
            sources: [{ system: 'sdui', name: 'Box', slot: 'content' }],
            fields: [],
          },
        ],
      },
    ],
    ...overrides,
  };
}

const DOC = {
  screen: { id: 's1', title: 'Home', w: 400, h: 800, bg: 'dark' },
  content: {
    type: 'Box',
    id: 'ignored',
    binding: { a: 1 },
    actions: { onClick: {} },
    route: '/x',
    children: [
      {
        type: 'Button',
        props: {
          text: 'Sign in',
          kind: 'Primary',
          on: true,
          off: false,
          count: 3,
          step: 2,
          avatar: { initials: 'MS', color: 'red' },
          items: [{ label: 'a', route: '/a' }, { label: 'b' }],
          hint: 'accepted',
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
  it('translates screen, values, booleans, values, default, nested and index', () => {
    const result = translate(DOC);
    expect(result.error).toBeUndefined();
    expect(result.warnings).toEqual([]);
    const layout = result.layout!;
    expect(layout).toMatchObject({
      id: 's1',
      name: 'Home',
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
      label: 'Sign in',
      style: 'filled',
      on: 'x', // the field `values` beat `booleans`
      off: 'no', // booleans of the origin
      count: 3,
      step: '3', // selectedIndex 2 → "3"
      inner: 'MS',
      second: 'b',
      loose: 'default', // without a source: the field default
    });
  });

  it('uses the origin default when the path is missing, and the default without default', () => {
    const doc = { screen: { w: 10, h: 20 }, content: { type: 'Box' } };
    const { layout, warnings } = translate(doc);
    expect(warnings).toEqual([]);
    expect(layout).toMatchObject({
      // pt-BR kept: default screen id of the engine (src/model/components/origin.ts)
      id: 'tela',
      name: 'Screen',
      background: '#FFFFFF',
    });
  });

  it('unknown props warn; ignore, actions, binding, id and route do not', () => {
    const doc = structuredClone(DOC);
    const props = doc.content.children[0]!.props as Record<string, unknown>;
    props.foo = 1;
    props.bar = { a: 1 };
    const { warnings } = translate(doc);
    expect(warnings).toEqual([
      'content.children[0].props.foo: unknown property in Button',
      'content.children[0].props.bar: unknown property in Button',
    ]);
  });

  it('an unknown external type warns and leaves the node and the subtree out', () => {
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
      'content.children[0].type: external type without an annotation type: Foo',
    ]);
    const box = layout!.roots[0]!.node;
    expect(box.children.map((c) => c.id)).toEqual(['content.children[1]']);
  });

  it('a value outside the options warns and keeps the value; an object in place of a simple value warns and becomes null', () => {
    const doc = {
      screen: { w: 10, h: 20 },
      content: {
        type: 'Button',
        props: { kind: 'Danger', text: { a: 1 }, step: 7 },
      },
    };
    const { layout, warnings } = translate(doc);
    expect(warnings).toEqual([
      'content.props.text: expected a simple value',
      'content.props.kind: value outside the options of style: Danger',
      'content.props.step: value outside the options of step: 7',
    ]);
    const values = layout!.roots[0]!.node.values;
    expect(values.label).toBeNull();
    expect(values.style).toBe('Danger');
    expect(values.step).toBe('7');
  });

  it('a missing root is ignored without a warning; [*] becomes one root per element, with the anchor and margin of the node', () => {
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
    // Without an anchor value on the node, the root is anchored in the corner.
    expect(layout!.roots[3]).toMatchObject({ anchor: 'top-start' });
  });

  it('invalid anchor avisa e usa top-start', () => {
    const doc = {
      screen: { w: 10, h: 20 },
      floating: [{ type: 'Button', anchor: 'middle', margin: 'lots' }],
    };
    const { layout, warnings } = translate(doc);
    expect(warnings).toEqual([
      'floating[0].anchor: invalid anchor: middle; using top-start',
      'floating[0].margin: expected a number greater than or equal to 0',
    ]);
    expect(layout!.roots[0]).toMatchObject({ anchor: 'top-start' });
  });

  it('scrim becomes scrimTypeId of the root', () => {
    const doc = { screen: { w: 10, h: 20 }, bar: { type: 'Button' } };
    expect(translate(doc).layout!.roots[0]?.scrimTypeId).toBe('btn');
  });

  it('without numeric width or height it is an error, without a screen', () => {
    const noWidth = translate({ screen: { h: 20 }, content: { type: 'Box' } });
    expect(noWidth.layout).toBeUndefined();
    expect(noWidth.error).toMatch(/screen width missing or invalid.*screen\.w/);
    const badHeight = translate({ screen: { w: 10, h: 'tall' } });
    expect(badHeight.error).toMatch(/screen height missing or invalid.*screen\.h/);
    expect(translate({ screen: { w: 0, h: 5 } }).error).toMatch(/screen width/);
  });

  it('a document that is not an object does not throw', () => {
    for (const doc of [null, 7, 'x', [], undefined]) {
      const result = translate(doc);
      expect(result.error, String(doc)).toBeDefined();
    }
  });

  it('library without origins or with an unknown system: error', () => {
    const none = translate(DOC, miniSpec({ origins: undefined }));
    expect(none.error).toMatch(/declares no origins/);
    expect(none.layout).toBeUndefined();
    const other = translate(DOC, miniSpec(), 'figma');
    expect(other.error).toMatch(/figma/);
    expect(translate(DOC, miniSpec(), 'sdui').error).toBeUndefined();
  });

  it('several types with the same external name: the first one applies', () => {
    const spec = miniSpec();
    const layer = (spec.layers as { annotationTypes: Record<string, unknown>[] }[])[0]!;
    layer.annotationTypes.push({
      id: 'other',
      name: 'Other',
      sources: [{ system: 'sdui', name: 'Button' }],
      fields: [],
    });
    const { layout } = translate(DOC, spec);
    expect(layout!.roots[0]!.node.children[0]?.typeId).toBe('btn');
  });

  it('screenFromSource never throws: the failure becomes error, with the translation warnings', () => {
    const library = loadLibrary(files(miniSpec()));
    const bad = screenFromSource(
      library,
      { screen: {} },
      { measure: approximateMeasurer },
    );
    expect(bad.screen).toBeUndefined();
    expect(bad.error).toMatch(/screen width/);
    expect(bad.warnings).toEqual([]);
  });
});

describe('parseFieldSources: path', () => {
  const parse = (raw: unknown) => {
    const problems: OriginProblem[] = [];
    const sources = parseFieldSources(raw, 'f.sources', problems);
    return { sources, problems: problems.map(originProblemText) };
  };

  it('reads path and name together, or only one of the two', () => {
    const { sources, problems } = parse([
      { system: 'sdui', path: 'a.b[0]', name: 'Caption' },
      { system: 'sdui', path: 'c' },
      { system: 'figma', name: 'Kind' },
    ]);
    expect(problems).toEqual([]);
    expect(sources).toEqual([
      { system: 'sdui', name: 'Caption', path: 'a.b[0]' },
      { system: 'sdui', path: 'c' },
      { system: 'figma', name: 'Kind' },
    ]);
  });

  it('rejects a path with invalid syntax or with [*], and an entry without name or path', () => {
    const { sources, problems } = parse([
      { system: 'sdui', path: 'a..b' },
      { system: 'sdui', path: 'a[*]' },
      { system: 'sdui', path: '' },
      { system: 'sdui' },
      { system: 'sdui', path: 'ok' },
    ]);
    expect(sources).toEqual([{ system: 'sdui', path: 'ok' }]);
    expect(problems).toEqual([
      'f.sources[0].path: invalid path "a..b" (empty segment)',
      'f.sources[1].path: "[*]" is only valid in roots[].path',
      'f.sources[2].path: expected a path (non-empty text)',
      'f.sources[3]: needs name or path',
    ]);
  });
});

describe('translateSource: without system the first tree origin applies', () => {
  const MEASURED_ORIGIN = { system: 'dom', kind: 'measured' };

  it('skips the measured origins that come before', () => {
    const spec = miniSpec({ origins: [MEASURED_ORIGIN, MINI_ORIGIN] });
    const result = translate(DOC, spec);
    expect(result.error).toBeUndefined();
    expect(result.layout?.id).toBe('s1');
  });

  it('with only measured origins, the error says to pass the system', () => {
    const spec = miniSpec({ origins: [MEASURED_ORIGIN] });
    const result = translate(DOC, spec);
    expect(result.layout).toBeUndefined();
    expect(result.error).toContain('system');
    expect(result.error).toContain('measured');
  });

  it('with system, the requested origin applies as before', () => {
    const spec = miniSpec({ origins: [MEASURED_ORIGIN, MINI_ORIGIN] });
    expect(translate(DOC, spec, 'sdui').error).toBeUndefined();
  });
});

describe('translateSource: the field path comes from path, never from name', () => {
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

  it('name and path coexist: reads the value from path and ignores name', () => {
    const { library, label } = labelOf(
      specWithField({ system: 'sdui', name: 'kind', path: 'text' }),
    );
    expect(library.problems).toEqual([]);
    expect(label).toBe('Sign in');
  });

  it('a name that looks like an existing path is not read without path', () => {
    const { library, result, label } = labelOf(
      specWithField({ system: 'sdui', name: 'text' }),
    );
    expect(library.problems).toEqual([
      'btn.fields[0].sources[0].path: required in a system declared in origins',
    ]);
    expect(label).toBeNull();
    // `text` is not read as a field: it becomes an unknown property.
    expect(result.warnings).toContain(
      'content.children[0].props.text: unknown property in Button',
    );
  });
});

// pt-BR kept: boolean enum values of the pt-BR Material 3 sample (viewer/samples/samplesMaterial3.ts)
const YES = 'sim';
const NO = 'não';

describe('contract: Material 3 and the settings SDUI', () => {
  it('translates settings.sdui.json without any warning and with the expected tree', () => {
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
    expect(chips?.children.map((c) => c.values.selected)).toEqual([YES, NO, NO]);
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
      selected: YES,
      icon: YES,
    });
    expect(toggles[1]?.values).toMatchObject({ selected: NO, icon: NO });
    expect(toggles[2]?.values).toMatchObject({ checked: YES, error: NO });
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
      handle: YES,
      item2: 'Date modified',
      icon3: 'settings',
    });
  });
});
