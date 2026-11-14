// Node parts on demand (CD2 of the canvas-performance stage, decision 5): a marking's node is born
// with only the group and the border; the halo, the double line, the badge, the alert and the name
// are born in the first frame in which they become visible and, once created, stay.
import Konva from 'konva/lib/Core';
import { afterEach, describe, expect, it } from 'vitest';
import type { MarkingNode, MarkingRenderer } from '../../src/canvas/renderers/markings';
import { openWholeProject, type WholeProjectScenario } from './wholeProjectScenario';

const rendererOf = (s: WholeProjectScenario) =>
  (s.controller as unknown as { markings: MarkingRenderer }).markings;
const nodeOf = (s: WholeProjectScenario, id: string) => rendererOf(s).node(id);

/** Konva nodes created for the marking's node (attached or not). */
function createdKonvaNodes(node: MarkingNode): number {
  const parts: unknown[] = [
    node.group,
    node.border,
    node.halo,
    node.inner,
    node.badge,
    node.alertClip,
    node.alert,
    node.text?.group,
    node.text?.header,
  ];
  return parts.filter((part) => part instanceof Konva.Node).length;
}

let scenario: WholeProjectScenario | null = null;
afterEach(() => {
  scenario?.destroy();
  scenario = null;
});

describe('node parts on demand (2,000 markings)', () => {
  it('in Fit all, each drawn marking has 2 nodes created (group and border)', () => {
    const s = (scenario = openWholeProject(2000, 'fit'));
    const withNode = s.project.markings.filter((m) => nodeOf(s, m.id) !== undefined);
    expect(withNode.length).toBeGreaterThan(1000);
    const created = withNode.reduce((sum, m) => {
      const node = nodeOf(s, m.id);
      return sum + (node ? createdKonvaNodes(node) : 0);
    }, 0);
    expect(created).toBe(2 * withNode.length);
  }, 120_000);

  it('zooming in on a marking creates the rest of its parts and zooming out does not destroy them', () => {
    const s = (scenario = openWholeProject(2000, 'fit'));
    const target = s.project.markings[0];
    if (!target) throw new Error('fixture');
    const far = nodeOf(s, target.id);
    expect(far?.halo).toBeUndefined();
    s.controller.zoomTo(2);
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    const near = nodeOf(s, target.id);
    expect(near).toBe(far);
    const halo = near?.halo;
    expect(halo).toBeDefined();
    expect(halo?.visible()).toBe(true);
    s.controller.fitAll();
    s.flush();
    expect(nodeOf(s, target.id)?.halo).toBe(halo);
    expect(halo?.visible()).toBe(false);
  }, 120_000);

  it('selecting a small marking creates its parts', () => {
    const s = (scenario = openWholeProject(2000, 'fit'));
    const target = s.project.markings[0];
    if (!target) throw new Error('fixture');
    expect(nodeOf(s, target.id)?.halo).toBeUndefined();
    s.ui.selection.value = { kind: 'marking', id: target.id };
    s.flush();
    const node = nodeOf(s, target.id);
    expect(node?.halo?.visible()).toBe(true);
    // The others keep the usual 2.
    const other = s.project.markings[1];
    const otherNode = other ? nodeOf(s, other.id) : undefined;
    expect(otherNode ? createdKonvaNodes(otherNode) : 2).toBe(2);
  }, 120_000);
});
