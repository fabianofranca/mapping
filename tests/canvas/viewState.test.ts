import { describe, expect, it } from 'vitest';
import { createCanvasViewState, sameRect } from '../../src/canvas/viewState';

describe('sameRect', () => {
  const r = { x: 1, y: 2, width: 3, height: 4 };

  it('is null-safe', () => {
    expect(sameRect(null, null)).toBe(true);
    expect(sameRect(r, null)).toBe(false);
    expect(sameRect(null, r)).toBe(false);
  });

  it('compares the four fields', () => {
    expect(sameRect(r, { ...r })).toBe(true);
    expect(sameRect(r, { ...r, height: 5 })).toBe(false);
  });
});

describe('createCanvasViewState', () => {
  it('starts without a quick review box', () => {
    expect(createCanvasViewState().quickReviewBox.value).toBeNull();
  });
});
