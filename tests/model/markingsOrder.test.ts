import { describe, expect, it } from 'vitest';
import {
  adjustMarkingRect,
  createMarking,
  reorderMarking,
  setMarkingLocked,
  setMarkingRect,
  siblingPosition,
  type Project,
} from '../../src/model';
import { expectValid, sampleProject } from './fixtures';

/** I1 com as irmãs S1..S4 no nível da imagem, depois da Porta M1 (M2 e M3 são filhas dela). */
function withSiblings(): Project {
  let p = sampleProject();
  for (const [id, x] of [
    ['S1', 0],
    ['S2', 100],
    ['S3', 200],
    ['S4', 300],
  ] as const) {
    p = createMarking(p, { id, containerId: 'I1', rect: { x, y: 0, width: 50, height: 50 } });
  }
  return p;
}

const order = (p: Project, ids: string[]) =>
  p.markings.map((m) => m.id).filter((id) => ids.includes(id));

describe('siblingPosition', () => {
  it('posição entre as irmãs da mesma imagem e do mesmo pai', () => {
    const p = withSiblings();
    // Nível da imagem I1: M1, S1..S4 (M2 e M3 são filhas).
    expect(siblingPosition(p, 'M1')).toEqual({ index: 0, count: 5 });
    expect(siblingPosition(p, 'S3')).toEqual({ index: 3, count: 5 });
    // Outra imagem tem as próprias irmãs.
    expect(siblingPosition(p, 'M4')).toEqual({ index: 0, count: 1 });
    // Filha de M1.
    expect(siblingPosition(p, 'M2')).toEqual({ index: 0, count: 1 });
  });

  it('marcação inexistente falha com not-found', () => {
    expect(() => siblingPosition(withSiblings(), 'X')).toThrow('not-found');
  });
});

describe('reorderMarking', () => {
  it('sobe e desce entre as irmãs, mantendo a ordem relativa das demais', () => {
    const p = withSiblings();
    const up = reorderMarking(p, 'S1', 4);
    expect(order(up, ['M1', 'S1', 'S2', 'S3', 'S4'])).toEqual([
      'M1',
      'S2',
      'S3',
      'S4',
      'S1',
    ]);
    expect(siblingPosition(up, 'S1')).toEqual({ index: 4, count: 5 });
    const down = reorderMarking(p, 'S4', 0);
    expect(order(down, ['M1', 'S1', 'S2', 'S3', 'S4'])).toEqual([
      'S4',
      'M1',
      'S1',
      'S2',
      'S3',
    ]);
    const middle = reorderMarking(p, 'S1', 2);
    expect(order(middle, ['M1', 'S1', 'S2', 'S3', 'S4'])).toEqual([
      'M1',
      'S2',
      'S1',
      'S3',
      'S4',
    ]);
    expectValid(middle);
  });

  it('as marcações que não são irmãs ficam onde estavam no array', () => {
    const p = withSiblings();
    const next = reorderMarking(p, 'S1', 4);
    for (const id of ['M2', 'M3', 'M4']) {
      expect(next.markings.findIndex((m) => m.id === id)).toBe(
        p.markings.findIndex((m) => m.id === id),
      );
    }
    expect(next.markings).toHaveLength(p.markings.length);
  });

  it('só reordena entre as irmãs: filhas de pais diferentes não se misturam', () => {
    let p = withSiblings();
    p = createMarking(p, {
      id: 'C1',
      containerId: 'I1',
      rect: { x: 1010, y: 1010, width: 30, height: 30 },
    });
    // C1 cabe em M1 › M2? (1200..) não; cabe em M1 mas fora de M2: pai = M1.
    expect(siblingPosition(p, 'C1')).toEqual({ index: 1, count: 2 });
    const next = reorderMarking(p, 'C1', 0);
    expect(order(next, ['M2', 'C1'])).toEqual(['C1', 'M2']);
  });

  it('mesma posição devolve o mesmo projeto', () => {
    const p = withSiblings();
    expect(reorderMarking(p, 'S2', 2)).toBe(p);
  });

  it('índice fora de [0, count - 1] falha com invalid-index', () => {
    const p = withSiblings();
    expect(() => reorderMarking(p, 'S1', 5)).toThrow('invalid-index');
    expect(() => reorderMarking(p, 'S1', -1)).toThrow('invalid-index');
    expect(() => reorderMarking(p, 'S1', 1.5)).toThrow('invalid-index');
  });

  it('a trava não impede reordenar', () => {
    let p = withSiblings();
    p = setMarkingLocked(p, 'S1', true);
    expect(order(reorderMarking(p, 'S1', 4), ['S1', 'S4'])).toEqual(['S4', 'S1']);
  });
});

