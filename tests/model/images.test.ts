import { describe, expect, it } from 'vitest';
import {
  IMAGES_DIR,
  IMAGE_GAP,
  MAPPING_FILE,
  addBackgroundContainer,
  addContainer,
  MAX_CONTAINER_SIZE,
  createMarking,
  isBackgroundContainer,
  setBackgroundContainer,
  setImageLocked,
  snapCoordinate,
  setMarkingLocked,
  containerDeletionImpact,
  containerLockStates,
  isSameAspect,
  moveContainer,
  overlappingContainer,
  removeContainer,
  replaceContainer,
  resizeContainer,
  settleHierarchy,
  fileNameKey,
  uniqueImageFile,
  validateProject,
} from '../../src/model';
import { emptyProject, expectValid, image, marking, sampleProject } from './fixtures';

describe('images: add', () => {
  it('the first goes to the origin with longer side = 1000', () => {
    const p = addContainer(emptyProject(), {
      id: 'I1',
      file: 'images/a.jpg',
      width: 4000,
      height: 3000,
    });
    expect(image(p, 'I1').placement).toEqual({ x: 0, y: 0, scale: 0.25 });
  });

  it('the next ones go to the right of the rightmost, with spacing', () => {
    let p = sampleProject(); // I2 takes x 1050..2050
    p = addContainer(p, { id: 'I3', file: 'images/c.jpg', width: 500, height: 2000 });
    expect(image(p, 'I3').placement).toEqual({ x: 2050 + IMAGE_GAP, y: 0, scale: 0.5 });
    expectValid(p);
  });

  it('rejects a repeated file and invalid dimensions', () => {
    const p = sampleProject();
    expect(() =>
      addContainer(p, { id: 'X', file: 'images/frente.jpg', width: 10, height: 10 }),
    ).toThrow('duplicate-file');
    expect(() =>
      addContainer(p, { id: 'X', file: 'images/x.jpg', width: 0, height: 10 }),
    ).toThrow('invalid-dimensions');
  });

  it('generates free names with suffix -2, -3…', () => {
    const p = sampleProject();
    expect(uniqueImageFile(p, 'new.jpg')).toBe('images/new.jpg');
    expect(uniqueImageFile(p, 'frente.jpg')).toBe('images/frente-2.jpg');
    const q = addContainer(p, {
      id: 'I3',
      file: 'images/frente-2.jpg',
      width: 10,
      height: 10,
    });
    expect(uniqueImageFile(q, 'frente.jpg')).toBe('images/frente-3.jpg');
    expect(uniqueImageFile(p, 'noextension')).toBe('images/noextension');
  });
});

describe('images: move and resize without overlap', () => {
  it('moves to a free place', () => {
    const p = moveContainer(sampleProject(), 'I2', 0, 800);
    expect(image(expectValid(p), 'I2').placement).toEqual({ x: 0, y: 800, scale: 1 });
  });

  it('touching the edge is not an overlap', () => {
    const p = moveContainer(sampleProject(), 'I2', 1000, 0);
    expect(image(expectValid(p), 'I2').placement.x).toBe(1000);
  });

  it('rejects a position that overlaps another image', () => {
    const p = sampleProject();
    expect(() => moveContainer(p, 'I2', 999, 0)).toThrow('image-overlap');
  });

  it('resizes proportionally if it does not overlap', () => {
    const p = sampleProject();
    expect(() => resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.5 })).toThrow(
      'image-overlap',
    );
    const q = resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.2 });
    expect(image(expectValid(q), 'I1').placement.scale).toBe(0.2);
    expect(() => resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0 })).toThrow(
      'invalid-placement',
    );
  });
});

