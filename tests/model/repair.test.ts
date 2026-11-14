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
  type Arrow,
  type Marking,
  type Project,
} from '../../src/model';
import { idGen } from './specFixtures';
import { image, marking, sampleProject } from './fixtures';

function repair(p: Project) {
  return repairProject(p, validateProject(p), idGen('NEW'));
}

describe('repairProject', () => {
  it('valid project: nothing to do', () => {
    const p = sampleProject();
    expect(repair(p)).toEqual({ project: p, repaired: [], unrepaired: [] });
  });

  it('a pair with an id already used in another annotation gets a new id; the first one stays', () => {
    const p = sampleProject();
    const broken: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'A2'
          ? { ...a, entries: [{ id: 'E1', key: 'type', value: 'crack' }] }
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

  it('a repeated pair only with a removed annotation: the id did not change, so there is no new-id', () => {
    const p = sampleProject();
    // A1 goes away because of a nonexistent marking; the E1 of A2 only collided with its own.
    const broken: Project = {
      ...p,
      annotations: p.annotations.map((a) =>
        a.id === 'A1'
          ? { ...a, markingId: 'DOES-NOT-EXIST' }
          : a.id === 'A2'
            ? { ...a, entries: [{ id: 'E1', key: 'type', value: 'crack' }] }
            : a,
      ),
    };
    const result = repair(broken);
    expect(result.repaired.some((r) => r.action === 'new-id')).toBe(false);
    expect(result.project.annotations.find((a) => a.id === 'A2')?.entries[0]?.id).toBe(
      'E1',
    );
  });

  it('a rect outside the image is clipped to the limits', () => {
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

  it('a marking that is left without area is removed, with its annotations', () => {
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

  it('a marking of a nonexistent image is removed; its children become roots', () => {
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
        // pt-BR kept: shared fixture data (sampleProject names) asserted by other tests
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

  it('an annotation of a nonexistent marking or layer is removed, with the ones it owns', () => {
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
        // pt-BR kept: shared fixture data (sampleProject names) asserted by other tests
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

  it('nonexistent parent: the marking becomes a root', () => {
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

  it('cycle in the hierarchy: only the markings of the cycle become roots', () => {
    const p = sampleProject();
    // M1 › M2 › M1; M3 (child of M2) enters the cycle, but is not part of it.
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

  it('overlapping images: the one with the highest index goes to the right of the previous ones', () => {
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

  it('a problem without a mechanical repair stays in unrepaired', () => {
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

// Containment by geometry (v13): the repair only makes the project valid; it never settles.
describe('repairProject: canvas and containment', () => {
  const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });
  /** sampleProject + K (canvas, surrounds only I1) + J (canvas, inside K). */
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

  it('missing container parent: the container is left without a parent', () => {
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

  it('container parent that is not of the canvas (of a container or floating): no parent', () => {
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
    // The floating one itself is not touched.
    expect(marking(ofFloating.project, 'J')).toEqual(marking(floating, 'J'));
  });

  it('container outside the canvas marking: no parent', () => {
    const result = repair(patchContainer(withCanvas(), 'I2', 'K'));
    expect(result.unrepaired).toEqual([]);
    expect(image(result.project, 'I2').parentId).toBeNull();
    expect(result.repaired.map((r) => `${r.code}:${r.id}`)).toEqual([
      'container-outside-parent:I2',
    ]);
    // The other parents stay.
    expect(image(result.project, 'I1').parentId).toBe('K');
  });

  it('a floating one inside a container: goes to the canvas, the rect converted; the children lose their parent', () => {
    const broken = patchMarking(sampleProject(), 'M1', { floating: true });
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(marking(result.project, 'M1')).toMatchObject({
      containerId: null,
      parentId: null,
      floating: true,
      // 1000 px of I1 (scale 0.25, at 0,0): 250 canvas units.
      rect: rect(250, 250, 250, 250),
    });
    // M2 pointed to the floating M1: no parent. M3 stays in M2.
    expect(marking(result.project, 'M2').parentId).toBeNull();
    expect(marking(result.project, 'M3').parentId).toBe('M2');
    expect(result.repaired).toContainEqual({
      action: 'made-root',
      code: 'floating-in-container',
      entity: 'marking',
      id: 'M1',
      // pt-BR kept: shared fixture data (sampleProject names) asserted by other tests
      name: 'Porta',
    });
    expect(result.repaired).toContainEqual({
      action: 'made-root',
      code: 'parent-floating',
      entity: 'marking',
      id: 'M2',
      // pt-BR kept: shared fixture data (sampleProject names) asserted by other tests
      name: 'Maçaneta',
    });
  });

  it('floating canvas marking that has a parent: the parent goes away and the rect stays', () => {
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

  it('marking with a floating parent: becomes a root', () => {
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
    // K is floating: it cannot be the parent of container I1.
    expect(image(result.project, 'I1').parentId).toBeNull();
    expect(result.repaired.map((r) => `${r.code}:${r.id}`).sort()).toEqual([
      'container-parent-not-canvas:I1',
      'parent-floating:J',
    ]);
  });

  it('a canvas marking is never an orphan nor clipped; only a container one', () => {
    // M2 points to a nonexistent container (removed); K, of the canvas, with negative coordinates, stays.
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

  it('only makes the project valid: it does not settle (a valid parent that is not the smallest stays)', () => {
    // M3 points to M1 (valid, but M2 is the smallest that contains it); M2 has a missing parent.
    let broken = patchMarking(sampleProject(), 'M3', { parentId: 'M1' });
    broken = patchMarking(broken, 'M2', { parentId: 'M9' });
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(marking(result.project, 'M2').parentId).toBeNull();
    expect(marking(result.project, 'M3').parentId).toBe('M1');
    expect(validateProject(result.project)).toEqual([]);
  });

  it('the repaired project is written and re-read without going through the repair again', () => {
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

// Arrows (ME4): an arrow without an endpoint or linked to itself has nothing to link; it is removed, and its
// annotations go in the next round, like those of any owner that stopped existing.
describe('repairProject: arrows', () => {
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
  const base = (...arrows: Arrow[]): Project => {
    let p: Project = { ...sampleProject(), arrows };
    for (const a of arrows) {
      p = {
        ...p,
        annotations: [
          ...p.annotations,
          {
            id: `N${a.id}`,
            markingId: a.id,
            layerId: 'L1',
            name: null,
            parentAnnotationId: null,
            parentRole: null,
            type: null,
            values: null,
            entries: [],
          },
        ],
      };
    }
    return p;
  };

  it('nonexistent endpoint: the arrow and its annotations are removed; the others stay', () => {
    const broken = base(arrowOf('R1', 'M1', 'M9'), arrowOf('R2', 'M1', 'M4'));
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(result.project.arrows.map((a) => a.id)).toEqual(['R2']);
    expect(result.project.annotations.map((a) => a.id)).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'NR2',
    ]);
    expect(result.repaired).toEqual([
      {
        action: 'removed',
        code: 'arrow-endpoint-missing',
        entity: 'arrow',
        id: 'R1',
        name: 'Arrow',
      },
      { action: 'removed', code: 'missing-marking', entity: 'annotation', id: 'NR1' },
    ]);
    expect(validateProject(result.project)).toEqual([]);
  });

  it('an arrow linked to itself and an arrow whose endpoint is another arrow are removed', () => {
    const broken = base(
      arrowOf('R1', 'M1', 'M1'),
      arrowOf('R2', 'M1', 'M4'),
      arrowOf('R3', 'R2', 'M1'),
    );
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(result.project.arrows.map((a) => a.id)).toEqual(['R2']);
    expect(result.repaired.filter((r) => r.entity === 'arrow')).toEqual([
      {
        action: 'removed',
        code: 'arrow-self',
        entity: 'arrow',
        id: 'R1',
        name: 'Arrow',
      },
      {
        action: 'removed',
        code: 'arrow-endpoint-missing',
        entity: 'arrow',
        id: 'R3',
        name: 'Arrow',
      },
    ]);
  });

  it('a marking removed by the repair takes the arrow attached to it, in a following round', () => {
    // M4 points to a nonexistent container: removed; the M1 → M4 arrow is left without an endpoint.
    const broken: Project = {
      ...base(arrowOf('R1', 'M1', 'M4')),
      markings: sampleProject().markings.map((m) =>
        m.id === 'M4' ? { ...m, containerId: 'I9' } : m,
      ),
    };
    const result = repair(broken);
    expect(result.unrepaired).toEqual([]);
    expect(result.project.arrows).toEqual([]);
    expect(result.project.annotations.map((a) => a.id)).toEqual(['A1', 'A2', 'A3']);
    expect(validateProject(result.project)).toEqual([]);
  });

  it('a repeated arrow id has no mechanical repair: it stays in unrepaired', () => {
    const broken = base(arrowOf('M2', 'M1', 'M4'));
    const result = repair(broken);
    expect(result.unrepaired.map((i) => `${i.code}:${i.entity}:${i.id}`)).toEqual([
      'duplicate-id:arrow:M2',
    ]);
    expect(result.repaired).toEqual([]);
  });

  it('a valid arrow passes intact and the repaired one is written and re-read', () => {
    const p = base(arrowOf('R1', 'M1', 'M4'));
    expect(repair(p)).toEqual({ project: p, repaired: [], unrepaired: [] });
    const fixed = repair(base(arrowOf('R1', 'M1', 'M9'), arrowOf('R2', 'M1', 'M4')));
    expect(deserialize(serialize(fixed.project)).ok).toBe(true);
  });

  describe('anchor (v20)', () => {
    const withAnchors = (anchors: Record<string, string>): Project => {
      const p = sampleProject();
      return {
        ...p,
        markings: p.markings.map((m) =>
          anchors[m.id] === undefined ? m : { ...m, anchor: { to: anchors[m.id]! } },
        ),
      };
    };
    const released = (r: ReturnType<typeof repair>) =>
      r.repaired.filter((x) => x.action === 'released');

    it.each([
      ['anchor-missing', { M2: 'DOES-NOT-EXIST' }, ['M2']],
      ['anchor-self', { M2: 'M2' }, ['M2']],
      ['anchor-other-space', { M2: 'M4' }, ['M2']],
      ['anchor-cycle', { M2: 'M3', M3: 'M2' }, ['M2', 'M3']],
    ] as const)(
      '%s: the anchor becomes null and the project opens',
      (code, anchors, ids) => {
        const result = repair(withAnchors(anchors));
        expect(result.unrepaired).toEqual([]);
        expect(released(result).map((r) => [r.code, r.id])).toEqual(
          ids.map((id) => [code, id]),
        );
        for (const id of ids) expect(marking(result.project, id).anchor).toBeNull();
        expect(validateProject(result.project)).toEqual([]);
      },
    );

    it('a valid anchor passes intact; only the broken one is released', () => {
      const p = withAnchors({ M2: 'M3', M3: 'DOES-NOT-EXIST' });
      const result = repair(p);
      expect(marking(result.project, 'M2').anchor).toEqual({ to: 'M3' });
      expect(marking(result.project, 'M3').anchor).toBeNull();
      expect(released(result).map((r) => r.id)).toEqual(['M3']);
    });

    it('the one anchored to a marking removed by the repair is released in the next round', () => {
      const p = withAnchors({ M4: 'M2' });
      const broken: Project = {
        ...p,
        markings: p.markings.map((m) =>
          m.id === 'M2' ? { ...m, containerId: 'I9' } : m,
        ),
      };
      const result = repair(broken);
      expect(result.unrepaired).toEqual([]);
      expect(marking(result.project, 'M4').anchor).toBeNull();
    });
  });
});
