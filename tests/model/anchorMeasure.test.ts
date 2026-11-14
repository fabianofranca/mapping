// R3 review (#1096): the measurements (`fitMarking`, size of the new anchored instance) receive the
// anchor like the drawing: a `hug` component whose size depends on `$anchor.side` measures in the same
// branch it draws.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  componentAnchoredPlacement,
  createDrawingCache,
  createMarking,
  fitMarking,
  loadSpecComponents,
  parseSpec,
  setMarkingAnchor,
  type ComponentCatalog,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { walk } from '../../src/model/components/scene';
import { emptyProject, marking } from './fixtures';

const SPEC_ID = 'hugtip';

/** Body whose height (and the component's `hug`) depends on the side: 90 on `bottom`, 30 on the others. */
function hugTip(id: string, anchor: Record<string, unknown> | undefined) {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size: { width: 100, height: 40 },
    minSize: { width: 10, height: 10 },
    sizing: { height: 'hug' },
    ...(anchor === undefined ? {} : { anchor }),
    template: {
      type: 'frame',
      layout: { type: 'column', padding: 0 },
      children: [
        {
          type: 'rect',
          name: 'body',
          width: 100,
          height: { $switch: '$anchor.side', cases: { bottom: 90 }, default: 30 },
          fill: '#ffffff',
        },
      ],
    },
  };
}

const COMPONENTS: Record<string, unknown> = {
  hug: hugTip('hug', undefined),
  'hug-bottom': hugTip('hug-bottom', { side: 'bottom' }),
};

const SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: SPEC_ID,
  name: 'Hug',
  version: 1,
  layers: [
    {
      id: 'components',
      name: 'Components',
      color: '#6750A4',
      annotationTypes: Object.keys(COMPONENTS).map((id) => ({
        id,
        name: id,
        component: `components/${id}.json`,
        fields: [],
      })),
    },
  ],
};

function spec() {
  const parsed = parseSpec(SPEC_JSON);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  return parsed.spec;
}

const catalog: ComponentCatalog = (() => {
  const texts = new Map(
    Object.entries(COMPONENTS).map(([id, c]) => [
      `specs/hugtip/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(spec(), 'specs/hugtip/hugtip.spec.json', 1, (path) =>
    texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
})();

function project(): Project {
  let p = applySpecialization(emptyProject(), spec(), {
    newId: (() => {
      let n = 0;
      return () => `HS${++n}`;
    })(),
    packageSpecName: 'hugtip.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: 'images/screen.png', width: 1000, height: 800 });
  return createMarking(p, {
    id: 'T',
    containerId: 'I1',
    rect: { x: 400, y: 300, width: 200, height: 100 },
  });
}

const args = (
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): NewComponentArgs => ({
  markingId: 'B',
  annotationId: 'A_B',
  containerId: 'I1',
  parentId: null,
  specId: SPEC_ID,
  typeId,
  ...extra,
});

/** B in place, with the size of `size` and the given anchor. */
function withB(typeId: string, anchor: { to: string; side?: 'top' | 'bottom' }) {
  const p = addComponentMarking(
    project(),
    catalog,
    args(typeId, { rect: { x: 450, y: 100, width: 100, height: 40 } }),
    approximateMeasurer,
  );
  return setMarkingAnchor(p, 'B', anchor);
}

/** The body height in the drawing of marking B (in pixels; density 1). */
function drawnBodyHeight(p: Project): number {
  const drawing = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('B')!;
  const node = [...walk(drawing.root)].find((n) => n.name === 'body')!;
  return node.height;
}

describe('fitMarking measures with the marking anchor', () => {
  it('the side declared on the marking picks the $switch branch (the same as the drawing)', () => {
    const bottom = fitMarking(
      withB('hug', { to: 'T', side: 'bottom' }),
      catalog,
      'B',
      approximateMeasurer,
    );
    expect(marking(bottom, 'B').rect.height).toBe(90);
    expect(drawnBodyHeight(bottom)).toBe(90);
    const top = fitMarking(
      withB('hug', { to: 'T', side: 'top' }),
      catalog,
      'B',
      approximateMeasurer,
    );
    expect(marking(top, 'B').rect.height).toBe(30);
  });

  it('without a declared side the component default applies', () => {
    const p = fitMarking(
      withB('hug-bottom', { to: 'T' }),
      catalog,
      'B',
      approximateMeasurer,
    );
    expect(marking(p, 'B').rect.height).toBe(90);
    expect(drawnBodyHeight(p)).toBe(90);
  });

  it('without an anchor the branch is the default (like the drawing)', () => {
    const p = addComponentMarking(
      project(),
      catalog,
      args('hug', { rect: { x: 450, y: 100, width: 100, height: 40 } }),
      approximateMeasurer,
    );
    expect(
      marking(fitMarking(p, catalog, 'B', approximateMeasurer), 'B').rect.height,
    ).toBe(30);
  });
});

describe('the new anchored instance is born at the size the drawing uses', () => {
  it('componentAnchoredPlacement measures with the anchor side', () => {
    const place = (typeId: string, side?: 'top' | 'bottom') =>
      componentAnchoredPlacement(
        project(),
        catalog,
        { ...args(typeId), anchor: { to: 'T', ...(side ? { side } : {}) } },
        approximateMeasurer,
      ).rect;
    expect(place('hug', 'bottom').height).toBe(90);
    expect(place('hug', 'top').height).toBe(30);
    // Without a side on the anchor the component default applies (`anchorDefaults` or `top`).
    expect(place('hug').height).toBe(30);
  });

  it('addComponentMarking without rect creates at the measured size and the drawing matches', () => {
    const p = addComponentMarking(
      project(),
      catalog,
      args('hug', { anchor: { to: 'T', side: 'bottom' } }),
      approximateMeasurer,
    );
    expect(marking(p, 'B').rect.height).toBe(90);
    expect(drawnBodyHeight(p)).toBe(90);
  });
});
