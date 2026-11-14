import { describe, expect, it } from 'vitest';
import {
  ALERT_SIZE,
  CORNER_MARGIN,
  REVIEW_BADGE_SIZE,
  TEXT_PADDING,
  cornerLayout,
} from '../../../src/canvas/renderers/metrics';

describe('cornerLayout', () => {
  it('no badge and no alert: only the name, at the text margin', () => {
    expect(cornerLayout(false, false)).toEqual({
      badgeX: null,
      alertX: null,
      nameX: TEXT_PADDING,
    });
    expect(TEXT_PADDING).toBe(4);
  });

  it('alert only: against the corner margin, the name after it', () => {
    const layout = cornerLayout(false, true);
    expect(layout).toEqual({ badgeX: null, alertX: 3, nameX: 20 });
    expect(layout.alertX).toBe(CORNER_MARGIN);
    expect(layout.nameX).toBe(CORNER_MARGIN + ALERT_SIZE + TEXT_PADDING);
  });

  it('badge only: the badge at a third of its size, the name after it', () => {
    const layout = cornerLayout(true, false);
    expect(layout.badgeX).toBeCloseTo(14 / 3, 10);
    expect(layout.badgeX).toBe(REVIEW_BADGE_SIZE / 3);
    expect(layout.alertX).toBeNull();
    expect(layout.nameX).toBeCloseTo(22.67, 2);
  });

  it('badge and alert: the alert after the badge, the name after the alert', () => {
    const layout = cornerLayout(true, true);
    expect(layout.badgeX).toBe(REVIEW_BADGE_SIZE / 3);
    expect(layout.alertX).toBe(REVIEW_BADGE_SIZE / 3 + REVIEW_BADGE_SIZE + CORNER_MARGIN);
    expect(layout.alertX).toBeCloseTo(21.67, 2);
    expect(layout.nameX).toBeCloseTo(38.67, 2);
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    'review=%s incomplete=%s: no mark starts before the previous one ends plus the margin',
    (review, incomplete) => {
      const { badgeX, alertX, nameX } = cornerLayout(review, incomplete);
      let end = 0;
      let gap = CORNER_MARGIN;
      if (badgeX !== null) {
        expect(badgeX).toBeGreaterThanOrEqual(0);
        end = badgeX + REVIEW_BADGE_SIZE;
      }
      if (alertX !== null) {
        expect(alertX).toBeGreaterThanOrEqual(end + (badgeX === null ? 0 : gap));
        end = alertX + ALERT_SIZE;
      }
      gap = TEXT_PADDING;
      expect(nameX).toBeGreaterThanOrEqual(end + gap);
    },
  );
});
