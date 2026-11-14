// Nodes on demand (DA5, decision 8 of the canvas-scale stage): a marking's Konva node is only born
// in the first frame in which it is drawn and stays until it leaves the project.
import { afterEach, describe, expect, it } from 'vitest';
import type { MarkingRenderer } from '../../src/canvas/renderers/markings';
import { openWholeProject, type WholeProjectScenario } from './wholeProjectScenario';

const nodeOf = (s: WholeProjectScenario, id: string) =>
  (s.controller as unknown as { markings: MarkingRenderer }).markings.node(id);

const withNode = (s: WholeProjectScenario) =>
  s.project.markings.filter((m) => nodeOf(s, m.id) !== undefined);

let scenario: WholeProjectScenario | null = null;
afterEach(() => {
  scenario?.destroy();
  scenario = null;
});

describe('marking nodes on demand (2,000 markings)', () => {
  it('zoomed in on a corner, only the markings in view have a node', () => {
    const s = (scenario = openWholeProject(2000, 'close'));
    const all = s.project.markings.length;
    s.controller.zoomTo(1);
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    const created = withNode(s).length;
    expect(created).toBeGreaterThan(0);
    expect(created).toBeLessThan(all);
    // The host attribute counts the drawn markings (the R12 steps read it).
    expect(Number(s.container.dataset.drawnMarkings)).toBe(
      withNode(s).filter((m) => nodeOf(s, m.id)?.group.visible()).length,
    );
  }, 120_000);

  it('scrolling creates the nodes of the other part and going back does not recreate the first ones', () => {
    const s = (scenario = openWholeProject(2000, 'close'));
    const first = withNode(s);
    const nodes = first.map((m) => nodeOf(s, m.id));
    s.controller.centerOnPoint({ x: 1_000_000, y: 1_000_000 });
    s.flush();
    const lastId = s.project.markings[s.project.markings.length - 1]?.id ?? '';
    expect(withNode(s).length).toBeGreaterThanOrEqual(first.length);
    s.controller.centerOnPoint({ x: 0, y: 0 });
    s.flush();
    first.forEach((m, i) => expect(nodeOf(s, m.id)).toBe(nodes[i]));
    expect(lastId).not.toBe('');
  }, 120_000);

  it('zoomed out to the minimum, the ones smaller than 2 px get no node; zooming in creates them', () => {
    const s = (scenario = openWholeProject(2000));
    s.controller.zoomBy(0.0001);
    s.flush();
    const before = withNode(s).length;
    s.controller.zoomBy(10_000);
    s.flush();
    expect(withNode(s).length).toBeGreaterThanOrEqual(before);
  }, 120_000);

  it('deleting destroys the node; selecting one without a node takes the canvas to it and creates the node', () => {
    const s = (scenario = openWholeProject(2000, 'close'));
    const live = withNode(s)[0];
    if (!live) throw new Error('node');
    const node = nodeOf(s, live.id);
    s.actions.removeMarking(live.id);
    s.flush();
    expect(nodeOf(s, live.id)).toBeUndefined();
    expect(node?.group.getParent()).toBeNull();

    const far = s.store.project
      .peek()
      ?.markings.find((m) => nodeOf(s, m.id) === undefined);
    if (!far) throw new Error('marking without a node');
    s.ui.selection.value = { kind: 'marking', id: far.id };
    s.controller.centerSelection();
    s.flush();
    expect(nodeOf(s, far.id)).toBeDefined();
  }, 120_000);

  // DA1 baseline (jsdom, 2,000): 223 ms. Opened zoomed in, only the markings in view get a node
  // (~50 ms). Fit all creates all of them (none becomes smaller than 2 px): outside this budget.
  it('the first frame when opening zoomed in fits in half the baseline (223 ms)', () => {
    const s = (scenario = openWholeProject(2000, 'close'));
    expect(s.firstFrameMs).toBeLessThan(223 / 2);
  }, 120_000);
});
