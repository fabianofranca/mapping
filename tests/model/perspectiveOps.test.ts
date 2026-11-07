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

// Operações das perspectivas (v16, decisões 6, 10 e 11). `multiProject`: raízes D (7000,0),
// E (9000,0), G (-100,-100), N (100,1300) e H (400,1300).

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
  perspectives: [persp('P', 'Fluxo', [['D', 1, 2]]), persp('Q', 'Telas')],
});

describe('nome da perspectiva', () => {
  it('vazio, repetido (sem caixa, com espaços) ou livre', () => {
    const names = ['Fluxo', 'Telas'];
    expect(perspectiveNameIssue(names, '   ')).toBe('empty');
    expect(perspectiveNameIssue(names, ' fluxo ')).toBe('taken');
    expect(perspectiveNameIssue(names, 'Novo')).toBeNull();
  });

  it('renomear a si mesma só com outra caixa não é repetido', () => {
    expect(perspectiveNameIssue(['Fluxo'], 'FLUXO', 'Fluxo')).toBeNull();
    expect(perspectiveNameIssue(['Fluxo', 'Telas'], 'telas', 'Fluxo')).toBe('taken');
  });

  it('a versão do projeto também confere os nomes extras (as "Só eu")', () => {
    const p = base();
    expect(projectPerspectiveNameIssue(p, 'telas')).toBe('taken');
    expect(projectPerspectiveNameIssue(p, 'Meu', undefined, ['meu'])).toBe('taken');
    expect(projectPerspectiveNameIssue(p, 'Telas', 'Telas')).toBeNull();
    expect(projectPerspectiveNameIssue(p, 'Novo', undefined, ['Meu'])).toBeNull();
  });
});