describe('images: cascade delete', () => {
  it('deletes the markings and annotations of the image', () => {
    const p = sampleProject();
    expect(containerDeletionImpact(p, 'I1')).toEqual({
      markings: 3,
      lockedMarkings: 0,
      annotations: 3,
      arrows: 0,
      brokenRefs: 0,
    });
    const next = expectValid(removeContainer(p, 'I1'));
    expect(next.containers.map((i) => i.id)).toEqual(['I2']);
    expect(next.markings.map((m) => m.id)).toEqual(['M4']);
    expect(next.annotations.map((a) => a.id)).toEqual(['A4']);
  });
});

describe('images: replace', () => {
  it('detects the same aspect with a 1% tolerance', () => {
    expect(
      isSameAspect({ width: 4000, height: 3000 }, { width: 2000, height: 1500 }),
    ).toBe(true);
    expect(
      isSameAspect({ width: 4000, height: 3000 }, { width: 2000, height: 1510 }),
    ).toBe(true);
    expect(
      isSameAspect({ width: 4000, height: 3000 }, { width: 2000, height: 1600 }),
    ).toBe(false);
  });

  it('same aspect: rescales the markings without review and preserves the displayed width', () => {
    const p = sampleProject();
    const next = expectValid(
      replaceContainer(p, 'I1', { file: 'images/new.jpg', width: 2000, height: 1500 }),
    );
    expect(image(next, 'I1')).toEqual({
      id: 'I1',
      name: null,
      parentId: null,
      markingColor: null,
      locked: false,
      source: null,
      file: 'images/new.jpg',
      background: null,
      width: 2000,
      height: 1500,
      placement: { x: 0, y: 0, scale: 0.5 },
    });
    expect(marking(next, 'M1').rect).toEqual({ x: 500, y: 500, width: 500, height: 500 });
    expect(marking(next, 'M2').rect).toEqual({ x: 600, y: 600, width: 200, height: 100 });
    expect(marking(next, 'M3').rect).toEqual({ x: 650, y: 625, width: 25, height: 25 });
    expect(next.markings.every((m) => !m.needsReview)).toBe(true);
    expect(marking(next, 'M4')).toBe(marking(p, 'M4'));
  });

  it('different aspect: requires confirmation and sets needsReview', () => {
    const p = sampleProject();
    const file = { file: 'images/new.jpg', width: 4000, height: 4000 };
    expect(() => replaceContainer(p, 'I1', file)).toThrow('aspect-change-not-confirmed');
    const next = expectValid(
      replaceContainer(p, 'I1', file, { confirmAspectChange: true }),
    );
    expect(marking(next, 'M1').rect).toEqual({
      x: 1000,
      y: 1333,
      width: 1000,
      height: 1334,
    });
    const own = next.markings.filter((m) => m.containerId === 'I1');
    expect(own.every((m) => m.needsReview)).toBe(true);
    expect(marking(next, 'M4').needsReview).toBe(false);
  });

  it('if the new height overlaps another image, it goes to a free space', () => {
    let p = sampleProject();
    p = moveContainer(p, 'I2', 0, 760); // right below I1 (displayed height 750)
    const next = expectValid(
      replaceContainer(
        p,
        'I1',
        { file: 'images/tall.jpg', width: 4000, height: 4000 },
        { confirmAspectChange: true },
      ),
    );
    expect(image(next, 'I1').placement).toEqual({
      x: 1000 + IMAGE_GAP,
      y: 760,
      scale: 0.25,
    });
  });

  it('markings that would end up smaller than the minimum are enlarged inside the parent', () => {
    const p = sampleProject();
    const next = expectValid(
      replaceContainer(p, 'I1', { file: 'images/mini.jpg', width: 400, height: 300 }),
    );
    // M3 (50×50) would become 5×5: grows to 8×8 staying inside M2.
    expect(marking(next, 'M3').rect).toEqual({ x: 129, y: 124, width: 8, height: 8 });
  });

  it('an image too small for the markings is rejected', () => {
    const p = sampleProject();
    expect(() =>
      replaceContainer(
        p,
        'I1',
        { file: 'images/x.jpg', width: 4, height: 3 },
        { confirmAspectChange: true },
      ),
    ).toThrow('image-too-small');
  });
});

