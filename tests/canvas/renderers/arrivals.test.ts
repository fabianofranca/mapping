import Konva from 'konva/lib/Core';
import { Text as KonvaText } from 'konva/lib/shapes/Text';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { arrivalMarks } from '../../../src/canvas/arrivals';
import { ArrivalRenderer } from '../../../src/canvas/renderers/arrivals';
import { t } from '../../../src/i18n';
import type { Arrival, Project } from '../../../src/model';
import { canvasProject, editorFor, frameOf, installFakeCanvas, TOKENS } from '../harness';

beforeAll(installFakeCanvas);
afterAll(() => vi.restoreAllMocks());

// The "Came from <name>" badge and the "Arrival area" band (PE3, decision 8): size in screen px
// (inverse of the zoom scale), colors only from the theme tokens.

const withArrival = (p: Project, root: string, fromName: string): Project => ({
  ...p,
  arrivals: [...p.arrivals, { root, from: 'V', fromName } satisfies Arrival],
});

function setup(project: Project = withArrival(canvasProject(), 'I2', 'Front')) {
  const editor = editorFor(project);
  const layer = new Konva.Group();
  const renderer = new ArrivalRenderer(layer);
  const frame = (zoom = 1, marks = arrivalMarks(project)) =>
    frameOf(editor, {
      project,
      arrivals: marks,
      viewport: { x: 0, y: 0, scale: zoom },
    });
  return { renderer, frame, layer, project };
}

describe('ArrivalRenderer', () => {
  it('without marks it draws nothing', () => {
    const { renderer, frame } = setup(canvasProject());
    renderer.render(frame());
    expect(renderer.badgeCount).toBe(0);
    expect(renderer.bandVisible).toBe(false);
  });

  it('one badge per root with a mark, with the translated text and the token colors', () => {
    const { renderer, frame } = setup();
    renderer.render(frame());
    expect(renderer.badgeCount).toBe(1);
    const badge = renderer.badge('I2');
    expect(badge?.label.text()).toBe(t('perspective.canvas.cameFrom', { name: 'Front' }));
    // Inverted pill, like the tooltip: light on dark, dark on light (TE1, decision 1).
    expect(badge?.box.fill()).toBe(TOKENS.text);
    expect(badge?.label.fill()).toBe(TOKENS.surface);
  });

  it('the first badge drawing measures the text with the token font', () => {
    const { renderer, frame } = setup();
    const widths: { fontSize: unknown; fontFamily: unknown }[] = [];
    const original = KonvaText.prototype.getTextWidth;
    const spy = vi
      .spyOn(KonvaText.prototype, 'getTextWidth')
      .mockImplementation(function (this: KonvaText) {
        widths.push({
          fontSize: this.getAttr('fontSize'),
          fontFamily: this.getAttr('fontFamily'),
        });
        return original.call(this);
      });
    renderer.render(frame());
    spy.mockRestore();
    expect(widths[0]).toEqual({
      fontSize: TOKENS.type.name.size,
      fontFamily: TOKENS.fontFamily,
    });
  });

  it('the badge has a fixed size on screen: the node scale is the inverse of the zoom', () => {
    const { renderer, frame } = setup();
    renderer.render(frame(2));
    const badge = renderer.badge('I2');
    expect(badge?.group.scaleX()).toBeCloseTo(0.5);
    expect(badge?.box.height()).toBe(TOKENS.arrival.height);
    renderer.render(frame(0.25));
    expect(badge?.group.scaleX()).toBeCloseTo(4);
  });

  it('the band is dashed, has the title and the subtitle, and disappears with the mark', () => {
    const { renderer, frame } = setup();
    renderer.render(frame());
    expect(renderer.bandVisible).toBe(true);
    expect(renderer.band.box.dash().length).toBeGreaterThan(0);
    expect(renderer.band.title.text()).toBe(t('perspective.canvas.arrivalArea'));
    expect(renderer.band.hint.text()).toBe(t('perspective.canvas.arrivalAreaHint'));
    expect(renderer.band.box.stroke()).toBe(TOKENS.selectSecondary);
    renderer.render(frame(1, null));
    expect(renderer.bandVisible).toBe(false);
    expect(renderer.badgeCount).toBe(0);
  });

  it('no band when the mark is in the middle of the content (only the badge)', () => {
    const project = withArrival(canvasProject(), 'I1', 'Front');
    const { renderer, frame } = setup(project);
    renderer.render(frame());
    expect(renderer.badgeCount).toBe(1);
    expect(renderer.bandVisible).toBe(false);
  });
});
