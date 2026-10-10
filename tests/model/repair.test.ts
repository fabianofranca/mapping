import { describe, expect, it } from 'vitest';
import {
  IMAGE_GAP,
  imageCanvasRect,
  repairProject,
  right,
  validateProject,
  type Project,
} from '../../src/model';
import { idGen } from './specFixtures';
import { image, marking, sampleProject } from './fixtures';

function repair(p: Project) {
  return repairProject(p, validateProject(p), idGen('NEW'));
}

describe('repairProject', () => {
  it('projeto válido: nada a fazer', () => {
    const p = sampleProject();
    expect(repair(p)).toEqual({ project: p, repaired: [], unrepaired: [] });
  });

  it('par com id já usado em outra anotação ganha id novo; o primeiro fica', () => {
    const p = sampleProject();
    const broken: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'A2'
          ? { ...a, entries: [{ id: 'E1', key: 'tipo', value: 'trinca' }] }
          : a,
      ),
    };
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    const entryIds = (id: string) =>
      result.project.annotations.find((a) => a.id === id)?.entries.map((e) => e.id);
    expect(entryIds('A1')).toEqual(['E1', 'E2']);
    expect(entryIds('A2')).toEqual(['NEW1']);
    expect(result.repaired).toEqual([
      { action: 'new-id', code: 'duplicate-entry-id', entity: 'annotation', id: 'A2' },
    ]);
  });

  it('rect fora da imagem é recortado aos limites', () => {
    const p = sampleProject();
    const broken: Project = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'M4' ? { ...m, rect: { x: 950, y: 900, width: 100, height: 300 } } : m,
      ),
    };
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(marking(result.project, 'M4').rect).toEqual({
      x: 950,
      y: 900,
      width: 50,
      height: 100,
    });
    expect(result.repaired).toEqual([
      { action: 'clipped', code: 'rect-out-of-image', entity: 'marking', id: 'M4' },
    ]);
  });

  it('marcação que fica sem área é removida, com as anotações dela', () => {
    const p = sampleProject();
    const broken: Project = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'M4' ? { ...m, rect: { x: 1000, y: 0, width: 100, height: 100 } } : m,
      ),
    };
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(result.project.markings.map((m) => m.id)).not.toContain('M4');
    expect(result.project.annotations.map((a) => a.id)).not.toContain('A4');
    expect(result.repaired).toContainEqual({
      action: 'removed',
      code: 'rect-out-of-image',
      entity: 'marking',
      id: 'M4',
    });
    expect(result.repaired).toContainEqual({
      action: 'removed',
      code: 'missing-marking',
      entity: 'annotation',
      id: 'A4',
    });
  });

  it('marcação de imagem inexistente é removida; os filhos dela viram raiz', () => {
    const p = sampleProject();
    const broken: Project = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M2' ? { ...m, imageId: 'I9' } : m)),
    };
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(result.project.markings.map((m) => m.id)).toEqual(['M1', 'M3', 'M4']);
    expect(marking(result.project, 'M3').parentId).toBeNull();
    expect(result.repaired).toEqual([
      {
        action: 'removed',
        code: 'missing-image',
        entity: 'marking',
        id: 'M2',
        name: 'Maçaneta',
      },
      {
        action: 'made-root',
        code: 'missing-parent',
        entity: 'marking',
        id: 'M3',
        name: 'Fechadura',
      },
      {
        action: 'removed',
        code: 'missing-marking',
        entity: 'annotation',
        id: 'A3',
      },
    ]);
  });

  it('anotação de marcação ou camada inexistente é removida, com as que ela possui', () => {
    const p = sampleProject();
    const broken: Project = {
      ...p,
      annotations: [
        ...p.annotations.map((a) => (a.id === 'A1' ? { ...a, layerId: 'L9' } : a)),
        { ...p.annotations[1]!, id: 'A5', parentAnnotationId: 'A1', entries: [] },
      ],
    };
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(result.project.annotations.map((a) => a.id)).toEqual(['A2', 'A3', 'A4']);
    expect(result.repaired).toEqual([
      {
        action: 'removed',
        code: 'missing-layer',
        entity: 'annotation',
        id: 'A1',
        name: 'Amassado',
      },
      {
        action: 'removed',
        code: 'missing-parent-annotation',
        entity: 'annotation',
        id: 'A5',
      },
    ]);
  });

  it('pai inexistente: a marcação vira raiz', () => {
    const p = sampleProject();
    const broken: Project = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M2' ? { ...m, parentId: 'M9' } : m)),
    };
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(marking(result.project, 'M2').parentId).toBeNull();
    expect(marking(result.project, 'M3').parentId).toBe('M2');
  });

  it('ciclo na hierarquia: só as marcações do ciclo viram raiz', () => {
    const p = sampleProject();
    // M1 › M2 › M1; M3 (filha de M2) entra no ciclo, mas não faz parte dele.
    const broken: Project = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M1' ? { ...m, parentId: 'M2' } : m)),
    };
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(marking(result.project, 'M1').parentId).toBeNull();
    expect(marking(result.project, 'M2').parentId).toBeNull();
    expect(marking(result.project, 'M3').parentId).toBe('M2');
    expect(result.repaired.map((r) => `${r.action}:${r.id}`)).toEqual([
      'made-root:M1',
      'made-root:M2',
    ]);
  });

  it('imagens sobrepostas: a de maior índice vai para a direita das anteriores', () => {
    const p = sampleProject();
    const first = image(p, 'I1');
    const broken: Project = {
      ...p,
      images: p.images.map((i) =>
        i.id === 'I2' ? { ...i, placement: { ...i.placement, x: first.placement.x } } : i,
      ),
    };
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    const moved = image(result.project, 'I2');
    expect(moved.placement.x).toBe(
      right(imageCanvasRect(first, first.placement)) + IMAGE_GAP,
    );
    expect(moved.placement.y).toBe(first.placement.y);
    expect(result.repaired).toEqual([
      {
        action: 'moved',
        code: 'images-overlap',
        entity: 'image',
        id: 'I2',
        name: 'images/frente.jpg',
      },
    ]);
  });

  it('problema sem reparo mecânico fica em unrepaired', () => {
    const p = sampleProject();
    const broken: Project = {
      ...p,
      markings: [
        ...p.markings.map((m) => (m.id === 'M2' ? { ...m, parentId: 'M9' } : m)),
        { ...marking(p, 'M4') },
      ],
    };
    const result = repair(broken);
    expect(result.unrepaired.map((i) => `${i.code}:${i.id}`)).toEqual([
      'duplicate-id:M4',
    ]);
  });
});
