// Component drawings on demand (CD2 of the canvas-performance stage, decision 3): a marking's
// drawing is only mounted (`renderScene`) in the first frame in which it is on screen and drawn, and
// stays until it leaves the project or the drawing object changes.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setShowComponentsOnPhotos } from '../../src/store/settings';
import type { ComponentLayerRenderer } from '../../src/canvas/components/componentLayer';
import { openWholeProject, type WholeProjectScenario } from './wholeProjectScenario';

let scenario: WholeProjectScenario | null = null;
// The scenario's containers have a photo: the component drawing only shows with the option on.
beforeEach(() => setShowComponentsOnPhotos(true));
afterEach(() => {
  scenario?.destroy();
  scenario = null;
  setShowComponentsOnPhotos(false);
});

const mounted = (s: WholeProjectScenario) =>
  (s.controller as unknown as { componentLayer: ComponentLayerRenderer }).componentLayer
    .mountedCount;

/** Takes the view to drawing `index` (project order). */
function goTo(s: WholeProjectScenario, index: number): void {
  const drawing = [...s.derived.drawingsOf(s.project).values()][index];
  const marking = s.project.markings.find((m) => m.id === drawing?.markingId);
  const placement = s.project.containers.find(
    (c) => c.id === marking?.containerId,
  )?.placement;
  if (!marking || !placement) throw new Error('fixture');
  s.controller.zoomTo(1);
  s.controller.centerOnPoint({
    x: placement.x + (marking.rect.x + marking.rect.width / 2) * placement.scale,
    y: placement.y + (marking.rect.y + marking.rect.height / 2) * placement.scale,
  });
  s.flush();
}

describe('component drawings on demand (2,000 markings, with components)', () => {
  it('zoomed in on a container, only the drawings in view are mounted', () => {
    const s = (scenario = openWholeProject(2000, 'close', { components: true }));
    const total = s.derived.drawingsOf(s.project).size;
    expect(total).toBeGreaterThan(400);
    goTo(s, 0);
    expect(mounted(s)).toBeGreaterThan(0);
    expect(mounted(s)).toBeLessThan(total / 4);
    // The host attribute still counts all the ones that appear (the scripts read it).
    expect(Number(s.container.dataset.components)).toBe(total);
  }, 120_000);

  it('scrolling to another container mounts its drawings and going back does not destroy the first ones', () => {
    const s = (scenario = openWholeProject(2000, 'close', { components: true }));
    const total = s.derived.drawingsOf(s.project).size;
    goTo(s, 0);
    const first = mounted(s);
    expect(first).toBeGreaterThan(0);
    goTo(s, total - 1);
    expect(mounted(s)).toBeGreaterThan(first);
    const second = mounted(s);
    goTo(s, 0);
    expect(mounted(s)).toBe(second);
    expect(mounted(s)).toBeLessThanOrEqual(total);
  }, 120_000);
});
