import { describe, expect, it } from 'vitest';
import {
  MIN_IMAGE_CANVAS_SIZE,
  containerTitleAt,
  cornerAt,
  imageAt,
  imagesBounds,
  resizeFromCorner,
} from '../../src/canvas/imageGeometry';
import { createMarking, imageCanvasRect } from '../../src/model';
import { image, sampleProject } from '../model/fixtures';

// I1: 4000×3000 em (0, 0) com escala 0.25 → 1000×750. I2: 1000×1000 à direita.
const p = sampleProject();
const i1 = image(p, 'I1');

describe('geometria das imagens no canvas', () => {
  it('encontra a imagem sob o ponto', () => {
    expect(imageAt(p.containers, { x: 10, y: 10 })?.id).toBe('I1');
    expect(imageAt(p.containers, { x: 1100, y: 10 })?.id).toBe('I2');
    expect(imageAt(p.containers, { x: 1025, y: 10 })).toBeNull();
    expect(imageAt(p.containers, { x: -1, y: 10 })).toBeNull();
  });

  it('encontra o container pelo rótulo do nome, respeitando a ordem de desenho', () => {
    // Rótulo de I1 em cima dele (y -20..-4) e um de I2 sobre o corpo de I1 (sem tapar I2).
    const titles = new Map([
      ['I1', { x: 0, y: -20, width: 100, height: 16 }],
      ['I2', { x: 1100, y: -20, width: 100, height: 16 }],
    ]);
    expect(containerTitleAt(p.containers, titles, { x: 50, y: -10 })?.id).toBe('I1');
    expect(containerTitleAt(p.containers, titles, { x: 1150, y: -10 })?.id).toBe('I2');
    // Fora do texto (a faixa é mais larga que o texto) e no corpo: nada.
    expect(containerTitleAt(p.containers, titles, { x: 500, y: -10 })).toBeNull();
    expect(containerTitleAt(p.containers, titles, { x: 50, y: 100 })).toBeNull();
    // Rótulo coberto pelo corpo de um container de cima: não vale.
    const covered = new Map([['I1', { x: 1100, y: 100, width: 100, height: 16 }]]);
    expect(containerTitleAt(p.containers, covered, { x: 1150, y: 110 })).toBeNull();
    // Rótulo de um container de cima sobre o corpo de um de baixo vence.
    const over = new Map([['I2', { x: 10, y: 100, width: 100, height: 16 }]]);
    expect(containerTitleAt(p.containers, over, { x: 50, y: 110 })?.id).toBe('I2');
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
    expect(imagesBounds(p.containers)).toEqual({
      x: 0,
      y: 0,
      width: r2.x + r2.width,
      height: Math.max(750, r2.height),
    });
  });

  it('inclui as marcações do canvas (flutuantes também), mas não as de container', () => {
    const withCanvas = createMarking(p, {
      id: 'C1',
      containerId: null,
      rect: { x: -300, y: -200, width: 400, height: 300 },
    });
    const noted = createMarking(withCanvas, {
      id: 'N1',
      containerId: null,
      rect: { x: 5000, y: 900, width: 100, height: 100 },
      floating: true,
    });
    const r2 = imageCanvasRect(image(p, 'I2'), image(p, 'I2').placement);
    expect(imagesBounds(p.containers, p.markings)).toEqual(imagesBounds(p.containers));
    expect(imagesBounds(withCanvas.containers, withCanvas.markings)).toEqual({
      x: -300,
      y: -200,
      width: r2.x + r2.width + 300,
      height: Math.max(750, r2.height) + 200,
    });
    expect(imagesBounds(noted.containers, noted.markings)).toMatchObject({
      x: -300,
      y: -200,
      width: 5400,
      height: 1200,
    });
    // Só marcações do canvas, sem imagens.
    expect(imagesBounds([], noted.markings)).toEqual({
      x: -300,
      y: -200,
      width: 5400,
      height: 1200,
    });
  });
});
