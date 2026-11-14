import { describe, expect, it } from 'vitest';
import {
  arrowDetail,
  type ArrowDetailInput,
  type ArrowEnd,
} from '../../../src/canvas/renderers/arrowDetail';

const BIG: ArrowEnd = { screenWidth: 100, screenHeight: 100, always: false };
const dot = (side: number, always = false): ArrowEnd => ({
  screenWidth: side,
  screenHeight: side,
  always,
});

function input(over: Partial<ArrowDetailInput> = {}): ArrowDetailInput {
  return {
    screenLength: 100,
    always: false,
    from: BIG,
    to: BIG,
    minFull: 24,
    hide: 2,
    ...over,
  };
}

describe('arrowDetail', () => {
  it('a long arrow with visible ends is full', () => {
    expect(arrowDetail(input())).toBe('full');
  });

  it('length: 23 px is only the stroke and 24 px is full', () => {
    expect(arrowDetail(input({ screenLength: 23 }))).toBe('thin');
    expect(arrowDetail(input({ screenLength: 24 }))).toBe('full');
  });

  it('hidden only if both ends are invisible: 1 px in both measures hides it, 2 px does not', () => {
    expect(arrowDetail(input({ from: dot(1), to: dot(1) }))).toBe('hidden');
    expect(arrowDetail(input({ from: dot(2), to: dot(1) }))).not.toBe('hidden');
    expect(arrowDetail(input({ from: dot(1), to: dot(2) }))).not.toBe('hidden');
    // One measure is enough for the end not to be invisible.
    const thinTall: ArrowEnd = { screenWidth: 1, screenHeight: 2, always: false };
    expect(arrowDetail(input({ from: thinTall, to: dot(1) }))).not.toBe('hidden');
  });

  it('an arrow between a visible end and an invisible one is not hidden', () => {
    expect(arrowDetail(input({ from: dot(1), to: BIG }))).toBe('full');
    expect(arrowDetail(input({ from: BIG, to: dot(1), screenLength: 10 }))).toBe('thin');
  });

  it('one that links two invisible ends is hidden whether long or short', () => {
    expect(arrowDetail(input({ from: dot(1), to: dot(1), screenLength: 500 }))).toBe(
      'hidden',
    );
    expect(arrowDetail(input({ from: dot(1), to: dot(1), screenLength: 5 }))).toBe(
      'hidden',
    );
  });

  it('the selected arrow is always full', () => {
    const tiny = { from: dot(1), to: dot(1), screenLength: 3 };
    expect(arrowDetail(input({ ...tiny, always: true }))).toBe('full');
  });

  it('one linked to a selected or hovered marking is always full', () => {
    const tiny = { screenLength: 3 };
    expect(arrowDetail(input({ ...tiny, from: dot(1, true), to: dot(1) }))).toBe('full');
    expect(arrowDetail(input({ ...tiny, from: dot(1), to: dot(1, true) }))).toBe('full');
  });
});