describe('buildPerspective: Começar de', () => {
  const p = base();

  it('Principal: todas as raízes nas posições delas', () => {
    const built = buildPerspective(p, { id: 'N1', name: ' Nova ', startFrom: null });
    expect(built).toEqual({
      id: 'N1',
      name: 'Nova',
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

  it('Vazia: sem raízes; o argumento hiddenLayers vale em todas', () => {
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

  it('uma perspectiva: copia raízes, posições e camadas escondidas', () => {
    const from = persp(
      'X',
      'Origem',
      [
        ['E', 5, 6],
        ['H', 7, 8],
      ],
      ['L1'],
    );
    const built = buildPerspective(p, { id: 'N1', name: 'Cópia', startFrom: from });
    expect(built.items).toEqual(from.items);
    expect(built.hiddenLayers).toEqual(['L1']);
    expect(built.items).not.toBe(from.items);
    expect(
      buildPerspective(p, { id: 'N1', name: 'Cópia', startFrom: from, hiddenLayers: [] })
        .hiddenLayers,
    ).toEqual([]);
  });

  it('só leva camadas que existem', () => {
    const built = buildPerspective(p, {
      id: 'N1',
      name: 'V',
      startFrom: null,
      hiddenLayers: ['L1', 'fantasma'],
    });
    expect(built.hiddenLayers).toEqual(['L1']);
  });
});

describe('perspectivas do projeto: acrescentar, renomear, duplicar, apagar', () => {
  it('addPerspective acrescenta no fim e confere nome e id', () => {
    const p = base();
    const next = addPerspective(p, persp('R', 'Nova'));
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

  it('renomear: aceita a mesma com outra caixa, recusa repetido e id inexistente', () => {
    const p = base();
    expect(renamePerspective(p, 'P', 'FLUXO').perspectives[0]?.name).toBe('FLUXO');
    expect(code(() => renamePerspective(p, 'P', 'telas'))).toBe('perspective-name-taken');
    expect(code(() => renamePerspective(p, 'P', ' '))).toBe('perspective-name-empty');
    expect(code(() => renamePerspective(p, 'zzz', 'X'))).toBe('not-found');
  });

  it('duplicar copia as raízes e as camadas com id e nome novos', () => {
    const p = {
      ...base(),
      perspectives: [persp('P', 'Fluxo', [['D', 1, 2]], ['L1'])],
    };
    const next = duplicatePerspective(p, 'P', 'P2', 'Fluxo (cópia)');
    expect(next.perspectives[1]).toEqual({
      id: 'P2',
      name: 'Fluxo (cópia)',
      hiddenLayers: ['L1'],
      items: [{ root: 'D', x: 1, y: 2 }],
    });
    expect(code(() => duplicatePerspective(p, 'P', 'P2', 'fluxo'))).toBe(
      'perspective-name-taken',
    );
    expect(code(() => duplicatePerspective(p, 'zzz', 'P2', 'X'))).toBe('not-found');
  });

  it('apagar não muda nada fora de perspectives (as marcas ficam com fromName)', () => {
    const p: Project = {
      ...base(),
      arrivals: [{ root: 'H', from: 'P', fromName: 'Fluxo' }],
    };
    const next = removePerspective(p, 'P');
    expect(next.perspectives.map((x) => x.id)).toEqual(['Q']);
    expect({ ...next, perspectives: p.perspectives }).toEqual(p);
    expect(code(() => removePerspective(p, 'zzz'))).toBe('not-found');
  });
});

/** Principal com S2 (600,0), a marcação m2 nele, e um container X longe com seta de Xm para m2. */
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
  it('entra pela mesma regra da chegada: perto da referência, sem marca', () => {
    const p: Project = {
      ...linked(),
      perspectives: [persp('Q', 'Telas', [['S2', 100, 100]])],
    };
    const next = sendRootsToPerspective(p, 'Q', ['X'], null);
    // X estava em (9000, 9000) e S2 em (600, 0): na perspectiva, S2 está em (100, 100).
    expect(next.perspectives[0]?.items).toEqual([
      { root: 'S2', x: 100, y: 100 },
      { root: 'X', x: 8500, y: 9100 },
    ]);
    expect(next.arrivals).toEqual([]);
  });

  it('uma de cada vez: a segunda já vê a primeira', () => {
    const p: Project = { ...multiProject(), perspectives: [persp('Q', 'Vazia')] };
    const next = sendRootsToPerspective(p, 'Q', ['D', 'E'], null);
    expect(next.perspectives[0]?.items).toEqual([
      { root: 'D', x: 0, y: 0 },
      { root: 'E', x: 1050, y: 0 },
    ]);
  });

  it('a raiz que já está continua onde está; a versão valor devolve a perspectiva', () => {
    const p = { ...multiProject(), perspectives: [persp('Q', 'Q', [['D', 5, 6]])] };
    const target = p.perspectives[0] as Perspective;
    expect(sendRoots(p, target, ['D'], null)).toBe(target);
    expect(sendRoots(p, target, ['E'], null).items.map((i) => i.root)).toEqual([
      'D',
      'E',
    ]);
  });

  it('recusa quem não é raiz e a perspectiva inexistente', () => {
    const p = base();
    expect(code(() => sendRootsToPerspective(p, 'Q', ['a1'], null))).toBe('not-root');
    expect(code(() => sendRootsToPerspective(p, 'Q', ['zzz'], null))).toBe('not-root');
    expect(code(() => sendRootsToPerspective(p, 'zzz', ['D'], null))).toBe('not-found');
  });

  it('a origem pode ser uma perspectiva: a distância é a que a raiz tem lá', () => {
    const p: Project = {
      ...linked(),
      perspectives: [
        persp('Q', 'Telas', [['S2', 100, 100]]),
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
  it('tira a raiz da perspectiva e não apaga nada do projeto', () => {
    const p = {
      ...base(),
      perspectives: [
        persp('P', 'Fluxo', [
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

  it('sem nada a tirar devolve a mesma perspectiva', () => {
    const target = persp('P', 'Fluxo', [['D', 1, 2]]);
    expect(removeRoots(target, ['E'])).toBe(target);
  });
});

describe('mover na perspectiva', () => {
  const p = {
    ...base(),
    perspectives: [
      persp('P', 'Fluxo', [
        ['D', 10, 20],
        ['H', 30, 40],
      ]),
    ],
  };

  it('muda só a posição na perspectiva', () => {
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

  it('marcação: deslocamento inteiro, senão rect-not-integer; raiz fora da perspectiva falha', () => {
    expect(
      code(() => moveRootsInPerspective(p, 'P', [{ root: 'H', dx: 0.5, dy: 0 }])),
    ).toBe('rect-not-integer');
    expect(
      code(() => moveRootsInPerspective(p, 'P', [{ root: 'E', dx: 1, dy: 0 }])),
    ).toBe('not-found');
    expect(code(() => moveRootsInPerspective(p, 'zzz', []))).toBe('not-found');
  });

  it('deslocamento zero devolve a mesma perspectiva; a versão valor também', () => {
    const target = p.perspectives[0] as Perspective;
    expect(moveRoots(p, target, [{ root: 'D', dx: 0, dy: 0 }])).toBe(target);
  });
});

describe('camadas escondidas', () => {
  it('só camadas que existem, sem repetir, na ordem das camadas do projeto', () => {
    const p = {
      ...addLayer(base(), { id: 'L2', name: 'Dois', color: '#1E88E5' }),
    };
    const next = setPerspectiveHiddenLayers(p, 'P', ['L2', 'fantasma', 'L1', 'L2']);
    expect(next.perspectives[0]?.hiddenLayers).toEqual(['L1', 'L2']);
    expect(code(() => setPerspectiveHiddenLayers(p, 'zzz', []))).toBe('not-found');
  });
});
