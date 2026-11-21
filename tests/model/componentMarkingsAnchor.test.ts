// New instance with `anchor` and without `rect` (R3, decision 12): born at the measured size and already
// attached to the anchor (`snapToAnchor`). `componentAnchoredPlacement` is the pure function the MCP uses.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  componentAnchoredPlacement,
  componentSize,
  createMarking,
  fitMarking,
  imageCanvasRect,
  loadSpecComponents,
  parseSpec,
  setContainerDensity,
  snapToAnchor,
  type ComponentCatalog,
  type NewComponentArgs,
  validateProject,
  type Project,
} from '../../src/model';
import { FIT_SPEC_ID, LONG_LABEL, fitCatalog, fitProject } from './fitFixtures';
import { emptyProject, marking } from './fixtures';

const catalog = fitCatalog();
const T = { x: 400, y: 300, width: 200, height: 100 };

function withTarget(): Project {
  return createMarking(fitProject(), { id: 'T', containerId: 'I1', rect: T });
}

const args = (
  typeId: string,
  extra: Partial<NewComponentArgs> = {},
): NewComponentArgs => ({
  markingId: 'B',
  annotationId: 'A_B',
  containerId: 'I1',
  parentId: null,
  specId: FIT_SPEC_ID,
  typeId,
  anchor: { to: 'T', side: 'top', align: 'center' },
  ...extra,
});

const create = (p: Project, typeId: string, extra: Partial<NewComponentArgs> = {}) =>
  addComponentMarking(p, catalog, args(typeId, extra), approximateMeasurer);

describe('new anchored instance', () => {
  it('without rect it is born at the component size, attached above the anchor and with the anchor stored', () => {
    const b = marking(create(withTarget(), 'fit-plain'), 'B');
    expect(b.rect).toEqual({ x: 440, y: 260, width: 120, height: 40 });
    expect(b.anchor).toEqual({ to: 'T', side: 'top', align: 'center' });
  });

  it('born at the measured size with the given values (and it is what snapToAnchor would give)', () => {
    const p = create(withTarget(), 'fit-button', { values: { label: LONG_LABEL } });
    const b = marking(p, 'B');
    expect(b.rect.width).toBe(120);
    expect(b.rect.height).toBeGreaterThanOrEqual(76);
    expect(b.rect.y).toBe(300 - b.rect.height);
    expect(snapToAnchor(p, 'B').project).toBe(p);
  });

  it('the given rect rules: it does not attach, but stores the anchor', () => {
    const given = { x: 10, y: 20, width: 120, height: 40 };
    const b = marking(create(withTarget(), 'fit-plain', { rect: given }), 'B');
    expect(b.rect).toEqual(given);
    expect(b.anchor).toEqual({ to: 'T', side: 'top', align: 'center' });
  });

  it('the component defaults complete what the anchor does not say, and the density scales them', () => {
    const p = setContainerDensity(withTarget(), 'I1', 2);
    const b = marking(
      create(p, 'fit-plain', {
        anchor: { to: 'T' },
        anchorDefaults: { side: 'bottom', align: 'start', offset: { main: 4, cross: 2 } },
      }),
      'B',
    );
    // 120×40 units × 2; main 4 × 2 below the anchor, cross 2 × 2 along it.
    expect(b.rect).toEqual({ x: 404, y: 408, width: 240, height: 80 });
    expect(b.anchor).toEqual({ to: 'T' });
  });

  it('clamped inside the container when it goes past it', () => {
    const b = marking(
      create(withTarget(), 'fit-plain', {
        anchor: { to: 'T', side: 'top', offset: { main: 5000, cross: 0 } },
      }),
      'B',
    );
    expect(b.rect.y).toBe(0);
  });

  it('an invalid anchor fails with the invariant code, without creating anything', () => {
    const p = withTarget();
    expect(() => create(p, 'fit-plain', { anchor: { to: 'nothing' } })).toThrowError(
      /^anchor-missing/,
    );
    expect(() => create(p, 'fit-plain', { anchor: { to: 'B' } })).toThrowError(
      /^anchor-self/,
    );
  });

  it('componentAnchoredPlacement returns the rectangle and the warnings, without creating the marking', () => {
    const p = withTarget();
    const placement = componentAnchoredPlacement(
      p,
      catalog,
      { ...args('fit-plain'), anchor: { to: 'T', side: 'top', align: 'center' } },
      approximateMeasurer,
    );
    expect(placement.rect).toEqual({ x: 440, y: 260, width: 120, height: 40 });
    expect(placement.warnings).toEqual([]);
    expect(componentSize(p, catalog, args('fit-plain'), approximateMeasurer)).toEqual({
      width: 120,
      height: 40,
    });
    expect(p.markings.some((m) => m.id === 'B')).toBe(false);
    const far = componentAnchoredPlacement(
      p,
      catalog,
      { ...args('fit-plain'), anchor: { to: 'T', offset: { main: 5000, cross: 0 } } },
      approximateMeasurer,
    );
    expect(far.warnings.map((w) => w.code)).toEqual(['arrange.outside']);
  });
});

