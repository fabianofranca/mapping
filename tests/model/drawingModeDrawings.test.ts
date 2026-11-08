// CF6: o modo efetivo de cada marcação escolhe os tokens do desenho; trocar o modo (do projeto ou
// do container) redesenha sem recarregar o catálogo.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  loadSpecComponents,
  setContainerDrawingMode,
  setProjectDrawingMode,
  type ComponentCatalog,
  type Project,
} from '../../src/model';
import {
  COMPONENTS,
  SPEC_FILE,
  SPEC_ID,
  componentProject,
  testSpec,
} from './componentFixtures';

const TOKEN_COMPONENT = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'text',
  name: 'text',
  size: { width: 100, height: 40 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    fill: { $token: 'bg' },
    children: [],
  },
};

function tokenCatalog(): ComponentCatalog {
  const spec = {
    ...testSpec(),
    formatVersion: 15,
    tokens: {
      modes: ['light', 'dark'],
      values: { bg: { light: '#ffffff', dark: '#111111' } },
    },
  };
  const texts = new Map(
    Object.entries({ ...COMPONENTS, text: TOKEN_COMPONENT }).map(([id, c]) => [
      `specs/test/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(spec as never, SPEC_FILE, 1, (path) =>
    texts.get(path),
  );
  return new Map([[SPEC_ID, loaded]]);
}

function withText(id: string, containerId = 'I1'): Project {
  return addComponentMarking(
    componentProject(),
    tokenCatalog(),
    {
      markingId: id,
      annotationId: `A_${id}`,
      containerId,
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      rect: { x: 10, y: 10, width: 100, height: 40 },
    },
    approximateMeasurer,
  );
}

function fillOf(p: Project, catalog: ComponentCatalog, id: string): unknown {
  const drawing = createDrawingCache()(p, catalog, approximateMeasurer, 0).get(id);
  return drawing?.root.fills[0];
}

describe('modo do desenho no desenho das marcações', () => {
  it('sem modo, o primeiro modo da especialização; com modo, os tokens dele', () => {
    const catalog = tokenCatalog();
    const p = withText('T1');
    const light = JSON.stringify(fillOf(p, catalog, 'T1'));
    expect(light).toContain('#ffffff');
    const dark = JSON.stringify(fillOf(setProjectDrawingMode(p, 'dark'), catalog, 'T1'));
    expect(dark).toContain('#111111');
  });

  it('o container que fixa o modo vence o do projeto', () => {
    const catalog = tokenCatalog();
    let p = setProjectDrawingMode(withText('T1'), 'dark');
    p = setContainerDrawingMode(p, 'I1', 'light');
    expect(JSON.stringify(fillOf(p, catalog, 'T1'))).toContain('#ffffff');
  });

  it('modo não declarado cai no primeiro modo', () => {
    const catalog = tokenCatalog();
    const p = setProjectDrawingMode(withText('T1'), 'solar');
    expect(JSON.stringify(fillOf(p, catalog, 'T1'))).toContain('#ffffff');
  });

  it('trocar o modo redesenha só pelo cache, sem novo catálogo, e o mesmo modo reaproveita', () => {
    const catalog = tokenCatalog();
    const cache = createDrawingCache();
    const p = withText('T1');
    const first = cache(p, catalog, approximateMeasurer, 0).get('T1');
    const dark = cache(
      setProjectDrawingMode(p, 'dark'),
      catalog,
      approximateMeasurer,
      0,
    ).get('T1');
    expect(dark).not.toBe(first);
    const again = cache(
      setProjectDrawingMode(setProjectDrawingMode(p, 'dark'), 'dark'),
      catalog,
      approximateMeasurer,
      0,
    ).get('T1');
    expect(again).toBe(dark);
  });
});
