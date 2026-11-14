import { describe, expect, it } from 'vitest';
import { OVERLAY_KEYS, createInteractionState } from '../../src/canvas/frame';

describe('interaction state', () => {
  it('the selection rectangle starts empty and enters the overlay keys', () => {
    const state = createInteractionState();
    expect(state.marquee.value).toBeNull();
    expect(OVERLAY_KEYS).toContain('marquee');
  });
});
