import { describe, expect, it } from 'vitest';
import {
  adjustMarkingRect,
  clampMarkingDelta,
  confirmMarkingReview,
  createMarking,
  descendantsOf,
  markingDeletionImpact,
  markingRectLimits,
  moveMarking,
  parentCandidates,
  removeMarking,
  renameMarking,
  replaceImage,
  setMarkingParent,
  setMarkingRect,
  topDown,
} from '../../src/model';
import { expectValid, marking, sampleProject } from './fixtures';

describe('marcações: criar', () => {
  it('pai automático = marcação mais interna que contém o retângulo', () => {
    const p = sampleProject();
    expect(marking(p, 'M1').parentId).toBeNull();
    expect(marking(p, 'M2').parentId).toBe('M1');
    expect(marking(p, 'M3').parentId).toBe('M2');
    const q = createMarking(p, {
      id: 'M5',
      imageId: 'I1',
      rect: { x: 1700, y: 1700, width: 100, height: 100 },
    });
    expect(marking(expectValid(q), 'M5').parentId).toBe('M1');
    expect(marking(q, 'M5').name).toBeNull();
  });

  it('só considera marcações da mesma imagem', () => {
    // Em I1 este retângulo cairia dentro de M1; em I2 não tem pai.
    const p = createMarking(sampleProject(), {
      id: 'M5',
      imageId: 'I2',
      rect: { x: 500, y: 500, width: 100, height: 100 },
    });
    expect(marking(p, 'M5').parentId).toBeNull();
    const q = createMarking(sampleProject(), {
      id: 'M5',
      imageId: 'I2',
      rect: { x: 10, y: 10, width: 50, height: 50 },
    });
    expect(marking(q, 'M5').parentId).toBe('M4');
  });

  it('valida inteiros, tamanho mínimo e limites da imagem', () => {
    const p = sampleProject();
    const make = (rect: { x: number; y: number; width: number; height: number }) => () =>
      createMarking(p, { id: 'X', imageId: 'I2', rect });
    expect(make({ x: 0.5, y: 0, width: 10, height: 10 })).toThrow('rect-not-integer');
    expect(make({ x: 0, y: 0, width: 7, height: 10 })).toThrow('rect-too-small');
    expect(make({ x: 995, y: 0, width: 10, height: 10 })).toThrow('rect-out-of-image');
    expect(make({ x: -1, y: 0, width: 10, height: 10 })).toThrow('rect-out-of-image');
    expect(make({ x: 992, y: 992, width: 8, height: 8 })).not.toThrow();
  });
});

describe('marcações: alterar', () => {
  it('renomeia (vazio vira null)', () => {
    let p = renameMarking(sampleProject(), 'M1', '  Porta dianteira ');
    expect(marking(p, 'M1').name).toBe('Porta dianteira');
    p = renameMarking(p, 'M1', '   ');
    expect(marking(p, 'M1').name).toBeNull();
  });

  it('a filha não sai dos limites do pai', () => {
    const p = sampleProject();
    expect(() =>
      setMarkingRect(p, 'M3', { x: 1300, y: 1250, width: 400, height: 50 }),
    ).toThrow('rect-outside-parent');
  });

  it('o pai não encolhe menos que a caixa das filhas', () => {
    const p = sampleProject();
    expect(markingRectLimits(p, 'M1')).toEqual({
      outer: { x: 0, y: 0, width: 4000, height: 3000 },
      inner: { x: 1200, y: 1200, width: 400, height: 200 },
    });
    expect(() =>
      setMarkingRect(p, 'M1', { x: 1250, y: 1000, width: 800, height: 800 }),
    ).toThrow('rect-excludes-children');
    const q = setMarkingRect(p, 'M1', { x: 1200, y: 1200, width: 400, height: 200 });
    expect(marking(expectValid(q), 'M1').rect).toEqual(marking(p, 'M2').rect);
  });

  it('marcação raiz fica dentro da imagem', () => {
    expect(() =>
      setMarkingRect(sampleProject(), 'M1', { x: 3500, y: 0, width: 600, height: 1000 }),
    ).toThrow('rect-out-of-image');
  });
});

describe('marcações: mover com descendentes', () => {
  it('mover o pai move todos os descendentes', () => {
    const p = sampleProject();
    const q = expectValid(moveMarking(p, 'M1', 100, -50));
    expect(marking(q, 'M1').rect).toMatchObject({ x: 1100, y: 950 });
    expect(marking(q, 'M2').rect).toMatchObject({ x: 1300, y: 1150 });
    expect(marking(q, 'M3').rect).toMatchObject({ x: 1400, y: 1200 });
    expect(marking(q, 'M4')).toBe(marking(p, 'M4'));
  });

  it('não deixa a filha sair do pai nem a raiz sair da imagem', () => {
    const p = sampleProject();
    expect(() => moveMarking(p, 'M3', 300, 0)).toThrow('rect-outside-parent');
    expect(() => moveMarking(p, 'M1', 3001, 0)).toThrow('rect-out-of-image');
    expect(() => moveMarking(p, 'M1', 0.5, 0)).toThrow('rect-not-integer');
  });

  it('clampMarkingDelta limita o deslocamento', () => {
    const p = sampleProject();
    // M3 em x 1300..1350 dentro de M2 (1200..1600), y 1250..1300 dentro de 1200..1400.
    expect(clampMarkingDelta(p, 'M3', 1000, -1000)).toEqual({ dx: 250, dy: -50 });
    expect(clampMarkingDelta(p, 'M3', 10.4, 5.6)).toEqual({ dx: 10, dy: 6 });
    expect(clampMarkingDelta(p, 'M1', -5000, 5000)).toEqual({ dx: -1000, dy: 1000 });
  });
});