describe('settling takes the new instance to a different space than the target', () => {
  /** T0 on the canvas over the right edge of I1; the instance anchored to its left falls inside I1. */
  function straddling(): { p: Project; anchor: NewComponentArgs['anchor'] } {
    const p0 = fitProject();
    const box = imageCanvasRect(p0.containers[0]!, p0.containers[0]!.placement);
    const edge = box.x + box.width;
    const p = createMarking(p0, {
      id: 'T0',
      containerId: null,
      rect: { x: edge - 20, y: box.y + 100, width: 100, height: 40 },
    });
    return { p, anchor: { to: 'T0', side: 'start', align: 'center' } };
  }
  const canvasArgs = (anchor: NewComponentArgs['anchor']): NewComponentArgs => ({
    ...args('fit-plain'),
    containerId: null,
    anchor,
  });

  it('addComponentMarking creates the marking and drops the anchor (the whole creation does not fail)', () => {
    const { p, anchor } = straddling();
    const out = addComponentMarking(p, catalog, canvasArgs(anchor), approximateMeasurer);
    const b = marking(out, 'B');
    expect(b.containerId).toBe('I1');
    expect(b.anchor ?? null).toBeNull();
    expect(out.annotations.some((a) => a.markingId === 'B')).toBe(true);
    expect(validateProject(out)).toEqual([]);
  });

  it('a nonexistent target still fails (the anchor was never acceptable)', () => {
    const { p } = straddling();
    expect(() =>
      addComponentMarking(p, catalog, canvasArgs({ to: 'nothing' }), approximateMeasurer),
    ).toThrowError(/^anchor-missing/);
  });
});

// AM2 (#2150, decision 7 of #1893): the creation measures at the box it snaps to, repeating until the size
// repeats (at most 3 measurements with the anchor), so a size that depends on `$anchor.x` is born at the box
// it draws at.
describe('a size that depends on $anchor.x is born at the box it draws at', () => {
  const STEP_SPEC = 'step';

  /** A width by steps of `$anchor.x`; no anchor (the first measure) is the `else` of the comparisons. */
  const stepComponent = (id: string, width: unknown) => ({
    format: 'mapping-component',
    formatVersion: 4,
    id,
    name: id,
    size: { width: 100, height: 40 },
    minSize: { width: 10, height: 10 },
    sizing: { width },
    template: {
      type: 'frame',
      layout: { type: 'column', padding: 0 },
      children: [{ type: 'rect', width: 'fill', height: 20, fill: '#ffffff' }],
    },
  });
  const COMPONENTS: Record<string, unknown> = {
    // x > 40: 60, x > 20: 80, else 100. From the top-centered box: 100 (x 50) → 60 (x 30) → 80 (x 40) → 80.
    converges: stepComponent('converges', {
      $if: { $gt: [{ $field: '$anchor.x' }, 40] },
      then: 60,
      else: { $if: { $gt: [{ $field: '$anchor.x' }, 20] }, then: 80, else: 100 },
    }),
    // x > 40: 60, else 100. 100 (x 50) → 60 (x 30) → 100 (x 50) → 60: it never settles.
    oscillates: stepComponent('oscillates', {
      $if: { $gt: [{ $field: '$anchor.x' }, 40] },
      then: 60,
      else: 100,
    }),
  };
  const specJson = {
    format: 'mapping-spec',
    formatVersion: 4,
    id: STEP_SPEC,
    name: 'Step',
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
  const parsed = parseSpec(specJson);
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const stepSpec = parsed.spec;
  const stepCatalog: ComponentCatalog = (() => {
    const texts = new Map(
      Object.entries(COMPONENTS).map(([id, c]) => [
        `specs/step/components/${id}.json`,
        JSON.stringify(c),
      ]),
    );
    const loaded = loadSpecComponents(stepSpec, 'specs/step/step.spec.json', 1, (path) =>
      texts.get(path),
    );
    if (loaded.problems.length > 0) throw new Error(loaded.problems.join('\n'));
    return new Map([[STEP_SPEC, loaded]]);
  })();

  function stepProject(): Project {
    let p = applySpecialization(emptyProject(), stepSpec, {
      newId: (() => {
        let n = 0;
        return () => `ST${++n}`;
      })(),
      packageSpecName: 'step.spec.json',
    });
    p = addContainer(p, {
      id: 'I1',
      file: 'images/screen.png',
      width: 1000,
      height: 800,
    });
    return createMarking(p, { id: 'T', containerId: 'I1', rect: T });
  }

  const born = (typeId: string): Project =>
    addComponentMarking(
      stepProject(),
      stepCatalog,
      {
        markingId: 'B',
        annotationId: 'A_B',
        containerId: 'I1',
        parentId: null,
        specId: STEP_SPEC,
        typeId,
        anchor: { to: 'T', side: 'top', align: 'center' },
      },
      approximateMeasurer,
    );

  it('a size that converges is born at the size the box it draws at asks for', () => {
    const p = born('converges');
    expect(marking(p, 'B').rect.width).toBe(80);
    // What the drawing reads at that box gives the same size: the measures after the creation change nothing.
    expect(fitMarking(p, stepCatalog, 'B', approximateMeasurer)).toBe(p);
    expect(snapToAnchor(p, 'B').project).toBe(p);
  });

  it('a size that does not converge stops after 3 measurements with the anchor, deterministically', () => {
    const p = born('oscillates');
    // measures with the anchor: 60, 100, 60: the third is the result (a fourth would give 100).
    expect(marking(p, 'B').rect.width).toBe(60);
    expect(marking(born('oscillates'), 'B').rect).toEqual(marking(p, 'B').rect);
  });
});
