import { describe, expect, it } from 'vitest';
import {
  membersOf,
  projectIndex,
  settleHierarchy,
  validateProject,
  type Arrow,
  type Marking,
  type Placement,
  type Project,
  type ProjectContainer,
  type Rect,
} from '../../src/model';
import { emptyProject } from './fixtures';

// Regras de contenção da etapa Marcações espaciais (PLAN.md, "Regras de contenção"): o teste
// que vem antes de qualquer canvas. Os projetos são montados à mão, sem as operações (que já
// assentam), para o assentar ser exercitado sozinho.

function rect(x: number, y: number, width: number, height: number): Rect {
  return { x, y, width, height };
}

function container(
  id: string,
  width: number,
  height: number,
  placement: Placement,
): ProjectContainer {
  return {
    id,
    name: null,
    file: null,
    width,
    height,
    placement,
    parentId: null,
    markingColor: null,
    locked: false,
    source: null,
    background: '#FFFFFF',
  };
}

function mk(
  id: string,
  containerId: string | null,
  r: Rect,
  extra: Partial<Marking> = {},
): Marking {
  return {
    id,
    containerId,
    parentId: null,
    name: null,
    rect: r,
    needsReview: false,
    locked: false,
    floating: false,
    source: null,
    ...extra,
  };
}

function project(containers: ProjectContainer[], markings: Marking[]): Project {
  return { ...emptyProject(), containers, markings };
}

const parents = (p: Project) =>
  Object.fromEntries(p.markings.map((m) => [m.id, m.parentId]));
const containerParents = (p: Project) =>
  Object.fromEntries(p.containers.map((c) => [c.id, c.parentId]));
const get = (p: Project, id: string) => projectIndex(p).markings.get(id) as Marking;

// Três telas no canvas: A (1000×1000, escala 1, em 0,0), B (500×500, escala 2, em 2000,0,
// ocupa 1000×1000 no canvas) e C (1000×1000, escala 1, em 4000,0).
const A = container('A', 1000, 1000, { x: 0, y: 0, scale: 1 });
const B = container('B', 500, 500, { x: 2000, y: 0, scale: 2 });
const C = container('C', 1000, 1000, { x: 4000, y: 0, scale: 1 });

describe('pai de uma marcação: a menor do mesmo espaço que a contém inteira', () => {
  it('escolhe a de menor área entre as que contêm', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('inner', 'A', rect(110, 110, 50, 50)),
          mk('big', 'A', rect(0, 0, 800, 800)),
          mk('mid', 'A', rect(100, 100, 200, 200)),
        ],
      ),
    );
    expect(parents(p)).toEqual({ inner: 'mid', big: null, mid: 'big' });
  });

  it('bordas coincidentes contam como dentro', () => {
    const p = settleHierarchy(
      project(
        [A],
        [mk('out', 'A', rect(0, 0, 100, 100)), mk('in', 'A', rect(0, 0, 100, 50))],
      ),
    );
    expect(get(p, 'in').parentId).toBe('out');
  });

  it('empate de área: a que vem antes no array é a de fora', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('first', 'A', rect(10, 10, 100, 100)),
          mk('second', 'A', rect(10, 10, 100, 100)),
          mk('third', 'A', rect(10, 10, 100, 100)),
        ],
      ),
    );
    // Entre várias iguais, a mais próxima no array (a de maior índice antes dela).
    expect(parents(p)).toEqual({ first: null, second: 'first', third: 'second' });
  });

  it('empate dentro de uma maior: a maior é o pai da primeira, a primeira da segunda', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('twinB', 'A', rect(10, 10, 100, 100), { parentId: 'twinA' }),
          mk('big', 'A', rect(0, 0, 500, 500)),
          mk('twinA', 'A', rect(10, 10, 100, 100)),
        ],
      ),
    );
    // A ordem do array decide, não o `parentId` gravado antes.
    expect(parents(p)).toEqual({ twinB: 'big', big: null, twinA: 'twinB' });
  });

  it('marcações que se cruzam não têm relação; o que está dentro das duas pertence à menor', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('left', 'A', rect(0, 0, 300, 200)),
          mk('right', 'A', rect(200, 0, 300, 300)),
          mk('both', 'A', rect(210, 10, 50, 50)),
          mk('partial', 'A', rect(250, 150, 100, 100)),
        ],
      ),
    );
    expect(parents(p)).toEqual({
      left: null,
      right: null,
      both: 'left',
      partial: 'right',
    });
  });

  it('item parcialmente coberto não é filho', () => {
    const p = settleHierarchy(
      project(
        [A],
        [mk('box', 'A', rect(0, 0, 100, 100)), mk('half', 'A', rect(50, 50, 100, 20))],
      ),
    );
    expect(get(p, 'half').parentId).toBeNull();
  });
});