describe('marcações: trocar pai', () => {
  it('lista só candidatos válidos', () => {
    let p = sampleProject();
    p = createMarking(p, {
      id: 'M5',
      imageId: 'I1',
      rect: { x: 1210, y: 1210, width: 380, height: 180 },
    });
    // M5 cai dentro de M2. Candidatos para M2: só M1 (M5 é descendente, M3 é filha).
    expect(marking(p, 'M5').parentId).toBe('M2');
    expect(parentCandidates(p, 'M2').map((m) => m.id)).toEqual(['M1']);
    expect(parentCandidates(p, 'M3').map((m) => m.id)).toEqual(['M1', 'M2', 'M5']);
  });

  it('troca e remove o pai', () => {
    let p = sampleProject();
    p = expectValid(setMarkingParent(p, 'M3', 'M1'));
    expect(marking(p, 'M3').parentId).toBe('M1');
    p = expectValid(setMarkingParent(p, 'M3', null));
    expect(marking(p, 'M3').parentId).toBeNull();
  });

  it('rejeita ciclos, outra imagem e pai que não contém', () => {
    const p = sampleProject();
    expect(() => setMarkingParent(p, 'M1', 'M3')).toThrow('invalid-parent');
    expect(() => setMarkingParent(p, 'M1', 'M1')).toThrow('invalid-parent');
    expect(() => setMarkingParent(p, 'M3', 'M4')).toThrow('invalid-parent');
    expect(() => setMarkingParent(p, 'M1', 'M2')).toThrow('invalid-parent');
  });
});

describe('marcações: excluir e revisão', () => {
  it('exclui em cascata descendentes e anotações', () => {
    const p = sampleProject();
    expect(markingDeletionImpact(p, 'M1')).toEqual({
      descendants: 2,
      lockedDescendants: 0,
      annotations: 3,
      brokenRefs: 0,
    });
    expect(markingDeletionImpact(p, 'M2')).toEqual({
      descendants: 1,
      lockedDescendants: 0,
      annotations: 1,
      brokenRefs: 0,
    });
    const q = expectValid(removeMarking(p, 'M2'));
    expect(q.markings.map((m) => m.id)).toEqual(['M1', 'M4']);
    expect(q.annotations.map((a) => a.id)).toEqual(['A1', 'A2', 'A4']);
  });

  it('confirmar posição limpa needsReview', () => {
    let p = replaceImage(
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

describe('marcações: ajuste fino pelo painel', () => {
  it('x/y movem a marcação com os descendentes', () => {
    const p = sampleProject();
    const q = expectValid(adjustMarkingRect(p, 'M1', 'x', 1100));
    expect(marking(q, 'M1').rect).toMatchObject({ x: 1100, y: 1000 });
    expect(marking(q, 'M2').rect).toMatchObject({ x: 1300, y: 1200 });
    expect(marking(q, 'M3').rect).toMatchObject({ x: 1400, y: 1250 });
  });

  it('x/y fora do pai ou da imagem param no limite', () => {
    const p = sampleProject();
    // M3 (50×50) dentro de M2 (1200..1600 × 1200..1400).
    expect(marking(adjustMarkingRect(p, 'M3', 'x', 0), 'M3').rect.x).toBe(1200);
    expect(marking(adjustMarkingRect(p, 'M3', 'y', 9999), 'M3').rect.y).toBe(1350);
    expect(marking(adjustMarkingRect(p, 'M1', 'x', -50), 'M1').rect.x).toBe(0);
  });

  it('largura/altura ficam entre o mínimo (ou as filhas) e o pai', () => {
    const p = sampleProject();
    expect(marking(adjustMarkingRect(p, 'M3', 'width', 1), 'M3').rect.width).toBe(8);
    expect(marking(adjustMarkingRect(p, 'M3', 'width', 9999), 'M3').rect.width).toBe(300);
    // M1 precisa envolver M2 (até x 1600, y 1400).
    expect(marking(adjustMarkingRect(p, 'M1', 'width', 10), 'M1').rect.width).toBe(600);
    expect(marking(adjustMarkingRect(p, 'M1', 'height', 10), 'M1').rect.height).toBe(400);
    expect(marking(adjustMarkingRect(p, 'M1', 'height', 5000), 'M1').rect.height).toBe(
      2000,
    );
  });

  it('sem mudança devolve o mesmo projeto; não inteiro falha', () => {
    const p = sampleProject();
    expect(adjustMarkingRect(p, 'M3', 'x', 1300)).toBe(p);
    expect(adjustMarkingRect(p, 'M3', 'x', 5000 - 3700)).toBe(p);
    expect(() => adjustMarkingRect(p, 'M3', 'x', 1.5)).toThrow('rect-not-integer');
  });
});
