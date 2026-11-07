import { describe, expect, it } from 'vitest';
import { showLayerIndicators } from '../../../src/canvas/renderers/indicatorVisibility';

const base = {
  drawsComponent: true,
  emphasized: false,
  screenWidth: 100,
  screenHeight: 60,
  minScreenSize: 24,
};

describe('showLayerIndicators', () => {
  it('componente grande o bastante: mostra', () => {
    expect(showLayerIndicators(base)).toBe(true);
  });
  it('largura ou altura abaixo do limite: esconde', () => {
    expect(showLayerIndicators({ ...base, screenWidth: 12, screenHeight: 8 })).toBe(
      false,
    );
    expect(showLayerIndicators({ ...base, screenWidth: 12 })).toBe(false);
    expect(showLayerIndicators({ ...base, screenHeight: 23 })).toBe(false);
    expect(showLayerIndicators({ ...base, screenWidth: 24, screenHeight: 24 })).toBe(
      true,
    );
  });
  it('selecionada ou sob o mouse mostra tudo', () => {
    expect(
      showLayerIndicators({
        ...base,
        screenWidth: 12,
        screenHeight: 8,
        emphasized: true,
      }),
    ).toBe(true);
  });
  it('marcação sem componente mostra sempre', () => {
    expect(
      showLayerIndicators({
        ...base,
        screenWidth: 12,
        screenHeight: 8,
        drawsComponent: false,
      }),
    ).toBe(true);
  });
});
