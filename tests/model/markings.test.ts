import { describe, expect, it } from 'vitest';
import {
  adjustMarkingRect,
  confirmMarkingReview,
  createMarking,
  descendantsOf,
  markingBounds,
  markingDeletionImpact,
  moveMarking,
  removeMarking,
  renameMarking,
  reorderMarking,
  replaceContainer,
  setMarkingFloating,
  setMarkingLocked,
  setMarkingRect,
  siblingPosition,
  topDown,
  type Project,
} from '../../src/model';
import { expectValid, image, marking, sampleProject } from './fixtures';

// sampleProject: I1 (4000×3000, escala 0,25) ocupa (0,0)–(1000,750) no canvas, com M1 › M2 › M3;
// I2 (1000×1000, escala 1) ocupa (1050,0)–(2050,1000), com M4.

const rect = (x: number, y: number, width: number, height: number) => ({
  x,
  y,
  width,
  height,
});

/** Marcação do canvas no vazio abaixo das duas telas (y ≥ 1200). */
function withCanvas(id = 'K', r = rect(100, 1200, 400, 300)): Project {
  return createMarking(sampleProject(), { id, containerId: null, rect: r });
}

describe('marcações: criar', () => {
  it('pai automático = marcação mais interna que contém o retângulo', () => {
    const p = sampleProject();
    expect(marking(p, 'M1').parentId).toBeNull();
    expect(marking(p, 'M2').parentId).toBe('M1');
    expect(marking(p, 'M3').parentId).toBe('M2');
    const q = createMarking(p, {
      id: 'M5',
      containerId: 'I1',
      rect: { x: 1700, y: 1700, width: 100, height: 100 },
    });
    expect(marking(expectValid(q), 'M5').parentId).toBe('M1');
    expect(marking(q, 'M5').name).toBeNull();
  });

  it('só considera marcações da mesma imagem', () => {
    // Em I1 este retângulo cairia dentro de M1; em I2 não tem pai.
    const p = createMarking(sampleProject(), {
      id: 'M5',
      containerId: 'I2',
      rect: { x: 500, y: 500, width: 100, height: 100 },
    });
    expect(marking(p, 'M5').parentId).toBeNull();
    const q = createMarking(sampleProject(), {
      id: 'M5',
      containerId: 'I2',
      rect: { x: 10, y: 10, width: 50, height: 50 },
    });
    expect(marking(q, 'M5').parentId).toBe('M4');
  });

  it('valida inteiros, tamanho mínimo e limites da imagem', () => {
    const p = sampleProject();
    const make = (r: { x: number; y: number; width: number; height: number }) => () =>
      createMarking(p, { id: 'X', containerId: 'I2', rect: r });
    expect(make({ x: 0.5, y: 0, width: 10, height: 10 })).toThrow('rect-not-integer');
    expect(make({ x: 0, y: 0, width: 7, height: 10 })).toThrow('rect-too-small');
    expect(make({ x: 995, y: 0, width: 10, height: 10 })).toThrow('rect-out-of-image');
    expect(make({ x: -1, y: 0, width: 10, height: 10 })).toThrow('rect-out-of-image');
    expect(make({ x: 992, y: 992, width: 8, height: 8 })).not.toThrow();
  });

  it('id repetido e container inexistente', () => {
    const p = sampleProject();
    const make = (id: string, containerId: string | null) => () =>
      createMarking(p, { id, containerId, rect: rect(0, 0, 10, 10) });
    expect(make('M1', 'I1')).toThrow('duplicate-id');
    expect(make('X', 'ZZ')).toThrow('not-found');
  });

  it('no canvas (containerId nulo): qualquer posição inteira, negativa inclusive', () => {
    const p = expectValid(
      createMarking(sampleProject(), {
        id: 'K',
        containerId: null,
        rect: rect(-500, -300, 200, 100),
        name: ' Fora ',
      }),
    );
    expect(marking(p, 'K')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: false,
      name: 'Fora',
      rect: rect(-500, -300, 200, 100),
    });
    // A forma continua conferida.
    const make = (r: ReturnType<typeof rect>) => () =>
      createMarking(sampleProject(), { id: 'X', containerId: null, rect: r });
    expect(make(rect(0.5, 0, 10, 10))).toThrow('rect-not-integer');
    expect(make(rect(0, 0, 7, 10))).toThrow('rect-too-small');
  });

  it('não escolhe o pai: assenta (o pai é a menor marcação do mesmo espaço)', () => {
    const outer = withCanvas('K', rect(0, 1200, 1000, 800));
    const p = createMarking(outer, {
      id: 'J',
      containerId: null,
      rect: rect(100, 1300, 300, 200),
    });
    expect(marking(expectValid(p), 'J').parentId).toBe('K');
    // Mesmo retângulo de J: a mais nova fica dentro da primeira (empate pelo array).
    const q = createMarking(p, {
      id: 'L',
      containerId: null,
      rect: rect(100, 1300, 300, 200),
    });
    expect(marking(q, 'L').parentId).toBe('J');
  });

  it('marcação do canvas inteira dentro de um container já nasce dele, convertida', () => {
    // I2 está em (1050,0) com escala 1.
    const p = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: rect(1150, 100, 200, 100),
    });
    expect(marking(expectValid(p), 'K')).toMatchObject({
      containerId: 'I2',
      rect: rect(100, 100, 200, 100),
    });
  });

  it('flutuante: só no canvas, e nunca vira marcação de container', () => {
    const p = createMarking(sampleProject(), {
      id: 'N',
      containerId: null,
      rect: rect(1150, 100, 200, 100),
      floating: true,
    });
    expect(marking(expectValid(p), 'N')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: true,
      rect: rect(1150, 100, 200, 100),
    });
    expect(() =>
      createMarking(sampleProject(), {
        id: 'N',
        containerId: 'I1',
        rect: rect(10, 10, 100, 100),
        floating: true,
      }),
    ).toThrow('invalid-space');
  });

  it('minSize do componente vale na criação e ao converter', () => {
    expect(() =>
      createMarking(
        sampleProject(),
        { id: 'X', containerId: 'I2', rect: rect(0, 0, 30, 30) },
        { minSize: { width: 40, height: 40 } },
      ),
    ).toThrow('rect-too-small');
    // No canvas, 40×40 caindo dentro de I2 (escala 1): fica 40×40 pixels dele.
    const p = createMarking(
      sampleProject(),
      { id: 'X', containerId: null, rect: rect(1100, 100, 40, 40) },
      { minSize: { width: 40, height: 40 } },
    );
    expect(marking(p, 'X')).toMatchObject({
      containerId: 'I2',
      rect: rect(50, 100, 40, 40),
    });
  });

  it('settle: false cria sem assentar (prévia de gesto)', () => {
    const p = createMarking(
      sampleProject(),
      { id: 'M5', containerId: 'I1', rect: rect(1700, 1700, 100, 100) },
      { settle: false },
    );
    expect(marking(p, 'M5').parentId).toBeNull();
  });
});

