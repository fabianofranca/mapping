import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addContainer,
  canReplaceImage,
  createArrow,
  createMarking,
  itemClipboardData,
  itemsDeletionImpact,
  replaceContainer,
  setMarkingLocked,
  setMarkingSpace,
  wrapItems,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';
import { multiProject } from './multiSelectionFixtures';

function codeOf(op: () => unknown): string | null {
  try {
    op();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

const extra = { project: 'mapeamento', ref: 'mapping://mapeamento/m/x' };

describe('CR do modelo, fase 1', () => {
  it('(5) itemClipboardData com o id de uma seta devolve os dados da seta', () => {
    const p = createArrow(sampleProject(), { id: 'R1', from: 'M1', to: 'M4' });
    const data = itemClipboardData(p, 'm', 'R1', extra);
    expect(data.item.id).toBe('R1');
    expect(data.markings).toEqual([]);
  });

  it('(28) trocar a imagem que sairia de baixo de marcação trancada é recusado', () => {
    const base = multiProject();
    const withFile = {
      ...base,
      containers: base.containers.map((c) =>
        c.id === 'B' ? { ...c, file: 'images/b0.png', background: null } : c,
      ),
    };
    const p = setMarkingLocked(withFile, 'G', true);
    const bigger = { file: 'images/b.png', width: 1000, height: 1000 };
    // A escala de B muda (mesma largura exibida): o `placement` que a troca grava.
    const moved = { ...bigger, placement: { x: 2000, y: 0, scale: 1 } };
    expect(canReplaceImage(p, 'B', moved)).toBe(false);
    expect(codeOf(() => replaceContainer(p, 'B', bigger))).toBe('locked');
  });

  it('(31) setMarkingSpace com o mesmo container e rect devolve o projeto intacto', () => {
    const base = sampleProject();
    const m = base.markings.find((x) => x.id === 'M1');
    if (!m) throw new Error('M1');
    const p = setMarkingLocked(base, 'M1', true);
    expect(setMarkingSpace(p, 'M1', 'I1', { ...m.rect })).toBe(p);
  });

  it('(32) id usado por container recusa marcação, seta e envolver; e o inverso', () => {
    const p = sampleProject();
    const r = { x: 10, y: 10, width: 50, height: 50 };
    expect(codeOf(() => createMarking(p, { id: 'I1', containerId: 'I1', rect: r }))).toBe(
      'duplicate-id',
    );
    expect(codeOf(() => createArrow(p, { id: 'I2', from: 'M1', to: 'M4' }))).toBe(
      'duplicate-id',
    );
    expect(
      codeOf(() => wrapItems(p, { id: 'I1', items: [{ kind: 'marking', id: 'M1' }] })),
    ).toBe('duplicate-id');
    expect(
      codeOf(() =>
        addContainer(p, { id: 'M1', file: 'images/x.png', width: 10, height: 10 }),
      ),
    ).toBe('duplicate-id');
  });

  it('(33) a trancada selecionada que sai com a mãe entra em lockedMarkings', () => {
    const p: Project = setMarkingLocked(multiProject(), 'a2', true);
    const impact = itemsDeletionImpact(p, [
      { kind: 'marking', id: 'a1' },
      { kind: 'marking', id: 'a2' },
    ]);
    expect(impact.lockedMarkings).toBe(1);
  });

  it('(33) a trancada selecionada que sai com o container entra em lockedMarkings', () => {
    const p: Project = setMarkingLocked(multiProject(), 'a3', true);
    const impact = itemsDeletionImpact(p, [
      { kind: 'image', id: 'A' },
      { kind: 'marking', id: 'a3' },
    ]);
    expect(impact.lockedMarkings).toBe(1);
  });

  it('(34) commonParent ignora flutuantes: o pai comum das demais continua o pai', () => {
    // P1 e P2 têm a mesma área, retângulos diferentes e ambos contêm c1 e c2; c1 e c2 são
    // filhas de P1. Com a flutuante N na seleção, o pai comum não pode se perder (o desempate
    // cairia em P2, a que vem depois no array).
    let p = sampleProject();
    const add = (id: string, x: number, y: number, size: number) => {
      p = createMarking(p, {
        id,
        containerId: 'I1',
        rect: { x, y, width: size, height: size },
      });
    };
    add('P1', 2200, 200, 400);
    add('P2', 2250, 250, 400);
    add('c1', 2250, 250, 50);
    add('c2', 2400, 400, 50);
    p = createMarking(p, {
      id: 'N',
      containerId: null,
      floating: true,
      rect: { x: 100, y: 5000, width: 200, height: 100 },
    });
    p = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'c1' || m.id === 'c2' ? { ...m, parentId: 'P1' } : m,
      ),
    };
    const q = wrapItems(p, {
      id: 'W',
      items: [
        { kind: 'marking', id: 'c1' },
        { kind: 'marking', id: 'c2' },
        { kind: 'marking', id: 'N' },
      ],
    });
    expect(q.markings.find((m) => m.id === 'W')?.parentId).toBe('P1');
  });
});