describe('images: replace preserves the size and respects the marking minimum (#953)', () => {
  /** A 100×100 container with a marking of `rect`; `minSizeOf` simulates the component that draws it. */
  function small(rect: { x: number; y: number; width: number; height: number }) {
    let p = emptyProject();
    p = addContainer(p, { id: 'C', file: 'images/a.jpg', width: 100, height: 100 });
    return createMarking(
      p,
      { id: 'K', containerId: 'C', rect, name: 'K' },
      { minSize: { width: 1, height: 1 } },
    );
  }
  const comp = (min: { width: number; height: number } | null) => ({
    minSizeOf: (id: string) => (id === 'K' ? min : null),
  });

  it('same scale: a 4×4 component marking stays as is, without review', () => {
    const p = small({ x: 10, y: 10, width: 4, height: 4 });
    const next = expectValid(
      replaceContainer(
        p,
        'C',
        { file: 'images/b.jpg', width: 100, height: 100 },
        comp({ width: 4, height: 4 }),
      ),
    );
    expect(marking(next, 'K').rect).toEqual({ x: 10, y: 10, width: 4, height: 4 });
    expect(marking(next, 'K').needsReview).toBe(false);
  });

  it('same scale: a plain marking of 8×8 or more does not change', () => {
    const p = small({ x: 10, y: 10, width: 8, height: 12 });
    const next = replaceContainer(p, 'C', {
      file: 'images/b.jpg',
      width: 100,
      height: 100,
    });
    expect(marking(next, 'K').rect).toEqual({ x: 10, y: 10, width: 8, height: 12 });
    expect(marking(next, 'K').needsReview).toBe(false);
  });

  it('rescaling a component without minSize: the minimum is 1 px, not 8', () => {
    let p = emptyProject();
    p = addContainer(p, { id: 'C', file: 'images/a.jpg', width: 200, height: 200 });
    p = createMarking(
      p,
      {
        id: 'K',
        containerId: 'C',
        rect: { x: 20, y: 20, width: 2, height: 2 },
        name: 'K',
      },
      { minSize: { width: 1, height: 1 } },
    );
    const next = expectValid(
      replaceContainer(
        p,
        'C',
        { file: 'images/b.jpg', width: 100, height: 100 },
        comp({
          width: 0,
          height: 0,
        }),
      ),
    );
    expect(marking(next, 'K').rect).toEqual({ x: 10, y: 10, width: 1, height: 1 });
    expect(marking(next, 'K').needsReview).toBe(false);
  });

  it('rescaling below the component minSize: grows around the center and gets review', () => {
    let p = emptyProject();
    p = addContainer(p, { id: 'C', file: 'images/a.jpg', width: 200, height: 200 });
    p = createMarking(p, {
      id: 'K',
      containerId: 'C',
      rect: { x: 60, y: 60, width: 80, height: 80 },
      name: 'K',
    });
    const next = expectValid(
      replaceContainer(
        p,
        'C',
        { file: 'images/b.jpg', width: 100, height: 100 },
        comp({ width: 40, height: 40 }),
      ),
    );
    // 80×80 would become 40×40 at (30,30): already fits. With minSize 60×60 it grows around the center.
    expect(marking(next, 'K').rect).toEqual({ x: 30, y: 30, width: 40, height: 40 });
    const grown = expectValid(
      replaceContainer(
        p,
        'C',
        { file: 'images/c.jpg', width: 100, height: 100 },
        comp({ width: 60, height: 60 }),
      ),
    );
    expect(marking(grown, 'K').rect).toEqual({ x: 20, y: 20, width: 60, height: 60 });
    expect(marking(grown, 'K').needsReview).toBe(true);
  });

  it('minimum larger than the new image: the side takes the whole image and gets review', () => {
    let p = emptyProject();
    p = addContainer(p, { id: 'C', file: 'images/a.jpg', width: 200, height: 200 });
    p = createMarking(p, {
      id: 'K',
      containerId: 'C',
      rect: { x: 60, y: 60, width: 80, height: 80 },
      name: 'K',
    });
    const next = expectValid(
      replaceContainer(
        p,
        'C',
        { file: 'images/b.jpg', width: 100, height: 100 },
        comp({ width: 150, height: 150 }),
      ),
    );
    expect(marking(next, 'K').rect).toEqual({ x: 0, y: 0, width: 100, height: 100 });
    expect(marking(next, 'K').needsReview).toBe(true);
  });
});