describe('os dois espaços', () => {
  it('marcações de espaços diferentes nunca se relacionam, mesmo com os mesmos números', () => {
    const p = settleHierarchy(
      project(
        [A, C],
        [
          // Canvas: cobre só A no canvas, em volta de onde está a marcação de C em pixels de C.
          mk('canvasBox', null, rect(-50, -50, 1100, 1100)),
          mk('inC', 'C', rect(10, 10, 100, 100)),
          mk('inA', 'A', rect(10, 10, 100, 100)),
        ],
      ),
    );
    expect(parents(p)).toEqual({ canvasBox: null, inC: null, inA: null });
  });

  it('uma marcação do canvas em volta de dois containers os tem como membros', () => {
    const p = settleHierarchy(
      project([A, B, C], [mk('group', null, rect(-10, -10, 3020, 1020))]),
    );
    expect(containerParents(p)).toEqual({ A: 'group', B: 'group', C: null });
    const members = membersOf(p, 'group');
    expect(members.containers.map((c) => c.id)).toEqual(['A', 'B']);
    expect(members.markings).toEqual([]);
  });

  it('container dentro de marcações do canvas aninhadas pertence à menor', () => {
    const p = settleHierarchy(
      project(
        [A, B],
        [
          mk('outer', null, rect(-100, -100, 3200, 1200)),
          mk('inner', null, rect(1900, -10, 1200, 1020)),
        ],
      ),
    );
    expect(parents(p)).toEqual({ outer: null, inner: 'outer' });
    expect(containerParents(p)).toEqual({ A: 'outer', B: 'inner' });
    expect(projectIndex(p).canvasRoots.map((m) => m.id)).toEqual(['outer']);
  });

  it('container parcialmente coberto não é membro', () => {
    const p = settleHierarchy(
      project([A], [mk('half', null, rect(-10, -10, 500, 2000))]),
    );
    expect(get(p, 'half').containerId).toBeNull();
    expect(containerParents(p)).toEqual({ A: null });
  });

  it('o pai de um container sai quando a marcação deixa de contê-lo', () => {
    const base = settleHierarchy(
      project([A], [mk('box', null, rect(-10, -10, 1020, 1020))]),
    );
    expect(base.containers[0]?.parentId).toBe('box');
    const moved = settleHierarchy({
      ...base,
      containers: base.containers.map((c) => ({
        ...c,
        placement: { ...c.placement, x: 5000 },
      })),
    });
    expect(moved.containers[0]?.parentId).toBeNull();
  });
});

describe('troca de espaço ao assentar', () => {
  it('marcação de A arrastada para B vira marcação de B, com o mesmo tamanho na tela', () => {
    // Em pixels de A (escala 1), o retângulo está no canvas em 2100,100 — dentro de B.
    const p = settleHierarchy(
      project([A, B], [mk('ball', 'A', rect(2100, 100, 200, 100))]),
    );
    const ball = get(p, 'ball');
    expect(ball.containerId).toBe('B');
    // B tem escala 2: 200×100 no canvas = 100×50 pixels de B.
    expect(ball.rect).toEqual(rect(50, 50, 100, 50));
  });

  it('as descendentes trocam junto e continuam filhas', () => {
    const p = settleHierarchy(
      project(
        [A, B],
        [
          mk('card', 'A', rect(2100, 100, 400, 400)),
          mk('icon', 'A', rect(2120, 120, 40, 40), { parentId: 'card' }),
        ],
      ),
    );
    expect(get(p, 'card')).toMatchObject({
      containerId: 'B',
      rect: rect(50, 50, 200, 200),
    });
    expect(get(p, 'icon')).toMatchObject({
      containerId: 'B',
      parentId: 'card',
      rect: rect(60, 60, 20, 20),
    });
  });

  it('solta fora de todos os containers vira marcação do canvas, em unidades do canvas', () => {
    // Em pixels de B (escala 2, em 2000,0): -300 px = 1400 no canvas, no vão entre A e B.
    const p = settleHierarchy(project([A, B], [mk('m', 'B', rect(-300, 10, 50, 20))]));
    expect(get(p, 'm')).toMatchObject({
      containerId: null,
      rect: rect(1400, 20, 100, 40),
    });
  });

  it('marcação do canvas que fica inteira dentro de um container vira dele (decisão 5)', () => {
    const p = settleHierarchy(project([A, B], [mk('m', null, rect(2010, 10, 100, 100))]));
    expect(get(p, 'm')).toMatchObject({ containerId: 'B', rect: rect(5, 5, 50, 50) });
  });

  it('a conversão arredonda pelas bordas, garante o mínimo e o do componente', () => {
    const D = container('D', 300, 300, { x: 0, y: 2000, scale: 3 });
    const p = settleHierarchy(
      project(
        [D],
        [
          // 10×10 no canvas = 3,33 px de D: sobe para o mínimo de 8.
          mk('tiny', null, rect(31, 2031, 10, 10)),
          mk('button', null, rect(301, 2301, 31, 31)),
        ],
      ),
      { minSizeOf: (id) => (id === 'button' ? { width: 40, height: 12 } : null) },
    );
    expect(get(p, 'tiny')).toMatchObject({ containerId: 'D', rect: rect(10, 10, 8, 8) });
    expect(get(p, 'button')).toMatchObject({
      containerId: 'D',
      rect: rect(100, 100, 40, 12),
    });
  });

  it('a marcação de container que continua dentro dele não muda', () => {
    const before = project([A, B], [mk('m', 'B', rect(0, 0, 500, 500))]);
    expect(settleHierarchy(before)).toBe(before);
  });
});

