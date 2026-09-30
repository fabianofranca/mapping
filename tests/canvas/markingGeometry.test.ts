import { describe, expect, it } from 'vitest';
import {
  canvasToImagePixel,
  handleHitRadius,
  isDrawableRect,
  markingCanvasRect,
  markingChainAt,
  nextInChain,
  rectFromPoints,
  resizeMarkingRect,
} from '../../src/canvas/markingGeometry';
import { createMarking, markingRectLimits } from '../../src/model';
import { marking, sampleProject } from '../model/fixtures';

describe('geometria das marcações no canvas', () => {
  const placement = { x: 100, y: 50, scale: 0.25 };

  it('converte pixels da imagem ↔ canvas', () => {
    const rect = { x: 400, y: 200, width: 80, height: 40 };
    expect(markingCanvasRect(placement, rect)).toEqual({
      x: 200,
      y: 100,
      width: 20,
      height: 10,
    });
    expect(canvasToImagePixel(placement, { x: 200, y: 100 })).toEqual({ x: 400, y: 200 });
  });

  it('desenho: retângulo inteiro entre dois pontos, limitado à imagem', () => {
    const image = { width: 1000, height: 500 };
    expect(rectFromPoints({ x: 10.4, y: 20.6 }, { x: 5, y: 5 }, image)).toEqual({
      x: 5,
      y: 5,
      width: 5,
      height: 16,
    });
    expect(rectFromPoints({ x: 900, y: 400 }, { x: 1500, y: -30 }, image)).toEqual({
      x: 900,
      y: 0,
      width: 100,
      height: 400,
    });
    expect(isDrawableRect({ x: 0, y: 0, width: 8, height: 8 })).toBe(true);
    expect(isDrawableRect({ x: 0, y: 0, width: 7, height: 100 })).toBe(false);
  });

  it('cadeia sob o ponto: a mais interna primeiro, depois os ancestrais', () => {
    const p = sampleProject();
    // M3 (Fechadura) fica em 1300..1350 × 1250..1300, dentro de M2 e M1.
    const ids = (x: number, y: number, imageId = 'I1') =>
      markingChainAt(p.markings, imageId, { x, y }).map((m) => m.id);
    expect(ids(1320, 1270)).toEqual(['M3', 'M2', 'M1']);
    expect(ids(1500, 1300)).toEqual(['M2', 'M1']);
    expect(ids(1900, 1900)).toEqual(['M1']);
    expect(ids(10, 10)).toEqual([]);
    expect(ids(10, 10, 'I2')).toEqual(['M4']);
  });

  it('entre irmãs sobrepostas, a de menor área vence', () => {
    let p = sampleProject();
    p = createMarking(p, {
      id: 'M5',
      imageId: 'I1',
      rect: { x: 1500, y: 1500, width: 400, height: 400 },
    });
    p = createMarking(p, {
      id: 'M6',
      imageId: 'I1',
      rect: { x: 1400, y: 1600, width: 200, height: 200 },
    });
    expect(marking(p, 'M5').parentId).toBe('M1');
    expect(marking(p, 'M6').parentId).toBe('M1');
    const chain = markingChainAt(p.markings, 'I1', { x: 1550, y: 1650 });
    expect(chain.map((m) => m.id)).toEqual(['M6', 'M1']);
  });

  it('tocar de novo no mesmo ponto sobe para o pai e depois volta à mais interna', () => {
    const chain = ['M3', 'M2', 'M1'];
    expect(nextInChain(chain, null, false)).toBe('M3');
    expect(nextInChain(chain, 'M3', true)).toBe('M2');
    expect(nextInChain(chain, 'M2', true)).toBe('M1');
    expect(nextInChain(chain, 'M1', true)).toBe('M3');
    // Outro ponto (ou seleção fora da cadeia): volta para a mais interna.
    expect(nextInChain(chain, 'M2', false)).toBe('M3');
    expect(nextInChain(chain, 'M4', true)).toBe('M3');
    expect(nextInChain([], 'M1', true)).toBeNull();
  });

  it('redimensionar: canto oposto fixo, inteiros e tamanho mínimo', () => {
    const limits = { outer: { x: 0, y: 0, width: 1000, height: 1000 }, inner: null };
    const start = { x: 100, y: 100, width: 200, height: 100 };
    expect(resizeMarkingRect(start, 'se', { x: 400.4, y: 250.6 }, limits)).toEqual({
      x: 100,
      y: 100,
      width: 300,
      height: 151,
    });
    expect(resizeMarkingRect(start, 'nw', { x: 50, y: 20 }, limits)).toEqual({
      x: 50,
      y: 20,
      width: 250,
      height: 180,
    });
    // Cruzar o canto oposto para no tamanho mínimo.
    expect(resizeMarkingRect(start, 'ne', { x: 0, y: 900 }, limits)).toEqual({
      x: 100,
      y: 192,
      width: 8,
      height: 8,
    });
  });

  it('redimensionar: a filha não sai do pai e o pai envolve as filhas', () => {
    const p = sampleProject();
    const m3 = marking(p, 'M3');
    // M3 dentro de M2 (1200..1600 × 1200..1400).
    expect(
      resizeMarkingRect(m3.rect, 'se', { x: 5000, y: 5000 }, markingRectLimits(p, 'M3')),
    ).toEqual({ x: 1300, y: 1250, width: 300, height: 150 });
    // M1 precisa envolver M2 (1200..1600 × 1200..1400).
    const m1 = marking(p, 'M1');
    expect(
      resizeMarkingRect(m1.rect, 'nw', { x: 1900, y: 1900 }, markingRectLimits(p, 'M1')),
    ).toEqual({ x: 1200, y: 1200, width: 800, height: 800 });
    expect(
      resizeMarkingRect(m1.rect, 'se', { x: 0, y: 0 }, markingRectLimits(p, 'M1')),
    ).toEqual({ x: 1000, y: 1000, width: 600, height: 400 });
  });

  it('alças encolhem em marcações pequenas, sem ficar abaixo de 24 px', () => {
    expect(handleHitRadius(300)).toBe(22);
    expect(handleHitRadius(45)).toBe(15);
    expect(handleHitRadius(6)).toBe(12);
  });
});
