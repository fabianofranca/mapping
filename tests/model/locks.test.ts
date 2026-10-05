import { describe, expect, it } from 'vitest';
import {
  ModelError,
  adjustMarkingRect,
  canDeleteImage,
  canDeleteMarking,
  canEditMarkingGeometry,
  canReplaceImage,
  createMarking,
  imageDeletionImpact,
  isMarkingGeometryLocked,
  markingDeletionImpact,
  moveImage,
  moveMarking,
  removeImage,
  removeMarking,
  renameMarking,
  replaceImage,
  resizeImage,
  setImageLocked,
  setImageMarkingsLocked,
  setMarkingLocked,
  setMarkingRect,
  type Project,
} from '../../src/model';
import { expectValid, marking, sampleProject } from './fixtures';

/** Roda a operação e devolve o código do erro de regra (ou `null` se passou). */
function codeOf(op: () => unknown): string | null {
  try {
    op();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

const image = (p: Project, id: string) => {
  const found = p.images.find((i) => i.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('trava: trancar e destrancar', () => {
  it('itens novos nascem destrancados', () => {
    const p = sampleProject();
    expect(p.markings.every((m) => !m.locked)).toBe(true);
    expect(p.images.every((i) => !i.locked)).toBe(true);
  });

  it('tranca e destranca uma marcação sem mexer no resto', () => {
    const p = sampleProject();
    const locked = setMarkingLocked(p, 'M2', true);
    expect(marking(locked, 'M2').locked).toBe(true);
    expect(marking(locked, 'M1').locked).toBe(false);
    expect(marking(locked, 'M3').locked).toBe(false);
    expect(setMarkingLocked(locked, 'M2', false)).toEqual(p);
    expectValid(locked);
  });

  it('tranca e destranca uma imagem', () => {
    const p = sampleProject();
    const locked = setImageLocked(p, 'I1', true);
    expect(image(locked, 'I1').locked).toBe(true);
    expect(image(locked, 'I2').locked).toBe(false);
    expect(setImageLocked(locked, 'I1', false)).toEqual(p);
  });

  it('repetir o mesmo estado devolve o mesmo projeto (sem entrada de histórico)', () => {
    const p = sampleProject();
    expect(setMarkingLocked(p, 'M1', false)).toBe(p);
    expect(setImageLocked(p, 'I1', false)).toBe(p);
    const locked = setMarkingLocked(p, 'M1', true);
    expect(setMarkingLocked(locked, 'M1', true)).toBe(locked);
    const lockedImage = setImageLocked(p, 'I1', true);
    expect(setImageLocked(lockedImage, 'I1', true)).toBe(lockedImage);
  });

  it('falha com id inexistente', () => {
    const p = sampleProject();
    expect(codeOf(() => setMarkingLocked(p, 'X', true))).toBe('not-found');
    expect(codeOf(() => setImageLocked(p, 'X', true))).toBe('not-found');
    expect(codeOf(() => setImageMarkingsLocked(p, 'X', true))).toBe('not-found');
  });

  it('trancar todas as marcações de uma imagem não afeta as de outra nem a imagem', () => {
    const p = setImageMarkingsLocked(sampleProject(), 'I1', true);
    expect(['M1', 'M2', 'M3'].every((id) => marking(p, id).locked)).toBe(true);
    expect(marking(p, 'M4').locked).toBe(false);
    expect(image(p, 'I1').locked).toBe(false);
    const back = setImageMarkingsLocked(p, 'I1', false);
    expect(back).toEqual(sampleProject());
  });

  it('trancar todas quando já estão trancadas devolve o mesmo projeto', () => {
    const p = setImageMarkingsLocked(sampleProject(), 'I1', true);
    expect(setImageMarkingsLocked(p, 'I1', true)).toBe(p);
    const empty = sampleProject();
    expect(setImageMarkingsLocked(empty, 'I1', false)).toBe(empty);
  });
});

describe('trava: marcação trancada', () => {
  const locked = () => setMarkingLocked(sampleProject(), 'M2', true);

  it('não pode ser movida, redimensionada nem excluída', () => {
    const p = locked();
    expect(codeOf(() => moveMarking(p, 'M2', 10, 0))).toBe('locked');
    expect(
      codeOf(() =>
        setMarkingRect(p, 'M2', { x: 1200, y: 1200, width: 300, height: 200 }),
      ),
    ).toBe('locked');
    expect(codeOf(() => adjustMarkingRect(p, 'M2', 'width', 300))).toBe('locked');
    expect(codeOf(() => adjustMarkingRect(p, 'M2', 'x', 1210))).toBe('locked');
    expect(codeOf(() => removeMarking(p, 'M2'))).toBe('locked');
  });

  it('mover e redimensionar a mesma marcação destrancada funciona', () => {
    const p = setMarkingLocked(locked(), 'M2', false);
    expect(codeOf(() => moveMarking(p, 'M2', 10, 0))).toBeNull();
    expect(codeOf(() => removeMarking(p, 'M2'))).toBeNull();
  });

  it('continua selecionável e editável: renomear não é bloqueado', () => {
    const p = renameMarking(locked(), 'M2', 'Outro nome');
    expect(marking(p, 'M2').name).toBe('Outro nome');
    expect(marking(p, 'M2').locked).toBe(true);
  });

  it('o ajuste fino que não muda nada não falha', () => {
    const p = locked();
    expect(adjustMarkingRect(p, 'M2', 'x', marking(p, 'M2').rect.x)).toBe(p);
  });

  it('as funções de consulta refletem a trava', () => {
    const p = locked();
    expect(canEditMarkingGeometry(p, 'M2')).toBe(false);
    expect(canEditMarkingGeometry(p, 'M2')).toBe(false);
    expect(canDeleteMarking(p, 'M2')).toBe(false);
    expect(canEditMarkingGeometry(p, 'M4')).toBe(true);
  });

  it('o impacto da exclusão ainda pode ser calculado', () => {
    expect(markingDeletionImpact(locked(), 'M2').descendants).toBe(1);
  });
});

describe('trava: pai trancado trava a geometria dos descendentes', () => {
  const parentLocked = () => setMarkingLocked(sampleProject(), 'M1', true);

  it('descendentes não podem ser movidos nem redimensionados', () => {
    const p = parentLocked();
    for (const id of ['M2', 'M3']) {
      expect(isMarkingGeometryLocked(p, id)).toBe(true);
      expect(codeOf(() => moveMarking(p, id, 1, 0))).toBe('locked');
      const { rect } = marking(p, id);
      expect(
        codeOf(() => setMarkingRect(p, id, { ...rect, width: rect.width + 2 })),
      ).toBe('locked');
    }
  });

  it('não altera o locked dos descendentes', () => {
    const p = parentLocked();
    expect(marking(p, 'M2').locked).toBe(false);
    expect(marking(p, 'M3').locked).toBe(false);
  });

  it('um descendente solto de um pai trancado ainda pode ser excluído', () => {
    const p = parentLocked();
    expect(canDeleteMarking(p, 'M3')).toBe(true);
    const q = removeMarking(p, 'M3');
    expect(q.markings.map((m) => m.id)).not.toContain('M3');
  });

  it('destrancar o pai libera a geometria dos descendentes', () => {
    const p = setMarkingLocked(parentLocked(), 'M1', false);
    expect(isMarkingGeometryLocked(p, 'M3')).toBe(false);
    expect(codeOf(() => moveMarking(p, 'M3', 1, 0))).toBeNull();
  });

  it('marcações de outra imagem não são afetadas', () => {
    expect(isMarkingGeometryLocked(parentLocked(), 'M4')).toBe(false);
  });

  it('criar uma marcação dentro de um pai trancado continua permitido', () => {
    const p = createMarking(parentLocked(), {
      id: 'M5',
      imageId: 'I1',
      rect: { x: 1700, y: 1700, width: 100, height: 100 },
    });
    expect(marking(p, 'M5').parentId).toBe('M1');
    expect(marking(p, 'M5').locked).toBe(false);
  });
});

describe('trava: descendente trancado não impede o pai', () => {
  const childLocked = () => setMarkingLocked(sampleProject(), 'M3', true);

  it('o pai e o avô podem ser movidos, e o descendente trancado vai junto', () => {
    const p = childLocked();
    expect(canEditMarkingGeometry(p, 'M1')).toBe(true);
    expect(canEditMarkingGeometry(p, 'M2')).toBe(true);
    for (const id of ['M1', 'M2']) {
      const q = expectValid(moveMarking(p, id, 10, 5));
      expect(marking(q, 'M3').rect).toEqual({
        ...marking(p, 'M3').rect,
        x: marking(p, 'M3').rect.x + 10,
        y: marking(p, 'M3').rect.y + 5,
      });
      expect(marking(q, 'M3').locked).toBe(true);
    }
  });

  it('mover o pai mantém a posição relativa de todos os descendentes, trancados ou não', () => {
    const p = setMarkingLocked(sampleProject(), 'M2', true);
    const q = moveMarking(p, 'M1', 20, -10);
    const offset = (a: string, b: string, project: Project) => ({
      dx: marking(project, b).rect.x - marking(project, a).rect.x,
      dy: marking(project, b).rect.y - marking(project, a).rect.y,
    });
    for (const [a, b] of [
      ['M1', 'M2'],
      ['M1', 'M3'],
      ['M2', 'M3'],
    ] as const) {
      expect(offset(a, b, q)).toEqual(offset(a, b, p));
    }
    expectValid(q);
  });

  it('o ajuste fino de x/y do pai também leva o descendente trancado', () => {
    const p = childLocked();
    const q = adjustMarkingRect(p, 'M1', 'y', 1010);
    expect(marking(q, 'M1').rect.y).toBe(1010);
    expect(marking(q, 'M3').rect.y).toBe(marking(p, 'M3').rect.y + 10);
  });

  it('o próprio descendente trancado continua sem poder ser movido por conta própria', () => {
    const p = childLocked();
    expect(codeOf(() => moveMarking(p, 'M3', 1, 0))).toBe('locked');
  });

  it('o pai pode ser redimensionado, e o descendente trancado fica onde está', () => {
    const p = childLocked();
    const { rect } = marking(p, 'M1');
    const q = setMarkingRect(p, 'M1', { ...rect, width: rect.width + 100 });
    expect(marking(q, 'M1').rect.width).toBe(rect.width + 100);
    expect(marking(q, 'M3').rect).toEqual(marking(p, 'M3').rect);
  });

  it('o pai e o avô podem ser excluídos, e o descendente trancado é excluído junto', () => {
    const p = childLocked();
    expect(canDeleteMarking(p, 'M1')).toBe(true);
    expect(canDeleteMarking(p, 'M2')).toBe(true);
    expect(canDeleteMarking(p, 'M3')).toBe(false);
    const q = expectValid(removeMarking(p, 'M2'));
    expect(q.markings.map((m) => m.id)).toEqual(['M1', 'M4']);
    const all = expectValid(removeMarking(p, 'M1'));
    expect(all.markings.map((m) => m.id)).toEqual(['M4']);
    expect(all.annotations.map((a) => a.markingId)).not.toContain('M3');
  });

  it('o impacto da exclusão conta os descendentes trancados', () => {
    const none = markingDeletionImpact(sampleProject(), 'M1');
    expect(none.lockedDescendants).toBe(0);
    const p = setMarkingLocked(childLocked(), 'M2', true);
    expect(markingDeletionImpact(p, 'M1')).toMatchObject({
      descendants: 2,
      lockedDescendants: 2,
    });
    expect(markingDeletionImpact(p, 'M2')).toMatchObject({
      descendants: 1,
      lockedDescendants: 1,
    });
    // O próprio item não entra na conta, mesmo trancado.
    expect(markingDeletionImpact(p, 'M3').lockedDescendants).toBe(0);
  });

  it('o pai trancado continua travando a geometria do descendente trancado', () => {
    const p = setMarkingLocked(childLocked(), 'M1', true);
    expect(codeOf(() => moveMarking(p, 'M1', 1, 0))).toBe('locked');
    expect(codeOf(() => moveMarking(p, 'M2', 1, 0))).toBe('locked');
    expect(codeOf(() => removeMarking(p, 'M1'))).toBe('locked');
  });

  it('uma marcação de outra imagem não é afetada', () => {
    expect(codeOf(() => removeMarking(childLocked(), 'M4'))).toBeNull();
  });
});

describe('trava: imagem trancada', () => {
  const locked = () => setImageLocked(sampleProject(), 'I2', true);
  const placement = (p: Project) => image(p, 'I2').placement;

  it('não pode ser movida, redimensionada nem excluída', () => {
    const p = locked();
    expect(codeOf(() => moveImage(p, 'I2', 5000, 0))).toBe('locked');
    expect(
      codeOf(() =>
        resizeImage(p, 'I2', { ...placement(p), scale: placement(p).scale / 2 }),
      ),
    ).toBe('locked');
    expect(codeOf(() => removeImage(p, 'I2'))).toBe('locked');
  });

  it('destrancada, volta a funcionar', () => {
    const p = setImageLocked(locked(), 'I2', false);
    expect(codeOf(() => moveImage(p, 'I2', 5000, 0))).toBeNull();
    expect(codeOf(() => removeImage(p, 'I2'))).toBeNull();
  });

  it('as marcações da imagem trancada continuam editáveis', () => {
    expect(codeOf(() => moveMarking(locked(), 'M4', 1, 1))).toBeNull();
  });

  it('o impacto da exclusão ainda pode ser calculado', () => {
    expect(imageDeletionImpact(locked(), 'I2').markings).toBe(1);
  });

  it('trocar o arquivo por um de outro tamanho é bloqueado; do mesmo tamanho, não', () => {
    const p = locked();
    const same = { file: 'images/nova.png', width: 1000, height: 1000 };
    const bigger = { file: 'images/nova.png', width: 2000, height: 2000 };
    expect(canReplaceImage(p, 'I2', same)).toBe(true);
    expect(canReplaceImage(p, 'I2', bigger)).toBe(false);
    expect(codeOf(() => replaceImage(p, 'I2', same))).toBeNull();
    expect(codeOf(() => replaceImage(p, 'I2', bigger))).toBe('locked');
    // O replace mantém a trava da imagem.
    expect(image(replaceImage(p, 'I2', same), 'I2').locked).toBe(true);
  });
});

describe('trava: imagem com marcação trancada', () => {
  const p = () => setMarkingLocked(sampleProject(), 'M3', true);

  it('a imagem pode ser excluída, e as marcações trancadas vão junto', () => {
    expect(canDeleteImage(p(), 'I1')).toBe(true);
    const q = expectValid(removeImage(p(), 'I1'));
    expect(q.images.map((i) => i.id)).toEqual(['I2']);
    expect(q.markings.map((m) => m.id)).toEqual(['M4']);
  });

  it('o impacto da exclusão conta as marcações trancadas', () => {
    expect(imageDeletionImpact(sampleProject(), 'I1').lockedMarkings).toBe(0);
    const locked = setImageMarkingsLocked(sampleProject(), 'I1', true);
    expect(imageDeletionImpact(locked, 'I1')).toMatchObject({
      markings: 3,
      lockedMarkings: 3,
    });
    expect(imageDeletionImpact(locked, 'I2').lockedMarkings).toBe(0);
  });

  it('a imagem pode ser movida, pois as marcações usam pixels da imagem', () => {
    expect(codeOf(() => moveImage(p(), 'I1', 0, 5000))).toBeNull();
  });

  it('trocar por um arquivo de outro tamanho segue bloqueado (a troca reescalaria a marcação revisada)', () => {
    const bigger = { file: 'images/nova.jpg', width: 8000, height: 6000 };
    expect(canReplaceImage(p(), 'I1', bigger)).toBe(false);
    expect(codeOf(() => replaceImage(p(), 'I1', bigger))).toBe('locked');
    const same = { file: 'images/nova.jpg', width: 4000, height: 3000 };
    expect(codeOf(() => replaceImage(p(), 'I1', same))).toBeNull();
  });

  it('a imagem sem trava nenhuma é trocada normalmente', () => {
    const bigger = { file: 'images/nova.jpg', width: 8000, height: 6000 };
    expect(codeOf(() => replaceImage(sampleProject(), 'I1', bigger))).toBeNull();
  });
});