describe('tamanho mínimo (minSize)', () => {
  const minSize = { width: 60, height: 40 };

  it('createMarking recusa o retângulo menor que o mínimo', () => {
    const p = sampleProject();
    const args = {
      id: 'N1',
      containerId: 'I2',
      rect: { x: 200, y: 200, width: 59, height: 60 },
    };
    expect(() => createMarking(p, args, { minSize })).toThrow('rect-too-small');
    expect(() =>
      createMarking(
        p,
        { ...args, rect: { ...args.rect, width: 60, height: 39 } },
        { minSize },
      ),
    ).toThrow('rect-too-small');
    expect(
      createMarking(
        p,
        { ...args, rect: { ...args.rect, width: 60, height: 40 } },
        { minSize },
      ).markings,
    ).toHaveLength(p.markings.length + 1);
  });

  it('sem a opção nada muda', () => {
    const p = sampleProject();
    const next = createMarking(p, {
      id: 'N1',
      containerId: 'I2',
      rect: { x: 200, y: 200, width: 10, height: 10 },
    });
    expect(next.markings.at(-1)?.rect.width).toBe(10);
  });

  it('setMarkingRect recusa abaixo do mínimo e aceita o mínimo', () => {
    const p = sampleProject();
    const rect = { x: 0, y: 0, width: 59, height: 100 };
    expect(() => setMarkingRect(p, 'M4', rect, { minSize })).toThrow('rect-too-small');
    const ok = setMarkingRect(p, 'M4', { ...rect, width: 60 }, { minSize });
    expect(ok.markings.find((m) => m.id === 'M4')?.rect.width).toBe(60);
  });

  it('setMarkingRect sem a opção segue as regras de sempre', () => {
    const p = sampleProject();
    expect(() =>
      setMarkingRect(p, 'M4', { x: 0, y: 0, width: 8, height: 8 }),
    ).not.toThrow();
    expect(() => setMarkingRect(p, 'M4', { x: 0, y: 0, width: 7, height: 8 })).toThrow(
      'rect-too-small',
    );
  });

  it('o retângulo atual continua não sendo mudança, mesmo abaixo do mínimo', () => {
    const p = sampleProject();
    const rect = { ...p.markings.find((m) => m.id === 'M4')!.rect };
    expect(setMarkingRect(p, 'M4', rect, { minSize: { width: 500, height: 500 } })).toBe(
      p,
    );
  });

  it('adjustMarkingRect limita largura e altura por baixo ao mínimo', () => {
    const p = sampleProject();
    const wide = adjustMarkingRect(p, 'M4', 'width', 20, { minSize });
    expect(wide.markings.find((m) => m.id === 'M4')?.rect.width).toBe(60);
    const tall = adjustMarkingRect(p, 'M4', 'height', 20, { minSize });
    expect(tall.markings.find((m) => m.id === 'M4')?.rect.height).toBe(40);
    // Sem a opção, o mínimo é o das marcações.
    const plain = adjustMarkingRect(p, 'M4', 'width', 20);
    expect(plain.markings.find((m) => m.id === 'M4')?.rect.width).toBe(20);
  });

  it('adjustMarkingRect: se o mínimo não cabe no pai, recusa', () => {
    const p = sampleProject();
    expect(() =>
      adjustMarkingRect(p, 'M3', 'width', 20, { minSize: { width: 5000, height: 10 } }),
    ).toThrow();
  });
});
