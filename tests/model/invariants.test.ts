import { describe, expect, it } from 'vitest';
import {
  addAnnotation,
  addBackgroundContainer,
  createMarking,
  validateProject,
  type Arrow,
  type Marking,
  type Project,
} from '../../src/model';
import { sampleProject } from './fixtures';

function codes(p: Project) {
  return validateProject(p).map((i) => `${i.code}:${i.id}`);
}

describe('invariant validator', () => {
  it('the sample project is valid', () => {
    expect(validateProject(sampleProject())).toEqual([]);
  });

  it('repeated ids and files', () => {
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

  it('each problem states the entity, the id and the name when there is one', () => {
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
          // pt-BR kept: name comes from sampleProject in fixtures.ts (outside this batch)
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

  it('overlapping images', () => {
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

  it('broken references', () => {
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

  it('rectangles: integers, minimum size, inside the image and the parent', () => {
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
    // The reading minimum is 1 px (decision 24): 7 px is accepted, below 1 px is not.
    expect(codes(withRect('M4', { x: 0, y: 0, width: 7, height: 10 }))).not.toContain(
      'rect-too-small:M4',
    );
    expect(codes(withRect('M4', { x: 0, y: 0, width: 1, height: 1 }))).not.toContain(
      'rect-too-small:M4',
    );
    expect(codes(withRect('M4', { x: 0, y: 0, width: 0, height: 10 }))).toContain(
      'rect-too-small:M4',
    );
    expect(codes(withRect('M4', { x: 950, y: 0, width: 100, height: 10 }))).toContain(
      'rect-out-of-image:M4',
    );
    expect(codes(withRect('M3', { x: 0, y: 0, width: 10, height: 10 }))).toContain(
      'rect-outside-parent:M3',
    );
  });

  it('parent in another image and cycles', () => {
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

  it('empty or duplicate keys', () => {
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

describe('invariant validator: container', () => {
  const bgContainer = () =>
    addBackgroundContainer(sampleProject(), {
      id: 'B1',
      width: 390,
      height: 844,
      background: '#FFFFFF',
    });

  it('a container with a color is valid and does not count as a repeated file', () => {
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

  it('container-content: without file and without color, or with file and with color', () => {
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

// Membership by geometry (v13): canvas marking (null `containerId`), floating and container
// parent. The "smallest that contains" rule is not an invariant: only what the parent guarantees.
describe('invariant validator: canvas and membership', () => {
  const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });
  /** sampleProject + K (canvas, surrounds only I1: (0,0)–(1000,750)) + J (canvas, inside K). */
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

  it('the project with canvas markings, nested and with a container inside, is valid', () => {
    const p = withCanvas();
    expect(p.containers.find((c) => c.id === 'I1')?.parentId).toBe('K');
    expect(p.markings.find((m) => m.id === 'J')?.parentId).toBe('K');
    expect(validateProject(p)).toEqual([]);
  });

  it('a canvas marking is neither orphaned nor "outside the image": negative x and y are valid', () => {
    const p = patchMarking(withCanvas(), 'J', { rect: rect(-9000, -9000, 200, 100) });
    // Leaves K (which no longer contains it): only `rect-outside-parent`, nothing about an image.
    expect(codes(p)).toEqual(['rect-outside-parent:J']);
    const free = patchMarking(patchMarking(p, 'J', { parentId: null }), 'K', {
      parentId: null,
    });
    expect(validateProject(free)).toEqual([]);
  });

  it('the canvas does not waive shape: integers and minimum side', () => {
    const p = withCanvas();
    expect(codes(patchMarking(p, 'K', { rect: rect(0.5, 0, 1200, 1000) }))).toContain(
      'rect-not-integer:K',
    );
    expect(codes(patchMarking(p, 'K', { rect: rect(0, 0, 0, 1000) }))).toContain(
      'rect-too-small:K',
    );
  });

  it('a container marking stays inside the image: negative x is rect-out-of-image', () => {
    const p = patchMarking(sampleProject(), 'M4', { rect: rect(-5, 0, 100, 100) });
    expect(codes(p)).toEqual(['rect-out-of-image:M4']);
  });

  it('parent in the same space: canvas with container (and the inverse) is parent-other-image', () => {
    const p = withCanvas();
    expect(codes(patchMarking(p, 'M1', { parentId: 'K' }))).toContain(
      'parent-other-image:M1',
    );
    expect(codes(patchMarking(p, 'J', { parentId: 'M1' }))).toContain(
      'parent-other-image:J',
    );
  });

  it('the canvas parent must contain the child', () => {
    const p = withCanvas();
    const out = patchMarking(p, 'J', { rect: rect(900, 600, 400, 400) });
    expect(codes(out)).toContain('rect-outside-parent:J');
  });

  it('a valid parent that is not the smallest that contains it is NOT an error (reading does not settle)', () => {
    let p = sampleProject();
    p = patchMarking(p, 'M3', { parentId: 'M1' }); // M2 is smaller and also contains it
    expect(validateProject(p)).toEqual([]);
    expect(validateProject(patchContainer(withCanvas(), 'I1', 'K'))).toEqual([]);
    // Does J surround I1? No (200×100): the container stays in K, which contains it.
    expect(validateProject(patchContainer(withCanvas(), 'I2', null))).toEqual([]);
  });

  it('floating with container or parent: floating-in-container', () => {
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

  it('marking with a floating parent: parent-floating (and not parent-other-image nor rect-outside-parent)', () => {
    const p = withCanvas();
    const q = patchMarking(patchMarking(p, 'K', { floating: true }), 'J', {
      parentId: 'K',
    });
    // K floating and without a parent; J points to it.
    expect(codes(patchMarking(q, 'K', { parentId: null }))).toEqual([
      'parent-floating:J',
      'container-parent-not-canvas:I1',
    ]);
  });

  it('missing container parent: container-parent-missing', () => {
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

  it('container parent that is not on the canvas: container-parent-not-canvas', () => {
    const p = withCanvas();
    // Container marking.
    expect(codes(patchContainer(p, 'I1', 'M1'))).toEqual([
      'container-parent-not-canvas:I1',
    ]);
    // Floating marking.
    const floating = patchMarking(patchMarking(p, 'J', { parentId: null }), 'J', {
      floating: true,
    });
    expect(codes(patchContainer(floating, 'I1', 'J'))).toEqual([
      'container-parent-not-canvas:I1',
    ]);
  });

  it('container outside the canvas marking: container-outside-parent', () => {
    const p = withCanvas();
    // K surrounds only I1; I2 (1050,0)–(2050,1000) does not fit in K.
    expect(codes(patchContainer(p, 'I2', 'K'))).toEqual(['container-outside-parent:I2']);
    // J (200×100) does not surround I1.
    expect(codes(patchContainer(p, 'I1', 'J'))).toEqual(['container-outside-parent:I1']);
  });

  it('a coinciding edge counts as inside (with floating-point slack)', () => {
    const p = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: rect(0, -50, 1000, 800),
    });
    // Left and right edges coincide with those of I1 (0–1000).
    expect(p.containers.find((c) => c.id === 'I1')?.parentId).toBe('K');
    expect(validateProject(p)).toEqual([]);
  });
});

// Arrows (ME4): links two existing, different markings; nothing else is an invariant.
describe('arrow invariants', () => {
  const arrowOf = (id: string, from: string, to: string): Arrow => ({
    id,
    from,
    to,
    fromSide: null,
    toSide: null,
    points: [],
    style: 'curve',
    name: 'Arrow',
    locked: false,
  });
  const withArrows = (...arrows: Arrow[]): Project => ({ ...sampleProject(), arrows });

  it('an arrow between two existing markings, of any container, is valid', () => {
    expect(validateProject(withArrows(arrowOf('R1', 'M1', 'M4')))).toEqual([]);
    // Two equal arrows too.
    expect(
      validateProject(withArrows(arrowOf('R1', 'M1', 'M2'), arrowOf('R2', 'M1', 'M2'))),
    ).toEqual([]);
  });

  it('nonexistent end: arrow-endpoint-missing, with the id of the end and the name of the arrow', () => {
    expect(validateProject(withArrows(arrowOf('R1', 'M9', 'M1')))).toEqual([
      {
        code: 'arrow-endpoint-missing',
        entity: 'arrow',
        id: 'R1',
        name: 'Arrow',
        otherId: 'M9',
      },
    ]);
    expect(codes(withArrows(arrowOf('R1', 'M1', 'M9')))).toEqual([
      'arrow-endpoint-missing:R1',
    ]);
    // Both ends missing: one problem per end.
    expect(codes(withArrows(arrowOf('R1', 'M8', 'M9')))).toEqual([
      'arrow-endpoint-missing:R1',
      'arrow-endpoint-missing:R1',
    ]);
  });

  it('an end that is another arrow or a container is not a marking', () => {
    expect(
      codes(withArrows(arrowOf('R1', 'M1', 'M2'), arrowOf('R2', 'R1', 'M1'))),
    ).toEqual(['arrow-endpoint-missing:R2']);
    expect(codes(withArrows(arrowOf('R1', 'M1', 'I1')))).toEqual([
      'arrow-endpoint-missing:R1',
    ]);
  });

  it('arrow linked to itself: arrow-self', () => {
    expect(validateProject(withArrows(arrowOf('R1', 'M1', 'M1')))).toEqual([
      { code: 'arrow-self', entity: 'arrow', id: 'R1', name: 'Arrow', otherId: 'M1' },
    ]);
  });

  it('id repeated between arrow and marking, or between two arrows: duplicate-id on the arrow', () => {
    expect(codes(withArrows(arrowOf('M2', 'M1', 'M4')))).toEqual(['duplicate-id:M2']);
    expect(validateProject(withArrows(arrowOf('M2', 'M1', 'M4')))[0]?.entity).toBe(
      'arrow',
    );
    expect(
      codes(withArrows(arrowOf('R1', 'M1', 'M2'), arrowOf('R1', 'M2', 'M1'))),
    ).toEqual(['duplicate-id:R1']);
  });

  it('the annotation of an arrow is valid; that of an id that is neither marking nor arrow is not', () => {
    const p = addAnnotation(withArrows(arrowOf('R1', 'M1', 'M4')), {
      id: 'AR',
      markingId: 'R1',
      layerId: 'L1',
    });
    expect(validateProject(p)).toEqual([]);
    expect(
      codes({
        ...p,
        annotations: p.annotations.map((a) =>
          a.id === 'AR' ? { ...a, markingId: 'R9' } : a,
        ),
      }),
    ).toEqual(['missing-marking:AR']);
    // The annotation of an arrow that leaves is left without an owner: missing-marking.
    expect(codes({ ...p, arrows: [] })).toEqual(['missing-marking:AR']);
  });
});

describe('images-overlap', () => {
  it('finds the same pairs as the all-against-all comparison, in the same order', () => {
    const base = sampleProject();
    const template = base.containers[0];
    if (!template) throw new Error('fixture');
    // Deterministic generator; varied positions and scales, with touching, contained and crossing ones.
    let seed = 7;
    const next = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    const containers = Array.from({ length: 80 }, (_, i) => ({
      ...template,
      id: `X${i}`,
      file: `images/x${i}.png`,
      width: 100 + next(300),
      height: 100 + next(300),
      placement: {
        x: next(25) * 100 - 500,
        y: next(25) * 100 - 500,
        scale: 0.5 + next(3),
      },
    }));
    const expected: string[] = [];
    containers.forEach((a, i) => {
      for (const b of containers.slice(i + 1)) {
        const ax = a.placement.x;
        const ay = a.placement.y;
        const aw = a.width * a.placement.scale;
        const ah = a.height * a.placement.scale;
        const bx = b.placement.x;
        const by = b.placement.y;
        const bw = b.width * b.placement.scale;
        const bh = b.height * b.placement.scale;
        if (ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah) {
          expected.push(`${a.id}:${b.id}`);
        }
      }
    });
    expect(expected.length).toBeGreaterThan(10);
    const found = validateProject({
      ...base,
      containers,
      markings: [],
      annotations: [],
      arrows: [],
    })
      .filter((i) => i.code === 'images-overlap')
      .map((i) => `${i.id}:${i.otherId}`);
    expect(found).toEqual(expected);
  });
});
