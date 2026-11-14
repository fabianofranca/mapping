import Konva from 'konva/lib/Core';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OverlayRenderer } from '../../../src/canvas/renderers/overlay';
import { OVERLAY_KEYS, type Frame } from '../../../src/canvas/frame';
import {
  createMarking,
  setMarkingAnchor,
  type Placement,
  type Project,
} from '../../../src/model';
import { canvasProject, editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

// Anchor link (R4, decision 13): the anchored marking, selected or under the mouse, shows a thin
// dashed line to the anchor; it disappears otherwise. Pan and zoom do not recompute it beyond the
// transform (the points stay, only the thickness and the dashes follow the zoom).

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

const PLACEMENTS: ReadonlyMap<string, Placement> = new Map([
  ['I1', { x: 0, y: 0, scale: 1 }],
  ['I2', { x: 1100, y: 0, scale: 1 }],
]);

/** `canvasProject` with M4 (100×100 at 800,100) anchored to M1 (600×500 at 100,100), both in I1. */
function anchoredProject(): Project {
  const p = createMarking(canvasProject(), {
    id: 'M4',
    containerId: 'I1',
    rect: { x: 800, y: 100, width: 100, height: 100 },
  });
  return setMarkingAnchor(p, 'M4', { to: 'M1' });
}

function setup(project: Project = anchoredProject()) {
  const overlay = new OverlayRenderer(new Konva.Layer(), document.createElement('div'));
  const editor = editorFor(project);
  const render = (overrides: Partial<Frame> = {}, placements = PLACEMENTS) =>
    overlay.render(frameOf(editor, overrides), placements);
  const shown = () => overlay.anchorLinkNodes().filter((n) => n.line.visible());
  return { overlay, render, shown };
}

const M4_CENTER = [850, 150];
const M1_CENTER = [400, 350];

describe('anchor link on the canvas', () => {
  it('with no selection or mouse, no line', () => {
    const { render, shown } = setup();
    render();
    expect(shown()).toHaveLength(0);
  });

  it('the selected anchored marking shows the dashed line from its center to the anchor center', () => {
    const { render, shown } = setup();
    render({ selection: { kind: 'marking', id: 'M4' } });
    const [link] = shown();
    expect(shown()).toHaveLength(1);
    expect(link?.line.points()).toEqual([...M4_CENTER, ...M1_CENTER]);
    // Thin dashed stroke in the control color, with the halo underneath.
    expect(link?.line.getAttrs()).toMatchObject({
      stroke: TOKENS.borderControl,
      strokeWidth: 2,
      dash: [6, 4],
    });
    expect(link?.halo.getAttrs()).toMatchObject({
      visible: true,
      stroke: TOKENS.halo,
      strokeWidth: 4,
      dash: [6, 4],
    });
  });

  it('the anchored marking under the mouse shows the line, and it disappears on leaving', () => {
    const { render, shown } = setup();
    render({ hoverMarking: 'M4' });
    expect(shown()).toHaveLength(1);
    expect(shown()[0]?.line.points()).toEqual([...M4_CENTER, ...M1_CENTER]);
    render({ hoverMarking: null });
    expect(shown()).toHaveLength(0);
  });

  it('the selected or hovered anchor (not the anchored marking) shows no line', () => {
    const { render, shown } = setup();
    render({ selection: { kind: 'marking', id: 'M1' }, hoverMarking: 'M1' });
    expect(shown()).toHaveLength(0);
  });

  it('a marking without an anchor and a selected container show no line', () => {
    const { render, shown } = setup();
    render({ selection: { kind: 'marking', id: 'M2' }, hoverMarking: 'M3' });
    expect(shown()).toHaveLength(0);
    render({ selection: { kind: 'image', id: 'I1' } });
    expect(shown()).toHaveLength(0);
  });

  it('the selected one and the hovered one, both anchored, show both links', () => {
    let p = createMarking(anchoredProject(), {
      id: 'M5',
      containerId: 'I1',
      rect: { x: 800, y: 300, width: 100, height: 100 },
    });
    p = setMarkingAnchor(p, 'M5', { to: 'M4' });
    const { render, shown } = setup(p);
    render({ selection: { kind: 'marking', id: 'M4' }, hoverMarking: 'M5' });
    expect(shown().map((n) => n.line.points())).toEqual([
      [...M4_CENTER, ...M1_CENTER],
      [850, 350, ...M4_CENTER],
    ]);
    // The same item selected and under the mouse has a single link.
    render({ selection: { kind: 'marking', id: 'M4' }, hoverMarking: 'M4' });
    expect(shown()).toHaveLength(1);
  });

  it('follows the frame positions (the drag preview) and the container placement', () => {
    const { render, shown } = setup();
    render(
      { selection: { kind: 'marking', id: 'M4' } },
      new Map([...PLACEMENTS, ['I1', { x: 50, y: 20, scale: 2 }]]),
    );
    expect(shown()[0]?.line.points()).toEqual([
      50 + 850 * 2,
      20 + 150 * 2,
      50 + 400 * 2,
      20 + 350 * 2,
    ]);
  });

  it('pan does not change the link; zoom only changes the thickness and the dashes, not the points', () => {
    const { render, shown } = setup();
    const selection = { kind: 'marking', id: 'M4' } as const;
    render({ selection, viewport: { x: 0, y: 0, scale: 1 } });
    const points = shown()[0]?.line.points();
    render({ selection, viewport: { x: -300, y: -120, scale: 1 } });
    expect(shown()[0]?.line.points()).toEqual(points);
    render({ selection, viewport: { x: -300, y: -120, scale: 4 } });
    const zoomed = shown()[0];
    expect(zoomed?.line.points()).toEqual(points);
    expect(zoomed?.line.strokeWidth()).toBe(2 / 4);
    expect(zoomed?.line.dash()).toEqual([6 / 4, 4 / 4]);
  });

  it('the hover is among the keys that redo the overlays', () => {
    expect(OVERLAY_KEYS).toContain('hoverMarking');
  });
});
