// `CanvasController.destroy` leaves no shapes in the Konva hit-color registry (`shapes`). The
// node parts that `syncParts` detaches from the group (hidden) are not destroyed along with it;
// without that, opening and closing large projects many times in the same tab filled the registry and the
// `Shape` constructor started looking for a free color for a long time.
import { shapes } from 'konva/lib/Shape';
import { describe, expect, it } from 'vitest';
import type { MarkingRenderer } from '../../src/canvas/renderers/markings';
import { openWholeProject } from './wholeProjectScenario';

const registered = () => Object.keys(shapes).length;

describe('Konva hit-color registry', () => {
  it('opening, zooming in, zooming out and destroying returns the registry to what it was', () => {
    const before = registered();
    const s = openWholeProject(500, 'fit');
    // Zooming in creates the node parts; zooming out hides them and `syncParts` detaches them from the group.
    s.controller.zoomTo(2);
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    s.controller.fitAll();
    s.flush();
    expect(registered()).toBeGreaterThan(before);
    s.destroy();
    expect(registered()).toBe(before);
  }, 120_000);

  it('deleting a marking with detached parts also destroys them', () => {
    const s = openWholeProject(500, 'fit');
    // One leaf: deleting a marking with children deletes the children too.
    const target = s.project.markings.find(
      (m) => !s.project.markings.some((c) => c.parentId === m.id),
    );
    if (!target) throw new Error('fixture');
    s.ui.selection.value = { kind: 'marking', id: target.id };
    s.flush();
    s.ui.selection.value = null;
    s.flush();
    const node = (s.controller as unknown as { markings: MarkingRenderer }).markings.node(
      target.id,
    );
    const ownShapes = [
      node?.border,
      node?.halo,
      node?.inner,
      node?.badge,
      node?.alert,
      node?.text?.header,
    ].filter((shape) => shape !== undefined).length;
    // The border and the halo, which the selection created and `syncParts` detached on deselection.
    expect(ownShapes).toBe(2);
    const withParts = registered();
    s.actions.removeMarking(target.id);
    s.flush();
    expect(registered()).toBe(withParts - ownShapes);
    s.destroy();
  }, 120_000);
});