describe('marcações: alterar', () => {
  it('renomeia (vazio vira null)', () => {
    let p = renameMarking(sampleProject(), 'M1', '  Porta dianteira ');
    expect(marking(p, 'M1').name).toBe('Porta dianteira');
    p = renameMarking(p, 'M1', '   ');
    expect(marking(p, 'M1').name).toBeNull();
  });

  it('a filha pode sair do pai: não há limite do pai, o pai é refeito pela geometria', () => {
    const p = sampleProject();
    // M3 passa a ocupar x 1300–1700: sai de M2 (até 1600), mas cabe em M1.
    const q = expectValid(
      setMarkingRect(p, 'M3', { x: 1300, y: 1250, width: 400, height: 50 }),
    );
    expect(marking(q, 'M3').rect).toEqual({ x: 1300, y: 1250, width: 400, height: 50 });
    expect(marking(q, 'M3').parentId).toBe('M1');
  });

  it('redimensionar o pai por cima de uma filha é aceito e a filha sai do pertencimento', () => {
    const p = sampleProject();
    expect(marking(p, 'M2').parentId).toBe('M1');
    // M1 passa a começar em x 1250: M2 (a partir de 1200) deixa de caber nela; M3 continua em M2.
    const q = expectValid(
      setMarkingRect(p, 'M1', { x: 1250, y: 1000, width: 800, height: 800 }),
    );
    expect(marking(q, 'M1').rect).toEqual({ x: 1250, y: 1000, width: 800, height: 800 });
    expect(marking(q, 'M2').rect).toEqual(marking(p, 'M2').rect);
    expect(marking(q, 'M2').parentId).toBeNull();
    expect(marking(q, 'M3').parentId).toBe('M2');
  });

  it('o pai do tamanho da filha: a filha fica dentro dele (empate pelo array)', () => {
    const p = sampleProject();
    const q = setMarkingRect(p, 'M1', { x: 1200, y: 1200, width: 400, height: 200 });
    expect(marking(expectValid(q), 'M1').rect).toEqual(marking(p, 'M2').rect);
    expect(marking(q, 'M2').parentId).toBe('M1');
  });

  it('marcação de container fica dentro da imagem', () => {
    expect(() =>
      setMarkingRect(sampleProject(), 'M1', { x: 3500, y: 0, width: 600, height: 1000 }),
    ).toThrow('rect-out-of-image');
    expect(() =>
      setMarkingRect(sampleProject(), 'M1', { x: -10, y: 0, width: 600, height: 1000 }),
    ).toThrow('rect-out-of-image');
  });

  it('marcação do canvas redimensiona sem limite', () => {
    const p = withCanvas();
    const q = expectValid(setMarkingRect(p, 'K', rect(-3000, -3000, 9000, 6000)));
    expect(marking(q, 'K').rect).toEqual(rect(-3000, -3000, 9000, 6000));
    // Cerca as duas telas: elas passam a ser membros.
    expect(image(q, 'I1').parentId).toBe('K');
    expect(image(q, 'I2').parentId).toBe('K');
  });

  it('mesmo retângulo devolve o mesmo projeto, sem conferir a trava; forma e trava nas mudanças', () => {
    const p = setMarkingLocked(sampleProject(), 'M1', true);
    expect(setMarkingRect(p, 'M1', marking(p, 'M1').rect)).toBe(p);
    expect(() => setMarkingRect(p, 'M1', rect(1000, 1000, 900, 900))).toThrow('locked');
    // Filha de marcação trancada: geometria herdada.
    expect(() => setMarkingRect(p, 'M2', rect(1200, 1200, 300, 200))).toThrow('locked');
    expect(() => setMarkingRect(sampleProject(), 'M1', rect(0.5, 0, 10, 10))).toThrow(
      'rect-not-integer',
    );
    expect(() => setMarkingRect(sampleProject(), 'M1', rect(0, 0, 7, 10))).toThrow(
      'rect-too-small',
    );
    expect(() =>
      setMarkingRect(sampleProject(), 'M3', rect(1300, 1250, 40, 40), {
        minSize: { width: 50, height: 50 },
      }),
    ).toThrow('rect-too-small');
  });

  it('settle: false só troca o retângulo (prévia): o pai congela', () => {
    const p = sampleProject();
    const q = setMarkingRect(p, 'M3', rect(1300, 1250, 400, 50), { settle: false });
    expect(marking(q, 'M3').rect).toEqual(rect(1300, 1250, 400, 50));
    expect(marking(q, 'M3').parentId).toBe('M2');
  });

  it('markingBounds: o container em pixels dele; nulo no canvas', () => {
    const p = withCanvas();
    expect(markingBounds(p, 'M1')).toEqual(rect(0, 0, 4000, 3000));
    expect(markingBounds(p, 'M4')).toEqual(rect(0, 0, 1000, 1000));
    expect(markingBounds(p, 'K')).toBeNull();
    expect(() => markingBounds(p, 'ZZ')).toThrow('not-found');
  });
});

