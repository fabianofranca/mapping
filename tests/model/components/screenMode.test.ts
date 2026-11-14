// Component in screen pixels (`screen`) and `stroke.scale` (format 4, decisions 22 and 23 of stage #747).
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  type NewComponentArgs,
  type Project,
} from '../../../src/model';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import { COMPONENTS, SPEC_ID, componentProject, testCatalog } from '../componentFixtures';

function file(version: number, extra: Record<string, unknown> = {}, stroke?: unknown) {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 120, height: 40 },
    template: {
      type: 'frame',
      children:
        stroke === undefined ? [] : [{ type: 'rect', width: 10, height: 10, stroke }],
    },
    ...extra,
  };
}

describe('parse: screen and stroke.scale', () => {
  it('in a formatVersion 3, screen is a version error at the key path', () => {
    expect(validateComponent(file(3, { screen: { anchor: 'top-left' } }))).toEqual([
      'screen: only allowed with formatVersion 4',
    ]);
  });

  it('in a formatVersion 3, stroke.scale is a version error at the key path', () => {
    expect(validateComponent(file(3, {}, { color: '#000', scale: false }))).toEqual([
      'template.children[0].stroke.scale: only allowed with formatVersion 4',
    ]);
  });

  it('in 4 they are accepted (empty screen is valid: anchor center)', () => {
    expect(
      validateComponent(file(4, { screen: {} }, { color: '#000', scale: false })),
    ).toEqual([]);
    expect(parseComponent(file(4, { screen: { anchor: 'bottom-right' } })).ok).toBe(true);
  });

  it('the nine anchors are valid; another is an error with a path', () => {
    for (const anchor of [
      'center',
      'top-left',
      'top',
      'top-right',
      'left',
      'right',
      'bottom-left',
      'bottom',
      'bottom-right',
    ])
      expect(validateComponent(file(4, { screen: { anchor } }))).toEqual([]);
    expect(validateComponent(file(4, { screen: { anchor: 'middle' } }))[0]).toMatch(
      /^screen\.anchor: /,
    );
    expect(validateComponent(file(4, { screen: { x: 1 } }))[0]).toMatch(/^screen\.x: /);
    expect(validateComponent(file(4, { screen: 'center' }))[0]).toMatch(/^screen: /);
  });

  it('stroke.scale must be a boolean', () => {
    expect(validateComponent(file(4, {}, { color: '#000', scale: 'no' }))[0]).toMatch(
      /^template\.children\[0\]\.stroke\.scale: /,
    );
  });

  it('screen on a child node is an error (unknown key)', () => {
    const f = file(4) as { template: Record<string, unknown> };
    f.template.screen = { anchor: 'center' };
    expect(validateComponent(f)[0]).toMatch(/screen/);
  });
});

function catalogWith(extra: Record<string, unknown>) {
  return testCatalog({
    ...COMPONENTS,
    wide: { ...COMPONENTS.wide, formatVersion: 4, ...extra },
  });
}

function drawWide(
  extra: Record<string, unknown>,
  rect = { x: 10, y: 20, width: 50, height: 30 },
) {
  const catalog = catalogWith(extra);
  const args: NewComponentArgs = {
    markingId: 'W',
    annotationId: 'A_W',
    containerId: 'I1',
    parentId: null,
    specId: SPEC_ID,
    typeId: 'wide',
    rect,
  };
  const p: Project = addComponentMarking(
    componentProject(),
    catalog,
    args,
    approximateMeasurer,
  );
  const marking = p.markings.find((m) => m.id === 'W')!;
  const drawing = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('W')!;
  return { marking, drawing };
}

describe('drawing with screen', () => {
  it('the scene measures the component size at the origin and carries the anchor and the marking rectangle', () => {
    const { marking, drawing } = drawWide({ screen: { anchor: 'top-left' } });
    expect(marking.rect).toEqual({ x: 10, y: 20, width: 50, height: 30 });
    expect(drawing.root).toMatchObject({ width: 100, height: 40 });
    expect(drawing.root.transform.slice(4)).toEqual([0, 0]);
    expect(drawing.screen).toEqual({
      anchor: 'top-left',
      rect: { x: 10, y: 20, width: 50, height: 30 },
    });
  });

  it('default anchor is center', () => {
    expect(drawWide({ screen: {} }).drawing.screen?.anchor).toBe('center');
  });

  it('without screen the drawing follows the rectangle and has no screen', () => {
    const { drawing } = drawWide({});
    expect(drawing.screen).toBeUndefined();
    expect(drawing.root).toMatchObject({ width: 50, height: 30 });
    expect(drawing.root.transform.slice(4)).toEqual([10, 20]);
  });

  it('going past the rectangle does not generate the "does not fit" pending item', () => {
    expect(drawWide({}, { x: 0, y: 0, width: 100, height: 40 }).drawing.overflow).toBe(
      true,
    );
    const { drawing } = drawWide({ screen: {} }, { x: 0, y: 0, width: 20, height: 10 });
    expect(drawing.overflow).toBe(false);
  });
});
