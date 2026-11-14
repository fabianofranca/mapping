import { describe, expect, it } from 'vitest';
import {
  ModelError,
  adjustMarkingRect,
  canDeleteImage,
  canDeleteMarking,
  canEditArrow,
  canEditMarkingGeometry,
  canEditImagePlacement,
  canReplaceImage,
  createArrow,
  createMarking,
  containerDeletionImpact,
  containerLockStates,
  isMarkingGeometryLocked,
  markingDeletionImpact,
  markingLockStates,
  moveContainer,
  moveMarking,
  removeContainer,
  removeMarking,
  renameMarking,
  replaceContainer,
  resizeContainer,
  setArrowLocked,
  setImageLocked,
  setImageMarkingsLocked,
  setMarkingLocked,
  setBackgroundContainer,
  addBackgroundContainer,
  setMarkingRect,
  type Project,
} from '../../src/model';
import { expectValid, marking, sampleProject } from './fixtures';

/** Runs the operation and returns the rule error code (or `null` if it passed). */
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
  const found = p.containers.find((i) => i.id === id);
  if (!found) throw new Error(id);
  return found;
};

describe('lock: locking and unlocking', () => {
  it('new items are born unlocked', () => {
    const p = sampleProject();
    expect(p.markings.every((m) => !m.locked)).toBe(true);
    expect(p.containers.every((i) => !i.locked)).toBe(true);
  });

  it('locks and unlocks a marking without touching the rest', () => {
    const p = sampleProject();
    const locked = setMarkingLocked(p, 'M2', true);
    expect(marking(locked, 'M2').locked).toBe(true);
    expect(marking(locked, 'M1').locked).toBe(false);
    expect(marking(locked, 'M3').locked).toBe(false);
    expect(setMarkingLocked(locked, 'M2', false)).toEqual(p);
    expectValid(locked);
  });

  it('locks and unlocks an image', () => {
    const p = sampleProject();
    const locked = setImageLocked(p, 'I1', true);
    expect(image(locked, 'I1').locked).toBe(true);
    expect(image(locked, 'I2').locked).toBe(false);
    expect(setImageLocked(locked, 'I1', false)).toEqual(p);
  });

  it('repeating the same state returns the same project (no history entry)', () => {
    const p = sampleProject();
    expect(setMarkingLocked(p, 'M1', false)).toBe(p);
    expect(setImageLocked(p, 'I1', false)).toBe(p);
    const locked = setMarkingLocked(p, 'M1', true);
    expect(setMarkingLocked(locked, 'M1', true)).toBe(locked);
    const lockedImage = setImageLocked(p, 'I1', true);
    expect(setImageLocked(lockedImage, 'I1', true)).toBe(lockedImage);
  });

  it('fails with a missing id', () => {
    const p = sampleProject();
    expect(codeOf(() => setMarkingLocked(p, 'X', true))).toBe('not-found');
    expect(codeOf(() => setImageLocked(p, 'X', true))).toBe('not-found');
    expect(codeOf(() => setImageMarkingsLocked(p, 'X', true))).toBe('not-found');
  });

  it('locking all the markings of an image does not affect those of another nor the image', () => {
    const p = setImageMarkingsLocked(sampleProject(), 'I1', true);
    expect(['M1', 'M2', 'M3'].every((id) => marking(p, id).locked)).toBe(true);
    expect(marking(p, 'M4').locked).toBe(false);
    expect(image(p, 'I1').locked).toBe(false);
    const back = setImageMarkingsLocked(p, 'I1', false);
    expect(back).toEqual(sampleProject());
  });

  it('locking all when they are already locked returns the same project', () => {
    const p = setImageMarkingsLocked(sampleProject(), 'I1', true);
    expect(setImageMarkingsLocked(p, 'I1', true)).toBe(p);
    const empty = sampleProject();
    expect(setImageMarkingsLocked(empty, 'I1', false)).toBe(empty);
  });
});

