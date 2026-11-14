import { afterEach, describe, expect, it } from 'vitest';
import type { ComponentFile } from '../../src/model/components/componentFormat';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { layoutScreen, type LayoutNode } from '../../src/model/components/layout';
import { importMeasured } from '../../src/model/components/measured';
import { loadLibrary } from '../../src/model/components/library';
import { screenFromSource } from '../../src/model/components/origin';
import { expandRepeats } from '../../src/model/components/repeat';
import { parseSpec, type Spec } from '../../src/model';
import type { ModelMessage } from '../../src/model/modelMessage';
import { locale } from '../../src/store/settings';
import { messageText } from '../../src/ui/modelMessage';
import { ptBRText } from '../support/modelText';

// MB5 (#1360): the drawing engine warnings (`instantiate`, `layoutScreen`, `expandRepeats`,
// `screenFromSource` and the `measured` origin) carry `messages` (code + parameters) next to
// `warnings`, in the same order. In pt-BR the text shown equals the current one; in en-US there is no
// Portuguese word outside the parameters (node names, ids and paths are data).

afterEach(() => {
  locale.value = 'pt-BR';
});

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const PORTUGUESE = /[ãõçáéíóúâêô]/i;
const box = { x: 0, y: 0, width: 300, height: 40 };

function component(template: Raw, extra: Raw = {}): ComponentFile {
  return {
    format: 'mapping-component',
    formatVersion: 1,
    id: 'test',
    name: 'Teste',
    size: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'none' }, ...template },
    ...extra,
  } as ComponentFile;
}

function draw(template: Raw, values: Raw = {}, size = box) {
  return instantiate(component(template), values, size, { measure: approximateMeasurer });
}

// --- instantiate / expandRepeats --------------------------------------------------------------

function engineCases() {
  const card = {
    name: 'card',
    layout: { type: 'column', padding: 16, gap: 8 },
    children: [
      { type: 'text', name: 'title', text: { $field: 'title' }, width: 'fill' },
      { type: 'rect', name: 'divider', height: 1, width: 'fill' },
      {
        type: 'frame',
        name: 'actions',
        height: 'hug',
        layout: { type: 'row', gap: 8 },
        children: [
          { type: 'frame', name: 'a', width: 'fill', height: 36 },
          { type: 'frame', name: 'b', width: 'fill', height: 36 },
        ],
      },
    ],
  };
  const hug = {
    children: [
      {
        type: 'frame',
        width: 'hug',
        height: 'hug',
        layout: { type: 'row', gap: 4 },
        children: [
          { type: 'rect', width: 10, height: 10 },
          { type: 'rect', width: 'fill', height: 10 },
        ],
      },
    ],
  };
  const zeroWidth = {
    layout: { type: 'column' },
    children: [
      {
        type: 'frame',
        layout: { type: 'row' },
        width: 'hug',
        height: 'hug',
        children: [{ type: 'text', name: 'rótulo', text: 'abc', width: 'fill' }],
      },
    ],
  };
  const blur = { children: [{ type: 'rect', shadow: { color: '#000', blur: -3 } }] };
  const icon = { children: [{ type: 'icon', name: 'nuvem' }] };
  const repeat = {
    children: [
      {
        type: 'repeat',
        name: 'lista',
        count: 1500,
        template: { type: 'frame', children: [] },
      },
    ],
  };
  const results = [
    draw(card, {}),
    draw(hug, {}),
    draw(zeroWidth, {}),
    draw(blur, {}),
    draw(icon, {}),
    draw(repeat, {}),
  ];
  const tableRepeat = {
    children: [
      {
        type: 'repeat',
        name: 'linhas',
        field: 'linhas',
        template: { type: 'frame', children: [] },
      },
    ],
  };
  const expanded = expandRepeats(component(tableRepeat), {});
  // `$lines` that does not settle between the two passes (MC2): the spacer narrows the text.
  const unstable = instantiate(
    component(
      {
        layout: { type: 'row' },
        children: [
          {
            type: 'frame',
            name: 'spacer',
            width: { $if: { $gt: [{ $lines: 'msg' }, 1] }, then: 150, else: 0 },
            height: 1,
          },
          {
            type: 'text',
            name: 'msg',
            text: 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eeeeeeeeee ffffffffff',
            width: 'fill',
            height: 'hug',
            font: { size: 10, lineHeight: 12 },
          },
        ],
      },
      { formatVersion: 4 },
    ),
    {},
    { x: 0, y: 0, width: 200, height: 100 },
    { measure: approximateMeasurer },
  );
  // `maxLines` that cuts children of a row with `wrap` (MC4).
  const outside = instantiate(
    component(
      {
        name: 'fileira',
        layout: { type: 'row', wrap: 'wrap', maxLines: 1, gap: 4 },
        children: Array.from({ length: 4 }, () => ({
          type: 'rect',
          width: 100,
          height: 10,
        })),
      },
      { formatVersion: 4 },
    ),
    {},
    { x: 0, y: 0, width: 220, height: 100 },
    { measure: approximateMeasurer },
  );
  return [...results, expanded, unstable, outside];
}

// --- layoutScreen -----------------------------------------------------------------------------

