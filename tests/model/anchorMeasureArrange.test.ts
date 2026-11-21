// AM2 (#2150, decision 5 of #1893): Arrange measures an anchored child with the anchor it draws with
// (`$anchor.*`, read from the working rectangles), so its size is the drawn one, the same one the creation
// without `rect` and `fitMarking` give.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  arrangeMarking,
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

const SPEC_ID = 'tipbox';

/** Height (and the component's `hug`) by the side: 90 on `bottom`, 30 on the others. */
const HUG_TIP = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'hug',
  name: 'hug',
  size: { width: 100, height: 40 },
  minSize: { width: 10, height: 10 },
  sizing: { height: 'hug' },
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

/** A box with a column slot; it has no `sizing`, so Arrange only places its children. */
const BOX = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'box',
  name: 'box',
  size: { width: 400, height: 400 },
  template: {
    type: 'frame',
    layout: { type: 'none' },
    fill: '#DDDDDD',
    children: [
      {
        type: 'slot',
        anchors: { left: 0, right: 0, top: 0, bottom: 0 },
        layout: { type: 'column', gap: 0, padding: 0, align: 'start' },
      },
    ],
  },
};

const COMPONENTS: Record<string, unknown> = { hug: HUG_TIP, box: BOX };

const SPEC_JSON = {
  format: 'mapping-spec',
  formatVersion: 4,
  id: SPEC_ID,
  name: 'Tip box',
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
      `specs/tipbox/components/${id}.json`,
      JSON.stringify(c),
    ]),
  );
  const loaded = loadSpecComponents(spec(), 'specs/tipbox/tipbox.spec.json', 1, (path) =>
    texts.get(path),
  );
  if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
  return new Map([[SPEC_ID, loaded]]);
})();

const args = (
  markingId: string,
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): NewComponentArgs => ({
  markingId,
  annotationId: `A_${markingId}`,
  containerId: 'I1',
  parentId: null,
  specId: SPEC_ID,
  typeId,
  ...extra,
});

/** The box on the image with a plain sibling S (the anchor's target) inside it. */
function boxWithSibling(): Project {
  let p = applySpecialization(emptyProject(), spec(), {
    newId: (() => {
      let n = 0;
      return () => `TB${++n}`;
    })(),
    packageSpecName: 'tipbox.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: 'images/screen.png', width: 1000, height: 800 });
  p = addComponentMarking(
    p,
    catalog,
    args('box', 'box', { rect: { x: 100, y: 100, width: 400, height: 400 } }),
    approximateMeasurer,
  );
  return createMarking(p, {
    id: 'S',
    containerId: 'I1',
    rect: { x: 150, y: 150, width: 100, height: 30 },
  });
}

const ANCHOR = { to: 'S', side: 'bottom' as const };

/** The tip created by hand at 40 high, inside the box, anchored on the bottom of S. */
function withHandMadeTip(): Project {
  const p = addComponentMarking(
    boxWithSibling(),
    catalog,
    args('tip', 'hug', {
      parentId: 'box',
      rect: { x: 150, y: 300, width: 100, height: 40 },
    }),
    approximateMeasurer,
  );
  return setMarkingAnchor(p, 'tip', ANCHOR);
}

function drawnBodyHeight(p: Project): number {
  const drawing = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('tip')!;
  return [...walk(drawing.root)].find((n) => n.name === 'body')!.height;
}

describe('arrangeMarking measures the anchored child with its anchor', () => {
  it('the child is measured at the height it draws (90 on bottom, not 30)', () => {
    const p = arrangeMarking(
      withHandMadeTip(),
      catalog,
      'box',
      approximateMeasurer,
    ).project;
    expect(marking(p, 'tip').rect.height).toBe(90);
    expect(drawnBodyHeight(p)).toBe(90);
  });

  it('a child without an anchor measures as before (the default branch)', () => {
    const p = addComponentMarking(
      boxWithSibling(),
      catalog,
      args('tip', 'hug', {
        parentId: 'box',
        rect: { x: 150, y: 300, width: 100, height: 40 },
      }),
      approximateMeasurer,
    );
    const arranged = arrangeMarking(p, catalog, 'box', approximateMeasurer).project;
    expect(marking(arranged, 'tip').rect.height).toBe(30);
  });

  it('creation, fitMarking and Arrange agree on the size of the same anchored instance', () => {
    const created = addComponentMarking(
      boxWithSibling(),
      catalog,
      args('tip', 'hug', { parentId: 'box', anchor: ANCHOR }),
      approximateMeasurer,
    );
    const born = marking(created, 'tip').rect.height;
    expect(born).toBe(90);
    expect(drawnBodyHeight(created)).toBe(90);
    expect(fitMarking(created, catalog, 'tip', approximateMeasurer)).toBe(created);
    const arranged = arrangeMarking(created, catalog, 'box', approximateMeasurer).project;
    expect(marking(arranged, 'tip').rect.height).toBe(born);
  });
});