describe('marcações: mover', () => {
  it('dentro do container, mover o pai move todos os descendentes', () => {
    const p = sampleProject();
    const q = expectValid(moveMarking(p, 'M1', 100, -50));
    expect(marking(q, 'M1').rect).toMatchObject({ x: 1100, y: 950 });
    expect(marking(q, 'M2').rect).toMatchObject({ x: 1300, y: 1150 });
    expect(marking(q, 'M3').rect).toMatchObject({ x: 1400, y: 1200 });
    expect(marking(q, 'M4')).toBe(marking(p, 'M4'));
    expect(marking(q, 'M2').parentId).toBe('M1');
    expect(marking(q, 'M3').parentId).toBe('M2');
  });

  it('descendentes trancados vão junto; a filha trancada não impede o pai', () => {
    let p = setMarkingLocked(sampleProject(), 'M2', true);
    p = expectValid(moveMarking(p, 'M1', 50, 0));
    expect(marking(p, 'M2').rect.x).toBe(1250);
    expect(marking(p, 'M3').rect.x).toBe(1350);
  });

  it('sem prender: a filha pode sair do pai e o pai passa a ser outro', () => {
    const p = sampleProject();
    // M3 (1300–1350) 300 px à direita: sai de M2 (até 1600) e continua em M1.
    const q = expectValid(moveMarking(p, 'M3', 300, 0));
    expect(marking(q, 'M3').rect).toMatchObject({ x: 1600, y: 1250 });
    expect(marking(q, 'M3').parentId).toBe('M1');
    // Mais longe, sai de M1 também.
    const r = expectValid(moveMarking(p, 'M3', 1500, 0));
    expect(marking(r, 'M3').parentId).toBeNull();
    expect(marking(r, 'M3').containerId).toBe('I1');
  });

  it('para fora do container no vazio vira marcação do canvas, com as descendentes junto', () => {
    // 4000 px para baixo (1000 unidades do canvas): o grupo inteiro cai no vazio abaixo das telas.
    const q = expectValid(moveMarking(sampleProject(), 'M1', 0, 4000));
    expect(marking(q, 'M1')).toMatchObject({
      containerId: null,
      parentId: null,
      rect: rect(250, 1250, 250, 250),
    });
    expect(marking(q, 'M2')).toMatchObject({
      containerId: null,
      parentId: 'M1',
      rect: rect(300, 1300, 100, 50),
    });
    expect(marking(q, 'M3')).toMatchObject({ containerId: null, parentId: 'M2' });
    expect(
      descendantsOf(q, 'M1')
        .map((m) => m.id)
        .sort(),
    ).toEqual(['M2', 'M3']);
  });

  it('para dentro de outro container converte, mantendo o tamanho que se via na tela', () => {
    // M4 (100×100 de I2, canvas x 1050). 1000 px à esquerda: canvas x 50, dentro de I1 (escala 0,25).
    const q = expectValid(moveMarking(sampleProject(), 'M4', -1000, 100));
    expect(marking(q, 'M4')).toMatchObject({
      containerId: 'I1',
      parentId: null,
      rect: rect(200, 400, 400, 400),
    });
    // Dentro da imagem de destino, o pai é o que a geometria dá: nada a contém aqui.
    const r = expectValid(moveMarking(sampleProject(), 'M4', -1000, 300));
    expect(marking(r, 'M4').containerId).toBe('I1');
  });

  it('o mínimo do componente vale ao converter para o espaço novo (minSize e minSizeOf)', () => {
    // M4 (100×100 de I2) vira 400×400 na I1; o mínimo do componente é maior.
    const viaMinSize = moveMarking(sampleProject(), 'M4', -1000, 100, {
      minSize: { width: 500, height: 450 },
    });
    expect(marking(viaMinSize, 'M4')).toMatchObject({
      containerId: 'I1',
      rect: { width: 500, height: 450 },
    });
    const viaMinSizeOf = moveMarking(sampleProject(), 'M4', -1000, 100, {
      minSizeOf: (id) => (id === 'M4' ? { width: 600, height: 420 } : null),
    });
    expect(marking(viaMinSizeOf, 'M4')).toMatchObject({
      containerId: 'I1',
      rect: { width: 600, height: 420 },
    });
  });

  it('marcação do canvas move só a si mesma (não leva os membros)', () => {
    let p = withCanvas('K', rect(0, 1200, 1000, 800));
    p = createMarking(p, { id: 'J', containerId: null, rect: rect(100, 1300, 300, 200) });
    expect(marking(p, 'J').parentId).toBe('K');
    const q = expectValid(moveMarking(p, 'K', 3000, 0));
    expect(marking(q, 'K').rect).toEqual(rect(3000, 1200, 1000, 800));
    expect(marking(q, 'J').rect).toEqual(rect(100, 1300, 300, 200));
    expect(marking(q, 'J').parentId).toBeNull();
  });

  it('o container sai e entra da marcação do canvas que o move sozinha', () => {
    const p = withCanvas('K', rect(-100, -100, 1200, 1000));
    expect(image(p, 'I1').parentId).toBe('K');
    const q = expectValid(moveMarking(p, 'K', 0, 4000));
    expect(image(q, 'I1').parentId).toBeNull();
  });

  it('flutuante move só a si mesma e nunca muda de espaço', () => {
    let p = createMarking(sampleProject(), {
      id: 'N',
      containerId: null,
      rect: rect(100, 100, 200, 100),
      floating: true,
    });
    p = expectValid(moveMarking(p, 'N', 1100, 0));
    // Agora sobre a I2, e continua do canvas.
    expect(marking(p, 'N')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: true,
      rect: rect(1200, 100, 200, 100),
    });
  });

  it('deslocamento zero devolve o mesmo projeto, sem conferir a trava; não inteiro falha', () => {
    const p = setMarkingLocked(sampleProject(), 'M1', true);
    expect(moveMarking(p, 'M1', 0, 0)).toBe(p);
    expect(() => moveMarking(p, 'M1', 1, 0)).toThrow('locked');
    expect(() => moveMarking(p, 'M3', 1, 0)).toThrow('locked');
    expect(() => moveMarking(sampleProject(), 'M1', 0.5, 0)).toThrow('rect-not-integer');
    expect(() => moveMarking(sampleProject(), 'ZZ', 1, 0)).toThrow('not-found');
  });

  it('settle: false desloca sem assentar nem converter (prévia de gesto)', () => {
    const p = sampleProject();
    const q = moveMarking(p, 'M1', 0, 4000, { settle: false });
    expect(marking(q, 'M1')).toMatchObject({
      containerId: 'I1',
      rect: rect(1000, 5000, 1000, 1000),
    });
    expect(marking(q, 'M2').parentId).toBe('M1');
  });
});

