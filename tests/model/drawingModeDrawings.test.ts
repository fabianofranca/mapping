// CF6: the effective mode of each marking picks the drawing tokens; switching the mode (of the project or
// of the container) redraws without reloading the catalog.
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

describe('drawing mode in the drawing of markings', () => {
  it("without a mode, the specialization's first mode; with a mode, its tokens", () => {
    const catalog = tokenCatalog();
    const p = withText('T1');
    const light = JSON.stringify(fillOf(p, catalog, 'T1'));
    expect(light).toContain('#ffffff');
    const dark = JSON.stringify(fillOf(setProjectDrawingMode(p, 'dark'), catalog, 'T1'));
    expect(dark).toContain('#111111');
  });

  it("the container that sets the mode beats the project's", () => {
    const catalog = tokenCatalog();
    let p = setProjectDrawingMode(withText('T1'), 'dark');
    p = setContainerDrawingMode(p, 'I1', 'light');
    expect(JSON.stringify(fillOf(p, catalog, 'T1'))).toContain('#ffffff');
  });

  it('an undeclared mode falls back to the first mode', () => {
    const catalog = tokenCatalog();
    const p = setProjectDrawingMode(withText('T1'), 'solar');
    expect(JSON.stringify(fillOf(p, catalog, 'T1'))).toContain('#ffffff');
  });

  it('switching the mode redraws only through the cache, with no new catalog, and the same mode reuses', () => {
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
