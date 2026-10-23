import { describe, expect, it } from 'vitest';
import {
  canvasToImagePixel,
  floatingAt,
  handleHitRadius,
  isDrawableRect,
  markingCanvasRect,
  markingChainAt,
  nextInChain,
  placementOfSpace,
  rectFromPoints,
  resizeMarkingRect,
} from '../../src/canvas/markingGeometry';
import { IDENTITY_PLACEMENT, createMarking } from '../../src/model';
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

  it('desenho no vazio (sem imagem): inteiros do canvas, sem limite e com negativos', () => {
    expect(rectFromPoints({ x: 10.4, y: 20.6 }, { x: -30, y: -5 }, null)).toEqual({
      x: -30,
      y: -5,
      width: 40,
      height: 26,
    });
    expect(rectFromPoints({ x: 5000, y: 4000 }, { x: 9000.6, y: 4500 }, null)).toEqual({
      x: 5000,
      y: 4000,
      width: 4001,
      height: 500,
    });
  });

  it('o espaço de uma marcação: a posição do container ou a identidade, no canvas', () => {
    const placements = new Map([['I1', placement]]);
    expect(placementOfSpace(placements, 'I1')).toBe(placement);
    expect(placementOfSpace(placements, 'X')).toBeUndefined();
    expect(placementOfSpace(placements, null)).toBe(IDENTITY_PLACEMENT);
  });

  it('cadeia sob o ponto: a mais interna primeiro, depois os ancestrais', () => {
    const p = sampleProject();
    // M3 (Fechadura) fica em 1300..1350 × 1250..1300, dentro de M2 e M1.
    const ids = (x: number, y: number, containerId = 'I1') =>
      markingChainAt(p.markings, containerId, { x, y }).map((m) => m.id);
    expect(ids(1320, 1270)).toEqual(['M3', 'M2', 'M1']);
    expect(ids(1500, 1300)).toEqual(['M2', 'M1']);
    expect(ids(1900, 1900)).toEqual(['M1']);
    expect(ids(10, 10)).toEqual([]);
    expect(ids(10, 10, 'I2')).toEqual(['M4']);
  });

  it('cadeia no canvas: marcações do canvas pelo ponto; as de container e as flutuantes não entram', () => {
    // Longe das imagens (I1 ocupa 0..1000 × 0..750), para continuarem marcações do canvas.
    let p = sampleProject();
    p = createMarking(p, {
      id: 'C1',
      containerId: null,
      rect: { x: -3000, y: -3000, width: 1000, height: 1000 },
    });
    p = createMarking(p, {
      id: 'C2',
      containerId: null,
      rect: { x: -2900, y: -2900, width: 300, height: 300 },
    });
    p = createMarking(p, {
      id: 'N1',
      containerId: null,
      rect: { x: -2800, y: -2800, width: 50, height: 50 },
      floating: true,
    });
    expect(marking(p, 'C2').parentId).toBe('C1');
    const ids = (x: number, y: number) =>
      markingChainAt(p.markings, null, { x, y }).map((m) => m.id);
    expect(ids(-2780, -2780)).toEqual(['C2', 'C1']);
    expect(ids(-2100, -2100)).toEqual(['C1']);
    expect(ids(-500, -500)).toEqual([]);
    // As de container (M1…) não entram na cadeia do canvas.
    expect(ids(1300, 1250)).toEqual([]);
    // A flutuante tem a vez antes, em `floatingAt`, e nunca está numa cadeia.
    expect(floatingAt(p.markings, { x: -2780, y: -2780 }).map((m) => m.id)).toEqual([
      'N1',
    ]);
    expect(floatingAt(p.markings, { x: -2000, y: -2000 })).toEqual([]);
  });

  it('flutuantes sobrepostas: a de cima (a última do array) vem primeiro', () => {
    let p = sampleProject();
    p = createMarking(p, {
      id: 'N1',
      containerId: null,
      rect: { x: -500, y: -500, width: 100, height: 100 },
      floating: true,
    });
    p = createMarking(p, {
      id: 'N2',
      containerId: null,
      rect: { x: -450, y: -450, width: 100, height: 100 },
      floating: true,
    });
    expect(floatingAt(p.markings, { x: -425, y: -425 }).map((m) => m.id)).toEqual([
      'N2',
      'N1',
    ]);
  });

  it('entre irmãs sobrepostas, a de menor área vence', () => {
    let p = sampleProject();
    p = createMarking(p, {
      id: 'M5',
      containerId: 'I1',
      rect: { x: 1500, y: 1500, width: 400, height: 400 },
    });
    p = createMarking(p, {
      id: 'M6',
      containerId: 'I1',
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
    const limits = { outer: { x: 0, y: 0, width: 1000, height: 1000 } };
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

  it('redimensionar: só o container limita; as filhas e o pai não', () => {
    const p = sampleProject();
    const m3 = marking(p, 'M3'); // dentro de M2 e M1, em I1 (4000×3000)
    const outer = { x: 0, y: 0, width: 4000, height: 3000 };
    // Cresce até a borda da imagem, por cima do pai (o que não cabe sai do pertencimento ao soltar).
    expect(resizeMarkingRect(m3.rect, 'se', { x: 9000, y: 9000 }, { outer })).toEqual({
      x: 1300,
      y: 1250,
      width: 2700,
      height: 1750,
    });
    // O pai encolhe por cima das filhas: nada o segura.
    const m1 = marking(p, 'M1');
    expect(resizeMarkingRect(m1.rect, 'se', { x: 0, y: 0 }, { outer })).toEqual({
      x: 1000,
      y: 1000,
      width: 8,
      height: 8,
    });
  });

  it('redimensionar uma marcação do canvas: sem limite, com negativos', () => {
    const start = { x: 0, y: 0, width: 100, height: 100 };
    expect(resizeMarkingRect(start, 'nw', { x: -500, y: -300 }, { outer: null })).toEqual(
      {
        x: -500,
        y: -300,
        width: 600,
        height: 400,
      },
    );
    expect(
      resizeMarkingRect(start, 'se', { x: 90000, y: 60000 }, { outer: null }),
    ).toEqual({ x: 0, y: 0, width: 90000, height: 60000 });
  });

  it('alças encolhem em marcações pequenas, sem ficar abaixo de 24 px', () => {
    expect(handleHitRadius(300)).toBe(22);
    expect(handleHitRadius(45)).toBe(15);
    expect(handleHitRadius(6)).toBe(12);
  });
});
