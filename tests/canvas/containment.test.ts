import { describe, expect, it } from 'vitest';
import {
  ABSORB_TOLERANCE,
  absorbCandidates,
  absorbInto,
  snapTarget,
  spaceTolerance,
  type AbsorbCandidate,
} from '../../src/canvas/containment';
import {
  IDENTITY_PLACEMENT,
  addContainer,
  createMarking,
  setContainerPlacement,
  type Placement,
  type Project,
  type ProjectContainer,
} from '../../src/model';
import { emptyProject } from '../model/fixtures';

// Dois containers: A 1000×800 em (0, 0) na escala 1; B 500×500 em (1100, 0) na escala 0,5
// (ocupa 250×250 no canvas, de 1100 a 1350 × 0 a 250).
function twoContainers(): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'A', file: 'images/a.jpg', width: 1000, height: 800 });
  p = addContainer(p, { id: 'B', file: 'images/b.jpg', width: 500, height: 500 });
  p = setContainerPlacement(p, 'A', { x: 0, y: 0, scale: 1 });
  p = setContainerPlacement(p, 'B', { x: 1100, y: 0, scale: 0.5 });
  return p;
}

const TOL = ABSORB_TOLERANCE; // zoom 1, escala 1

describe('spaceTolerance', () => {
  it('converte os px de tela pelo zoom e pela escala do container', () => {
    expect(ABSORB_TOLERANCE).toBe(12);
    expect(spaceTolerance(1, 1)).toBe(12);
    expect(spaceTolerance(2, 1)).toBe(6);
    expect(spaceTolerance(0.5, 0.5)).toBe(48);
  });
});

describe('snapTarget: encaixe de uma marcação movida', () => {
  const p = twoContainers();
  const containers = (): readonly ProjectContainer[] => p.containers;
  const from: Placement = IDENTITY_PLACEMENT;

  it('inteira dentro de um container: ele, sem deslocamento', () => {
    expect(
      snapTarget({ x: 100, y: 100, width: 50, height: 50 }, from, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: 0, dy: 0 });
    // Bordas coincidentes contam como dentro.
    expect(
      snapTarget({ x: 950, y: 750, width: 50, height: 50 }, from, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: 0, dy: 0 });
  });

  it('quase inteira: desloca para dentro (a parte de fora de até 12 px de tela)', () => {
    // 10 para fora à direita.
    expect(
      snapTarget({ x: 960, y: 100, width: 50, height: 50 }, from, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: -10, dy: 0 });
    // 12 para fora à esquerda e 5 em cima: os dois eixos.
    expect(
      snapTarget({ x: -12, y: -5, width: 50, height: 50 }, from, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: 12, dy: 5 });
  });

  it('além da tolerância, longe ou maior que o container: não encaixa', () => {
    // 12 para fora ainda encaixa (limite inclusive); 13 não.
    expect(
      snapTarget({ x: 962, y: 100, width: 50, height: 50 }, from, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: -12, dy: 0 });
    expect(
      snapTarget({ x: 963, y: 100, width: 50, height: 50 }, from, containers(), TOL),
    ).toBeNull();
    expect(
      snapTarget({ x: 5000, y: 5000, width: 50, height: 50 }, from, containers(), TOL),
    ).toBeNull();
    // Maior que o container B (250×250 no canvas): não cabe nele, mesmo colada.
    expect(
      snapTarget({ x: 1100, y: 0, width: 300, height: 100 }, from, containers(), TOL),
    ).toBeNull();
  });

  it('a tolerância é em px de tela: com mais zoom, menos unidades do canvas', () => {
    const rect = { x: 960, y: 100, width: 50, height: 50 }; // 10 unidades para fora
    expect(snapTarget(rect, from, containers(), spaceTolerance(1, 1))).not.toBeNull();
    expect(snapTarget(rect, from, containers(), spaceTolerance(2, 1))).toBeNull();
    expect(snapTarget(rect, from, containers(), spaceTolerance(0.5, 1))).not.toBeNull();
  });

  it('entre escalas: o deslocamento é do canvas e volta ao espaço de origem arredondando para dentro', () => {
    // Origem: o container B (escala 0,5). A marcação, em unidades do canvas, ficou 3,5 para fora
    // à direita do container A (x = 1000 é a borda direita de A): precisa ir 3,5 unidades do canvas
    // para a esquerda = 7 pixels de B.
    const fromB: Placement = { x: 1100, y: 0, scale: 0.5 };
    expect(
      snapTarget({ x: 953.5, y: 100, width: 50, height: 50 }, fromB, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: -7, dy: 0 });
    // 3,25 unidades = 6,5 px de B: arredonda para dentro (mais para a esquerda).
    expect(
      snapTarget({ x: 953.25, y: 100, width: 50, height: 50 }, fromB, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: -7, dy: 0 });
    // À esquerda: 3,25 para fora = 6,5 px; para dentro é para a direita (arredonda para cima).
    expect(
      snapTarget({ x: -3.25, y: 100, width: 50, height: 50 }, fromB, containers(), TOL),
    ).toEqual({ containerId: 'A', dx: 7, dy: 0 });
  });

  it('marcação do mesmo tamanho do container que não fecha com o arredondamento: não encaixa', () => {
    // Largura = 1000 (a do container A) em escala 0,5: o deslocamento inteiro sobra 0,5 do
    // outro lado.
    const fromB: Placement = { x: 1100, y: 0, scale: 0.5 };
    expect(
      snapTarget({ x: -0.25, y: 100, width: 1000, height: 50 }, fromB, containers(), TOL),
    ).toBeNull();
  });

  it('com dois candidatos, vence o de menor deslocamento', () => {
    let q = emptyProject();
    q = addContainer(q, { id: 'L', file: 'images/l.jpg', width: 400, height: 400 });
    q = addContainer(q, { id: 'R', file: 'images/r.jpg', width: 400, height: 400 });
    q = setContainerPlacement(q, 'L', { x: 0, y: 0, scale: 1 });
    q = setContainerPlacement(q, 'R', { x: 405, y: 0, scale: 1 });
    // Entre os dois (L termina em 400; R começa em 405): 30 de largura; a 4 de R, a 6 de L.
    const rect = { x: 401, y: 100, width: 30, height: 30 };
    expect(snapTarget(rect, from, q.containers, TOL)).toEqual({
      containerId: 'R',
      dx: 4,
      dy: 0,
    });
  });
});

