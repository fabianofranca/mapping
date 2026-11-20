// CC2 (decision 10 of #2093): the viewer draws a screen with a composed component from the files it
// already receives: `loadLibrary` attaches the inner components, so the `component` node is drawn
// with its values and the color its `provide` passes to the inner `$provided`.
import Konva from 'konva';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../canvas/harness';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { layoutScreen } from '../../src/model/components/layout';
import { loadLibrary } from '../../src/model/components/library';
import { type Viewer, createViewer } from '../../viewer';

beforeAll(() => installFakeCanvas());

const SPEC = {
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'nest',
  name: 'Nest',
  version: 1,
  layers: [
    {
      id: 'ui',
      name: 'UI',
      color: '#6750A4',
      annotationTypes: [
        {
          id: 'button',
          name: 'Button',
          component: 'components/button.json',
          fields: [{ key: 'n', type: 'number' }],
        },
        {
          id: 'badge',
          name: 'Badge',
          component: 'components/badge.json',
          fields: [{ key: 'count', type: 'number', default: 0 }],
        },
      ],
    },
  ],
};

const component = (id: string, size: object, template: object) => ({
  format: 'mapping-component',
  formatVersion: 4,
  id,
  name: id,
  size,
  template,
});

const BADGE = component(
  'badge',
  { width: 24, height: 16 },
  {
    type: 'frame',
    layout: { type: 'row', align: 'center', justify: 'center' },
    children: [
      {
        type: 'text',
        name: 'count',
        text: { $field: 'count' },
        color: { $provided: 'ink', default: '#999999' },
        font: { size: 10, lineHeight: 12 },
        width: 'hug',
      },
    ],
  },
);

const BUTTON = component(
  'button',
  { width: 120, height: 40 },
  {
    type: 'frame',
    layout: { type: 'none' },
    children: [
      {
        type: 'component',
        id: 'badge',
        anchors: { right: 4, top: 4 },
        width: 24,
        height: 16,
        values: { count: { $field: 'n' } },
        provide: { ink: '#ff0000' },
      },
    ],
  },
);

const library = loadLibrary([
  { path: 'nest.spec.json', text: JSON.stringify(SPEC) },
  { path: 'components/button.json', text: JSON.stringify(BUTTON) },
  { path: 'components/badge.json', text: JSON.stringify(BADGE) },
]);

const mounted: Viewer[] = [];
afterEach(() => {
  for (const viewer of mounted.splice(0)) viewer.dispose();
  document.body.replaceChildren();
});

function drawnTexts(): Konva.Text[] {
  const { screen } = layoutScreen(
    {
      id: 's',
      name: 'S',
      width: 300,
      height: 100,
      background: '#FFF',
      roots: [{ node: { id: 'b', typeId: 'button', values: { n: 7 }, children: [] } }],
    },
    library,
    approximateMeasurer,
  );
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true });
  Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true });
  document.body.appendChild(el);
  mounted.push(createViewer(el, { measure: approximateMeasurer, library, screen }));
  const stage = Konva.stages.find((s) => s.container() === el);
  if (!stage) throw new Error('stage not found');
  return stage.find<Konva.Text>('Text');
}

describe('createViewer: composed component', () => {
  it('loadLibrary gives the outer component its inner ones', () => {
    const button = library.types.find((t) => t.id === 'button')?.component;
    expect(button?.resolvedComponents?.badge?.component.id).toBe('badge');
  });

  it('draws the inner badge with the outer value and the color the node provides', () => {
    const texts = drawnTexts();
    expect(texts.map((t) => t.text())).toEqual(['7']);
    expect(texts[0]?.fill()).toBe('#ff0000');
  });
});
