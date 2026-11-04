import { describe, expect, it } from 'vitest';
import { OVERLAY_KEYS, createInteractionState } from '../../src/canvas/frame';

describe('estado de interação', () => {
  it('o retângulo de seleção começa vazio e entra nas chaves das sobreposições', () => {
    const state = createInteractionState();
    expect(state.marquee.value).toBeNull();
    expect(OVERLAY_KEYS).toContain('marquee');
  });
});
