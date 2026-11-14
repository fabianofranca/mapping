// Density (#1085, decision 8): the marking group receives the scene with the scale at the root, so the
// same component in a 3x container (174×120) and in a 1x one (58×40) at zoom 3 gives the same boxes.
import Konva from 'konva';
import { beforeAll, describe, expect, it } from 'vitest';
import { installFakeCanvas } from '../harness';
import { ComponentLayerRenderer } from '../../../src/canvas/components/componentLayer';
import {
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  setContainerDensity,
  type Placement,
  type Project,
  type Rect,
} from '../../../src/model';
import { SPEC_ID, componentProject, testCatalog } from '../../model/componentFixtures';

beforeAll(() => installFakeCanvas());

const catalog = testCatalog();
const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['I1', { x: 0, y: 0, scale: 1 }],
]);

function project(rect: Rect, density: number): Project {
  const p = addComponentMarking(
    componentProject(),
    catalog,
    {
      markingId: 'M',
      annotationId: 'A',
      containerId: 'I1',
      parentId: null,
      specId: SPEC_ID,
      typeId: 'text',
      rect,
    },
    approximateMeasurer,
  );
  return setContainerDensity(p, 'I1', density);
}

/** The boxes (in screen pixels) of all the shapes drawn by the marking `M`. */
function boxes(p: Project, zoom: number): Rect[] {
  const drawings = createDrawingCache()(p, catalog, approximateMeasurer, 0);
  const stage = new Konva.Group({ scaleX: zoom, scaleY: zoom });
  const layer = new ComponentLayerRenderer(stage);
  layer.render(drawings, () => true, PLACEMENTS, zoom);
  return stage.find('Shape').map((s) => s.getClientRect());
}

describe('component layer with density', () => {
  it('3x at 180×72 (zoom 1) has the same boxes as 1x at 60×24 with zoom 3', () => {
    const dense = boxes(project({ x: 30, y: 30, width: 180, height: 72 }, 3), 1);
    const flat = boxes(project({ x: 10, y: 10, width: 60, height: 24 }, 1), 3);
    expect(dense.length).toBeGreaterThan(0);
    expect(dense).toHaveLength(flat.length);
    dense.forEach((box, i) => {
      const other = flat[i]!;
      expect(box.x).toBeCloseTo(other.x, 0);
      expect(box.y).toBeCloseTo(other.y, 0);
      expect(box.width).toBeCloseTo(other.width, 0);
      expect(box.height).toBeCloseTo(other.height, 0);
    });
  });
});