describe('marcações: floating', () => {
  it('ida: sai do container, convertida para o canvas; as filhas ficam e são reparentadas', () => {
    const p = sampleProject();
    const q = expectValid(setMarkingFloating(p, 'M1', true));
    expect(marking(q, 'M1')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: true,
      rect: rect(250, 250, 250, 250),
    });
    // M2 e M3 não se mexem: sem a M1 por perto, M2 fica sem pai e M3 continua em M2.
    expect(marking(q, 'M2')).toMatchObject({ containerId: 'I1', parentId: null });
    expect(marking(q, 'M2').rect).toEqual(marking(p, 'M2').rect);
    expect(marking(q, 'M3').parentId).toBe('M2');
  });

  it('volta: ao deixar de ser flutuante, cabendo inteira num container, vira dele e é mãe de novo', () => {
    const p = sampleProject();
    const q = setMarkingFloating(setMarkingFloating(p, 'M1', true), 'M1', false);
    expect(marking(expectValid(q), 'M1')).toMatchObject({
      containerId: 'I1',
      parentId: null,
      floating: false,
      rect: rect(1000, 1000, 1000, 1000),
    });
    expect(marking(q, 'M2').parentId).toBe('M1');
  });

  it('desligar fora de qualquer container fica no canvas', () => {
    const p = setMarkingFloating(withCanvas(), 'K', true);
    expect(marking(p, 'K').floating).toBe(true);
    const q = expectValid(setMarkingFloating(p, 'K', false));
    expect(marking(q, 'K')).toMatchObject({ containerId: null, floating: false });
  });

  it('mesmo valor devolve o mesmo projeto; a trava de geometria impede nos dois sentidos', () => {
    const p = sampleProject();
    expect(setMarkingFloating(p, 'M1', false)).toBe(p);
    const locked = setMarkingLocked(p, 'M1', true);
    expect(() => setMarkingFloating(locked, 'M1', true)).toThrow('locked');
    // Herdada do ancestral trancado.
    expect(() => setMarkingFloating(locked, 'M2', true)).toThrow('locked');
    // Já flutuante e trancada: desligar também é geometria.
    const floating = setMarkingLocked(setMarkingFloating(p, 'M1', true), 'M1', true);
    expect(() => setMarkingFloating(floating, 'M1', false)).toThrow('locked');
  });

  it('o mínimo do componente vale na conversão para o canvas', () => {
    const q = setMarkingFloating(sampleProject(), 'M3', true, {
      minSize: { width: 40, height: 30 },
    });
    // 50×50 pixels na escala 0,25 = 12,5 no canvas: sobe ao mínimo do componente.
    expect(marking(q, 'M3').rect).toMatchObject({ width: 40, height: 30 });
  });
});

