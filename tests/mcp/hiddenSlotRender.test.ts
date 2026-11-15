import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  addContainer,
  applySpecialization,
  approximateMeasurer,
  createMarking,
  createDrawingCache,
  type NewComponentArgs,
  type Project,
} from '../../src/model';
import { paintContainerDrawings } from '../../mcp/image/containerDrawing';
import { createRaster } from '../../mcp/image/raster';
import { catalog, spec } from '../support/material3Adoption';
import { emptyProject } from '../model/fixtures';

// #1989 (CL6 of #1080): the MCP's PNG (`render_container`, `render_marking`) does not draw what sits in a slot
// hidden by `visible`, nor its descendants, as the app does (`docs/COMPONENT-FORMAT.md`, #1978 option A).

const r = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

function put(
  p: Project,
  markingId: string,
  typeId: string,
  rect: ReturnType<typeof r>,
  extra: Partial<NewComponentArgs> = {},
): Project {
  return addComponentMarking(
    p,
    catalog,
    {
      markingId,
      annotationId: `A_${markingId}`,
      containerId: 'I1',
      parentId: null,
      specId: spec.id,
      typeId,
      rect,
      ...extra,
    },
    approximateMeasurer,
  );
}

const OFF = { direction: 'StartToEnd', enableDismissFromStartToEnd: 'false' };
const ON = { direction: 'StartToEnd' };

/** A swipe-to-dismiss with `child` ('icon' directly, or a plain marking holding an icon) in its start strip. */
function scene(values: Record<string, string>, child: 'direct' | 'plain'): Project {
  let p = applySpecialization(emptyProject(), spec, {
    newId: (() => {
      let n = 0;
      return () => `LS${++n}`;
    })(),
    packageSpecName: 'material3-compose.spec.json',
  });
  p = addContainer(p, { id: 'I1', file: null, width: 360, height: 200 } as never);
  p = put(p, 'SW', 'swipe-to-dismiss', r(0, 0, 360, 72), { values });
  if (child === 'direct') return put(p, 'IC', 'icon', r(0, 0, 56, 72), { parentId: 'SW' });
  p = createMarking(p, {
    id: 'PL',
    containerId: 'I1',
    parentId: 'SW',
    rect: r(0, 0, 56, 72),
  } as never);
  return put(p, 'IC', 'icon', r(8, 16, 40, 40), { parentId: 'PL' });
}

function painted(p: Project): { count: number; ink: number } {
  const raster = createRaster(360, 200);
  raster.data.fill(255);
  const count = paintContainerDrawings(
    raster,
    { project: p, catalog },
    'I1',
    { scaleX: 1, scaleY: 1, clip: { x: 0, y: 0, width: 360, height: 200 } },
  );
  let ink = 0;
  for (let i = 0; i < raster.data.length; i += 4)
    if (raster.data[i]! < 255 || raster.data[i + 1]! < 255) ink += 1;
  return { count, ink };
}

describe.each(['direct', 'plain'] as const)(
  'the MCP render of a child in a hidden slot (%s)',
  (child) => {
    it('the model marks the drawing hidden when the direction is off, and not when it is on', () => {
      const hidden = (v: Record<string, string>) =>
        [...createDrawingCache()(scene(v, child), catalog, approximateMeasurer, 0).values()]
          .filter((d) => d.hidden === true)
          .map((d) => d.markingId)
          .sort();
      expect(hidden(ON)).toEqual([]);
      expect(hidden(OFF)).toEqual(['IC']);
    });

    it('does not draw the hidden slot content, and draws it with the direction on', () => {
      const on = painted(scene(ON, child));
      const off = painted(scene(OFF, child));
      expect(on.count - off.count).toBe(1);
      expect(off.ink).toBeLessThanOrEqual(on.ink);
    });
  },
);