// Names in the project folder, in one place for the app (`src/storage/`) and the MCP server (phase 8.5, M10).
describe('project folder files', () => {
  it('mapping.json e images/', () => {
    expect(MAPPING_FILE).toBe('mapping.json');
    expect(IMAGES_DIR).toBe('images');
    expect(uniqueImageFile(emptyProject(), 'a.png')).toBe(`${IMAGES_DIR}/a.png`);
  });
});

describe('container (image without a file)', () => {
  const bgContainer = (p = sampleProject()) =>
    addBackgroundContainer(p, {
      id: 'B1',
      width: 390,
      height: 844,
      background: '#ffffff',
      name: '  Login  ',
    });

  it('addBackgroundContainer: uppercase color, normalized name, longer side = 1000', () => {
    const p = bgContainer();
    const b = image(p, 'B1');
    expect(isBackgroundContainer(b)).toBe(true);
    expect(isBackgroundContainer(image(p, 'I1'))).toBe(false);
    expect(b).toMatchObject({
      file: null,
      background: '#FFFFFF',
      name: 'Login',
      width: 390,
      height: 844,
      locked: false,
      markingColor: null,
      source: null,
    });
    expect(b.placement.scale).toBeCloseTo(1000 / 844);
    // To the right of the rightmost image (I2 takes x 1050..2050).
    expect(b.placement.x).toBe(2050 + IMAGE_GAP);
    expectValid(p);
  });

  it('addBackgroundContainer: near `center`, without overlapping', () => {
    const p = addBackgroundContainer(sampleProject(), {
      id: 'B1',
      width: 100,
      height: 100,
      background: '#000000',
      center: { x: 5000, y: 5000 },
    });
    expect(image(p, 'B1').placement).toEqual({ x: 4500, y: 4500, scale: 10 });
    expectValid(p);
  });

  it('addBackgroundContainer: validates id, color and dimensions (1 to MAX_CONTAINER_SIZE)', () => {
    const p = sampleProject();
    const args = { id: 'B1', width: 10, height: 10, background: '#000000' };
    expect(() => addBackgroundContainer(p, { ...args, id: 'I1' })).toThrow(
      'duplicate-id',
    );
    expect(() => addBackgroundContainer(p, { ...args, background: 'black' })).toThrow(
      'invalid-color',
    );
    expect(() => addBackgroundContainer(p, { ...args, width: 0 })).toThrow(
      'invalid-dimensions',
    );
    expect(() => addBackgroundContainer(p, { ...args, height: 1.5 })).toThrow(
      'invalid-dimensions',
    );
    expect(() =>
      addBackgroundContainer(p, { ...args, width: MAX_CONTAINER_SIZE + 1 }),
    ).toThrow('invalid-dimensions');
    expectValid(addBackgroundContainer(p, { ...args, width: MAX_CONTAINER_SIZE }));
  });

  it('images without a file do not take file names', () => {
    const p = bgContainer();
    expect(uniqueImageFile(p, 'frente.jpg')).toBe('images/frente-2.jpg');
    expect(uniqueImageFile(p, 'new.jpg')).toBe('images/new.jpg');
    const q = addContainer(p, {
      id: 'I3',
      file: 'images/new.jpg',
      width: 10,
      height: 10,
    });
    expectValid(q);
    expect(() =>
      addContainer(q, { id: 'I4', file: 'images/new.jpg', width: 10, height: 10 }),
    ).toThrow('duplicate-file');
  });

  it('replaceImage refuses the container', () => {
    expect(() =>
      replaceContainer(bgContainer(), 'B1', {
        file: 'images/x.png',
        width: 390,
        height: 844,
      }),
    ).toThrow('container-without-file');
  });

  describe('setBackgroundContainer', () => {
    it('changes the color without touching the geometry (even with the image locked)', () => {
      const p = setImageLocked(bgContainer(), 'B1', true);
      const q = setBackgroundContainer(p, 'B1', { background: '#abcdef' });
      expect(image(q, 'B1')).toMatchObject({
        background: '#ABCDEF',
        width: 390,
        height: 844,
      });
      expect(setBackgroundContainer(q, 'B1', { background: '#ABCDEF' })).toBe(q);
      expect(() => setBackgroundContainer(p, 'B1', { background: 'x' })).toThrow(
        'invalid-color',
      );
    });

    it('changes the size keeping the placement scale', () => {
      const p = bgContainer();
      const scale = image(p, 'B1').placement.scale;
      const q = setBackgroundContainer(p, 'B1', { width: 200, height: 300 });
      expect(image(q, 'B1')).toMatchObject({ width: 200, height: 300, file: null });
      expect(image(q, 'B1').placement).toEqual(image(p, 'B1').placement);
      expect(image(q, 'B1').placement.scale).toBe(scale);
      expectValid(q);
    });

    it('refuses invalid dimensions, an image with a file and a size on a locked image', () => {
      const p = bgContainer();
      expect(() => setBackgroundContainer(p, 'B1', { width: 0 })).toThrow(
        'invalid-dimensions',
      );
      expect(() =>
        setBackgroundContainer(p, 'B1', { height: MAX_CONTAINER_SIZE + 1 }),
      ).toThrow('invalid-dimensions');
      expect(() => setBackgroundContainer(p, 'I1', { background: '#000000' })).toThrow(
        'container-has-file',
      );
      expect(() =>
        setBackgroundContainer(setImageLocked(p, 'B1', true), 'B1', { width: 200 }),
      ).toThrow('locked');
    });

    it('refuses the size that would leave a marking outside', () => {
      let p = bgContainer();
      p = createMarking(p, {
        id: 'MB',
        containerId: 'B1',
        rect: { x: 100, y: 600, width: 200, height: 200 },
      });
      expect(() => setBackgroundContainer(p, 'B1', { height: 700 })).toThrow(
        'rect-out-of-image',
      );
      // A locked marking changes nothing: the rule is the same.
      const locked = setMarkingLocked(p, 'MB', true);
      expect(() => setBackgroundContainer(locked, 'B1', { width: 250 })).toThrow(
        'rect-out-of-image',
      );
      const grown = setBackgroundContainer(p, 'B1', { width: 500, height: 900 });
      expect(image(grown, 'B1')).toMatchObject({ width: 500, height: 900 });
      expectValid(grown);
    });

    it('refuses the size that would make the image overlap another', () => {
      const p = bgContainer();
      const next = addBackgroundContainer(p, {
        id: 'B2',
        width: 100,
        height: 100,
        background: '#000000',
      });
      // B1 and B2 side by side: enlarging B1 (same scale) invades B2.
      expect(() => setBackgroundContainer(next, 'B1', { width: 2000 })).toThrow(
        'image-overlap',
      );
      expectValid(setBackgroundContainer(next, 'B1', { width: 400 }));
    });
  });
});

