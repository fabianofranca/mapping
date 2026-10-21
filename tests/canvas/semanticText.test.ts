import { describe, expect, it } from 'vitest';
import {
  SEMANTIC_MIN_HEIGHT,
  SEMANTIC_MIN_WIDTH,
  semanticMode,
} from '../../src/canvas/semanticText';

describe('zoom semântico: quando aparece', () => {
  it('só o cabeçalho, e só com o tamanho mínimo da marcação na tela', () => {
    const at = (screenWidth: number, screenHeight: number) =>
      semanticMode({ screenWidth, screenHeight });
    expect(at(SEMANTIC_MIN_WIDTH - 1, 500)).toBe('none');
    expect(at(500, SEMANTIC_MIN_HEIGHT - 1)).toBe('none');
    expect(at(SEMANTIC_MIN_WIDTH, SEMANTIC_MIN_HEIGHT)).toBe('header');
    expect(at(5000, 5000)).toBe('header');
  });
});