describe('flutuantes: fora da árvore nos dois sentidos', () => {
  it('nunca é mãe: um post-it grande não captura uma tela nem marcações do canvas', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('note', null, rect(-100, -100, 3000, 3000), { floating: true }),
          mk('label', null, rect(1500, 10, 100, 100)),
        ],
      ),
    );
    expect(parents(p)).toEqual({ note: null, label: null });
    expect(containerParents(p)).toEqual({ A: null });
  });

  it('nunca é filha nem troca de espaço: sobre uma tela, continua do canvas', () => {
    const p = settleHierarchy(
      project(
        [A],
        [
          mk('box', null, rect(1500, 0, 500, 500)),
          mk('note', null, rect(1510, 10, 50, 50), { floating: true, parentId: 'box' }),
          mk('onScreen', null, rect(10, 10, 50, 50), { floating: true }),
        ],
      ),
    );
    expect(get(p, 'note')).toMatchObject({ containerId: null, parentId: null });
    expect(get(p, 'onScreen')).toMatchObject({ containerId: null, parentId: null });
  });

  it('flutuante gravada num container vai para o canvas, convertida', () => {
    const p = settleHierarchy(
      project([B], [mk('note', 'B', rect(10, 10, 50, 50), { floating: true })]),
    );
    expect(get(p, 'note')).toMatchObject({
      containerId: null,
      parentId: null,
      rect: rect(2020, 20, 100, 100),
    });
  });
});

describe('assentar é determinístico e idempotente', () => {
  const messy = () =>
    project(
      [A, B, C],
      [
        mk('group', null, rect(-10, -10, 3020, 1020)),
        mk('m1', 'A', rect(10, 10, 300, 300), { parentId: 'x' }),
        mk('m2', 'A', rect(20, 20, 50, 50)),
        mk('moved', 'A', rect(4100, 100, 50, 50)),
        mk('twin1', 'C', rect(0, 0, 100, 100)),
        mk('twin2', 'C', rect(0, 0, 100, 100)),
      ],
    );

  it('assentar de novo devolve o mesmo objeto', () => {
    const once = settleHierarchy(messy());
    expect(settleHierarchy(once)).toBe(once);
  });

  it('não muda a ordem dos arrays', () => {
    const once = settleHierarchy(messy());
    expect(once.markings.map((m) => m.id)).toEqual(messy().markings.map((m) => m.id));
    expect(once.containers.map((c) => c.id)).toEqual(['A', 'B', 'C']);
  });

  it('o resultado satisfaz as invariantes de contenção', () => {
    expect(validateProject(settleHierarchy(messy()))).toEqual([]);
  });

  it('projetos aleatórios assentados são válidos e estáveis', () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let round = 0; round < 30; round++) {
      const markings: Marking[] = [];
      for (let i = 0; i < 25; i++) {
        const space = ['A', 'B', 'C', null][rand(4)] ?? null;
        const w = 8 + rand(300);
        const h = 8 + rand(300);
        const x = space === null ? rand(5000) - 500 : rand(400);
        const y = space === null ? rand(1500) - 200 : rand(150);
        markings.push(mk(`m${i}`, space, rect(x, y, w, h), { floating: rand(10) === 0 }));
      }
      const once = settleHierarchy(project([A, B, C], markings));
      expect(validateProject(once)).toEqual([]);
      expect(settleHierarchy(once)).toBe(once);
    }
  });
});

