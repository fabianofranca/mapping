import { describe, expect, it } from 'vitest';
import {
  addBackgroundContainer,
  createMarking,
  validateProject,
  type Marking,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

function codes(p: Project) {
  return validateProject(p).map((i) => `${i.code}:${i.id}`);
}

describe('validador de invariantes', () => {
  it('o projeto de exemplo é válido', () => {
    expect(validateProject(sampleProject())).toEqual([]);
  });

  it('ids e arquivos repetidos', () => {
    const p = sampleProject();
    const layer = p.layers[0];
    const image = p.containers[1];
    if (!layer || !image) throw new Error('fixture');
    expect(codes({ ...p, layers: [...p.layers, layer] })).toContain('duplicate-id:L1');
    expect(
      codes({
        ...p,
        containers: p.containers.map((i) =>
          i.id === 'I2' ? { ...i, file: 'images/lateral.jpg' } : i,
        ),
      }),
    ).toContain('duplicate-file:I2');
    expect(image.id).toBe('I2');
  });

  it('cada problema diz a entidade, o id e o nome quando houver', () => {
    const p = sampleProject();
    const layer = p.layers[1];
    const spec = { id: 'S1', version: 1, file: 'specs/s1.json', spec: null };
    if (!layer) throw new Error('fixture');
    const broken: Project = {
      ...p,
      specializations: [spec, spec],
      layers: [...p.layers, layer],
      markings: p.markings.map((m) =>
        m.id === 'M2'
          ? { ...m, containerId: 'I9' }
          : m.id === 'M4'
            ? { ...m, parentId: 'M9' }
            : m,
      ),
      annotations: p.annotations.map((a) =>
        a.id === 'A1' ? { ...a, layerId: 'L9' } : a,
      ),
    };
    expect(validateProject(broken)).toEqual(
      expect.arrayContaining([
        { code: 'duplicate-id', entity: 'spec', id: 'S1' },
        { code: 'duplicate-spec-file', entity: 'spec', id: 'S1' },
        { code: 'duplicate-id', entity: 'layer', id: 'L2', name: 'Vidros' },
        {
          code: 'missing-image',
          entity: 'marking',
          id: 'M2',
          name: 'Maçaneta',
          otherId: 'I9',
        },
        { code: 'missing-parent', entity: 'marking', id: 'M4', otherId: 'M9' },
        {
          code: 'missing-layer',
          entity: 'annotation',
          id: 'A1',
          name: 'Amassado',
          otherId: 'L9',
        },
      ]),
    );
  });

  it('imagens sobrepostas', () => {
    const p = sampleProject();
    const overlapping = {
      ...p,
      containers: p.containers.map((i) =>
        i.id === 'I2' ? { ...i, placement: { ...i.placement, x: 500 } } : i,
      ),
    };
    expect(validateProject(overlapping)).toContainEqual({
      code: 'images-overlap',
      entity: 'image',
      id: 'I1',
      name: 'images/lateral.jpg',
      otherId: 'I2',
    });
  });

  it('referências quebradas', () => {
    const p = sampleProject();
    const broken: Project = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'M4'
          ? { ...m, containerId: 'I9' }
          : m.id === 'M3'
            ? { ...m, parentId: 'M9' }
            : m,
      ),
      annotations: p.annotations.map((a) =>
        a.id === 'A1'
          ? { ...a, markingId: 'M9' }
          : a.id === 'A2'
            ? { ...a, layerId: 'L9' }
            : a,
      ),
    };
    expect(codes(broken)).toEqual(
      expect.arrayContaining([
        'missing-image:M4',
        'missing-parent:M3',
        'missing-marking:A1',
        'missing-layer:A2',
      ]),
    );
  });

  it('retângulos: inteiros, tamanho mínimo, dentro da imagem e do pai', () => {
    const p = sampleProject();
    const withRect = (
      id: string,
      rect: Project['markings'][number]['rect'],
    ): Project => ({
      ...p,
      markings: p.markings.map((m) => (m.id === id ? { ...m, rect } : m)),
    });
    expect(codes(withRect('M4', { x: 0.5, y: 0, width: 10, height: 10 }))).toContain(
      'rect-not-integer:M4',
    );
    expect(codes(withRect('M4', { x: 0, y: 0, width: 7, height: 10 }))).toContain(
      'rect-too-small:M4',
    );
    expect(codes(withRect('M4', { x: 950, y: 0, width: 100, height: 10 }))).toContain(
      'rect-out-of-image:M4',
    );
    expect(codes(withRect('M3', { x: 0, y: 0, width: 10, height: 10 }))).toContain(
      'rect-outside-parent:M3',
    );
  });

  it('pai em outra imagem e ciclos', () => {
    const p = sampleProject();
    const otherImage: Project = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M4' ? { ...m, parentId: 'M1' } : m)),
    };
    expect(codes(otherImage)).toContain('parent-other-image:M4');
    const cycle: Project = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'M1' ? { ...m, parentId: 'M3' } : m)),
    };
    expect(codes(cycle)).toEqual(
      expect.arrayContaining([
        'hierarchy-cycle:M1',
        'hierarchy-cycle:M2',
        'hierarchy-cycle:M3',
      ]),
    );
  });

  it('chaves vazias ou duplicadas', () => {
    const p = sampleProject();
    const bad: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'A1'
          ? {
              ...a,
              entries: [
                { id: 'X1', key: 'x', value: '' },
                { id: 'X2', key: 'x', value: '' },
                { id: 'X3', key: ' ', value: '' },
              ],
            }
          : a,
      ),
    };
    expect(codes(bad)).toEqual(['duplicate-key:A1', 'empty-key:A1']);
  });
});

