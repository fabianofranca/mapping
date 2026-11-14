import { describe, expect, it } from 'vitest';
import {
  SEMANTIC_MIN_HEIGHT,
  SEMANTIC_MIN_WIDTH,
  semanticMode,
} from '../../src/canvas/semanticText';

describe('semantic zoom: when it appears', () => {
  it('only the header, and only with the minimum size of the marking on screen', () => {
    const at = (screenWidth: number, screenHeight: number) =>
      semanticMode({ screenWidth, screenHeight });
    expect(at(SEMANTIC_MIN_WIDTH - 1, 500)).toBe('none');
    expect(at(500, SEMANTIC_MIN_HEIGHT - 1)).toBe('none');
    expect(at(SEMANTIC_MIN_WIDTH, SEMANTIC_MIN_HEIGHT)).toBe('header');
    expect(at(5000, 5000)).toBe('header');
  });
});