describe('marcações: ajuste fino pelo painel', () => {
  it('x/y movem a marcação com os descendentes', () => {
    const p = sampleProject();
    const q = expectValid(adjustMarkingRect(p, 'M1', 'x', 1100));
    expect(marking(q, 'M1').rect).toMatchObject({ x: 1100, y: 1000 });
    expect(marking(q, 'M2').rect).toMatchObject({ x: 1300, y: 1200 });
    expect(marking(q, 'M3').rect).toMatchObject({ x: 1400, y: 1250 });
  });

  it('x/y de marcação de container param no limite do container (o painel não ejeta)', () => {
    const p = sampleProject();
    // M3 pode passar do pai (M2): só o container limita.
    expect(marking(adjustMarkingRect(p, 'M3', 'x', 0), 'M3').rect.x).toBe(0);
    expect(marking(adjustMarkingRect(p, 'M3', 'y', 9999), 'M3').rect.y).toBe(2950);
    expect(marking(adjustMarkingRect(p, 'M1', 'x', -50), 'M1').rect.x).toBe(0);
    expect(marking(adjustMarkingRect(p, 'M1', 'x', 9999), 'M1').rect.x).toBe(3000);
    expect(
      marking(expectValid(adjustMarkingRect(p, 'M3', 'x', 0)), 'M3').parentId,
    ).toBeNull();
  });

  it('no canvas, x/y são livres', () => {
    const p = withCanvas();
    expect(marking(adjustMarkingRect(p, 'K', 'x', -9000), 'K').rect.x).toBe(-9000);
    expect(marking(adjustMarkingRect(p, 'K', 'y', 99999), 'K').rect.y).toBe(99999);
  });

  it('largura/altura ficam entre o mínimo e o limite do container; sem máximo no canvas', () => {
    const p = sampleProject();
    expect(marking(adjustMarkingRect(p, 'M3', 'width', 1), 'M3').rect.width).toBe(8);
    // Até a borda da imagem (4000 − 1300), não até a borda do pai.
    expect(marking(adjustMarkingRect(p, 'M3', 'width', 99999), 'M3').rect.width).toBe(
      2700,
    );
    // O pai pode encolher abaixo da caixa das filhas.
    const shrunk = expectValid(adjustMarkingRect(p, 'M1', 'width', 10));
    expect(marking(shrunk, 'M1').rect.width).toBe(10);
    expect(marking(shrunk, 'M2').parentId).toBeNull();
    expect(marking(adjustMarkingRect(p, 'M1', 'height', 99999), 'M1').rect.height).toBe(
      2000,
    );
    const k = withCanvas();
    expect(marking(adjustMarkingRect(k, 'K', 'width', 99999), 'K').rect.width).toBe(
      99999,
    );
    expect(marking(adjustMarkingRect(k, 'K', 'height', 1), 'K').rect.height).toBe(8);
  });

  it('o mínimo do componente limita por baixo', () => {
    const p = sampleProject();
    const q = adjustMarkingRect(p, 'M3', 'width', 20, {
      minSize: { width: 40, height: 10 },
    });
    expect(marking(q, 'M3').rect.width).toBe(40);
  });

  it('sem mudança devolve o mesmo projeto; não inteiro falha', () => {
    const p = sampleProject();
    expect(adjustMarkingRect(p, 'M3', 'x', 1300)).toBe(p);
    expect(adjustMarkingRect(p, 'M3', 'width', 50)).toBe(p);
    expect(() => adjustMarkingRect(p, 'M3', 'x', 1.5)).toThrow('rect-not-integer');
  });

  it('respeita a trava', () => {
    const p = setMarkingLocked(sampleProject(), 'M1', true);
    expect(() => adjustMarkingRect(p, 'M1', 'x', 1100)).toThrow('locked');
    expect(() => adjustMarkingRect(p, 'M2', 'width', 500)).toThrow('locked');
  });
});