describe('absorbInto: absorção ao desenhar ou redimensionar', () => {
  const item = (
    id: string,
    x: number,
    y: number,
    w: number,
    h: number,
  ): AbsorbCandidate => ({
    kind: 'marking',
    id,
    rect: { x, y, width: w, height: h },
  });
  const R = { x: 100, y: 100, width: 200, height: 200 };

  it('o item que cruza dentro da tolerância é envolvido', () => {
    // Passa 10 à direita e 5 embaixo.
    const out = absorbInto(R, [item('a', 250, 250, 60, 55)], TOL, null);
    expect(out.rect).toEqual({ x: 100, y: 100, width: 210, height: 205 });
    expect(out.absorbed.map((a) => a.id)).toEqual(['a']);
  });

  it('além da tolerância em algum lado: nada', () => {
    const out = absorbInto(R, [item('a', 250, 250, 63, 55)], TOL, null);
    expect(out.rect).toEqual(R);
    expect(out.absorbed).toEqual([]);
  });

  it('já inteiro dentro, sem cruzar, ou contendo o retângulo: não é absorvido', () => {
    const out = absorbInto(
      R,
      [
        item('dentro', 120, 120, 50, 50),
        item('fora', 400, 400, 20, 20),
        item('encosta', 300, 100, 20, 20),
        item('pai', 95, 95, 215, 215), // contém o retângulo: possível pai
      ],
      TOL,
      null,
    );
    expect(out.rect).toEqual(R);
    expect(out.absorbed).toEqual([]);
  });

  it('um a um, do menor excesso ao maior, reavaliando a cada crescimento', () => {
    const near = item('near', 295, 150, 15, 20); // passa 10 à direita
    const nearer = item('nearer', 295, 200, 8, 20); // passa 3 à direita
    const out = absorbInto(R, [near, nearer], TOL, null);
    expect(out.absorbed.map((a) => a.id)).toEqual(['nearer', 'near']);
    expect(out.rect).toEqual({ x: 100, y: 100, width: 210, height: 200 });
  });

  it('crescer envolve um item que antes passava da tolerância', () => {
    // `b` passa 14 à direita (fora); `a` passa 10 e, absorvido, deixa `b` com 4: entra.
    const a = item('a', 290, 100, 20, 40);
    const b = item('b', 296, 150, 18, 40);
    const out = absorbInto(R, [b, a], TOL, null);
    expect(out.absorbed.map((x) => x.id)).toEqual(['a', 'b']);
    expect(out.rect).toEqual({ x: 100, y: 100, width: 214, height: 200 });
  });

  it('numa marcação de container o crescimento não sai do container', () => {
    const limit = { x: 0, y: 0, width: 305, height: 400 };
    const out = absorbInto(R, [item('a', 250, 150, 60, 20)], TOL, limit); // iria a 310
    expect(out.rect).toEqual(R);
    expect(out.absorbed).toEqual([]);
    const ok = absorbInto(R, [item('a', 250, 150, 55, 20)], TOL, limit);
    expect(ok.rect).toEqual({ x: 100, y: 100, width: 205, height: 200 });
  });

  it('retângulos decimais (containers do canvas): floor à esquerda e em cima, ceil à direita e embaixo', () => {
    const container: AbsorbCandidate = {
      kind: 'container',
      id: 'B',
      rect: { x: 290.4, y: 95.6, width: 20.3, height: 50.2 }, // 290.4..310.7 × 95.6..145.8
    };
    const out = absorbInto(R, [container], TOL, null);
    expect(out.rect).toEqual({ x: 100, y: 95, width: 211, height: 205 });
    expect(Number.isInteger(out.rect.x + out.rect.width)).toBe(true);
  });

  it('pelo menor lado cruzado, sem crescer nos outros', () => {
    // Passa só à esquerda (por 6).
    const out = absorbInto(R, [item('a', 94, 150, 20, 20)], TOL, null);
    expect(out.rect).toEqual({ x: 94, y: 100, width: 206, height: 200 });
  });

  it('sem candidatos, devolve o mesmo retângulo', () => {
    expect(absorbInto(R, [], TOL, null)).toEqual({ rect: R, absorbed: [] });
  });
});