function layoutCases() {
  const slot = (layout: Raw = { type: 'column' }) => ({
    type: 'slot',
    anchors: { left: 0, right: 0, top: 0, bottom: 0 },
    layout,
  });
  const components = [
    component({}, { id: 'fixed', name: 'fixed' }),
    component({}, { id: 'tall', name: 'tall', size: { width: 300, height: 500 } }),
    component({}, { id: 'plain', name: 'plain' }),
    component(
      {},
      {
        id: 'filler',
        name: 'filler',
        size: { width: 50, height: 30 },
        sizing: { width: 'fill', height: 'fill' },
      },
    ),
    component(
      { children: [slot()] },
      { id: 'col', name: 'col', sizing: { width: 'fill', height: 'hug' } },
    ),
  ];
  const spec = {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'layout-test',
    name: 'Layout',
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#1E88E5',
        annotationTypes: components.map((c) => ({
          id: c.id,
          name: c.id,
          component: `components/${c.id}.json`,
          fields: [],
        })),
      },
    ],
  };
  const library = loadLibrary([
    { path: 'spec.json', text: JSON.stringify(spec) },
    ...components.map((c) => ({
      path: `components/${c.id}.json`,
      text: JSON.stringify(c),
    })),
  ]);
  expect(library.problems).toEqual([]);
  const node = (id: string, typeId: string, children: LayoutNode[] = []): LayoutNode => ({
    id,
    typeId,
    values: {},
    children,
  });
  const run = (roots: LayoutNode[], height = 800, scrimTypeId?: string) =>
    layoutScreen(
      {
        id: 's',
        name: 'S',
        width: 300,
        height,
        background: '#fff',
        roots: roots.map((n) => ({
          node: n,
          ...(scrimTypeId === undefined ? {} : { scrimTypeId }),
        })),
      },
      library,
      approximateMeasurer,
    );
  return [
    run([
      node('c', 'col', [node('x', 'nao-existe', [node('xx', 'fixed')])]),
      node('p', 'plain', [node('k', 'fixed')]),
    ]),
    run([node('c', 'col', [node('f', 'filler')])]),
    run([node('a', 'tall'), node('b', 'tall')], 600),
    run([node('m', 'fixed')], 800, 'nao-existe'),
  ];
}

// --- screenFromSource and the measured origin -----------------------------------------------------

const NODE = { type: 'type', props: 'props', children: 'children' };

let sourceLibrary: ReturnType<typeof loadLibrary> | undefined;

function sourceCases() {
  const btn = {
    format: 'mapping-component',
    formatVersion: 1,
    id: 'btn',
    name: 'Botão',
    size: { width: 100, height: 40 },
    template: { type: 'frame', name: 'btn', layout: { type: 'none' } },
  };
  const boxComponent = {
    ...btn,
    id: 'box',
    name: 'Caixa',
    template: {
      type: 'frame',
      name: 'box',
      layout: { type: 'none' },
      children: [{ type: 'slot', name: 'conteudo' }],
    },
  };
  const spec = {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'mini',
    name: 'Mini',
    version: 1,
    origins: [
      {
        system: 'sdui',
        node: NODE,
        screen: {
          width: { path: 'screen.w' },
          height: { path: 'screen.h' },
          roots: [
            { path: 'content' },
            {
              path: 'floating[*]',
              anchor: { path: 'anchor' },
              margin: { path: 'margin' },
            },
          ],
        },
      },
    ],
    layers: [
      {
        id: 'l',
        name: 'L',
        annotationTypes: [
          {
            id: 'btn',
            name: 'Botão',
            component: 'components/btn.json',
            sources: [{ system: 'sdui', name: 'Button' }],
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
                sources: [{ system: 'sdui', path: 'kind' }],
              },
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
  };
  const library = loadLibrary([
    { path: 'spec.json', text: JSON.stringify(spec) },
    { path: 'components/btn.json', text: JSON.stringify(btn) },
    { path: 'components/box.json', text: JSON.stringify(boxComponent) },
  ]);
  expect(library.problems).toEqual([]);
  sourceLibrary = library;
  const from = (json: unknown) =>
    screenFromSource(library, json, { system: 'sdui', measure: approximateMeasurer });
  return [
    from({
      screen: { w: 300, h: 400 },
      content: {
        type: 'Box',
        children: [
          'x',
          { props: {} },
          { type: 'Foo', children: [{ type: 'Button' }] },
          { type: 'Button', props: { text: { a: 1 }, kind: 'Danger', foo: 1 } },
          { type: 'Button', props: 3, children: 4 },
        ],
      },
      floating: [{ type: 'Button', anchor: 'meio', margin: 'muito' }],
    }),
  ];
}

function measuredCases() {
  const parsed = parseSpec({
    format: 'mapping-spec',
    formatVersion: 15,
    id: 'ui',
    name: 'UI',
    version: 1,
    origins: [{ system: 'dom', name: 'DOM medido', kind: 'measured' }],
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 'plain',
            name: 'Botão',
            sources: [{ system: 'dom', name: 'button' }],
            fields: [],
          },
        ],
      },
    ],
  });
  if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
  const spec: Spec = parsed.spec;
  const rect = { x: 0, y: 0, width: 10, height: 10 };
  return [
    importMeasured([spec], {
      system: 'dom',
      tree: {
        type: 'div',
        rect,
        children: [
          'x',
          { type: 'button', rect: { x: 0, y: 0, width: 0, height: 10 } },
          { type: 'button' },
          { type: 'span', id: 'a', rect },
          { rect },
          { type: 'button', rect, children: 3 },
        ],
      },
    }),
  ];
}