describe('marcações: excluir e revisão', () => {
  it('exclui em cascata descendentes e anotações', () => {
    const p = sampleProject();
    expect(markingDeletionImpact(p, 'M1')).toEqual({
      descendants: 2,
      lockedDescendants: 0,
      annotations: 3,
      containers: 0,
      brokenRefs: 0,
    });
    expect(markingDeletionImpact(p, 'M2')).toEqual({
      descendants: 1,
      lockedDescendants: 0,
      annotations: 1,
      containers: 0,
      brokenRefs: 0,
    });
    const q = expectValid(removeMarking(p, 'M2'));
    expect(q.markings.map((m) => m.id)).toEqual(['M1', 'M4']);
    expect(q.annotations.map((a) => a.id)).toEqual(['A1', 'A2', 'A4']);
  });

  it('excluir marcação do canvas não exclui containers: o impacto conta os que ficam', () => {
    // K cerca as duas telas; J (dentro de K) cerca só a I1.
    let p = withCanvas('K', rect(-200, -200, 2600, 1400));
    p = createMarking(p, {
      id: 'J',
      containerId: null,
      rect: rect(-100, -100, 1200, 1000),
    });
    expect(image(p, 'I1').parentId).toBe('J');
    expect(image(p, 'I2').parentId).toBe('K');
    expect(marking(p, 'J').parentId).toBe('K');
    // K tem J como descendente e dois containers (um deles de J).
    expect(markingDeletionImpact(p, 'K')).toMatchObject({
      descendants: 1,
      containers: 2,
    });
    expect(markingDeletionImpact(p, 'J')).toMatchObject({
      descendants: 0,
      containers: 1,
    });

    // Excluir J: os containers dele passam ao pai dela (K).
    const q = expectValid(removeMarking(p, 'J'));
    expect(q.containers.map((c) => c.id)).toEqual(['I1', 'I2']);
    expect(image(q, 'I1').parentId).toBe('K');
    // Excluir K leva J, mas os containers ficam sem pai e as marcações deles não se mexem.
    const r = expectValid(removeMarking(p, 'K'));
    expect(r.markings.map((m) => m.id)).toEqual(['M1', 'M2', 'M3', 'M4']);
    expect(r.containers.map((c) => [c.id, c.parentId])).toEqual([
      ['I1', null],
      ['I2', null],
    ]);
  });

  it('excluir marcação do canvas tranca como as demais: só a própria trava impede', () => {
    const p = setMarkingLocked(withCanvas(), 'K', true);
    expect(() => removeMarking(p, 'K')).toThrow('locked');
  });

  it('confirmar posição limpa needsReview', () => {
    let p = replaceContainer(
      sampleProject(),
      'I2',
      { file: 'images/x.jpg', width: 2000, height: 1000 },
      { confirmAspectChange: true },
    );
    expect(marking(p, 'M4').needsReview).toBe(true);
    p = confirmMarkingReview(p, 'M4');
    expect(marking(p, 'M4').needsReview).toBe(false);
  });
});

