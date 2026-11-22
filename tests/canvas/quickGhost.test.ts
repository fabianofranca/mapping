import { describe, expect, it } from 'vitest';
import { quickGhost } from '../../src/canvas/quickGhost';
import { unionRect } from '../../src/canvas/minimap';
import { markingCanvasRect } from '../../src/canvas/markingGeometry';
import {
  IDENTITY_PLACEMENT,
  createMarking,
  previewProject,
  projectIndex,
  quickReviewOf,
  renameMarking,
  setMarkingRect,
  type ComponentDrawing,
  type ComponentDrawings,
  type Project,
  type Proposal,
} from '../../src/model';
import type { QuickReviewView } from '../../src/store/quickReview';
import { sampleProject } from '../model/fixtures';
import { propose } from '../model/proposalFixtures';

// The ghost of the quick review on the canvas (stage #1932, QR2): the review marks, the drawings
// and the box of ONLY the markings the proposal creates or changes. Pure, without Konva.

const base = sampleProject();

function viewOf(p: Proposal, committed: Project = base): QuickReviewView {
  const eligibility = quickReviewOf(p, committed);
  if (!eligibility.ok) throw new Error(eligibility.reason);
  return {
    proposal: p,
    threadId: 'T1',
    spaceId: eligibility.spaceId,
    created: eligibility.created,
    changed: eligibility.changed,
    revised: 0,
    preview: previewProject(committed, p).project,
    blocked: null,
  };
}

const drawingOf = (id: string): ComponentDrawing =>
  ({ markingId: id }) as ComponentDrawing;
const drawingsOf = (...ids: string[]): ComponentDrawings =>
  new Map(ids.map((id) => [id, drawingOf(id)]));

describe('quickGhost', () => {
  it('a created marking: dashed line and the created badge', () => {
    const after = createMarking(base, {
      id: 'M9',
      containerId: 'I1',
      rect: { x: 10, y: 10, width: 100, height: 50 },
      name: 'Button',
    });
    const ghost = quickGhost(viewOf(propose(base, after)), base, drawingsOf('M9'));
    expect(ghost.proposalId).toBe('P1');
    expect(ghost.review.view).toBe('proposed');
    expect(ghost.review.markings.get('M9')).toEqual({
      line: 'created',
      dim: false,
      badges: ['created'],
    });
    expect(ghost.items).toBe(1);
  });

  it('a changed marking (name): the changed line and badge', () => {
    const after = renameMarking(base, 'M1', 'Front door');
    const ghost = quickGhost(viewOf(propose(base, after)), base, drawingsOf());
    const mark = ghost.review.markings.get('M1');
    expect(mark?.line).toBe('changed');
    expect(mark?.badges).toEqual(['changed']);
  });

  it('a rect-only change: the moved badge and a ghost entry at the old position', () => {
    const after = setMarkingRect(base, 'M2', {
      x: 1210,
      y: 1210,
      width: 400,
      height: 200,
    });
    const ghost = quickGhost(viewOf(propose(base, after)), base, drawingsOf());
    expect(ghost.review.markings.get('M2')?.badges).toEqual(['moved']);
    expect(ghost.review.ghosts).toHaveLength(1);
    expect(ghost.review.ghosts[0]?.rect).toEqual({
      x: 1200,
      y: 1200,
      width: 400,
      height: 200,
    });
    expect(ghost.review.images.size).toBe(0);
    expect(ghost.review.removed).toEqual([]);
  });

  it('markings that are not created or changed are absent', () => {
    const after = renameMarking(base, 'M1', 'Front door');
    const ghost = quickGhost(viewOf(propose(base, after)), base, drawingsOf());
    expect([...ghost.review.markings.keys()]).toEqual(['M1']);
  });

  it('keeps the drawings of only the ghost markings', () => {
    let after = renameMarking(base, 'M1', 'Front door');
    after = createMarking(after, {
      id: 'M9',
      containerId: 'I1',
      rect: { x: 200, y: 200, width: 50, height: 50 },
    });
    const all = drawingsOf('M1', 'M9', 'M2', 'M4');
    const ghost = quickGhost(viewOf(propose(base, after)), base, all);
    expect([...ghost.drawings.keys()].sort()).toEqual(['M1', 'M9']);
    expect(ghost.items).toBe(2);
  });

  it('a marking without a drawing is simply absent from the drawings', () => {
    const after = renameMarking(base, 'M1', 'Front door');
    const ghost = quickGhost(viewOf(propose(base, after)), base, drawingsOf('M2'));
    expect(ghost.drawings.size).toBe(0);
  });

  it('the box is the union of the preview rects in canvas units, in a placed container', () => {
    let after = setMarkingRect(base, 'M4', { x: 20, y: 30, width: 100, height: 100 });
    after = createMarking(after, {
      id: 'M9',
      containerId: 'I2',
      rect: { x: 300, y: 300, width: 50, height: 50 },
    });
    const view = viewOf(propose(base, after));
    const placement = projectIndex(view.preview).containers.get('I2')?.placement;
    if (!placement) throw new Error('placement');
    expect(placement).not.toEqual(IDENTITY_PLACEMENT);
    const a = markingCanvasRect(placement, { x: 20, y: 30, width: 100, height: 100 });
    const b = markingCanvasRect(placement, { x: 300, y: 300, width: 50, height: 50 });
    expect(quickGhost(view, base, drawingsOf()).box).toEqual(unionRect(a, b));
  });

  it('the box of a canvas marking (space null) is its own rect', () => {
    const after = createMarking(base, {
      id: 'M9',
      containerId: null,
      rect: { x: 90000, y: 90000, width: 100, height: 50 },
    });
    const view = viewOf(propose(base, after));
    expect(quickGhost(view, base, drawingsOf()).box).toEqual({
      x: 90000,
      y: 90000,
      width: 100,
      height: 50,
    });
  });

  it('the box is null when no ghost marking resolves', () => {
    const after = renameMarking(base, 'M1', 'Front door');
    const view = viewOf(propose(base, after));
    const empty: QuickReviewView = {
      ...view,
      preview: { ...view.preview, markings: [] },
    };
    const ghost = quickGhost(empty, base, drawingsOf());
    expect(ghost.box).toBeNull();
  });

  it('memoizes by view, drawings and committed project', () => {
    const after = renameMarking(base, 'M1', 'Front door');
    const view = viewOf(propose(base, after));
    const drawings = drawingsOf('M1');
    const first = quickGhost(view, base, drawings);
    expect(quickGhost(view, base, drawings)).toBe(first);
    expect(quickGhost(view, base, drawingsOf('M1'))).not.toBe(first);
  });

  it('does not mutate the view', () => {
    const after = renameMarking(base, 'M1', 'Front door');
    const view = viewOf(propose(base, after));
    const before = JSON.stringify(view);
    quickGhost(view, base, drawingsOf('M1'));
    expect(JSON.stringify(view)).toBe(before);
  });
});
