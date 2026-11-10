import { describe, expect, it } from 'vitest';
import {
  ARRIVAL_BAND_PAD,
  arrivalBadgeSpot as spotOf,
  arrivalBandLabelFit as bandFitOf,
  arrivalBandLabelSpot as bandSpotOf,
  arrivalBadgeWidth as widthOf,
  arrivalMarks,
  type ArrivalRoot,
} from '../../src/canvas/arrivals';
import {
  addContainer,
  createArrow,
  createMarking,
  dismissArrival,
  setContainerPlacement,
  type Arrival,
  type Project,
  type Rect,
} from '../../src/model';
import { TOKENS, canvasProject } from './harness';

const A = TOKENS.arrival;
const badgeWidth = (text: string) => widthOf(text, A);
const badgeSpot = (
  rect: Rect,
  zoom: number,
  width: number,
  view?: Rect,
  avoid?: Rect,
  roots?: readonly ArrivalRoot[],
  self?: string,
) => spotOf(rect, zoom, width, A, view, avoid, roots, self);
const bandLabelSpot = (
  band: Rect,
  zoom: number,
  size: { readonly width: number; readonly height: number },
  view: Rect,
  nameClear: number,
) => bandSpotOf(band, zoom, size, view, nameClear, A);

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

  it('sem ArrivalInfo (depois de recarregar): a faixa envolve só a raiz sem referência (etapa #764, AP1)', () => {
    // I3 (0,900) chegou perto da referência I1 (seta de M1 para M4); I2 (1100,0) não tem seta.
    let p = addContainer(canvasProject(), {
      id: 'I3',
      file: 'images/c.jpg',
      width: 400,
      height: 300,
    });
    p = setContainerPlacement(p, 'I3', { x: 0, y: 900, scale: 1 });
    p = createMarking(p, {
      id: 'M4',
      containerId: 'I3',
      rect: { x: 10, y: 10, width: 50, height: 50 },
    });
    p = createArrow(p, { id: 'R1', from: 'M1', to: 'M4' });
    const marks = arrivalMarks(mark(mark(p, 'I3'), 'I2'));
    expect(marks?.badges.map((b) => b.root).sort()).toEqual(['I2', 'I3']);
    expect(marks?.band).toEqual({
      x: 1100 - ARRIVAL_BAND_PAD,
      y: 0 - ARRIVAL_BAND_PAD,
      width: 500 + 2 * ARRIVAL_BAND_PAD,
      height: 500 + 2 * ARRIVAL_BAND_PAD,
    });
  });

  it('só raízes marcadas com referência: selo e nenhuma faixa', () => {
    const p = createArrow(canvasProject(), { id: 'R1', from: 'M1', to: 'M3' });
    const marks = arrivalMarks(mark(p, 'I2'));
    expect(marks?.badges).toHaveLength(1);
    expect(marks?.band).toBeNull();
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
    const spot = badgeSpot(big, 1, 100);
    expect(spot.x).toBeGreaterThan(100);
    expect(spot.y).toBeGreaterThan(200 + 600 - 2 * A.height);
    expect(spot.y + A.height).toBeLessThanOrEqual(200 + 600);
  });

  it('raiz pequena: por fora, abaixo do canto de baixo à esquerda (nunca sobre o nome nem a faixa)', () => {
    const spot = badgeSpot(small, 1, 100);
    expect(spot.x).toBe(100);
    expect(spot.y).toBeGreaterThanOrEqual(200 + 30);
  });

  it('o tamanho do selo na tela não muda com o zoom: o vão em unidades do canvas encolhe', () => {
    const at1 = badgeSpot(small, 1, 100);
    const at2 = badgeSpot(small, 2, 100);
    expect(at1.y - 230).toBeCloseTo(2 * (at2.y - 230));
  });

  it('raiz pequena: o vão cobre as alças da seleção (10 px de tela abaixo do canto)', () => {
    const spot = badgeSpot(small, 2, 100);
    expect(spot.y - (200 + 30)).toBeGreaterThanOrEqual(10 / 2 - 1e-9);
  });

  it('raiz pequena com outra raiz logo abaixo: o selo não cai no nome dela, vai para o lado', () => {
    const zoom = 0.22;
    const below = { x: 100, y: 200 + 30 + 5, width: 40, height: 30 };
    const width = 100;
    const spot = badgeSpot(small, zoom, width, undefined, undefined, [
      { id: 'B', rect: below },
    ]);
    const nameBand = 24 / zoom;
    const hits =
      spot.x < below.x + below.width &&
      spot.x + width / zoom > below.x &&
      spot.y < below.y + below.height &&
      spot.y + A.height / zoom > below.y - nameBand;
    expect(hits).toBe(false);
    // Sem obstáculo, o lugar de sempre: abaixo do canto.
    expect(badgeSpot(small, zoom, width).x).toBe(100);
  });

  // R23.10: a Relatório em y 0 e a Funil logo abaixo, no mesmo x; a ~39% de zoom a faixa do nome
  // da Funil (24 px de tela) invade o fundo da Relatório, onde o selo ficava.
  const relatorio = { x: 0, y: 0, width: 1000, height: 700 };
  const funil = { x: 0, y: 720, width: 1000, height: 600 };
  const both = [
    { id: 'R', rect: relatorio },
    { id: 'F', rect: funil },
  ];
  const crosses = (at: { x: number; y: number }, w: number, h: number, r: Rect) =>
    at.x < r.x + r.width && at.x + w > r.x && at.y < r.y + r.height && at.y + h > r.y;

  it('raiz grande com outra raiz logo abaixo (~39%): o selo não cruza a faixa do nome dela', () => {
    const zoom = 0.39;
    const width = 150;
    const spot = badgeSpot(relatorio, zoom, width, undefined, undefined, both, 'R');
    const band = {
      x: funil.x,
      y: funil.y - A.nameBand / zoom,
      width: funil.width,
      height: funil.height + A.nameBand / zoom,
    };
    expect(crosses(spot, width / zoom, A.height / zoom, band)).toBe(false);
    // Ainda por dentro da Relatório, abaixo da faixa do nome dela.
    expect(spot.y).toBeGreaterThanOrEqual(relatorio.y + A.nameBand / zoom);
    expect(spot.y + A.height / zoom).toBeLessThanOrEqual(relatorio.y + relatorio.height);
  });

  it('a raiz não se bloqueia a si mesma: a comparação é por id, não pelo objeto', () => {
    const copy = [{ id: 'R', rect: { ...relatorio } }];
    const alone = badgeSpot(relatorio, 1, 150);
    expect(badgeSpot(relatorio, 1, 150, undefined, undefined, copy, 'R')).toEqual(alone);
  });

  it('sem candidato livre: o de menor interseção', () => {
    const a = { x: 0, y: 0, width: 300, height: 60 };
    const b = { x: -50, y: 60, width: 200, height: 100 };
    const c = { x: 300, y: 30, width: 60, height: 60 };
    const roots = [
      { id: 'A', rect: a },
      { id: 'B', rect: b },
      { id: 'C', rect: c },
    ];
    // O de dentro cairia por inteiro sobre a faixa do nome da B (2000), o de baixo sobre o corpo
    // dela (2000), o da direita sobre a C (1120); o da esquerda é o que menos cobre (920).
    const spot = badgeSpot(a, 1, 100, undefined, undefined, roots, 'A');
    expect(spot).toEqual({ x: a.x - A.gap - 100, y: a.y + 60 + A.gap - A.height });
  });

  it('o selo não sai da área visível: encosta na borda direita e na de baixo', () => {
    const zoom = 0.16;
    const width = 220;
    const view = { x: 0, y: 0, width: 880 / zoom, height: 660 / zoom };
    const edge = { x: 5300, y: 3900, width: 400, height: 300 };
    const spot = badgeSpot(edge, zoom, width, view);
    expect(spot.x + width / zoom).toBeLessThanOrEqual(view.x + view.width);
    expect(spot.y + A.height / zoom).toBeLessThanOrEqual(view.y + view.height);
    expect(spot.x).toBeGreaterThanOrEqual(view.x);
  });

  it('a largura cresce com o nome', () => {
    expect(badgeWidth('Veio de Frente longa')).toBeGreaterThan(badgeWidth('Veio de A'));
  });
});