describe('hierarquia', () => {
  it('descendentes e ordem de cima para baixo', () => {
    const p = sampleProject();
    expect(
      descendantsOf(p, 'M1')
        .map((m) => m.id)
        .sort(),
    ).toEqual(['M2', 'M3']);
    const reversed = [...p.markings].reverse();
    expect(topDown(reversed).map((m) => m.id)).toEqual(['M4', 'M1', 'M2', 'M3']);
  });
});

describe('irmãs: mesmo pai e mesmo espaço', () => {
  it('as do canvas são um grupo à parte (null com null), separado das de cada container', () => {
    let p = withCanvas('K1', rect(0, 1200, 200, 200));
    p = createMarking(p, {
      id: 'K2',
      containerId: null,
      rect: rect(300, 1200, 200, 200),
    });
    p = createMarking(p, {
      id: 'K3',
      containerId: null,
      rect: rect(600, 1200, 200, 200),
    });
    expect(siblingPosition(p, 'K1')).toEqual({ index: 0, count: 3 });
    expect(siblingPosition(p, 'K3')).toEqual({ index: 2, count: 3 });
    // M1 e M4 são raízes de containers diferentes: não são irmãs das do canvas nem entre si.
    expect(siblingPosition(p, 'M1')).toEqual({ index: 0, count: 1 });
    expect(siblingPosition(p, 'M4')).toEqual({ index: 0, count: 1 });

    const q = reorderMarking(p, 'K1', 2);
    expect(q.markings.map((m) => m.id)).toEqual([
      'M1',
      'M2',
      'M3',
      'M4',
      'K2',
      'K3',
      'K1',
    ]);
    expect(siblingPosition(q, 'K1')).toEqual({ index: 2, count: 3 });
    expect(() => reorderMarking(p, 'K1', 3)).toThrow('invalid-index');
  });
});
