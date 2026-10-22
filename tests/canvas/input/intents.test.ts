import { describe, expect, it } from 'vitest';
import {
  cursorFor,
  dragModeOf,
  intentAt,
  isRepeatTap,
  tapSelection,
  type IntentContext,
} from '../../../src/canvas/input/intents';
import {
  createMarking,
  setImageLocked,
  setMarkingFloating,
  setMarkingLocked,
  type Project,
} from '../../../src/model';
import type { SelectionItem } from '../../../src/store/ui';
import { canvasProject } from '../harness';

const project = canvasProject();

/**
 * `canvasProject` com uma marcação do canvas C1 (-100, -100, 1800×1000) em volta de I1
 * (0..1000 × 0..800) e I2 (1100..1600 × 0..500), uma marcação C2 do canvas fora delas
 * (2000..2200 × 100..300) e uma flutuante N1 sobre a Porta (400..600 × 400..500).
 */
function spatialProject(): Project {
  let p = createMarking(project, {
    id: 'C1',
    containerId: null,
    rect: { x: -100, y: -100, width: 1800, height: 1000 },
    name: 'Grupo',
  });
  p = createMarking(p, {
    id: 'C2',
    containerId: null,
    rect: { x: 2000, y: 100, width: 200, height: 200 },
  });
  return createMarking(p, {
    id: 'N1',
    containerId: null,
    rect: { x: 400, y: 400, width: 200, height: 100 },
    floating: true,
  });
}
const ctx = (overrides: Partial<IntentContext> = {}): IntentContext => ({
  project,
  readOnly: false,
  mode: 'navigate',
  selection: null,
  // Sem `items` explícito, a seleção é só o primário (o caso de um item).
  items: overrides.selection ? [overrides.selection] : [],
  zoom: 1,
  spaceDown: false,
  ...overrides,
});
const NONE = new Map();

