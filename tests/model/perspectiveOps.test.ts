import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addBackgroundContainer,
  addLayer,
  addPerspective,
  buildPerspective,
  createArrow,
  createMarking,
  duplicatePerspective,
  moveRoots,
  moveRootsInPerspective,
  perspectiveNameIssue,
  projectPerspectiveNameIssue,
  removePerspective,
  removeRoots,
  removeRootsFromPerspective,
  renamePerspective,
  sendRoots,
  sendRootsToPerspective,
  setContainerPlacement,
  setPerspectiveHiddenLayers,
  type ModelErrorCode,
  type Perspective,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';
import { multiProject } from './multiSelectionFixtures';

// Perspective operations (v16, decisions 6, 10 and 11). `multiProject`: roots D (7000,0),
// E (9000,0), G (-100,-100), N (100,1300) and H (400,1300).

function persp(
  id: string,
  name: string,
  items: [string, number, number][] = [],
  hiddenLayers: string[] = [],
): Perspective {
  return { id, name, hiddenLayers, items: items.map(([root, x, y]) => ({ root, x, y })) };
}

function code(run: () => unknown): ModelErrorCode | null {
  try {
    run();
  } catch (error) {
    if (error instanceof ModelError) return error.code;
    throw error;
  }
  return null;
}

const base = (): Project => ({
  ...multiProject(),
  perspectives: [persp('P', 'Flow', [['D', 1, 2]]), persp('Q', 'Screens')],
});

describe('perspective name', () => {
  it('empty, repeated (case-insensitive, with spaces) or free', () => {
    const names = ['Flow', 'Screens'];
    expect(perspectiveNameIssue(names, '   ')).toBe('empty');
    expect(perspectiveNameIssue(names, ' fluxo ')).toBe('taken');
    expect(perspectiveNameIssue(names, 'Novo')).toBeNull();
  });

  it('renaming itself with only a different case is not a repeat', () => {
    expect(perspectiveNameIssue(['Flow'], 'FLOW', 'Flow')).toBeNull();
    expect(perspectiveNameIssue(['Flow', 'Screens'], 'screens', 'Flow')).toBe('taken');
  });

  it('the project version also checks the extra names (the "Only me" ones)', () => {
    const p = base();
    expect(projectPerspectiveNameIssue(p, 'screens')).toBe('taken');
    expect(projectPerspectiveNameIssue(p, 'Meu', undefined, ['meu'])).toBe('taken');
    expect(projectPerspectiveNameIssue(p, 'Screens', 'Screens')).toBeNull();
    expect(projectPerspectiveNameIssue(p, 'Novo', undefined, ['Meu'])).toBeNull();
  });
});

describe('buildPerspective: Start from', () => {
  const p = base();

  it('Main: all the roots at their positions', () => {
    const built = buildPerspective(p, { id: 'N1', name: ' New ', startFrom: null });
    expect(built).toEqual({
      id: 'N1',
      name: 'New',
      hiddenLayers: [],
      items: [
        { root: 'D', x: 7000, y: 0 },
        { root: 'E', x: 9000, y: 0 },
        { root: 'G', x: -100, y: -100 },
        { root: 'N', x: 100, y: 1300 },
        { root: 'H', x: 400, y: 1300 },
      ],
    });
  });

  it('Empty: no roots; the hiddenLayers argument applies to all', () => {
    expect(
      buildPerspective(p, { id: 'N1', name: 'V', startFrom: 'empty' }).items,
    ).toEqual([]);
    expect(
      buildPerspective(p, {
        id: 'N1',
        name: 'V',
        startFrom: 'empty',
        hiddenLayers: ['L1'],
      }).hiddenLayers,
    ).toEqual(['L1']);
    expect(
      buildPerspective(p, { id: 'N1', name: 'V', startFrom: null, hiddenLayers: ['L1'] })
        .hiddenLayers,
    ).toEqual(['L1']);
  });

  it('a perspective: copies roots, positions and hidden layers', () => {
    const from = persp(
      'X',
      'Origem',
      [
        ['E', 5, 6],
        ['H', 7, 8],
      ],
      ['L1'],
    );
    const built = buildPerspective(p, { id: 'N1', name: 'Copy', startFrom: from });
    expect(built.items).toEqual(from.items);
    expect(built.hiddenLayers).toEqual(['L1']);
    expect(built.items).not.toBe(from.items);
    expect(
      buildPerspective(p, { id: 'N1', name: 'Copy', startFrom: from, hiddenLayers: [] })
        .hiddenLayers,
    ).toEqual([]);
  });

  it('only takes layers that exist', () => {
    const built = buildPerspective(p, {
      id: 'N1',
      name: 'V',
      startFrom: null,
      hiddenLayers: ['L1', 'fantasma'],
    });
    expect(built.hiddenLayers).toEqual(['L1']);
  });
});

