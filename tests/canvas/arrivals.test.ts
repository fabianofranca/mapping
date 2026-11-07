import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_BADGE_HEIGHT,
  ARRIVAL_BAND_PAD,
  arrivalBadgeSpot,
  arrivalBandLabelSpot,
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

  it('raiz grande: por dentro, no canto de baixo à esquerda (o nome do container fica em cima)', () => {
    const spot = arrivalBadgeSpot(big, 1, 100);
    expect(spot.x).toBeGreaterThan(100);
    expect(spot.y).toBeGreaterThan(200 + 600 - 2 * ARRIVAL_BADGE_HEIGHT);
    expect(spot.y + ARRIVAL_BADGE_HEIGHT).toBeLessThanOrEqual(200 + 600);
  });

  it('raiz pequena: por fora, abaixo do canto de baixo à esquerda (nunca sobre o nome nem a faixa)', () => {
    const spot = arrivalBadgeSpot(small, 1, 100);
    expect(spot.x).toBe(100);
    expect(spot.y).toBeGreaterThanOrEqual(200 + 30);
  });

  it('o tamanho do selo na tela não muda com o zoom: o vão em unidades do canvas encolhe', () => {
    const at1 = arrivalBadgeSpot(small, 1, 100);
    const at2 = arrivalBadgeSpot(small, 2, 100);
    expect(at1.y - 230).toBeCloseTo(2 * (at2.y - 230));
  });

  it('o selo não sai da área visível: encosta na borda direita e na de baixo', () => {
    const zoom = 0.16;
    const width = 220;
    const view = { x: 0, y: 0, width: 880 / zoom, height: 660 / zoom };
    const edge = { x: 5300, y: 3900, width: 400, height: 300 };
    const spot = arrivalBadgeSpot(edge, zoom, width, view);
    expect(spot.x + width / zoom).toBeLessThanOrEqual(view.x + view.width);
    expect(spot.y + ARRIVAL_BADGE_HEIGHT / zoom).toBeLessThanOrEqual(
      view.y + view.height,
    );
    expect(spot.x).toBeGreaterThanOrEqual(view.x);
  });

  it('a largura cresce com o nome', () => {
    expect(arrivalBadgeWidth('Veio de Frente longa')).toBeGreaterThan(
      arrivalBadgeWidth('Veio de A'),
    );
  });
});

describe('arrivalBandLabelSpot: o lugar do rótulo da faixa', () => {
  const view = { x: 0, y: 0, width: 900, height: 600 };
  const size = { width: 160, height: 40 };

  it('com espaço em cima: acima da faixa, sem encostar nela', () => {
    const band = { x: 300, y: 300, width: 200, height: 200 };
    const spot = arrivalBandLabelSpot(band, 1, size, view, 20);
    expect(spot.x).toBe(300);
    expect(spot.y + size.height).toBeLessThanOrEqual(300);
  });

  it('zoom baixo: a folga da faixa encolhe e o rótulo sobe acima da linha do nome do container', () => {
    const zoom = 0.16;
    const band = { x: 3000, y: 2000, width: 800, height: 3000 };
    const spot = arrivalBadgeSpotless(band, zoom);
    // O nome do container ocupa os 20 px de tela logo acima do conteúdo, que está
    // ARRIVAL_BAND_PAD abaixo do topo da faixa.
    const contentTop = band.y + ARRIVAL_BAND_PAD;
    const nameTop = contentTop - 20 / zoom;
    expect(spot.y + size.height / zoom).toBeLessThanOrEqual(nameTop);

    function arrivalBadgeSpotless(b: typeof band, z: number) {
      const v = { x: 0, y: 0, width: 6000, height: 6000 };
      return arrivalBandLabelSpot(b, z, size, v, 20);
    }
  });

  it('sem espaço em cima: vai para baixo da faixa, dentro da área visível', () => {
    const band = { x: 100, y: 5, width: 200, height: 300 };
    const spot = arrivalBandLabelSpot(band, 1, size, view, 20);
    expect(spot.y).toBeGreaterThanOrEqual(305);
    expect(spot.y + size.height).toBeLessThanOrEqual(view.y + view.height);
  });

  it('não sai pela direita nem pela esquerda da área visível', () => {
    const band = { x: 820, y: 300, width: 60, height: 100 };
    const spot = arrivalBandLabelSpot(band, 1, size, view, 20);
    expect(spot.x + size.width).toBeLessThanOrEqual(view.x + view.width);
    expect(spot.x).toBeGreaterThanOrEqual(view.x);
  });
});

describe('arrivalBadgeSpot: sem cair sob o minimapa', () => {
  const view = { x: 0, y: 0, width: 600, height: 400 };
  const width = 135;
  const minimap = { x: 500, y: 300, width: 90, height: 90 };

  it('selo que cairia sob o minimapa vai para a esquerda dele', () => {
    const rect = { x: 480, y: 250, width: 60, height: 40 };
    const spot = arrivalBadgeSpot(rect, 1, width, view, minimap);
    const overlaps =
      spot.x < minimap.x + minimap.width &&
      spot.x + width > minimap.x &&
      spot.y < minimap.y + minimap.height &&
      spot.y + ARRIVAL_BADGE_HEIGHT > minimap.y;
    expect(overlaps).toBe(false);
    expect(spot.x).toBeGreaterThanOrEqual(view.x);
  });

  it('sem espaço à esquerda dele, sobe para cima do minimapa', () => {
    const narrow = { x: 0, y: 0, width: 600, height: 400 };
    const mini = { x: 20, y: 300, width: 570, height: 90 };
    const rect = { x: 480, y: 250, width: 60, height: 40 };
    const spot = arrivalBadgeSpot(rect, 1, width, narrow, mini);
    expect(spot.y + ARRIVAL_BADGE_HEIGHT).toBeLessThanOrEqual(mini.y);
  });

  it('longe do minimapa, nada muda', () => {
    const rect = { x: 100, y: 100, width: 60, height: 40 };
    expect(arrivalBadgeSpot(rect, 1, width, view, minimap)).toEqual(
      arrivalBadgeSpot(rect, 1, width, view),
    );
  });
});
