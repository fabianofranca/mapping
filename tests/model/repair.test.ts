import { describe, expect, it } from 'vitest';
import {
  IMAGE_GAP,
  createMarking,
  deserialize,
  imageCanvasRect,
  repairProject,
  right,
  serialize,
  validateProject,
  type Marking,
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
      markings: p.markings.map((m) => (m.id === 'M2' ? { ...m, containerId: 'I9' } : m)),
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
      containers: p.containers.map((i) =>
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

// Pertencimento por geometria (v13): o reparo só torna o projeto válido; nunca assenta.
describe('repairProject: canvas e pertencimento', () => {
  const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });
  /** sampleProject + K (canvas, cerca só a I1) + J (canvas, dentro de K). */
  function withCanvas(): Project {
    let p = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: rect(-100, -100, 1200, 1000),
    });
    p = createMarking(p, { id: 'J', containerId: null, rect: rect(-50, -50, 200, 100) });
    return p;
  }
  const patchMarking = (p: Project, id: string, change: Partial<Marking>): Project => ({
    ...p,
    markings: p.markings.map((m) => (m.id === id ? { ...m, ...change } : m)),
  });
  const patchContainer = (p: Project, id: string, parentId: string | null): Project => ({
    ...p,
    containers: p.containers.map((c) => (c.id === id ? { ...c, parentId } : c)),
  });

  it('pai de container ausente: o container fica sem pai', () => {
    const result = repair(patchContainer(sampleProject(), 'I1', 'ZZ'));
    expect(result.unrepaired).toEqual([]);
    expect(image(result.project, 'I1').parentId).toBeNull();
    expect(result.repaired).toEqual([
      {
        action: 'made-root',
        code: 'container-parent-missing',
        entity: 'image',
        id: 'I1',
        name: 'images/lateral.jpg',
      },
    ]);
  });

  it('pai de container que não é do canvas (de container ou flutuante): sem pai', () => {
    const ofContainer = repair(patchContainer(withCanvas(), 'I1', 'M1'));
    expect(ofContainer.unrepaired).toEqual([]);
    expect(image(ofContainer.project, 'I1').parentId).toBeNull();
    expect(ofContainer.repaired.map((r) => `${r.action}:${r.code}:${r.id}`)).toEqual([
      'made-root:container-parent-not-canvas:I1',
    ]);

    const floating = patchMarking(
      patchMarking(withCanvas(), 'J', { parentId: null }),
      'J',
      {
        floating: true,
      },
    );
    const ofFloating = repair(patchContainer(floating, 'I1', 'J'));
    expect(ofFloating.unrepaired).toEqual([]);
    expect(image(ofFloating.project, 'I1').parentId).toBeNull();
    // A flutuante em si não é tocada.
    expect(marking(ofFloating.project, 'J')).toEqual(marking(floating, 'J'));
  });

  it('container fora da marcação do canvas: sem pai', () => {
    const result = repair(patchContainer(withCanvas(), 'I2', 'K'));
    expect(result.unrepaired).toEqual([]);
    expect(image(result.project, 'I2').parentId).toBeNull();
    expect(result.repaired.map((r) => `${r.code}:${r.id}`)).toEqual([
      'container-outside-parent:I2',
    ]);
    // Os outros pais continuam.
    expect(image(result.project, 'I1').parentId).toBe('K');
  });

  it('flutuante dentro de um container: vai para o canvas, o rect convertido; as filhas perdem o pai', () => {
    const broken = patchMarking(sampleProject(), 'M1', { floating: true });
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(marking(result.project, 'M1')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: true,
      // 1000 px de I1 (escala 0,25, em 0,0): 250 unidades do canvas.
      rect: rect(250, 250, 250, 250),
    });
    // M2 apontava para a M1 flutuante: sem pai. M3 continua em M2.
    expect(marking(result.project, 'M2').parentId).toBeNull();
    expect(marking(result.project, 'M3').parentId).toBe('M2');
    expect(result.repaired).toContainEqual({
      action: 'made-root',
      code: 'floating-in-container',
      entity: 'marking',
      id: 'M1',
      name: 'Porta',
    });
    expect(result.repaired).toContainEqual({
      action: 'made-root',
      code: 'parent-floating',
      entity: 'marking',
      id: 'M2',
      name: 'Maçaneta',
    });
  });

  it('flutuante do canvas que tem pai: o pai sai e o rect fica', () => {
    const broken = patchMarking(withCanvas(), 'J', { floating: true });
    expect(marking(broken, 'J').parentId).toBe('K');
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(marking(result.project, 'J')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: true,
      rect: rect(-50, -50, 200, 100),
    });
  });

  it('marcação com pai flutuante: vira raiz', () => {
    const broken = patchMarking(
      patchMarking(withCanvas(), 'K', { floating: true }),
      'K',
      {
        parentId: null,
      },
    );
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(marking(result.project, 'J').parentId).toBeNull();
    // K é flutuante: não pode ser pai do container I1.
    expect(image(result.project, 'I1').parentId).toBeNull();
    expect(result.repaired.map((r) => `${r.code}:${r.id}`).sort()).toEqual([
      'container-parent-not-canvas:I1',
      'parent-floating:J',
    ]);
  });

  it('a marcação do canvas nunca é órfã nem é recortada; só a de container', () => {
    // M2 aponta para um container inexistente (removida); K, do canvas, com coordenadas negativas, fica.
    const broken = patchMarking(withCanvas(), 'M2', { containerId: 'I9' });
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(result.project.markings.map((m) => m.id)).toEqual([
      'M1',
      'M3',
      'M4',
      'K',
      'J',
    ]);
    expect(marking(result.project, 'K')).toEqual(marking(broken, 'K'));
    expect(marking(result.project, 'J')).toEqual(marking(broken, 'J'));
  });

  it('só torna o projeto válido: não assenta (um pai válido que não é o menor fica)', () => {
    // M3 aponta para M1 (válido, mas M2 é a menor que a contém); M2 tem pai ausente.
    let broken = patchMarking(sampleProject(), 'M3', { parentId: 'M1' });
    broken = patchMarking(broken, 'M2', { parentId: 'M9' });
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(marking(result.project, 'M2').parentId).toBeNull();
    expect(marking(result.project, 'M3').parentId).toBe('M1');
    expect(validateProject(result.project)).toEqual([]);
  });

  it('o projeto reparado grava e relê sem passar de novo pelo reparo', () => {
    const broken = patchContainer(
      patchMarking(withCanvas(), 'J', { floating: true }),
      'I2',
      'K',
    );
    const result = repair(broken);
    expect(validateProject(result.project)).toEqual([]);
    expect(deserialize(serialize(result.project)).ok).toBe(true);
  });
});