interface WithMessages {
  readonly warnings: readonly string[];
  readonly messages?: readonly ModelMessage[];
}

const ALL: readonly WithMessages[] = [
  ...engineCases(),
  ...layoutCases(),
  ...sourceCases(),
  ...measuredCases(),
];

const codes = new Set(ALL.flatMap((r) => (r.messages ?? []).map((m) => m.code)));

/** The text without the parameter values (data: node names, ids, paths and values). */
function withoutParams(text: string, message: ModelMessage): string {
  let out = text;
  for (const value of Object.values(message.params))
    out = out.split(String(value)).join('');
  return out;
}

describe('drawing engine warnings: messages next to warnings', () => {
  it('each result carries messages with the same texts as warnings, in the same order', () => {
    for (const result of ALL) {
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.messages).toBeDefined();
      expect(result.warnings).toEqual((result.messages ?? []).map((m) => m.text));
    }
  });

  it.each([
    ['field not provided', 'engine.fieldMissing'],
    ['content larger than the box', 'engine.contentTooBig'],
    ['fill inside hug', 'engine.fillInHug'],
    ['fill inside hug (layout)', 'engine.fillInHugUsing'],
    ['unknown icon', 'engine.iconUnknown'],
    ['type without component', 'engine.typeNoComponent'],
    ['ignored children', 'engine.childrenIgnored'],
    ['content larger than the screen', 'engine.screenTooTall'],
    ['text measured with width 0', 'engine.textZeroWidth'],
    ['invalid value', 'engine.invalidValue'],
    ['limited repeat', 'engine.repeatLimited'],
    ['unstable $lines', 'engine.linesUnstable'],
    ['children outside maxLines', 'engine.childrenOutsideMaxLines'],
    ['invalid node (origin and measured)', 'origins.draw.nodeInvalid'],
    ['missing type', 'origins.draw.typeMissing'],
    ['external type without annotation type', 'origins.draw.typeUnknown'],
    ['unknown property', 'origins.draw.unknownProp'],
    ['value that is not scalar', 'origins.draw.notScalar'],
    ['value outside the options', 'origins.draw.optionOutside'],
    ['invalid anchor', 'origins.draw.anchorInvalid'],
    ['invalid margin', 'origins.draw.marginInvalid'],
    ['empty rectangle', 'origins.draw.emptyRect'],
    ['measured node without annotation type', 'origins.draw.nodeUntyped'],
  ])('produces the warning "%s" (%s)', (_label, code) => {
    expect(codes.has(code), code).toBe(true);
  });

  it('en-US shows the English text and pt-BR the pt-BR template, filled with the parameters', () => {
    for (const result of ALL) {
      for (const message of result.messages ?? []) {
        locale.value = 'pt-BR';
        expect(messageText(message), message.code).toBe(ptBRText(message));
        expect(messageText(message), message.code).not.toBe(message.text);
        locale.value = 'en-US';
        const shown = messageText(message);
        expect(shown, message.code).toBe(message.text);
        expect(withoutParams(shown, message), `${message.code}: ${shown}`).not.toMatch(
          PORTUGUESE,
        );
      }
    }
  });
});

// The errors that prevent the screen translation (`errorMessage`, next to `error`).
describe('screen translation errors: errorMessage next to error', () => {
  const lib = (): NonNullable<typeof sourceLibrary> => {
    if (sourceLibrary === undefined) throw new Error('biblioteca de origem não montada');
    return sourceLibrary;
  };
  const run = (json: unknown, system = 'sdui') =>
    screenFromSource(lib(), json, { system, measure: approximateMeasurer });

  it.each([
    ['undeclared origin', () => run({}, 'nao-existe'), 'origins.error.systemUndeclared'],
    ['missing width', () => run({ screen: { h: 400 } }), 'origins.error.widthInvalid'],
    ['missing height', () => run({ screen: { w: 300 } }), 'origins.error.heightInvalid'],
  ])(
    '%s: has a code, text equal to error and pt-BR from the template',
    (_l, make, code) => {
      const result = make();
      const message = result.errorMessage;
      expect(message?.code).toBe(code);
      expect(result.error).toBe(message?.text);
      locale.value = 'pt-BR';
      expect(message === undefined ? '' : messageText(message)).toBe(
        ptBRText(message as ModelMessage),
      );
      expect(message === undefined ? '' : messageText(message)).not.toBe(result.error);
      locale.value = 'en-US';
      const shown = message === undefined ? '' : messageText(message);
      expect(shown).toBe(result.error);
      expect(withoutParams(shown, message as ModelMessage)).not.toMatch(PORTUGUESE);
    },
  );
});