// Membership (v13): the container is born without a parent and the settle decides which canvas marking
// contains it; moving, resizing, replacing the file and deleting settle; `settle: false` freezes.
describe('containers: membership in canvas markings', () => {
  /** sampleProject: I1 takes (0,0)–(1000,750) and I2 (1050,0)–(2050,1000); K surrounds only I1. */
  function withCanvasMarking() {
    return createMarking(sampleProject(), {
      id: 'K',
      containerId: null,
      rect: { x: -100, y: -100, width: 1200, height: 1000 },
    });
  }

  it('the container is born without a parent; the sample project has no canvas marking', () => {
    const p = addContainer(sampleProject(), {
      id: 'I3',
      file: 'images/c.jpg',
      width: 100,
      height: 100,
    });
    expect(image(p, 'I3').parentId).toBeNull();
    expect(p.containers.every((c) => c.parentId === null)).toBe(true);
  });

  it('creating the canvas marking settles: only I1 fits in it', () => {
    const p = expectValid(withCanvasMarking());
    expect(image(p, 'I1').parentId).toBe('K');
    expect(image(p, 'I2').parentId).toBeNull();
    expect(marking(p, 'K')).toMatchObject({ containerId: null, parentId: null });
    // The markings of the images stay as they were.
    expect(marking(p, 'M1').containerId).toBe('I1');
  });

  it('moving the container out of the marking removes it; moving it in puts it back', () => {
    let p = withCanvasMarking();
    p = expectValid(moveContainer(p, 'I1', 0, 2000));
    expect(image(p, 'I1').parentId).toBeNull();
    // Back: I1 (1000×750) fits in K again.
    p = expectValid(moveContainer(p, 'I1', 0, 0));
    expect(image(p, 'I1').parentId).toBe('K');
  });

  it('a container that now fits entirely in another canvas marking becomes its member', () => {
    let p = createMarking(sampleProject(), {
      id: 'K2',
      containerId: null,
      rect: { x: -50, y: 1500, width: 1200, height: 900 },
    });
    expect(image(p, 'I2').parentId).toBeNull();
    // I2 (1000×1000 at scale 1) does not fit in a height of 900: reduce the scale and then move.
    p = resizeContainer(p, 'I2', { x: 1050, y: 0, scale: 0.8 });
    p = moveContainer(p, 'I2', 0, 1600);
    expect(image(expectValid(p), 'I2').parentId).toBe('K2');
  });

  it('resizing the container also settles', () => {
    // Far from I2: I1 can grow without overlapping. K goes from -100 to 1100 in x and from -100 to 900 in y.
    let p = moveContainer(withCanvasMarking(), 'I2', 1050, 2000);
    p = resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.26 }); // 1040×780: fits in K
    expect(image(p, 'I1').parentId).toBe('K');
    p = expectValid(resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.28 })); // 1120×840
    expect(image(p, 'I1').parentId).toBeNull();
  });

  it('settle: false freezes membership (gesture preview); settling afterwards decides', () => {
    const p = withCanvasMarking();
    const preview = moveContainer(p, 'I1', 0, 2000, { settle: false });
    expect(image(preview, 'I1').placement.y).toBe(2000);
    expect(image(preview, 'I1').parentId).toBe('K');
    expect(image(settleHierarchy(preview), 'I1').parentId).toBeNull();
  });

  it('the lock of the canvas marking locks the placement of the container inside it', () => {
    let p = withCanvasMarking();
    p = setMarkingLocked(p, 'K', true);
    expect(containerLockStates(p)).toEqual(new Map([['I1', 'inherited']]));
    expect(() => moveContainer(p, 'I1', 0, 2000)).toThrow('locked');
    expect(() => resizeContainer(p, 'I1', { x: 0, y: 0, scale: 0.2 })).toThrow('locked');
    // Outside the marking, free; the locked container appears as `self`.
    expect(image(moveContainer(p, 'I2', 1050, 1200), 'I2').placement.y).toBe(1200);
    p = setImageLocked(p, 'I2', true);
    expect(containerLockStates(p)).toEqual(
      new Map([
        ['I1', 'inherited'],
        ['I2', 'self'],
      ]),
    );
  });

  it('deleting the container settles and does not take the canvas marking', () => {
    const p = withCanvasMarking();
    const next = expectValid(removeContainer(p, 'I1'));
    expect(next.containers.map((c) => c.id)).toEqual(['I2']);
    expect(marking(next, 'K').containerId).toBeNull();
    expect(next.markings.map((m) => m.id)).toEqual(['M4', 'K']);
  });

  it('a new container inside a canvas marking is its member', () => {
    let p = createMarking(emptyProject(), {
      id: 'K',
      containerId: null,
      rect: { x: -100, y: -100, width: 1300, height: 1300 },
    });
    p = addContainer(p, { id: 'I1', file: 'images/a.jpg', width: 1000, height: 1000 });
    expect(image(expectValid(p), 'I1').parentId).toBe('K');
  });

  it('a canvas marking that now fits entirely in a new container becomes its own', () => {
    let p = createMarking(emptyProject(), {
      id: 'N',
      containerId: null,
      rect: { x: 100, y: 100, width: 50, height: 50 },
    });
    p = addBackgroundContainer(p, {
      id: 'W',
      width: 1000,
      height: 1000,
      background: '#FFFFFF',
      center: { x: 500, y: 500 },
    });
    expect(marking(expectValid(p), 'N')).toMatchObject({
      containerId: 'W',
      rect: { x: 100, y: 100, width: 50, height: 50 },
    });
  });

  it('replacing the file rescales each marking on its own; the parent is redone by geometry', () => {
    // M3 (50×50) against the corner of M2: at 10% it grows to 8×8 and goes past the edge of M2,
    // which no longer contains it. Rescaling does not tie it to the parent; the settle decides the parent.
    let p = sampleProject();
    p = {
      ...p,
      markings: p.markings.map((m) =>
        m.id === 'M3' ? { ...m, rect: { x: 1550, y: 1350, width: 50, height: 50 } } : m,
      ),
    };
    expect(marking(expectValid(p), 'M3').parentId).toBe('M2');
    const next = expectValid(
      replaceContainer(p, 'I1', { file: 'images/mini.jpg', width: 400, height: 300 }),
    );
    expect(marking(next, 'M2').rect).toEqual({ x: 120, y: 120, width: 40, height: 20 });
    expect(marking(next, 'M3').rect).toEqual({ x: 154, y: 134, width: 8, height: 8 });
    // M2 (120..160 × 120..140) no longer contains M3; the smallest that contains it is M1 (100..200 × 100..200).
    expect(marking(next, 'M3').parentId).toBe('M1');
  });
});

