import { describe, expect, it } from 'vitest';
import {
  ModelError,
  addTypedAnnotation,
  canDeleteItems,
  canMoveItems,
  containerDeletionImpact,
  createMarking,
  itemsDeletionImpact,
  markingDeletionImpact,
  moveItems,
  movingItems,
  removeContainer,
  removeItems,
  removeMarking,
  selectionWithContents,
  setFieldValue,
  setImageLocked,
  setItemsLocked,
  setMarkingLocked,
  settleHierarchy,
  type ItemRef,
} from '../../src/model';
import { expectValid, image, marking } from './fixtures';
import {
  container,
  mk,
  multiProject,
  multiProjectAnnotated,
  rect,
} from './multiSelectionFixtures';
import { cadastroProject, layerOf } from './specFixtures';

const img = (id: string): ItemRef => ({ kind: 'image', id });
const mark = (id: string): ItemRef => ({ kind: 'marking', id });

/** Roda a operação e devolve o código do erro de regra (ou `null` se passou). */
function codeOf(op: () => unknown): string | null {
  try {
    op();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

const ids = (items: readonly ItemRef[]) => items.map((i) => `${i.kind}:${i.id}`);

describe('movingItems: quem recebe deslocamento próprio', () => {
  const p = multiProject();

  it('descarta inexistentes e repetidos, na ordem dos itens', () => {
    const items = [
      mark('G'),
      mark('G'),
      mark('nada'),
      img('nada'),
      img('C'),
      img('C'),
      mark('N'),
    ];
    expect(ids(movingItems(p, items))).toEqual(['marking:G', 'image:C', 'marking:N']);
    expect(movingItems(p, [])).toEqual([]);
  });

  it('descarta a marcação de um container selecionado: o container a leva', () => {
    expect(ids(movingItems(p, [mark('a1'), img('A'), mark('b1')]))).toEqual([
      'image:A',
      'marking:b1',
    ]);
  });

  it('descarta a marcação de container que tem uma ancestral selecionada', () => {
    // a2 › a1: mover a1 dentro do container leva a2.
    expect(ids(movingItems(p, [mark('a2'), mark('a1')]))).toEqual(['marking:a1']);
    expect(ids(movingItems(p, [mark('a2')]))).toEqual(['marking:a2']);
    // a3 não é descendente de a1: fica.
    expect(ids(movingItems(p, [mark('a1'), mark('a3'), mark('a2')]))).toEqual([
      'marking:a1',
      'marking:a3',
    ]);
  });

  it('no canvas nada é descartado por ancestral: mover uma marcação não leva nada', () => {
    // G2 está dentro de G; os containers A, B e C estão dentro delas; N é flutuante.
    const items = [mark('G'), mark('G2'), img('A'), img('B'), mark('N'), mark('H')];
    expect(ids(movingItems(p, items))).toEqual(ids(items));
  });
});

describe('canMoveItems', () => {
  it('falso sem nada para mover; verdadeiro com itens livres', () => {
    const p = multiProject();
    expect(canMoveItems(p, [])).toBe(false);
    expect(canMoveItems(p, [mark('nada'), img('nada')])).toBe(false);
    expect(canMoveItems(p, [img('A'), mark('G'), mark('b1')])).toBe(true);
  });

  it('a geometria travada de um item que se move bloqueia o conjunto', () => {
    const p = setMarkingLocked(multiProject(), 'N', true);
    expect(canMoveItems(p, [img('A'), mark('N')])).toBe(false);
    expect(canMoveItems(p, [img('A')])).toBe(true);
    const q = setImageLocked(multiProject(), 'A', true);
    expect(canMoveItems(q, [img('A'), img('D')])).toBe(false);
    expect(canMoveItems(q, [img('D')])).toBe(true);
  });

  it('item descartado não conta: a marcação trancada vai com o container ou a mãe', () => {
    const p = setMarkingLocked(setMarkingLocked(multiProject(), 'a1', true), 'a2', true);
    expect(canMoveItems(p, [mark('a1')])).toBe(false);
    expect(canMoveItems(p, [mark('a2')])).toBe(false); // herdada de a1
    expect(canMoveItems(p, [img('A'), mark('a1')])).toBe(true);
    expect(canMoveItems(p, [mark('a1'), mark('a2'), img('D')])).toBe(false);
  });

  it('a trava de uma marcação do canvas desce aos containers dentro dela', () => {
    const p = setMarkingLocked(multiProject(), 'G', true);
    expect(canMoveItems(p, [img('B')])).toBe(false); // pai G
    expect(canMoveItems(p, [img('A')])).toBe(false); // pai G2, e G é ancestral de G2
    expect(canMoveItems(p, [img('D')])).toBe(true); // fora de G
    expect(canMoveItems(p, [mark('N')])).toBe(true); // flutuante: não é membro de nada
  });
});

describe('moveItems: cada item no próprio espaço', () => {
  it('container, marcação do canvas e marcação de outro container, mantendo as posições', () => {
    const p = multiProject();
    const q = expectValid(moveItems(p, [img('A'), mark('N'), mark('b1')], 100, 50));
    expect(image(q, 'A').placement).toEqual({ x: 100, y: 50, scale: 1 });
    expect(marking(q, 'N').rect).toEqual(rect(200, 1350, 200, 100));
    // B tem escala 2: 100 unidades do canvas são 50 pixels dele; 50 são 25.
    expect(marking(q, 'b1').rect).toEqual(rect(100, 75, 100, 100));
    // Na tela, b1 andou exatamente dx, dy: (2000 + 50·2, 50·2) → (2000 + 100·2, 75·2).
    expect(2000 + 100 * 2 - (2000 + 50 * 2)).toBe(100);
    expect(75 * 2 - 50 * 2).toBe(50);
    // As marcações de A vão com ele (coordenadas relativas): nada muda nelas.
    expect(marking(q, 'a1')).toBe(marking(p, 'a1'));
    expect(marking(q, 'a3')).toBe(marking(p, 'a3'));
    // O que não estava na seleção não se mexe.
    expect(image(q, 'B').placement).toBe(image(p, 'B').placement);
    expect(marking(q, 'G').rect).toBe(marking(p, 'G').rect);
    // O assentar refez o pertencimento: A saiu de G2 (passa de 1050) e ficou em G.
    expect(image(q, 'A').parentId).toBe('G');
  });

  it('marcação de container recebe o deslocamento dividido pela escala e arredondado', () => {
    const p = multiProject();
    // E tem escala 0,5: 10 unidades do canvas são 20 pixels dele.
    expect(marking(moveItems(p, [mark('e1')], 10, -5), 'e1').rect).toEqual(
      rect(120, 90, 200, 200),
    );
    // Decimal: 10,3 / 0,5 = 20,6 → 21.
    expect(marking(moveItems(p, [mark('e1')], 10.3, 0), 'e1').rect.x).toBe(121);
    // B tem escala 2: 6 / 2 = 3.
    expect(marking(moveItems(p, [mark('b1')], 6, 6), 'b1').rect).toEqual(
      rect(53, 53, 100, 100),
    );
  });

  it('marcação do canvas arredonda o deslocamento, flutuante inclusive', () => {
    const p = multiProject();
    const q = moveItems(p, [mark('H'), mark('N')], 10.4, -20.6);
    expect(marking(q, 'H').rect).toEqual(rect(410, 1279, 200, 100));
    expect(marking(q, 'N').rect).toEqual(rect(110, 1279, 200, 100));
    expect(marking(q, 'N').floating).toBe(true);
  });

  it('a marcação de container leva as descendentes, trancadas inclusive', () => {
    const p = setMarkingLocked(multiProject(), 'a2', true);
    const q = moveItems(p, [mark('a1')], 20, 10);
    expect(marking(q, 'a1').rect).toEqual(rect(120, 110, 300, 300));
    expect(marking(q, 'a2').rect).toEqual(rect(170, 160, 100, 100));
    expect(marking(q, 'a3')).toBe(marking(p, 'a3'));
    // Com a mãe e a filha selecionadas, a filha não recebe deslocamento à parte.
    expect(moveItems(p, [mark('a2'), mark('a1')], 20, 10)).toEqual(q);
  });

  it('a marcação de um container selecionado não recebe deslocamento à parte', () => {
    const p = multiProject();
    const q = moveItems(p, [img('A'), mark('a1')], 100, 0);
    expect(image(q, 'A').placement.x).toBe(100);
    expect(marking(q, 'a1')).toBe(marking(p, 'a1'));
    expect(marking(q, 'a2')).toBe(marking(p, 'a2'));
  });

  it('container sozinho anda pelo deslocamento exato, decimal inclusive', () => {
    const p = multiProject();
    const q = moveItems(p, [img('A')], 10.4, 0.25);
    expect(image(q, 'A').placement).toEqual({ x: 10.4, y: 0.25, scale: 1 });
    expect(marking(q, 'a1')).toBe(marking(p, 'a1'));
  });

  it('com marcação do canvas junto, o deslocamento do canvas é arredondado uma vez para todos', () => {
    const p = multiProject();
    const q = moveItems(p, [mark('G'), img('A'), img('B'), img('C')], 37.6, -12.3);
    expect(marking(q, 'G').rect).toEqual(rect(-62, -112, 5300, 1200));
    expect(image(q, 'A').placement).toEqual({ x: 38, y: -12, scale: 1 });
    expect(image(q, 'B').placement).toEqual({ x: 2038, y: -12, scale: 2 });
    expect(image(q, 'C').placement).toEqual({ x: 4038, y: -12, scale: 1 });
  });

  it('mover os containers e a marcação do canvas que os contém mantém os três como membros', () => {
    // X está colado nas bordas de baixo e da direita de Y (uma marcação do canvas com o mesmo
    // retângulo do container seria dele): qualquer fração a mais no deslocamento do container
    // o tiraria de dentro.
    const base = settleHierarchy({
      ...multiProject(),
      containers: [container('X', 1000, 1000, { x: 100, y: 100, scale: 1 })],
      markings: [mk('Y', null, rect(99, 99, 1001, 1001))],
    });
    expect(image(base, 'X').parentId).toBe('Y');
    const q = expectValid(moveItems(base, [img('X'), mark('Y')], 10.4, 20.6));
    expect(image(q, 'X').placement).toEqual({ x: 110, y: 121, scale: 1 });
    expect(marking(q, 'Y').rect).toEqual(rect(109, 120, 1001, 1001));
    expect(image(q, 'X').parentId).toBe('Y');

    // No projeto grande: G, A, B e C andam juntos e os três continuam em G ou G2.
    const p = multiProject();
    const r = expectValid(
      moveItems(p, [mark('G'), img('A'), img('B'), img('C')], 123.7, 45.2),
    );
    expect(image(r, 'B').parentId).toBe('G');
    expect(image(r, 'C').parentId).toBe('G');
    expect(['G', 'G2']).toContain(image(r, 'A').parentId);
  });

  it('mover só dois containers para fora da marcação os tira dela', () => {
    const p = multiProject();
    expect(image(p, 'B').parentId).toBe('G');
    const q = expectValid(moveItems(p, [img('A'), img('B')], 0, 3000));
    expect(image(q, 'A').parentId).toBeNull();
    expect(image(q, 'B').parentId).toBeNull();
    expect(image(q, 'C').parentId).toBe('G');
  });

  it('mover a marcação do canvas sozinha não leva os containers dentro dela (observadora)', () => {
    const p = multiProject();
    const q = expectValid(moveItems(p, [mark('G')], 3000, 0));
    expect(marking(q, 'G').rect).toEqual(rect(2900, -100, 5300, 1200));
    for (const c of p.containers) expect(image(q, c.id).placement).toEqual(c.placement);
    expect(marking(q, 'G2').rect).toEqual(marking(p, 'G2').rect);
    // O assentar reavalia: A e B ficaram para trás, C continua dentro e D entrou.
    expect(image(q, 'A').parentId).toBe('G2');
    expect(image(q, 'B').parentId).toBeNull();
    expect(image(q, 'C').parentId).toBe('G');
    expect(image(q, 'D').parentId).toBe('G');
  });

  it('uma marcação do canvas que acaba inteira dentro de um container vira dele', () => {
    const p = multiProject();
    // H (400,1300) sobe para (400,300): dentro de A.
    const inA = expectValid(moveItems(p, [mark('H')], 0, -1000));
    expect(marking(inA, 'H')).toMatchObject({
      containerId: 'A',
      rect: rect(400, 300, 200, 100),
    });
    // Para dentro de B (escala 2): (2400,200) no canvas são (200,100) em pixels dele, 100×50.
    const inB = expectValid(moveItems(p, [mark('H')], 2000, -1100));
    expect(marking(inB, 'H')).toMatchObject({
      containerId: 'B',
      rect: rect(200, 100, 100, 50),
    });
    // A flutuante nunca troca de espaço.
    const note = moveItems(p, [mark('N')], 0, -1000);
    expect(marking(note, 'N')).toMatchObject({ containerId: null, floating: true });
  });

  it('settle: false é a prévia: o pertencimento fica congelado', () => {
    const p = multiProject();
    const preview = moveItems(p, [img('A'), img('B')], 0, 3000, { settle: false });
    expect(image(preview, 'A').placement.y).toBe(3000);
    expect(image(preview, 'A').parentId).toBe('G2');
    expect(image(preview, 'B').parentId).toBe('G');
    expect(settleHierarchy(preview)).toEqual(moveItems(p, [img('A'), img('B')], 0, 3000));
  });
});

describe('moveItems: tudo ou nada', () => {
  it('container que passa a sobrepor um container que não se move falha', () => {
    const p = multiProject();
    // A (1500..2500) cai em cima de B (2000..3000).
    expect(codeOf(() => moveItems(p, [img('A')], 1500, 0))).toBe('image-overlap');
    // A e B juntos: B (3500..4500) cai em cima de C, que não se move.
    expect(codeOf(() => moveItems(p, [img('A'), img('B')], 1500, 0))).toBe(
      'image-overlap',
    );
    // Um item válido junto de um inválido não vale: nada é movido.
    expect(codeOf(() => moveItems(p, [mark('N'), img('C')], 3000, 0))).toBe(
      'image-overlap',
    );
  });

  it('os containers movidos não são testados entre si', () => {
    const p = multiProject();
    // A vai para onde B estava, B para onde C estava, C encosta em D (7000): sem sobreposição.
    const q = expectValid(moveItems(p, [img('A'), img('B'), img('C')], 2000, 0));
    expect(image(q, 'A').placement.x).toBe(2000);
    expect(image(q, 'B').placement.x).toBe(4000);
    expect(image(q, 'C').placement.x).toBe(6000);
    // B e C juntos, 3000: C (7000..8000) cai em cima de D.
    expect(codeOf(() => moveItems(p, [img('B'), img('C')], 3000, 0))).toBe(
      'image-overlap',
    );
  });

  it('marcação de container que sairia do container falha, nas duas direções', () => {
    const p = multiProject();
    // c1 está colada no canto de baixo à direita de C (escala 1).
    expect(codeOf(() => moveItems(p, [mark('c1')], 10, 0))).toBe('rect-out-of-image');
    expect(codeOf(() => moveItems(p, [mark('a1')], -200, 0))).toBe('rect-out-of-image');
    // Em B (500 px, escala 2), 1000 unidades do canvas são 500 pixels.
    expect(codeOf(() => moveItems(p, [mark('b1')], 1000, 0))).toBe('rect-out-of-image');
    // a3 (600..800 em A) pode ir até a borda (dx 200) e nem um pixel além.
    expect(codeOf(() => moveItems(p, [mark('a3')], 200, 0))).toBeNull();
    expect(codeOf(() => moveItems(p, [mark('a3')], 201, 0))).toBe('rect-out-of-image');
    // Um item inválido junto de um válido: o conjunto inteiro falha.
    expect(codeOf(() => moveItems(p, [mark('N'), mark('c1')], 10, 0))).toBe(
      'rect-out-of-image',
    );
  });

  it('item travado bloqueia o conjunto inteiro', () => {
    const locked = setMarkingLocked(multiProject(), 'N', true);
    expect(codeOf(() => moveItems(locked, [img('A'), mark('N')], 10, 10))).toBe('locked');
    expect(codeOf(() => moveItems(locked, [img('A')], 10, 10))).toBeNull();
    const container = setImageLocked(multiProject(), 'A', true);
    expect(codeOf(() => moveItems(container, [img('D'), img('A')], 10, 10))).toBe(
      'locked',
    );
    // Marcação trancada, ou com ancestral trancado, no container.
    const inner = setMarkingLocked(multiProject(), 'a1', true);
    expect(codeOf(() => moveItems(inner, [mark('a1')], 10, 10))).toBe('locked');
    expect(codeOf(() => moveItems(inner, [mark('a2')], 10, 10))).toBe('locked');
    // O item descartado não conta: o container leva a marcação trancada.
    expect(codeOf(() => moveItems(inner, [img('A'), mark('a1')], 10, 10))).toBeNull();
  });

  it('a trava de uma marcação do canvas alcança o placement dos containers dentro dela', () => {
    const p = setMarkingLocked(multiProject(), 'G', true);
    expect(codeOf(() => moveItems(p, [img('B')], 10, 10))).toBe('locked');
    expect(codeOf(() => moveItems(p, [img('A')], 10, 10))).toBe('locked');
    expect(codeOf(() => moveItems(p, [img('D'), mark('N')], 10, 10))).toBeNull();
  });

  it('deslocamento zero, ou nada para mover, devolve o mesmo projeto sem conferir a trava', () => {
    const p = setMarkingLocked(multiProject(), 'N', true);
    expect(moveItems(p, [mark('N')], 0, 0)).toBe(p);
    expect(moveItems(p, [], 5, 5)).toBe(p);
    expect(moveItems(p, [mark('nada'), img('nada')], 5, 5)).toBe(p);
    // O arredondamento zera o deslocamento da marcação do canvas: nada mudou.
    const q = multiProject();
    expect(moveItems(q, [mark('H')], 0.3, -0.2)).toBe(q);
    expect(moveItems(q, [mark('e1')], 0.2, 0.2)).toBe(q); // 0,2 / 0,5 = 0,4 → 0
  });

  it('o deslocamento precisa ser finito', () => {
    const p = multiProject();
    expect(codeOf(() => moveItems(p, [img('A')], Number.NaN, 0))).toBe(
      'invalid-placement',
    );
    expect(codeOf(() => moveItems(p, [img('A')], 0, Number.POSITIVE_INFINITY))).toBe(
      'invalid-placement',
    );
  });
});

describe('selectionWithContents', () => {
  const p = multiProject();

  it('marcação do canvas: o conteúdo em profundidade e ela por último', () => {
    // G › G2 › A › (a1 › a2, a3); G › B › b1; G › C › c1. D, E, H e a flutuante N ficam de fora.
    expect(ids(selectionWithContents(p, 'G'))).toEqual([
      'marking:G2',
      'image:A',
      'marking:a1',
      'marking:a2',
      'marking:a3',
      'image:B',
      'marking:b1',
      'image:C',
      'marking:c1',
      'marking:G',
    ]);
    expect(ids(selectionWithContents(p, 'G2'))).toEqual([
      'image:A',
      'marking:a1',
      'marking:a2',
      'marking:a3',
      'marking:G2',
    ]);
  });

  it('marcação de container: só as descendentes', () => {
    expect(ids(selectionWithContents(p, 'a1'))).toEqual(['marking:a2', 'marking:a1']);
    expect(ids(selectionWithContents(p, 'a3'))).toEqual(['marking:a3']);
  });

  it('as flutuantes não cobrem nem são cobertas; a própria flutuante entra sozinha', () => {
    expect(ids(selectionWithContents(p, 'N'))).toEqual(['marking:N']);
    expect(ids(selectionWithContents(p, 'H'))).toEqual(['marking:H']);
    // Uma flutuante sobre G, com G contendo-a geometricamente, não vira conteúdo.
    const q = settleHierarchy({
      ...p,
      markings: [
        ...p.markings,
        mk('F', null, rect(100, 100, 50, 50), { floating: true }),
      ],
    });
    expect(marking(q, 'F').parentId).toBeNull();
    expect(ids(selectionWithContents(q, 'G'))).not.toContain('marking:F');
  });

  it('marcação inexistente falha com not-found', () => {
    expect(codeOf(() => selectionWithContents(p, 'nada'))).toBe('not-found');
  });

  it('o resultado serve de entrada ao arrasto conjunto: move tudo mantendo as posições', () => {
    const items = selectionWithContents(p, 'G');
    expect(canMoveItems(p, items)).toBe(true);
    // As marcações dos containers são descartadas (os containers as levam), o resto anda.
    expect(ids(movingItems(p, items))).toEqual([
      'marking:G2',
      'image:A',
      'image:B',
      'image:C',
      'marking:G',
    ]);
    const q = expectValid(moveItems(p, items, 55.5, 20.4));
    expect(image(q, 'B').parentId).toBe('G');
    expect(image(q, 'C').parentId).toBe('G');
    expect(image(q, 'A').parentId).toBe('G2');
    expect(marking(q, 'a1')).toBe(marking(p, 'a1'));
  });
});

describe('itemsDeletionImpact', () => {
  const p = multiProjectAnnotated();
  const empty = {
    markings: 0,
    containers: 0,
    annotations: 0,
    lockedMarkings: 0,
    containersStay: 0,
    brokenRefs: 0,
  };

  it('nada selecionado, ou só itens inexistentes: tudo zero', () => {
    expect(itemsDeletionImpact(p, [])).toEqual(empty);
    expect(itemsDeletionImpact(p, [mark('nada'), img('nada')])).toEqual(empty);
  });

  it('uma marcação selecionada e a filha dela também: sem dupla contagem', () => {
    expect(itemsDeletionImpact(p, [mark('a1'), mark('a2')])).toEqual({
      ...empty,
      markings: 2,
      annotations: 3,
    });
    // Igual a selecionar só a mãe, e ao impacto de uma marcação só.
    expect(itemsDeletionImpact(p, [mark('a1')])).toEqual(
      itemsDeletionImpact(p, [mark('a1'), mark('a2'), mark('a2')]),
    );
    const single = markingDeletionImpact(p, 'a1');
    expect(itemsDeletionImpact(p, [mark('a1')])).toMatchObject({
      markings: single.descendants + 1,
      annotations: single.annotations,
      containersStay: single.containers,
    });
  });

  it('um container selecionado e uma marcação dele selecionada: a marcação conta uma vez', () => {
    const impact = itemsDeletionImpact(p, [img('A'), mark('a1')]);
    expect(impact).toEqual({ ...empty, markings: 3, containers: 1, annotations: 3 });
    const single = containerDeletionImpact(p, 'A');
    expect(impact).toMatchObject({
      markings: single.markings,
      annotations: single.annotations,
    });
  });

  it('os containers dentro de uma marcação que sai e não foram selecionados ficam', () => {
    // G leva G2; os containers dentro delas são A (de G2), B e C (de G).
    expect(itemsDeletionImpact(p, [mark('G')])).toEqual({
      ...empty,
      markings: 2,
      containersStay: 3,
    });
    // Selecionar B também: ele sai (com b1 e a anotação dela) e deixa de ficar.
    expect(itemsDeletionImpact(p, [mark('G'), img('B')])).toEqual({
      ...empty,
      markings: 3,
      containers: 1,
      annotations: 1,
      containersStay: 2,
    });
  });

  it('conta as trancadas que saem junto, não as selecionadas', () => {
    const locked = setMarkingLocked(p, 'a2', true);
    expect(itemsDeletionImpact(locked, [img('A')]).lockedMarkings).toBe(1);
    expect(itemsDeletionImpact(locked, [mark('a1')]).lockedMarkings).toBe(1);
    expect(itemsDeletionImpact(locked, [mark('a1'), mark('a2')]).lockedMarkings).toBe(0);
    expect(itemsDeletionImpact(locked, [mark('a2')]).lockedMarkings).toBe(0);
    expect(itemsDeletionImpact(locked, [img('B')]).lockedMarkings).toBe(0);
  });

  it('referências que a exclusão quebraria', () => {
    // O sistema de cadastro: AIN, AII e AIE apontam para anotações de MF.
    let q = cadastroProject();
    q = createMarking(q, {
      id: 'MX',
      containerId: 'I1',
      rect: rect(100, 1500, 300, 100),
    });
    q = addTypedAnnotation(q, {
      id: 'AX',
      markingId: 'MX',
      layerId: layerOf(q, 'sdui', 'componentes'),
      type: { specId: 'sdui', typeId: 'input' },
    });
    q = setFieldValue(q, 'AX', 'dado', { annotationId: 'AU', entryId: 'EN' });
    // Excluir MF leva AU e a fonte AX (em MX) fica com a referência quebrada; as outras
    // (AIN, AII, AIE) saem junto com as descendentes de MF.
    expect(itemsDeletionImpact(q, [mark('MF')]).brokenRefs).toBe(1);
    expect(markingDeletionImpact(q, 'MF').brokenRefs).toBe(1);
    // Excluir também MX leva a fonte: nada quebra.
    expect(itemsDeletionImpact(q, [mark('MF'), mark('MX')]).brokenRefs).toBe(0);
  });
});

describe('canDeleteItems', () => {
  it('verdadeiro com itens livres; falso se algum selecionado está trancado', () => {
    const p = multiProject();
    expect(canDeleteItems(p, [mark('G'), img('A'), mark('a1')])).toBe(true);
    expect(canDeleteItems(setMarkingLocked(p, 'a1', true), [mark('a1'), img('D')])).toBe(
      false,
    );
    expect(canDeleteItems(setImageLocked(p, 'D', true), [mark('G'), img('D')])).toBe(
      false,
    );
  });

  it('trancada que sai junto com a mãe ou com o container selecionados não impede', () => {
    const p = setMarkingLocked(multiProject(), 'a2', true);
    // a2 é filha de a1 em A.
    expect(canDeleteItems(p, [mark('a2')])).toBe(false);
    expect(canDeleteItems(p, [mark('a1'), mark('a2')])).toBe(true);
    expect(canDeleteItems(p, [img('A'), mark('a2')])).toBe(true);
    expect(canDeleteItems(p, [img('B'), mark('a2')])).toBe(false);
  });

  it('a trava de um ancestral é de geometria e não impede excluir', () => {
    const p = setMarkingLocked(multiProject(), 'a1', true);
    expect(canDeleteItems(p, [mark('a2')])).toBe(true);
    // Descendente trancado sai junto com a mãe, como em canDeleteMarking.
    expect(canDeleteItems(p, [img('A')])).toBe(true);
  });

  it('itens inexistentes são ignorados; sem nada para excluir é falso', () => {
    const p = multiProject();
    expect(canDeleteItems(p, [])).toBe(false);
    expect(canDeleteItems(p, [mark('nada')])).toBe(false);
    expect(canDeleteItems(p, [mark('nada'), mark('H')])).toBe(true);
  });
});

describe('removeItems', () => {
  const p = multiProjectAnnotated();

  it('uma marcação com as descendentes e as anotações, como removeMarking', () => {
    const q = expectValid(removeItems(p, [mark('a1')]));
    expect(q).toEqual(removeMarking(p, 'a1'));
    expect(q.markings.map((m) => m.id)).not.toContain('a2');
    expect(q.annotations.map((a) => a.id)).toEqual(['n4']);
  });

  it('um container com as marcações e anotações, como removeContainer', () => {
    const q = expectValid(removeItems(p, [img('A')]));
    expect(q).toEqual(removeContainer(p, 'A'));
    expect(q.containers.map((c) => c.id)).toEqual(['B', 'C', 'D', 'E']);
  });

  it('nunca exclui um container não selecionado: os de dentro passam ao pai ou a nenhum', () => {
    const q = expectValid(removeItems(p, [mark('G')]));
    expect(q).toEqual(removeMarking(p, 'G'));
    expect(q.containers.map((c) => c.id)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(q.containers.map((c) => c.parentId)).toEqual([null, null, null, null, null]);
    // G2 sai junto com G; os containers e as marcações deles ficam.
    expect(q.markings.map((m) => m.id)).toEqual([
      'a1',
      'a2',
      'a3',
      'b1',
      'c1',
      'e1',
      'N',
      'H',
    ]);
  });

  it('a seleção inteira numa operação, sem contar duas vezes', () => {
    const q = expectValid(
      removeItems(p, [mark('G'), img('A'), mark('a1'), mark('a2'), img('B'), mark('H')]),
    );
    expect(q.containers.map((c) => c.id)).toEqual(['C', 'D', 'E']);
    expect(q.containers.map((c) => c.parentId)).toEqual([null, null, null]);
    expect(q.markings.map((m) => m.id)).toEqual(['c1', 'e1', 'N']);
    expect(q.annotations).toEqual([]);
  });

  it('item trancado falha sem excluir nada; inexistentes são ignorados', () => {
    const locked = setMarkingLocked(p, 'a1', true);
    expect(codeOf(() => removeItems(locked, [mark('H'), mark('a1')]))).toBe('locked');
    // Trancada que sai junto com o container selecionado não barra.
    expect(codeOf(() => removeItems(locked, [img('A'), mark('a1')]))).toBeNull();
    expect(codeOf(() => removeItems(locked, [mark('a1'), img('D')]))).toBe('locked');
    const container = setImageLocked(p, 'D', true);
    expect(codeOf(() => removeItems(container, [mark('H'), img('D')]))).toBe('locked');
    // Descendente trancado sai junto com a mãe, sem barrar.
    expect(codeOf(() => removeItems(locked, [img('A')]))).toBeNull();
    expect(removeItems(p, [mark('nada'), img('nada')])).toBe(p);
    expect(removeItems(p, [])).toBe(p);
  });

  it('settle: false deixa o pertencimento como está', () => {
    const q = removeItems(p, [mark('G')], { settle: false });
    expect(q.containers.map((c) => c.parentId)).toEqual(['G2', 'G', 'G', null, null]);
  });
});

describe('setItemsLocked', () => {
  it('tranca e destranca marcações e containers numa operação', () => {
    const p = multiProject();
    const locked = setItemsLocked(p, [mark('G'), img('A'), mark('a1'), img('D')], true);
    expect(marking(locked, 'G').locked).toBe(true);
    expect(marking(locked, 'a1').locked).toBe(true);
    expect(image(locked, 'A').locked).toBe(true);
    expect(image(locked, 'D').locked).toBe(true);
    // O resto não muda e mantém a identidade.
    expect(marking(locked, 'a2')).toBe(marking(p, 'a2'));
    expect(image(locked, 'B')).toBe(image(p, 'B'));
    expect(
      setItemsLocked(locked, [mark('G'), img('A'), mark('a1'), img('D')], false),
    ).toEqual(p);
  });

  it('só muda o que precisa; nada a mudar devolve o mesmo projeto', () => {
    const p = setMarkingLocked(multiProject(), 'G', true);
    const q = setItemsLocked(p, [mark('G'), mark('H')], true);
    expect(marking(q, 'H').locked).toBe(true);
    expect(q.containers).toBe(p.containers);
    expect(setItemsLocked(q, [mark('G'), mark('H')], true)).toBe(q);
    expect(setItemsLocked(p, [], true)).toBe(p);
    expect(setItemsLocked(p, [mark('nada'), img('nada')], true)).toBe(p);
    // Só containers: as marcações mantêm o array.
    const r = setItemsLocked(p, [img('A')], true);
    expect(r.markings).toBe(p.markings);
  });
});