describe('absorbCandidates', () => {
  it('as marcações do espaço (menos as excluídas e as flutuantes) e, no canvas, os containers', () => {
    let p = twoContainers();
    p = createMarking(p, {
      id: 'M1',
      containerId: 'A',
      rect: { x: 10, y: 10, width: 100, height: 100 },
    });
    p = createMarking(p, {
      id: 'M2',
      containerId: 'A',
      rect: { x: 20, y: 20, width: 20, height: 20 },
    });
    p = createMarking(p, {
      id: 'M3',
      containerId: 'B',
      rect: { x: 10, y: 10, width: 100, height: 100 },
    });
    p = createMarking(p, {
      id: 'C1',
      containerId: null,
      rect: { x: -500, y: -500, width: 100, height: 100 },
    });
    p = createMarking(p, {
      id: 'N1',
      containerId: null,
      rect: { x: -700, y: -700, width: 100, height: 100 },
      floating: true,
    });
    const ids = (cs: AbsorbCandidate[]) => cs.map((c) => `${c.kind}:${c.id}`);
    expect(ids(absorbCandidates(p, 'A', new Set()))).toEqual([
      'marking:M1',
      'marking:M2',
    ]);
    expect(ids(absorbCandidates(p, 'A', new Set(['M1'])))).toEqual(['marking:M2']);
    expect(ids(absorbCandidates(p, 'B', new Set()))).toEqual(['marking:M3']);
    expect(ids(absorbCandidates(p, null, new Set()))).toEqual([
      'marking:C1',
      'container:A',
      'container:B',
    ]);
    const container = absorbCandidates(p, null, new Set()).find((c) => c.id === 'B');
    expect(container?.rect).toEqual({ x: 1100, y: 0, width: 250, height: 250 });
  });
});