describe('images: free name ignoring case', () => {
  const withFile = (file: string) =>
    addContainer(emptyProject(), { id: 'I1', file, width: 10, height: 10 });

  it('fileNameKey: NFC and lowercase', () => {
    expect(fileNameKey('images/Photo.JPG')).toBe('images/photo.jpg');
    expect(fileNameKey('images/caf\u0065\u0301.png')).toBe(
      fileNameKey('images/caf\u00e9.png'),
    );
  });

  it('the project with images/Photo.jpg gives photo-2.jpg for photo.jpg (the requested case is kept)', () => {
    const p = withFile('images/Photo.jpg');
    expect(uniqueImageFile(p, 'photo.jpg')).toBe('images/photo-2.jpg');
    expect(uniqueImageFile(p, 'Other.JPG')).toBe('images/Other.JPG');
  });

  it('taken with images/SCREEN.png makes screen.png become screen-2.png', () => {
    expect(
      uniqueImageFile(emptyProject(), 'screen.png', new Set(['images/SCREEN.png'])),
    ).toBe('images/screen-2.png');
  });

  it('composed and decomposed NFC count as equal', () => {
    const p = withFile('images/caf\u00e9.png');
    expect(uniqueImageFile(p, 'caf\u0065\u0301.png')).toBe(
      'images/caf\u0065\u0301-2.png',
    );
  });

  it('the candidates -2, -3… also ignore case', () => {
    const taken = new Set(['images/A.png', 'images/a-2.PNG']);
    expect(uniqueImageFile(emptyProject(), 'a.png', taken)).toBe('images/a-3.png');
  });

  it('addContainer and replaceContainer refuse a file that differs only in case', () => {
    const p = withFile('images/Photo.jpg');
    expect(() =>
      addContainer(p, { id: 'I2', file: 'images/photo.jpg', width: 10, height: 10 }),
    ).toThrow('duplicate-file');
    const q = addContainer(p, {
      id: 'I2',
      file: 'images/other.jpg',
      width: 10,
      height: 10,
    });
    expect(() =>
      replaceContainer(q, 'I2', { file: 'images/PHOTO.JPG', width: 10, height: 10 }),
    ).toThrow('duplicate-file');
    // Replacing with its own name, changing only the case, is allowed.
    expect(
      replaceContainer(q, 'I2', { file: 'images/OTHER.jpg', width: 10, height: 10 })
        .containers[1]?.file,
    ).toBe('images/OTHER.jpg');
  });

  it('the validation on open still accepts the old project with both (decision 2)', () => {
    const p = withFile('images/Photo.jpg');
    const old = {
      ...p,
      containers: [
        ...p.containers,
        { ...p.containers[0]!, id: 'I2', file: 'images/photo.jpg' },
      ],
    };
    expect(validateProject(old).map((i) => i.code)).not.toContain('duplicate-file');
  });
});