describe('project perspectives: add, rename, duplicate, delete', () => {
  it('addPerspective acrescenta no fim e confere nome e id', () => {
    const p = base();
    const next = addPerspective(p, persp('R', 'New'));
    expect(next.perspectives.map((x) => x.id)).toEqual(['P', 'Q', 'R']);
    expect(code(() => addPerspective(p, persp('R', '  ')))).toBe(
      'perspective-name-empty',
    );
    expect(code(() => addPerspective(p, persp('R', 'fluxo')))).toBe(
      'perspective-name-taken',
    );
    expect(code(() => addPerspective(p, persp('R', 'Meu'), ['MEU']))).toBe(
      'perspective-name-taken',
    );
    expect(code(() => addPerspective(p, persp('P', 'Outro')))).toBe('duplicate-id');
  });

  it('rename: accepts the same one with a different case, refuses a repeat and a nonexistent id', () => {
    const p = base();
    expect(renamePerspective(p, 'P', 'FLOW').perspectives[0]?.name).toBe('FLOW');
    expect(code(() => renamePerspective(p, 'P', 'screens'))).toBe(
      'perspective-name-taken',
    );
    expect(code(() => renamePerspective(p, 'P', ' '))).toBe('perspective-name-empty');
    expect(code(() => renamePerspective(p, 'zzz', 'X'))).toBe('not-found');
  });

  it('duplicate copies the roots and layers with a new id and name', () => {
    const p = {
      ...base(),
      perspectives: [persp('P', 'Flow', [['D', 1, 2]], ['L1'])],
    };
    const next = duplicatePerspective(p, 'P', 'P2', 'Flow (copy)');
    expect(next.perspectives[1]).toEqual({
      id: 'P2',
      name: 'Flow (copy)',
      hiddenLayers: ['L1'],
      items: [{ root: 'D', x: 1, y: 2 }],
    });
    expect(code(() => duplicatePerspective(p, 'P', 'P2', 'fluxo'))).toBe(
      'perspective-name-taken',
    );
    expect(code(() => duplicatePerspective(p, 'zzz', 'P2', 'X'))).toBe('not-found');
  });

  it('deleting changes nothing outside perspectives (the marks keep fromName)', () => {
    const p: Project = {
      ...base(),
      arrivals: [{ root: 'H', from: 'P', fromName: 'Flow' }],
    };
    const next = removePerspective(p, 'P');
    expect(next.perspectives.map((x) => x.id)).toEqual(['Q']);
    expect({ ...next, perspectives: p.perspectives }).toEqual(p);
    expect(code(() => removePerspective(p, 'zzz'))).toBe('not-found');
  });
});

/** Main with S2 (600,0), the marking m2 in it, and a container X far away with an arrow from Xm to m2. */
function linked(): Project {
  let p = emptyProject();
  for (const [id, x, y] of [
    ['S2', 600, 0],
    ['X', 9000, 9000],
  ] as const) {
    p = addBackgroundContainer(p, { id, width: 500, height: 500, background: '#FFFFFF' });
    p = setContainerPlacement(p, id, { x, y, scale: 1 });
  }
  const rect = { x: 50, y: 50, width: 100, height: 100 };
  p = createMarking(p, { id: 'm2', containerId: 'S2', rect });
  p = createMarking(p, { id: 'Xm', containerId: 'X', rect });
  return createArrow(p, { id: 'ar', from: 'Xm', to: 'm2' });
}

