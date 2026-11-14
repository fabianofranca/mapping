// R3 (#1096, decision 11): the drawing cache hands the anchor to the engine, and the test tooltip
// draws the arrow through `$anchor.*`. Without an anchor, nothing changes.
import { describe, expect, it } from 'vitest';
import {
  addComponentMarking,
  approximateMeasurer,
  createDrawingCache,
  createMarking,
  markingAnchorDefaults,
  setMarkingAnchor,
  typeAnchorDefaults,
  type MarkingAnchor,
  type Project,
} from '../../src/model';
import { walk } from '../../src/model/components/scene';
import { marking } from './fixtures';
import { TIP_SPEC_ID, tipCatalog, tipProject } from './tooltipFixtures';

const catalog = tipCatalog();
const T = { x: 400, y: 300, width: 200, height: 100 };

function scene(anchor?: MarkingAnchor): Project {
  let p = createMarking(tipProject(), { id: 'T', containerId: 'I1', rect: T });
  p = addComponentMarking(
    p,
    catalog,
    {
      markingId: 'B',
      annotationId: 'A_B',
      containerId: 'I1',
      parentId: null,
      specId: TIP_SPEC_ID,
      typeId: 'tooltip',
      rect: { x: 450, y: 180, width: 100, height: 48 },
    },
    approximateMeasurer,
  );
  return anchor === undefined ? p : setMarkingAnchor(p, 'B', anchor);
}

/** The visible arrow of B's drawing: the top left corner, relative to the tooltip box (in units). */
function arrowOf(p: Project): [number, number] | undefined {
  const drawing = createDrawingCache()(p, catalog, approximateMeasurer, 0).get('B');
  const node = [...walk(drawing!.root)].find((n) => n.name === 'seta' && n.visible);
  return node === undefined ? undefined : [node.transform[4], node.transform[5]];
}

describe('the anchor reaches the engine', () => {
  it('without an anchor the arrow does not show (the pseudo-fields stay empty)', () => {
    expect(arrowOf(scene())).toBeUndefined();
  });

  it('side top: the arrow sits below the tooltip, under the anchor center', () => {
    // The anchor center is x = 500; the tooltip starts at 450: the arrow (16) starts at 50 - 8 = 42.
    expect(arrowOf(scene({ to: 'T', side: 'top' }))).toEqual([42, 40]);
  });

  it('side bottom: the arrow moves up to the top of the tooltip', () => {
    expect(arrowOf(scene({ to: 'T', side: 'bottom' }))).toEqual([42, 0]);
  });

  it('without a declared side the component default (top) applies', () => {
    expect(arrowOf(scene({ to: 'T' }))).toEqual([42, 40]);
  });

  it('switches side when the project anchor.side changes', () => {
    const p = scene({ to: 'T', side: 'top' });
    expect(arrowOf(p)?.[1]).toBe(40);
    expect(arrowOf(setMarkingAnchor(p, 'B', { to: 'T', side: 'bottom' }))?.[1]).toBe(0);
  });

  it('the arrow follows the anchor center when it moves (the cache re-instantiates)', () => {
    const p = scene({ to: 'T', side: 'top' });
    const moved = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'T' ? { ...m, rect: { ...T, x: T.x + 20 } } : m,
      ),
    };
    expect(arrowOf(moved)?.[0]).toBe(62);
  });
});

describe('component defaults for the attachment', () => {
  it('markingAnchorDefaults: the anchor of the root of the marking component (offset in units)', () => {
    const p = scene({ to: 'T' });
    const lookup = markingAnchorDefaults(p, catalog);
    expect(lookup(marking(p, 'B'))).toEqual({
      side: 'top',
      align: 'center',
      offset: { main: 4, cross: 0 },
    });
  });

  it('marking without a component or component without an anchor: no defaults', () => {
    const p = scene({ to: 'T' });
    expect(markingAnchorDefaults(p, catalog)(marking(p, 'T'))).toBeUndefined();
  });

  it('typeAnchorDefaults: by type (specId/typeId), for the new instance', () => {
    expect(typeAnchorDefaults(catalog, TIP_SPEC_ID, 'tooltip')).toEqual({
      side: 'top',
      align: 'center',
      offset: { main: 4, cross: 0 },
    });
    expect(typeAnchorDefaults(catalog, TIP_SPEC_ID, 'button')).toBeUndefined();
    expect(typeAnchorDefaults(catalog, 'nothing', 'x')).toBeUndefined();
  });
});