describe('containers: beside', () => {
  it('beside: born to the right of the reference one, top aligned and the same scale', () => {
    let p = emptyProject();
    p = addBackgroundContainer(p, {
      id: 'T',
      width: 390,
      height: 844,
      background: '#ffffff',
    });
    const ref = image(p, 'T').placement;
    p = addBackgroundContainer(p, {
      id: 'D',
      width: 390,
      height: 300,
      background: '#ffffff',
      beside: 'T',
    });
    const after = image(p, 'D').placement;
    expect(after.scale).toBe(ref.scale);
    expect(after.y).toBe(ref.y);
    expect(after.x).toBe(snapCoordinate(ref.x + 390 * ref.scale + IMAGE_GAP));
  });

  it('beside: an occupied place goes to the nearest free space and keeps the scale', () => {
    let p = emptyProject();
    p = addBackgroundContainer(p, {
      id: 'T',
      width: 400,
      height: 400,
      background: '#ffffff',
    });
    const t = image(p, 'T').placement;
    p = addBackgroundContainer(p, {
      id: 'X',
      width: 400,
      height: 400,
      background: '#ffffff',
      beside: 'T',
    });
    p = addBackgroundContainer(p, {
      id: 'Y',
      width: 400,
      height: 400,
      background: '#ffffff',
      beside: 'T',
    });
    const y = image(p, 'Y').placement;
    expect(y.scale).toBe(t.scale);
    expect(overlappingContainer(p, 'Y', y)).toBeNull();
  });

  it('beside: a nonexistent reference container fails', () => {
    expect(() =>
      addBackgroundContainer(emptyProject(), {
        id: 'D',
        width: 10,
        height: 10,
        background: '#ffffff',
        beside: 'does-not-exist',
      }),
    ).toThrow();
  });

  it('beside also works with a file', () => {
    let p = addBackgroundContainer(emptyProject(), {
      id: 'T',
      width: 390,
      height: 844,
      background: '#ffffff',
    });
    p = addContainer(p, {
      id: 'F',
      file: 'images/f.png',
      width: 800,
      height: 200,
      beside: 'T',
    });
    expect(image(p, 'F').placement.scale).toBe(image(p, 'T').placement.scale);
  });
});