describe('enviar para a perspectiva', () => {
  it('enters by the same rule as the arrival: near the reference, with no mark', () => {
    const p: Project = {
      ...linked(),
      perspectives: [persp('Q', 'Screens', [['S2', 100, 100]])],
    };
    const next = sendRootsToPerspective(p, 'Q', ['X'], null);
    // X was at (9000, 9000) and S2 at (600, 0): in the perspective, S2 is at (100, 100).
    expect(next.perspectives[0]?.items).toEqual([
      { root: 'S2', x: 100, y: 100 },
      { root: 'X', x: 8500, y: 9100 },
    ]);
    expect(next.arrivals).toEqual([]);
  });

  it('one at a time: the second already sees the first', () => {
    const p: Project = { ...multiProject(), perspectives: [persp('Q', 'Vazia')] };
    const next = sendRootsToPerspective(p, 'Q', ['D', 'E'], null);
    expect(next.perspectives[0]?.items).toEqual([
      { root: 'D', x: 0, y: 0 },
      { root: 'E', x: 1050, y: 0 },
    ]);
  });

  it('a root that is already there stays where it is; the value version returns the perspective', () => {
    const p = { ...multiProject(), perspectives: [persp('Q', 'Q', [['D', 5, 6]])] };
    const target = p.perspectives[0] as Perspective;
    expect(sendRoots(p, target, ['D'], null)).toBe(target);
    expect(sendRoots(p, target, ['E'], null).items.map((i) => i.root)).toEqual([
      'D',
      'E',
    ]);
  });

  it('refuses what is not a root and the nonexistent perspective', () => {
    const p = base();
    expect(code(() => sendRootsToPerspective(p, 'Q', ['a1'], null))).toBe('not-root');
    expect(code(() => sendRootsToPerspective(p, 'Q', ['zzz'], null))).toBe('not-root');
    expect(code(() => sendRootsToPerspective(p, 'zzz', ['D'], null))).toBe('not-found');
  });

  it('the source can be a perspective: the distance is the one the root has there', () => {
    const p: Project = {
      ...linked(),
      perspectives: [
        persp('Q', 'Screens', [['S2', 100, 100]]),
        persp('O', 'Origem', [
          ['S2', 0, 0],
          ['X', 0, 700],
        ]),
      ],
    };
    const source = p.perspectives[1] as Perspective;
    const next = sendRootsToPerspective(p, 'Q', ['X'], source);
    expect(next.perspectives[0]?.items.at(-1)).toEqual({ root: 'X', x: 100, y: 800 });
  });
});

describe('tirar da perspectiva', () => {
  it('removes the root from the perspective and deletes nothing from the project', () => {
    const p = {
      ...base(),
      perspectives: [
        persp('P', 'Flow', [
          ['D', 1, 2],
          ['H', 3, 4],
        ]),
      ],
    };
    const next = removeRootsFromPerspective(p, 'P', ['D', 'zzz']);
    expect(next.perspectives[0]?.items).toEqual([{ root: 'H', x: 3, y: 4 }]);
    expect({ ...next, perspectives: p.perspectives }).toEqual(p);
    expect(code(() => removeRootsFromPerspective(p, 'zzz', ['D']))).toBe('not-found');
  });

  it('with nothing to remove returns the same perspective', () => {
    const target = persp('P', 'Flow', [['D', 1, 2]]);
    expect(removeRoots(target, ['E'])).toBe(target);
  });
});

describe('mover na perspectiva', () => {
  const p = {
    ...base(),
    perspectives: [
      persp('P', 'Flow', [
        ['D', 10, 20],
        ['H', 30, 40],
      ]),
    ],
  };

  it('changes only the position in the perspective', () => {
    const next = moveRootsInPerspective(p, 'P', [
      { root: 'D', dx: 5.5, dy: -20 },
      { root: 'H', dx: 1, dy: 2 },
    ]);
    expect(next.perspectives[0]?.items).toEqual([
      { root: 'D', x: 15.5, y: 0 },
      { root: 'H', x: 31, y: 42 },
    ]);
    expect({ ...next, perspectives: p.perspectives }).toEqual(p);
  });

  it('marking: integer offset, otherwise rect-not-integer; a root outside the perspective fails', () => {
    expect(
      code(() => moveRootsInPerspective(p, 'P', [{ root: 'H', dx: 0.5, dy: 0 }])),
    ).toBe('rect-not-integer');
    expect(
      code(() => moveRootsInPerspective(p, 'P', [{ root: 'E', dx: 1, dy: 0 }])),
    ).toBe('not-found');
    expect(code(() => moveRootsInPerspective(p, 'zzz', []))).toBe('not-found');
  });

  it("the stored position has at most 6 decimal places (the gesture's y, with no floating-point tail)", () => {
    const next = moveRootsInPerspective(p, 'P', [
      { root: 'D', dx: 0.1 + 0.2, dy: 250.2979740000001 },
    ]);
    expect(next.perspectives[0]?.items[0]).toEqual({ root: 'D', x: 10.3, y: 270.297974 });
  });

  it('a zero offset returns the same perspective; the value version too', () => {
    const target = p.perspectives[0] as Perspective;
    expect(moveRoots(p, target, [{ root: 'D', dx: 0, dy: 0 }])).toBe(target);
  });
});

describe('camadas escondidas', () => {
  it("only layers that exist, without repeating, in the project's layer order", () => {
    const p = {
      ...addLayer(base(), { id: 'L2', name: 'Two', color: '#1E88E5' }),
    };
    const next = setPerspectiveHiddenLayers(p, 'P', ['L2', 'fantasma', 'L1', 'L2']);
    expect(next.perspectives[0]?.hiddenLayers).toEqual(['L1', 'L2']);
    expect(code(() => setPerspectiveHiddenLayers(p, 'zzz', []))).toBe('not-found');
  });
});