// Setas (ME4): fora da árvore de pertencimento. O assentar as ignora, salvo numa coisa: se uma
// ponta muda de espaço, os pontos de passagem (que ficam no espaço das pontas) são apagados.
describe('setas', () => {
  const arrowOf = (
    id: string,
    from: string,
    to: string,
    points: Arrow['points'] = [],
  ): Arrow => ({
    id,
    from,
    to,
    fromSide: null,
    toSide: null,
    points,
    style: 'curve',
    name: null,
    locked: false,
  });
  const withArrows = (p: Project, arrows: Arrow[]): Project => ({ ...p, arrows });
  const via = [{ x: 400, y: 50 }];

  it('são ignoradas: nada a mudar devolve o mesmo objeto, com as setas como estão', () => {
    const settled = withArrows(
      settleHierarchy(
        project(
          [A, B],
          [
            mk('x', 'A', rect(10, 10, 100, 100)),
            mk('y', 'A', rect(300, 10, 100, 100)),
            mk('z', 'B', rect(0, 0, 100, 100)),
            mk('h', null, rect(0, 1500, 100, 100)),
          ],
        ),
      ),
      [arrowOf('r1', 'x', 'y', via), arrowOf('r2', 'x', 'z'), arrowOf('r3', 'h', 'x')],
    );
    const again = settleHierarchy(settled);
    expect(again).toBe(settled);
    expect(again.arrows).toBe(settled.arrows);
    // Ser pai ou filho não depende das setas: elas não entram na árvore.
    expect(parents(again)).toEqual({ x: null, y: null, z: null, h: null });
  });

  it('uma ponta que muda de espaço apaga os pontos (do canvas para o container)', () => {
    // `y` é do canvas, mas cabe inteira em A: o assentar a passa para A.
    const p = withArrows(
      project(
        [A, B],
        [
          mk('x', 'A', rect(10, 10, 100, 100)),
          mk('y', null, rect(300, 10, 100, 100)),
          mk('w', 'A', rect(600, 600, 100, 100)),
        ],
      ),
      [arrowOf('r1', 'x', 'y', via), arrowOf('r2', 'x', 'w', via)],
    );
    const settled = settleHierarchy(p);
    expect(get(settled, 'y').containerId).toBe('A');
    expect(settled.arrows[0]?.points).toEqual([]);
    // A seta que não toca marcação nenhuma que mudou fica como está.
    expect(settled.arrows[1]).toBe(p.arrows[1]);
    expect(settled.arrows[0]).toMatchObject({ from: 'x', to: 'y', style: 'curve' });
    // E assentar de novo devolve o mesmo objeto.
    expect(settleHierarchy(settled)).toBe(settled);
  });

  it('uma ponta que sai do container para o canvas apaga os pontos', () => {
    // `x` passa da borda de A: vira marcação do canvas.
    const p = withArrows(
      project(
        [A, B],
        [mk('x', 'A', rect(950, 10, 100, 100)), mk('y', 'A', rect(300, 10, 100, 100))],
      ),
      [arrowOf('r1', 'x', 'y', via)],
    );
    const settled = settleHierarchy(p);
    expect(get(settled, 'x').containerId).toBeNull();
    expect(settled.arrows[0]?.points).toEqual([]);
  });

  it('uma ponta que troca de container apaga os pontos, mesmo que o espaço derivado seja o canvas', () => {
    // x (A) e z (B) já têm os pontos no canvas; x passa para B: troca de espaço da ponta.
    const p = withArrows(
      project(
        [A, B],
        [mk('x', 'A', rect(2100, 100, 100, 100)), mk('z', 'B', rect(0, 0, 100, 100))],
      ),
      [arrowOf('r1', 'x', 'z', via)],
    );
    expect(get(settleHierarchy(p), 'x').containerId).toBe('B');
    expect(settleHierarchy(p).arrows[0]?.points).toEqual([]);
  });

  it('seta sem pontos nunca é reescrita', () => {
    const p = withArrows(
      project(
        [A, B],
        [mk('x', 'A', rect(10, 10, 100, 100)), mk('y', null, rect(300, 10, 100, 100))],
      ),
      [arrowOf('r1', 'x', 'y')],
    );
    expect(settleHierarchy(p).arrows).toBe(p.arrows);
  });

  it('o assentar não cria, apaga nem reordena setas', () => {
    const p = withArrows(
      project(
        [A, B],
        [mk('x', 'A', rect(950, 10, 100, 100)), mk('y', 'A', rect(300, 10, 100, 100))],
      ),
      [arrowOf('r2', 'y', 'x', via), arrowOf('r1', 'x', 'y', via)],
    );
    expect(settleHierarchy(p).arrows.map((a) => a.id)).toEqual(['r2', 'r1']);
    expect(validateProject(settleHierarchy(p))).toEqual([]);
  });
});
