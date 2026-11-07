import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_BADGE_HEIGHT,
  ARRIVAL_BAND_PAD,
  arrivalBadgeSpot,
  arrivalBadgeWidth,
  arrivalMarks,
} from '../../src/canvas/arrivals';
import { dismissArrival, type Arrival, type Project } from '../../src/model';
import { canvasProject } from './harness';

// As marcas de chegada no canvas (etapa #659, PE3, decisão 8): o selo "Veio de <nome>" sobre cada
// raiz com marca e a faixa "Área de chegada". Funções puras sobre o projeto, sem Konva.

const mark = (p: Project, root: string, fromName = 'Frente'): Project => ({
  ...p,
  arrivals: [...p.arrivals, { root, from: 'V', fromName } satisfies Arrival],
});

describe('arrivalMarks: o que desenhar', () => {
  it('sem marca de chegada, nada a desenhar', () => {
    expect(arrivalMarks(canvasProject())).toBeNull();
    expect(arrivalMarks(null)).toBeNull();
  });

  it('um selo por raiz com marca, com o nome da origem e a pegada da raiz', () => {
    const p = mark(canvasProject(), 'I2', 'Frente');
    const marks = arrivalMarks(p);
    expect(marks?.badges).toEqual([
      { root: 'I2', name: 'Frente', rect: { x: 1100, y: 0, width: 500, height: 500 } },
    ]);
  });

  it('marca de uma raiz que não existe mais não vira selo', () => {
    expect(arrivalMarks(mark(canvasProject(), 'XX'))).toBeNull();
  });

  it('dispensar a marca tira o selo (e a faixa)', () => {
    const p = mark(canvasProject(), 'I2');
    expect(arrivalMarks(p)).not.toBeNull();
    expect(arrivalMarks(dismissArrival(p, 'I2'))).toBeNull();
  });

  it('faixa: a caixa das raízes com marca, com folga, quando fica à direita de tudo o resto', () => {
    const p = mark(canvasProject(), 'I2');
    const band = arrivalMarks(p)?.band;
    // I1 (o que não tem marca) termina em x=1000; I2 começa em 1100.
    expect(band).toEqual({
      x: 1100 - ARRIVAL_BAND_PAD,
      y: 0 - ARRIVAL_BAND_PAD,
      width: 500 + 2 * ARRIVAL_BAND_PAD,
      height: 500 + 2 * ARRIVAL_BAND_PAD,
    });
  });

  it('sem faixa quando a raiz com marca não está à direita do resto (marca perto da referência)', () => {
    const p = mark(canvasProject(), 'I1');
    const marks = arrivalMarks(p);
    expect(marks?.badges).toHaveLength(1);
    expect(marks?.band).toBeNull();
  });

  it('com todas as raízes marcadas a faixa envolve todas', () => {
    const p = mark(mark(canvasProject(), 'I1'), 'I2');
    expect(arrivalMarks(p)?.band).not.toBeNull();
  });

  it('é calculado uma vez por versão do projeto (mesmo objeto na segunda chamada)', () => {
    const p = mark(canvasProject(), 'I2');
    expect(arrivalMarks(p)).toBe(arrivalMarks(p));
    expect(arrivalMarks(mark(p, 'I1'))).not.toBe(arrivalMarks(p));
  });
});

describe('arrivalBadgeSpot: o lugar do selo', () => {
  const big = { x: 100, y: 200, width: 800, height: 600 };
  const small = { x: 100, y: 200, width: 40, height: 30 };

  it('raiz grande: por dentro, no canto de cima à esquerda', () => {
    const spot = arrivalBadgeSpot(big, 1, 100);
    expect(spot.x).toBeGreaterThan(100);
    expect(spot.y).toBeGreaterThan(200);
  });

  it('raiz pequena: por fora, acima do canto de cima à esquerda', () => {
    const spot = arrivalBadgeSpot(small, 1, 100);
    expect(spot.x).toBe(100);
    expect(spot.y + ARRIVAL_BADGE_HEIGHT).toBeLessThanOrEqual(200);
  });

  it('o tamanho do selo na tela não muda com o zoom: o vão em unidades do canvas encolhe', () => {
    const at1 = arrivalBadgeSpot(small, 1, 100);
    const at2 = arrivalBadgeSpot(small, 2, 100);
    expect(200 - at1.y).toBeCloseTo(2 * (200 - at2.y));
  });

  it('a largura cresce com o nome', () => {
    expect(arrivalBadgeWidth('Veio de Frente longa')).toBeGreaterThan(
      arrivalBadgeWidth('Veio de A'),
    );
  });
});
