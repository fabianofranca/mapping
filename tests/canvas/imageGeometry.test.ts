import { describe, expect, it } from 'vitest';
import {
  MIN_IMAGE_CANVAS_SIZE,
  cornerAt,
  imageAt,
  imagesBounds,
  resizeFromCorner,
} from '../../src/canvas/imageGeometry';
import { imageCanvasRect } from '../../src/model';
import { image, sampleProject } from '../model/fixtures';

// I1: 4000×3000 em (0, 0) com escala 0.25 → 1000×750. I2: 1000×1000 à direita.
const p = sampleProject();
const i1 = image(p, 'I1');

describe('geometria das imagens no canvas', () => {
  it('encontra a imagem sob o ponto', () => {
    expect(imageAt(p.images, { x: 10, y: 10 })?.id).toBe('I1');
    expect(imageAt(p.images, { x: 1100, y: 10 })?.id).toBe('I2');
    expect(imageAt(p.images, { x: 1025, y: 10 })).toBeNull();
    expect(imageAt(p.images, { x: -1, y: 10 })).toBeNull();
  });

  it('encontra o canto mais próximo dentro do raio', () => {
    const rect = imageCanvasRect(i1, i1.placement);
    expect(cornerAt(rect, { x: 3, y: -4 }, 10)).toBe('nw');
    expect(cornerAt(rect, { x: 995, y: 755 }, 10)).toBe('se');
    expect(cornerAt(rect, { x: 1000, y: 0 }, 10)).toBe('ne');
    expect(cornerAt(rect, { x: 500, y: 0 }, 10)).toBeNull();
  });

  it('redimensiona pelo canto SE mantendo o NW fixo e a proporção', () => {
    const next = resizeFromCorner(i1, i1.placement, 'se', { x: 2000, y: 900 });
    expect(next).toEqual({ x: 0, y: 0, scale: 0.5 });
  });

  it('redimensiona pelo canto NW mantendo o SE fixo', () => {
    const next = resizeFromCorner(i1, i1.placement, 'nw', { x: 500, y: 375 });
    expect(next.scale).toBeCloseTo(0.125);
    const rect = imageCanvasRect(i1, next);
    expect(rect.x + rect.width).toBeCloseTo(1000);
    expect(rect.y + rect.height).toBeCloseTo(750);
  });

  it('não encolhe abaixo do tamanho mínimo, mesmo cruzando o canto oposto', () => {
    const next = resizeFromCorner(i1, i1.placement, 'se', { x: -500, y: -500 });
    const rect = imageCanvasRect(i1, next);
    expect(Math.max(rect.width, rect.height)).toBeCloseTo(MIN_IMAGE_CANVAS_SIZE);
    expect(rect.x).toBe(0);
    expect(rect.y).toBe(0);
  });

  it('caixa que envolve as imagens', () => {
    expect(imagesBounds([])).toBeNull();
    const i2 = image(p, 'I2');
    const r2 = imageCanvasRect(i2, i2.placement);
    expect(imagesBounds(p.images)).toEqual({
      x: 0,
      y: 0,
      width: r2.x + r2.width,
      height: Math.max(750, r2.height),
    });
  });
});