describe('medidas do selo vêm dos tokens', () => {
  it('largura, altura e vão seguem as medidas passadas', () => {
    expect(widthOf('abc', { ...A, charWidth: 10, pad: 4 })).toBe(38);
    const rect = { x: 0, y: 0, width: 1000, height: 1000 };
    const tall = spotOf(rect, 1, 100, { ...A, height: 40, gap: 10 });
    expect(tall.y).toBe(1000 - 10 - 40);
    expect(tall.x).toBe(10);
  });
});

describe('arrivalBandLabelSpot: o lugar do rótulo da faixa', () => {
  const view = { x: 0, y: 0, width: 900, height: 600 };
  const size = { width: 160, height: 40 };

  it('com espaço em cima: acima da faixa, sem encostar nela', () => {
    const band = { x: 300, y: 300, width: 200, height: 200 };
    const spot = bandLabelSpot(band, 1, size, view, 20);
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
      return bandLabelSpot(b, z, size, v, 20);
    }
  });

  it('sem espaço em cima: vai para baixo da faixa, dentro da área visível', () => {
    const band = { x: 100, y: 5, width: 200, height: 300 };
    const spot = bandLabelSpot(band, 1, size, view, 20);
    expect(spot.y).toBeGreaterThanOrEqual(305);
    expect(spot.y + size.height).toBeLessThanOrEqual(view.y + view.height);
  });

  it('o rótulo fica a tokens.arrival.pad (px de tela) de cada borda da área visível', () => {
    const margin = A.pad / 0.5;
    const wide = { x: 0, y: 0, width: 1800, height: 1200 };
    const right = bandLabelSpot(
      { x: 1700, y: 600, width: 60, height: 100 },
      0.5,
      size,
      wide,
      20,
    );
    expect(right.x + size.width / 0.5).toBeLessThanOrEqual(wide.x + wide.width - margin);
    const left = bandLabelSpot(
      { x: 2, y: 600, width: 60, height: 100 },
      0.5,
      size,
      wide,
      20,
    );
    expect(left.x).toBeGreaterThanOrEqual(wide.x + margin);
    const top = bandLabelSpot(
      { x: 300, y: 2, width: 60, height: 100 },
      0.5,
      size,
      wide,
      20,
    );
    expect(top.y).toBeGreaterThanOrEqual(wide.y + margin);
  });

  it('mais largo que a área visível menos as margens: ganha largura e reticências', () => {
    expect(bandFitOf(160, 1, view, A)).toBeNull();
    expect(bandFitOf(1000, 1, view, A)).toBe(view.width - 2 * A.pad);
    expect(bandFitOf(1000, 0.5, view, A)).toBe(view.width * 0.5 - 2 * A.pad);
    const band = { x: 100, y: 300, width: 200, height: 200 };
    const spot = bandLabelSpot(band, 1, { width: 1000, height: 40 }, view, 20);
    expect(spot.x).toBe(view.x + A.pad);
  });

  it('não sai pela direita nem pela esquerda da área visível', () => {
    const band = { x: 820, y: 300, width: 60, height: 100 };
    const spot = bandLabelSpot(band, 1, size, view, 20);
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
    const spot = badgeSpot(rect, 1, width, view, minimap);
    const overlaps =
      spot.x < minimap.x + minimap.width &&
      spot.x + width > minimap.x &&
      spot.y < minimap.y + minimap.height &&
      spot.y + A.height > minimap.y;
    expect(overlaps).toBe(false);
    expect(spot.x).toBeGreaterThanOrEqual(view.x);
  });

  it('sem espaço à esquerda dele, sobe para cima do minimapa', () => {
    const narrow = { x: 0, y: 0, width: 600, height: 400 };
    const mini = { x: 20, y: 300, width: 570, height: 90 };
    const rect = { x: 480, y: 250, width: 60, height: 40 };
    const spot = badgeSpot(rect, 1, width, narrow, mini);
    expect(spot.y + A.height).toBeLessThanOrEqual(mini.y);
  });

  it('longe do minimapa, nada muda', () => {
    const rect = { x: 100, y: 100, width: 60, height: 40 };
    expect(badgeSpot(rect, 1, width, view, minimap)).toEqual(
      badgeSpot(rect, 1, width, view),
    );
  });
});