describe('validador de invariantes: container', () => {
  const bgContainer = () =>
    addBackgroundContainer(sampleProject(), {
      id: 'B1',
      width: 390,
      height: 844,
      background: '#FFFFFF',
    });

  it('container com cor é válida e não conta como arquivo repetido', () => {
    const p = bgContainer();
    const two = addBackgroundContainer(p, {
      id: 'B2',
      width: 100,
      height: 100,
      background: '#000000',
    });
    expect(validateProject(p)).toEqual([]);
    expect(validateProject(two)).toEqual([]);
  });

  it('container-content: sem arquivo e sem cor, ou com arquivo e com cor', () => {
    const p = bgContainer();
    const patch = (id: string, change: object): Project => ({
      ...p,
      containers: p.containers.map((i) => (i.id === id ? { ...i, ...change } : i)),
    });
    expect(validateProject(patch('B1', { background: null }))).toEqual([
      { code: 'container-content', entity: 'image', id: 'B1' },
    ]);
    expect(codes(patch('B1', { file: 'images/x.png' }))).toEqual([
      'container-content:B1',
    ]);
    expect(codes(patch('I2', { background: '#000000' }))).toEqual([
      'container-content:I2',
    ]);
  });
});

// Pertencimento por geometria (v13): marcação do canvas (`containerId` nulo), flutuante e pai de
// container. A regra "o menor que contém" não é invariante: só o que o pai garante.
describe('validador de invariantes: canvas e pertencimento', () => {
  const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });
  /** sampleProject + K (canvas, cerca só a I1: (0,0)–(1000,750)) + J (canvas, dentro de K). */
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

  it('o projeto com marcações do canvas, aninhadas e com container dentro, é válido', () => {
    const p = withCanvas();
    expect(p.containers.find((c) => c.id === 'I1')?.parentId).toBe('K');
    expect(p.markings.find((m) => m.id === 'J')?.parentId).toBe('K');
    expect(validateProject(p)).toEqual([]);
  });

  it('marcação do canvas não é órfã nem está "fora da imagem": x e y negativos valem', () => {
    const p = patchMarking(withCanvas(), 'J', { rect: rect(-9000, -9000, 200, 100) });
    // Sai de K (que não a contém mais): só `rect-outside-parent`, nada de imagem.
    expect(codes(p)).toEqual(['rect-outside-parent:J']);
    const free = patchMarking(patchMarking(p, 'J', { parentId: null }), 'K', {
      parentId: null,
    });
    expect(validateProject(free)).toEqual([]);
  });

  it('o canvas não dispensa forma: inteiros e lado mínimo', () => {
    const p = withCanvas();
    expect(codes(patchMarking(p, 'K', { rect: rect(0.5, 0, 1200, 1000) }))).toContain(
      'rect-not-integer:K',
    );
    expect(codes(patchMarking(p, 'K', { rect: rect(0, 0, 7, 1000) }))).toContain(
      'rect-too-small:K',
    );
  });

  it('marcação de container continua dentro da imagem: x negativo é rect-out-of-image', () => {
    const p = patchMarking(sampleProject(), 'M4', { rect: rect(-5, 0, 100, 100) });
    expect(codes(p)).toEqual(['rect-out-of-image:M4']);
  });

  it('pai no mesmo espaço: canvas com container (e o inverso) é parent-other-image', () => {
    const p = withCanvas();
    expect(codes(patchMarking(p, 'M1', { parentId: 'K' }))).toContain(
      'parent-other-image:M1',
    );
    expect(codes(patchMarking(p, 'J', { parentId: 'M1' }))).toContain(
      'parent-other-image:J',
    );
  });

  it('o pai do canvas precisa conter a filha', () => {
    const p = withCanvas();
    const out = patchMarking(p, 'J', { rect: rect(900, 600, 400, 400) });
    expect(codes(out)).toContain('rect-outside-parent:J');
  });

  it('o pai válido que não é o menor que contém NÃO é erro (a leitura não assenta)', () => {
    let p = sampleProject();
    p = patchMarking(p, 'M3', { parentId: 'M1' }); // M2 é menor e também a contém
    expect(validateProject(p)).toEqual([]);
    expect(validateProject(patchContainer(withCanvas(), 'I1', 'K'))).toEqual([]);
    // J cerca a I1? Não (200×100): o container fica em K, que o contém.
    expect(validateProject(patchContainer(withCanvas(), 'I2', null))).toEqual([]);
  });

  it('flutuante com container ou pai: floating-in-container', () => {
    const p = withCanvas();
    const inContainer = patchMarking(p, 'M4', { floating: true });
    expect(codes(inContainer)).toEqual(['floating-in-container:M4']);
    const withParent = patchMarking(p, 'J', { floating: true });
    expect(codes(withParent)).toEqual(['floating-in-container:J']);
    const ok = patchMarking(patchMarking(p, 'J', { floating: true }), 'J', {
      parentId: null,
    });
    expect(validateProject(ok)).toEqual([]);
  });

  it('marcação com pai flutuante: parent-floating (e não parent-other-image nem rect-outside-parent)', () => {
    const p = withCanvas();
    const q = patchMarking(patchMarking(p, 'K', { floating: true }), 'J', {
      parentId: 'K',
    });
    // K flutuante e sem pai; J aponta para ela.
    expect(codes(patchMarking(q, 'K', { parentId: null }))).toEqual([
      'parent-floating:J',
      'container-parent-not-canvas:I1',
    ]);
  });

  it('pai de container ausente: container-parent-missing', () => {
    expect(validateProject(patchContainer(sampleProject(), 'I1', 'ZZ'))).toEqual([
      {
        code: 'container-parent-missing',
        entity: 'image',
        id: 'I1',
        name: 'images/lateral.jpg',
        otherId: 'ZZ',
      },
    ]);
  });

  it('pai de container que não é do canvas: container-parent-not-canvas', () => {
    const p = withCanvas();
    // Marcação de container.
    expect(codes(patchContainer(p, 'I1', 'M1'))).toEqual([
      'container-parent-not-canvas:I1',
    ]);
    // Marcação flutuante.
    const floating = patchMarking(patchMarking(p, 'J', { parentId: null }), 'J', {
      floating: true,
    });
    expect(codes(patchContainer(floating, 'I1', 'J'))).toEqual([
      'container-parent-not-canvas:I1',
    ]);
  });

  it('container fora da marcação do canvas: container-outside-parent', () => {
    const p = withCanvas();
    // K cerca só a I1; a I2 (1050,0)–(2050,1000) não cabe em K.
    expect(codes(patchContainer(p, 'I2', 'K'))).toEqual(['container-outside-parent:I2']);
    // J (200×100) não cerca a I1.
    expect(codes(patchContainer(p, 'I1', 'J'))).toEqual(['container-outside-parent:I1']);
  });

  it('a borda coincidente conta como dentro (com a folga do ponto flutuante)', () => {
    const p = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: rect(0, -50, 1000, 800),
    });
    // Bordas esquerda e direita coincidem com as da I1 (0–1000).
    expect(p.containers.find((c) => c.id === 'I1')?.parentId).toBe('K');
    expect(validateProject(p)).toEqual([]);
  });
});