describe('intentAt', () => {
  it('sem seleção, arrastar faz pan', () => {
    expect(intentAt(ctx(), { x: 150, y: 150 })).toEqual({ kind: 'pan' });
  });

  it('marcação selecionada: alça redimensiona, dentro move, fora faz pan', () => {
    const c = ctx({ selection: { kind: 'marking', id: 'M1' } });
    expect(intentAt(c, { x: 102, y: 98 })).toEqual({
      kind: 'resize-marking',
      markingId: 'M1',
      corner: 'nw',
    });
    expect(intentAt(c, { x: 400, y: 400 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
    expect(intentAt(c, { x: 900, y: 700 })).toEqual({ kind: 'pan' });
  });

  it('imagem selecionada: alça de 44 px de tela, independente do zoom', () => {
    const c = ctx({ selection: { kind: 'image', id: 'I2' }, zoom: 2 });
    // 10 unidades do canvas = 20 px de tela do canto: dentro do raio de 22.
    expect(intentAt(c, { x: 1610, y: 510 })).toEqual({
      kind: 'resize-image',
      containerId: 'I2',
      corner: 'se',
    });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({
      kind: 'move-image',
      containerId: 'I2',
    });
  });

  it('modo Desenhar: sobre uma imagem desenha presa a ela (mesmo nas alças); no vazio, desenha no canvas', () => {
    const c = ctx({ mode: 'draw', selection: { kind: 'marking', id: 'M1' } });
    expect(intentAt(c, { x: 100, y: 100 })).toEqual({ kind: 'draw', containerId: 'I1' });
    expect(intentAt(c, { x: 1050, y: 100 })).toEqual({ kind: 'draw', containerId: null });
  });

  it('modo Desenhar: pan só com Espaço (o botão do meio e a roda são do ponteiro)', () => {
    const c = ctx({ mode: 'draw', spaceDown: true });
    expect(intentAt(c, { x: 1050, y: 100 })).toEqual({ kind: 'pan' });
    expect(intentAt(c, { x: 100, y: 100 })).toEqual({ kind: 'pan' });
  });

  it('marcação do canvas selecionada: alças e mover pelo espaço dela (identidade)', () => {
    const p = spatialProject();
    const c = ctx({ project: p, selection: { kind: 'marking', id: 'C2' } });
    expect(intentAt(c, { x: 2002, y: 102 })).toEqual({
      kind: 'resize-marking',
      markingId: 'C2',
      corner: 'nw',
    });
    expect(intentAt(c, { x: 2100, y: 200 })).toEqual({
      kind: 'move-marking',
      markingId: 'C2',
    });
    expect(intentAt(c, { x: 1900, y: 200 })).toEqual({ kind: 'pan' });
  });

  it('marcação de container selecionada usa o espaço do container (escala diferente)', () => {
    // I2 na escala 0,5: M3 (50, 50, 200×200) ocupa 1125..1225 × 25..125 no canvas.
    const scaled = canvasProject();
    const moved = {
      ...scaled,
      containers: scaled.containers.map((i) =>
        i.id === 'I2' ? { ...i, placement: { x: 1100, y: 0, scale: 0.5 } } : i,
      ),
    };
    const c = ctx({ project: moved, selection: { kind: 'marking', id: 'M3' } });
    expect(intentAt(c, { x: 1175, y: 75 })).toEqual({
      kind: 'move-marking',
      markingId: 'M3',
    });
    expect(intentAt(c, { x: 1300, y: 200 })).toEqual({ kind: 'pan' });
  });

  it('Espaço, só leitura ou sem projeto: sempre pan', () => {
    const selection = { kind: 'marking', id: 'M1' } as const;
    const inside = { x: 400, y: 400 };
    expect(intentAt(ctx({ selection, spaceDown: true }), inside)).toEqual({
      kind: 'pan',
    });
    expect(intentAt(ctx({ selection, readOnly: true }), inside)).toEqual({ kind: 'pan' });
    expect(intentAt(ctx({ project: null }), inside)).toEqual({ kind: 'pan' });
  });
});

describe('tapSelection', () => {
  it('seleciona a mais interna; tocar de novo sobe para o pai; fora, a imagem', () => {
    const p = { x: 250, y: 250 };
    const first = tapSelection(project, null, NONE, p, false);
    expect(first).toEqual({ kind: 'marking', id: 'M2' });
    const second = tapSelection(project, first, NONE, p, true);
    expect(second).toEqual({ kind: 'marking', id: 'M1' });
    // Depois da raiz, o container; depois dele, volta à mais interna.
    const third = tapSelection(project, second, NONE, p, true);
    expect(third).toEqual({ kind: 'image', id: 'I1' });
    expect(tapSelection(project, third, NONE, p, true)).toEqual({
      kind: 'marking',
      id: 'M2',
    });
    expect(tapSelection(project, second, NONE, { x: 900, y: 700 }, false)).toEqual({
      kind: 'image',
      id: 'I1',
    });
  });

  it('fora das imagens e sem marcação do canvas (ou sem projeto), limpa a seleção', () => {
    const selection = { kind: 'image', id: 'I1' } as const;
    expect(tapSelection(project, selection, NONE, { x: 1050, y: 0 }, false)).toBeNull();
    expect(tapSelection(null, selection, NONE, { x: 250, y: 250 }, false)).toBeNull();
  });
});

describe('tapSelection com marcações do canvas e flutuantes', () => {
  const p = spatialProject();
  const tap = (
    point: { x: number; y: number },
    selection = null as never,
    repeat = false,
  ) => tapSelection(p, selection, NONE, point, repeat);

  it('dentro de um container: a marcação, os ancestrais, o container e as marcações do canvas que o contêm', () => {
    const at = { x: 250, y: 250 };
    const chain = [
      { kind: 'marking', id: 'M2' },
      { kind: 'marking', id: 'M1' },
      { kind: 'image', id: 'I1' },
      { kind: 'marking', id: 'C1' },
    ] as const;
    let current = tap(at);
    expect(current).toEqual(chain[0]);
    for (const next of [chain[1], chain[2], chain[3], chain[0]]) {
      current = tapSelection(p, current, NONE, at, true);
      expect(current).toEqual(next);
    }
  });

  it('fora dos containers: a marcação do canvas sob o ponto', () => {
    // Entre I1 e I2 (1000..1100), ainda dentro de C1.
    expect(tap({ x: 1050, y: 300 })).toEqual({ kind: 'marking', id: 'C1' });
    // Longe de C1, a marcação do canvas C2.
    expect(tap({ x: 2100, y: 200 })).toEqual({ kind: 'marking', id: 'C2' });
    // No vazio de verdade, nada.
    expect(tap({ x: 1900, y: 900 })).toBeNull();
  });

  it('a flutuante é a primeira a receber o toque onde estiver; tocar de novo desce para o que está embaixo', () => {
    const at = { x: 450, y: 450 }; // N1 está sobre a Porta (M1), dentro de I1 e de C1
    let current = tap(at);
    expect(current).toEqual({ kind: 'marking', id: 'N1' });
    current = tapSelection(p, current, NONE, at, true);
    expect(current).toEqual({ kind: 'marking', id: 'M1' });
    current = tapSelection(p, current, NONE, at, true);
    expect(current).toEqual({ kind: 'image', id: 'I1' });
    current = tapSelection(p, current, NONE, at, true);
    expect(current).toEqual({ kind: 'marking', id: 'C1' });
    current = tapSelection(p, current, NONE, at, true);
    expect(current).toEqual({ kind: 'marking', id: 'N1' });
  });

  it('a flutuante fora de qualquer container também recebe o toque', () => {
    const floating = setMarkingFloating(p, 'C2', true);
    expect(tapSelection(floating, null, NONE, { x: 2100, y: 200 }, false)).toEqual({
      kind: 'marking',
      id: 'C2',
    });
  });

  it('marcações ocultas pela visibilidade não recebem o toque', () => {
    const hidden = new Map([['N1', 'hidden' as const]]);
    expect(tapSelection(p, null, hidden, { x: 450, y: 450 }, false)).toEqual({
      kind: 'marking',
      id: 'M1',
    });
    const hiddenParent = new Map([['C1', 'hidden' as const]]);
    expect(tapSelection(p, null, hiddenParent, { x: 1050, y: 300 }, false)).toBeNull();
  });

  it('o toque cai nas marcações do canvas sobrepostas ao container, ao fim da cadeia', () => {
    // C3 cruza I2 pela borda direita (1500..1800): sobreposta, sem ser pai do container.
    const q = createMarking(p, {
      id: 'C3',
      containerId: null,
      rect: { x: 1500, y: 100, width: 300, height: 200 },
    });
    expect(q.containers.find((i) => i.id === 'I2')?.parentId).toBe('C1');
    const at = { x: 1550, y: 150 };
    const first = tapSelection(q, null, NONE, at, false);
    expect(first).toEqual({ kind: 'image', id: 'I2' });
    const chain: string[] = [];
    let current = first;
    for (let i = 0; i < 4; i++) {
      current = tapSelection(q, current, NONE, at, true);
      chain.push(current ? `${current.kind}:${current.id}` : 'nada');
    }
    expect(chain).toEqual(['marking:C1', 'marking:C3', 'image:I2', 'marking:C1']);
  });
});

describe('isRepeatTap', () => {
  it('perto do anterior em px de tela (12 px)', () => {
    expect(isRepeatTap(null, { x: 0, y: 0 }, 1)).toBe(false);
    expect(isRepeatTap({ x: 0, y: 0 }, { x: 10, y: 0 }, 1)).toBe(true);
    expect(isRepeatTap({ x: 0, y: 0 }, { x: 10, y: 0 }, 2)).toBe(false);
  });
});

describe('dragModeOf e cursorFor', () => {
  it('classificam a intenção', () => {
    expect(dragModeOf({ kind: 'pan' })).toBe('pan');
    expect(dragModeOf({ kind: 'draw', containerId: 'I1' })).toBe('draw');
    expect(dragModeOf({ kind: 'draw', containerId: null })).toBe('draw');
    expect(dragModeOf({ kind: 'move-image', containerId: 'I1' })).toBe('move');
    expect(dragModeOf({ kind: 'resize-marking', markingId: 'M1', corner: 'ne' })).toBe(
      'resize',
    );
    expect(cursorFor({ kind: 'pan' })).toBe('');
    expect(cursorFor({ kind: 'move-marking', markingId: 'M1' })).toBe('move');
    expect(cursorFor({ kind: 'resize-image', containerId: 'I1', corner: 'se' })).toBe(
      'nwse-resize',
    );
    expect(cursorFor({ kind: 'resize-image', containerId: 'I1', corner: 'ne' })).toBe(
      'nesw-resize',
    );
    expect(cursorFor({ kind: 'draw', containerId: 'I1' })).toBe('crosshair');
    expect(cursorFor({ kind: 'draw', containerId: null })).toBe('crosshair');
  });
});

describe('trava (etapa 2.5)', () => {
  const lockedMarking = (id: string) => setMarkingLocked(project, id, true);
  const select = (id: string) => ({ kind: 'marking', id }) as const;

  it('marcação selecionada e trancada: sem alças, e arrastar dentro dela é "locked"', () => {
    const c = ctx({ project: lockedMarking('M1'), selection: select('M1') });
    // O canto onde ficaria a alça também é só "locked".
    expect(intentAt(c, { x: 102, y: 102 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 400, y: 400 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 900, y: 700 })).toEqual({ kind: 'pan' });
  });

  it('descendente de um pai trancado também fica sem alças', () => {
    const c = ctx({ project: lockedMarking('M1'), selection: select('M2') });
    expect(intentAt(c, { x: 202, y: 202 })).toEqual({ kind: 'locked' });
  });

  it('pai com um descendente trancado: redimensiona e move normalmente', () => {
    const c = ctx({ project: lockedMarking('M2'), selection: select('M1') });
    expect(intentAt(c, { x: 102, y: 98 })).toMatchObject({ kind: 'resize-marking' });
    expect(intentAt(c, { x: 500, y: 450 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
  });

  it('imagem selecionada e trancada: sem alças e sem mover', () => {
    const c = ctx({
      project: setImageLocked(project, 'I2', true),
      selection: { kind: 'image', id: 'I2' },
    });
    expect(intentAt(c, { x: 1600, y: 500 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 1050, y: 300 })).toEqual({ kind: 'pan' });
  });

  it('o modo Desenhar não é afetado pela trava', () => {
    const c = ctx({
      project: lockedMarking('M1'),
      mode: 'draw',
      selection: select('M1'),
    });
    expect(intentAt(c, { x: 400, y: 400 })).toEqual({ kind: 'draw', containerId: 'I1' });
  });

  it('container dentro de uma marcação do canvas trancada: sem alças e sem mover (trava herdada)', () => {
    const locked = setMarkingLocked(spatialProject(), 'C1', true);
    const c = ctx({ project: locked, selection: { kind: 'image', id: 'I2' } });
    expect(intentAt(c, { x: 1600, y: 500 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({ kind: 'locked' });
    expect(intentAt(c, { x: 1050, y: 300 })).toEqual({ kind: 'pan' });
    // Um container fora da marcação trancada continua livre.
    const free = ctx({
      project: setMarkingLocked(spatialProject(), 'C2', true),
      selection: { kind: 'image', id: 'I2' },
    });
    expect(intentAt(free, { x: 1300, y: 300 })).toEqual({
      kind: 'move-image',
      containerId: 'I2',
    });
  });

  it('marcação do canvas trancada: sem alças; as flutuantes e quem não é descendente seguem livres', () => {
    const locked = setMarkingLocked(spatialProject(), 'C2', true);
    const c = ctx({ project: locked, selection: { kind: 'marking', id: 'C2' } });
    expect(intentAt(c, { x: 2002, y: 102 })).toEqual({ kind: 'locked' });
    const other = ctx({ project: locked, selection: { kind: 'marking', id: 'N1' } });
    expect(intentAt(other, { x: 500, y: 450 })).toEqual({
      kind: 'move-marking',
      markingId: 'N1',
    });
  });

  it('cursor "não permitido" e arrastar tentaria mover', () => {
    expect(cursorFor({ kind: 'locked' })).toBe('not-allowed');
    expect(dragModeOf({ kind: 'locked' })).toBe('move');
  });

  it('tocar continua selecionando o item trancado', () => {
    const p = lockedMarking('M2');
    expect(tapSelection(p, null, NONE, { x: 250, y: 250 }, false)).toEqual({
      kind: 'marking',
      id: 'M2',
    });
  });
});

// Seleção múltipla (etapa Marcações espaciais, ME2): as alças continuam só no primário e
// arrastar dentro de qualquer item selecionado move a seleção toda.
describe('intentAt: seleção múltipla', () => {
  const p = spatialProject();
  const mk = (id: string): SelectionItem => ({ kind: 'marking', id });
  const im = (id: string): SelectionItem => ({ kind: 'image', id });
  /** O primário é o último dos itens, como em `selectedItems`. */
  const multi = (
    items: readonly SelectionItem[],
    overrides: Partial<IntentContext> = {},
  ) => ctx({ project: p, items, selection: items.at(-1) ?? null, ...overrides });

  it('dentro de qualquer item selecionado (container ou marcação) começa o arrasto conjunto', () => {
    const items = [im('I2'), mk('C2'), mk('M2')];
    const c = multi(items);
    const expected = { kind: 'move-items', items };
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual(expected); // dentro de I2
    expect(intentAt(c, { x: 2100, y: 200 })).toEqual(expected); // dentro de C2
    expect(intentAt(c, { x: 250, y: 250 })).toEqual(expected); // dentro de M2 (o primário)
  });

  it('fora de todos os itens selecionados, pan', () => {
    const c = multi([im('I2'), mk('M2')]);
    expect(intentAt(c, { x: 900, y: 700 })).toEqual({ kind: 'pan' }); // I1, não selecionado
    expect(intentAt(c, { x: 1050, y: 300 })).toEqual({ kind: 'pan' }); // entre as telas
  });

  it('as alças são só do primário: as dos outros itens movem a seleção', () => {
    const c = multi([im('I2'), mk('M2')]);
    // Canto SE de M2 (o primário): redimensiona M2.
    expect(intentAt(c, { x: 300, y: 300 })).toEqual({
      kind: 'resize-marking',
      markingId: 'M2',
      corner: 'se',
    });
    // Canto SE de I2 (secundário): é só "dentro de um item selecionado".
    expect(intentAt(c, { x: 1598, y: 498 })).toMatchObject({ kind: 'move-items' });
  });

  it('o primário pode ser um container: as alças dele redimensionam', () => {
    const c = multi([mk('C2'), im('I2')]);
    expect(intentAt(c, { x: 1600, y: 500 })).toEqual({
      kind: 'resize-image',
      containerId: 'I2',
      corner: 'se',
    });
    expect(intentAt(c, { x: 2002, y: 102 })).toMatchObject({ kind: 'move-items' });
  });

  it('algum item travado bloqueia o arrasto inteiro (cursor "não permitido")', () => {
    const locked = setImageLocked(p, 'I2', true);
    const c = multi([im('I2'), mk('C2')], { project: locked });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({ kind: 'locked' }); // sobre o travado
    expect(intentAt(c, { x: 2100, y: 200 })).toEqual({ kind: 'locked' }); // sobre o livre
    expect(intentAt(c, { x: 900, y: 700 })).toEqual({ kind: 'pan' }); // fora de todos
  });

  it('o primário travado não tem alças, mas o arrasto conjunto continua bloqueado', () => {
    const locked = setMarkingLocked(p, 'C2', true);
    const c = multi([im('I2'), mk('C2')], { project: locked });
    expect(intentAt(c, { x: 2002, y: 102 })).toEqual({ kind: 'locked' });
  });

  it('uma marcação oculta pelo modo de exibição não conta como "dentro", mas é movida com a seleção', () => {
    const items = [mk('M2'), im('I2')];
    const visibility = new Map([['M2', 'hidden' as const]]);
    const c = multi(items, { visibility });
    expect(intentAt(c, { x: 250, y: 250 })).toEqual({ kind: 'pan' });
    expect(intentAt(c, { x: 1300, y: 300 })).toEqual({ kind: 'move-items', items });
  });

  it('só um item (ou nenhum): nada muda, vale o primário', () => {
    const one = multi([mk('M1')]);
    expect(intentAt(one, { x: 400, y: 400 })).toEqual({
      kind: 'move-marking',
      markingId: 'M1',
    });
    expect(intentAt(multi([]), { x: 400, y: 400 })).toEqual({ kind: 'pan' });
  });

  it('modo Desenhar, Espaço e só leitura ignoram a seleção múltipla', () => {
    const items = [im('I2'), mk('M2')];
    expect(intentAt(multi(items, { mode: 'draw' }), { x: 1300, y: 300 })).toEqual({
      kind: 'draw',
      containerId: 'I2',
    });
    expect(intentAt(multi(items, { spaceDown: true }), { x: 1300, y: 300 })).toEqual({
      kind: 'pan',
    });
    expect(intentAt(multi(items, { readOnly: true }), { x: 1300, y: 300 })).toEqual({
      kind: 'pan',
    });
  });

  it('o arrasto conjunto é um "mover": cursor de mover e classificação do gesto', () => {
    const intent = { kind: 'move-items', items: [im('I1'), mk('M1')] } as const;
    expect(cursorFor(intent)).toBe('move');
    expect(dragModeOf(intent)).toBe('move');
  });
});