describe('lock: locked marking', () => {
  const locked = () => setMarkingLocked(sampleProject(), 'M2', true);

  it('cannot be moved, resized or deleted', () => {
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

  it('moving and resizing the same unlocked marking works', () => {
    const p = setMarkingLocked(locked(), 'M2', false);
    expect(codeOf(() => moveMarking(p, 'M2', 10, 0))).toBeNull();
    expect(codeOf(() => removeMarking(p, 'M2'))).toBeNull();
  });

  it('stays selectable and editable: renaming is not blocked', () => {
    const p = renameMarking(locked(), 'M2', 'Other name');
    expect(marking(p, 'M2').name).toBe('Other name');
    expect(marking(p, 'M2').locked).toBe(true);
  });

  it('a fine adjustment that changes nothing does not fail', () => {
    const p = locked();
    expect(adjustMarkingRect(p, 'M2', 'x', marking(p, 'M2').rect.x)).toBe(p);
  });

  it('equal geometry is not a change: returns the project as is (finding 14)', () => {
    const p = locked();
    const rect = marking(p, 'M2').rect;
    expect(setMarkingRect(p, 'M2', { ...rect })).toBe(p);
    expect(moveMarking(p, 'M2', 0, 0)).toBe(p);
    // Unlocked, likewise: no new project, no undo entry and no new index.
    const free = sampleProject();
    expect(setMarkingRect(free, 'M2', { ...marking(free, 'M2').rect })).toBe(free);
    expect(moveMarking(free, 'M2', 0, 0)).toBe(free);
  });

  it('any geometry difference is still blocked by the lock', () => {
    const p = locked();
    const rect = marking(p, 'M2').rect;
    for (const changed of [
      { ...rect, x: rect.x + 1 },
      { ...rect, y: rect.y - 1 },
      { ...rect, width: rect.width - 1 },
      { ...rect, height: rect.height + 1 },
    ]) {
      expect(codeOf(() => setMarkingRect(p, 'M2', changed))).toBe('locked');
    }
    expect(codeOf(() => moveMarking(p, 'M2', 0, 1))).toBe('locked');
    expect(codeOf(() => moveMarking(p, 'M2', -1, 0))).toBe('locked');
  });

  it('the query functions reflect the lock', () => {
    const p = locked();
    expect(canEditMarkingGeometry(p, 'M2')).toBe(false);
    expect(canEditMarkingGeometry(p, 'M2')).toBe(false);
    expect(canDeleteMarking(p, 'M2')).toBe(false);
    expect(canEditMarkingGeometry(p, 'M4')).toBe(true);
  });

  it('the deletion impact can still be computed', () => {
    expect(markingDeletionImpact(locked(), 'M2').descendants).toBe(1);
  });
});

describe('lock: a locked parent locks the geometry of the descendants', () => {
  const parentLocked = () => setMarkingLocked(sampleProject(), 'M1', true);

  it('descendants cannot be moved or resized', () => {
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

  it('with the inherited lock, equal geometry also passes and returns the project', () => {
    const p = parentLocked();
    for (const id of ['M1', 'M2', 'M3']) {
      const { rect } = marking(p, id);
      expect(setMarkingRect(p, id, { ...rect })).toBe(p);
      expect(moveMarking(p, id, 0, 0)).toBe(p);
    }
  });

  it('does not change the locked of the descendants', () => {
    const p = parentLocked();
    expect(marking(p, 'M2').locked).toBe(false);
    expect(marking(p, 'M3').locked).toBe(false);
  });

  it('a loose descendant of a locked parent can still be deleted', () => {
    const p = parentLocked();
    expect(canDeleteMarking(p, 'M3')).toBe(true);
    const q = removeMarking(p, 'M3');
    expect(q.markings.map((m) => m.id)).not.toContain('M3');
  });

  it('unlocking the parent frees the geometry of the descendants', () => {
    const p = setMarkingLocked(parentLocked(), 'M1', false);
    expect(isMarkingGeometryLocked(p, 'M3')).toBe(false);
    expect(codeOf(() => moveMarking(p, 'M3', 1, 0))).toBeNull();
  });

  it('markings of another image are not affected', () => {
    expect(isMarkingGeometryLocked(parentLocked(), 'M4')).toBe(false);
  });

  it('creating a marking inside a locked parent is still allowed', () => {
    const p = createMarking(parentLocked(), {
      id: 'M5',
      containerId: 'I1',
      rect: { x: 1700, y: 1700, width: 100, height: 100 },
    });
    expect(marking(p, 'M5').parentId).toBe('M1');
    expect(marking(p, 'M5').locked).toBe(false);
  });
});

describe('lock: a locked descendant does not stop the parent', () => {
  const childLocked = () => setMarkingLocked(sampleProject(), 'M3', true);

  it('the parent and the grandparent can be moved, and the locked descendant goes along', () => {
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

  it('moving the parent keeps the relative position of all descendants, locked or not', () => {
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

  it('the fine x/y adjustment of the parent also carries the locked descendant', () => {
    const p = childLocked();
    const q = adjustMarkingRect(p, 'M1', 'y', 1010);
    expect(marking(q, 'M1').rect.y).toBe(1010);
    expect(marking(q, 'M3').rect.y).toBe(marking(p, 'M3').rect.y + 10);
  });

  it('the locked descendant itself still cannot be moved on its own', () => {
    const p = childLocked();
    expect(codeOf(() => moveMarking(p, 'M3', 1, 0))).toBe('locked');
  });

  it('the parent can be resized, and the locked descendant stays where it is', () => {
    const p = childLocked();
    const { rect } = marking(p, 'M1');
    const q = setMarkingRect(p, 'M1', { ...rect, width: rect.width + 100 });
    expect(marking(q, 'M1').rect.width).toBe(rect.width + 100);
    expect(marking(q, 'M3').rect).toEqual(marking(p, 'M3').rect);
  });

  it('the parent and the grandparent can be deleted, and the locked descendant is deleted along', () => {
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

  it('the deletion impact counts the locked descendants', () => {
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
    // The item itself is not counted, even when locked.
    expect(markingDeletionImpact(p, 'M3').lockedDescendants).toBe(0);
  });

  it('the locked parent still locks the geometry of the locked descendant', () => {
    const p = setMarkingLocked(childLocked(), 'M1', true);
    expect(codeOf(() => moveMarking(p, 'M1', 1, 0))).toBe('locked');
    expect(codeOf(() => moveMarking(p, 'M2', 1, 0))).toBe('locked');
    expect(codeOf(() => removeMarking(p, 'M1'))).toBe('locked');
  });

  it('a marking of another image is not affected', () => {
    expect(codeOf(() => removeMarking(childLocked(), 'M4'))).toBeNull();
  });
});

describe('lock: locked image', () => {
  const locked = () => setImageLocked(sampleProject(), 'I2', true);
  const placement = (p: Project) => image(p, 'I2').placement;

  it('cannot be moved, resized or deleted', () => {
    const p = locked();
    expect(codeOf(() => moveContainer(p, 'I2', 5000, 0))).toBe('locked');
    expect(
      codeOf(() =>
        resizeContainer(p, 'I2', { ...placement(p), scale: placement(p).scale / 2 }),
      ),
    ).toBe('locked');
    expect(codeOf(() => removeContainer(p, 'I2'))).toBe('locked');
  });

  it('unlocked, it works again', () => {
    const p = setImageLocked(locked(), 'I2', false);
    expect(codeOf(() => moveContainer(p, 'I2', 5000, 0))).toBeNull();
    expect(codeOf(() => removeContainer(p, 'I2'))).toBeNull();
  });

  it('the markings of the locked image stay editable', () => {
    expect(codeOf(() => moveMarking(locked(), 'M4', 1, 1))).toBeNull();
  });

  it('the deletion impact can still be computed', () => {
    expect(containerDeletionImpact(locked(), 'I2').markings).toBe(1);
  });

  it('replacing the file with one of another size is blocked; of the same size, it is not', () => {
    const p = locked();
    const same = { file: 'images/new.png', width: 1000, height: 1000 };
    const bigger = { file: 'images/new.png', width: 2000, height: 2000 };
    expect(canReplaceImage(p, 'I2', same)).toBe(true);
    expect(canReplaceImage(p, 'I2', bigger)).toBe(false);
    expect(codeOf(() => replaceContainer(p, 'I2', same))).toBeNull();
    expect(codeOf(() => replaceContainer(p, 'I2', bigger))).toBe('locked');
    // The replace keeps the image lock.
    expect(image(replaceContainer(p, 'I2', same), 'I2').locked).toBe(true);
  });
});

describe('lock: image with a locked marking', () => {
  const p = () => setMarkingLocked(sampleProject(), 'M3', true);

  it('the image can be deleted, and the locked markings go along', () => {
    expect(canDeleteImage(p(), 'I1')).toBe(true);
    const q = expectValid(removeContainer(p(), 'I1'));
    expect(q.containers.map((i) => i.id)).toEqual(['I2']);
    expect(q.markings.map((m) => m.id)).toEqual(['M4']);
  });

  it('the deletion impact counts the locked markings', () => {
    expect(containerDeletionImpact(sampleProject(), 'I1').lockedMarkings).toBe(0);
    const locked = setImageMarkingsLocked(sampleProject(), 'I1', true);
    expect(containerDeletionImpact(locked, 'I1')).toMatchObject({
      markings: 3,
      lockedMarkings: 3,
    });
    expect(containerDeletionImpact(locked, 'I2').lockedMarkings).toBe(0);
  });

  it('the image can be moved, since the markings use image pixels', () => {
    expect(codeOf(() => moveContainer(p(), 'I1', 0, 5000))).toBeNull();
  });

  it('replacing with a file of another size is still blocked (the replacement would rescale the reviewed marking)', () => {
    const bigger = { file: 'images/new.jpg', width: 8000, height: 6000 };
    expect(canReplaceImage(p(), 'I1', bigger)).toBe(false);
    expect(codeOf(() => replaceContainer(p(), 'I1', bigger))).toBe('locked');
    const same = { file: 'images/new.jpg', width: 4000, height: 3000 };
    expect(codeOf(() => replaceContainer(p(), 'I1', same))).toBeNull();
  });

  it('an image with no lock at all is replaced normally', () => {
    const bigger = { file: 'images/new.jpg', width: 8000, height: 6000 };
    expect(codeOf(() => replaceContainer(sampleProject(), 'I1', bigger))).toBeNull();
  });
});

// Canvas marking (v13): its lock goes down to the containers inside it (decision 6).
describe('lock: a canvas marking locks the placement of the containers inside it', () => {
  const rect = (x: number, y: number, width: number, height: number) => ({
    x,
    y,
    width,
    height,
  });
  /** sampleProject: K surrounds both screens; J (inside K) surrounds only I1 (0,0)–(1000,750). */
  function withCanvas(): Project {
    let p = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: rect(-200, -200, 2500, 1400),
    });
    p = createMarking(p, {
      id: 'J',
      containerId: null,
      rect: rect(-100, -100, 1200, 1000),
    });
    return p;
  }
  const lockedK = () => setMarkingLocked(withCanvas(), 'K', true);

  it('a locked canvas marking cannot be moved, resized or deleted', () => {
    const p = lockedK();
    expect(codeOf(() => moveMarking(p, 'K', 10, 0))).toBe('locked');
    expect(codeOf(() => setMarkingRect(p, 'K', rect(-200, -200, 2600, 1400)))).toBe(
      'locked',
    );
    expect(codeOf(() => adjustMarkingRect(p, 'K', 'width', 2600))).toBe('locked');
    expect(codeOf(() => removeMarking(p, 'K'))).toBe('locked');
    // The canvas marking inside it inherits the geometry lock, but can be deleted.
    expect(isMarkingGeometryLocked(p, 'J')).toBe(true);
    expect(codeOf(() => moveMarking(p, 'J', 1, 0))).toBe('locked');
    expect(canDeleteMarking(p, 'J')).toBe(true);
  });

  it('the container inside it cannot be moved or resized; deleting can', () => {
    const p = lockedK();
    expect(image(p, 'I1').parentId).toBe('J');
    expect(canEditImagePlacement(p, 'I1')).toBe(false);
    expect(codeOf(() => moveContainer(p, 'I1', 0, 5000))).toBe('locked');
    expect(codeOf(() => resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.2 }))).toBe(
      'locked',
    );
    // Deleting the image is another matter (like the locked marking that does not stop the parent).
    expect(canDeleteImage(p, 'I1')).toBe(true);
    expect(codeOf(() => removeContainer(p, 'I1'))).toBeNull();
    // I2 is also a member of K, directly.
    expect(image(p, 'I2').parentId).toBe('K');
    expect(canEditImagePlacement(p, 'I2')).toBe(false);
  });

  it('walks up the whole chain: the container parent is one link, the locked ancestor is another', () => {
    // I1 has J as parent and J has K as parent. Locking only K is enough; locking only J too.
    expect(image(withCanvas(), 'I1').parentId).toBe('J');
    expect(canEditImagePlacement(lockedK(), 'I1')).toBe(false);
    const onlyJ = setMarkingLocked(withCanvas(), 'J', true);
    expect(canEditImagePlacement(onlyJ, 'I1')).toBe(false);
    // I2 is only in K, which is not locked: free.
    expect(canEditImagePlacement(onlyJ, 'I2')).toBe(true);
  });

  it('the size of a container without a file is also placement', () => {
    let p = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: rect(-200, 1100, 1500, 1300),
    });
    p = addBackgroundContainer(p, {
      id: 'B1',
      width: 390,
      height: 844,
      background: '#FFFFFF',
      center: { x: 300, y: 1700 },
    });
    expect(image(p, 'B1').parentId).toBe('K');
    p = setMarkingLocked(p, 'K', true);
    expect(codeOf(() => setBackgroundContainer(p, 'B1', { width: 400 }))).toBe('locked');
    // The color is not geometry.
    expect(
      codeOf(() => setBackgroundContainer(p, 'B1', { background: '#000000' })),
    ).toBeNull();
  });

  it('entering a locked marking is allowed; once inside, the container is locked', () => {
    let p = createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: rect(0, 1200, 3000, 1500),
    });
    p = setMarkingLocked(p, 'K', true);
    expect(image(p, 'I2').parentId).toBeNull();
    p = expectValid(moveContainer(p, 'I2', 1050, 1300));
    expect(image(p, 'I2').parentId).toBe('K');
    expect(codeOf(() => moveContainer(p, 'I2', 1050, 0))).toBe('locked');
    // Creating a marking inside the locked one is also allowed.
    const q = createMarking(p, {
      id: 'N',
      containerId: null,
      rect: rect(100, 1300, 100, 100),
    });
    expect(marking(q, 'N').parentId).toBe('K');
  });

  it('the floating one is not a member: the lock of the marking underneath does not reach it', () => {
    let p = createMarking(lockedK(), {
      id: 'N',
      containerId: null,
      rect: rect(100, 100, 200, 100),
      floating: true,
    });
    expect(marking(p, 'N').parentId).toBeNull();
    expect(isMarkingGeometryLocked(p, 'N')).toBe(false);
    p = moveMarking(p, 'N', 5, 5);
    expect(marking(p, 'N').rect.x).toBe(105);
  });

  it('markingLockStates covers the canvas markings; containerLockStates, the containers', () => {
    const p = lockedK();
    expect(markingLockStates(p)).toEqual(
      new Map([
        ['K', 'self'],
        ['J', 'inherited'],
      ]),
    );
    expect(containerLockStates(p)).toEqual(
      new Map([
        ['I1', 'inherited'],
        ['I2', 'inherited'],
      ]),
    );
    // The image's own lock outweighs the inherited one.
    expect(containerLockStates(setImageLocked(p, 'I1', true)).get('I1')).toBe('self');
    // With no lock at all, the map is empty.
    expect(containerLockStates(withCanvas()).size).toBe(0);
    expect(containerLockStates(sampleProject()).size).toBe(0);
  });

  it('unlocking the marking frees the containers', () => {
    const p = setMarkingLocked(lockedK(), 'K', false);
    expect(canEditImagePlacement(p, 'I1')).toBe(true);
    expect(codeOf(() => moveContainer(p, 'I1', 0, 5000))).toBeNull();
  });
});

describe('lock: arrow', () => {
  const withArrow = () =>
    createArrow(sampleProject(), { id: 'R1', from: 'M1', to: 'M4' });

  it('an arrow is born unlocked and the lock is its own', () => {
    const p = withArrow();
    expect(canEditArrow(p, 'R1')).toBe(true);
    expect(canEditArrow(setArrowLocked(p, 'R1', true), 'R1')).toBe(false);
    // Locked end markings do not lock the arrow.
    const ends = setMarkingLocked(setMarkingLocked(p, 'M1', true), 'M4', true);
    expect(canEditArrow(ends, 'R1')).toBe(true);
    expect(codeOf(() => canEditArrow(p, 'R9'))).toBe('not-found');
  });
});
