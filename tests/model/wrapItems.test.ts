import { describe, expect, it } from 'vitest';
import {
  ModelError,
  WRAP_MARGIN,
  canWrapItems,
  createArrow,
  settleHierarchy,
  wrapItems,
  type ItemRef,
  type Marking,
  type Project,
} from '../../src/model';
import { expectValid } from './fixtures';
import { container, mk, multiProject, rect } from './multiSelectionFixtures';

// Envolver a seleção numa marcação pai (docs/ARCHITECTURE.md, "Marcação pai (Envolver)").
// Fixture: ver tests/model/multiSelectionFixtures.ts.

const img = (id: string): ItemRef => ({ kind: 'image', id });
const mark = (id: string): ItemRef => ({ kind: 'marking', id });

function codeOf(op: () => unknown): string | null {
  try {
    op();
    return null;
  } catch (e) {
    if (e instanceof ModelError) return e.code;
    throw e;
  }
}

const get = (p: Project, id: string): Marking => {
  const m = p.markings.find((x) => x.id === id);
  if (!m) throw new Error(`sem marcação ${id}`);
  return m;
};

/** `multiProject` com marcações extras no fim, assentado. */
function withMarkings(...extra: Marking[]): Project {
  const p = multiProject();
  return settleHierarchy({ ...p, markings: [...p.markings, ...extra] });
}

describe('wrapItems', () => {
  it('a margem é o tamanho mínimo da marcação', () => {
    expect(WRAP_MARGIN).toBe(8);
  });

  it('duas marcações do mesmo container: a nova é do container, com a margem', () => {
    const p = multiProject();
    const next = wrapItems(p, { id: 'W', items: [mark('a1'), mark('a3')] });
    expectValid(next);
    const w = get(next, 'W');
    expect(w).toMatchObject({
      containerId: 'A',
      parentId: null,
      name: null,
      floating: false,
      locked: false,
      needsReview: false,
    });
    expect(w.rect).toEqual(rect(92, 92, 716, 716));
    expect(get(next, 'a1').parentId).toBe('W');
    expect(get(next, 'a3').parentId).toBe('W');
    expect(get(next, 'a2').parentId).toBe('a1');
    // Entra antes da primeira selecionada.
    expect(next.markings.findIndex((m) => m.id === 'W')).toBe(
      next.markings.findIndex((m) => m.id === 'a1') - 1,
    );
  });

  it('a margem é cortada pela borda do container', () => {
    const next = wrapItems(multiProject(), { id: 'W', items: [mark('c1')] });
    expect(get(next, 'W')).toMatchObject({
      containerId: 'C',
      rect: rect(892, 892, 108, 108),
    });
    expect(get(next, 'c1').parentId).toBe('W');
  });

  it('a margem é cortada pelo pai atual do conjunto', () => {
    const p = withMarkings(
      mk('P', 'A', rect(600, 50, 300, 300)),
      mk('x1', 'A', rect(604, 54, 50, 50)),
      mk('x2', 'A', rect(700, 100, 50, 50)),
    );
    expect(get(p, 'x1').parentId).toBe('P');
    const next = wrapItems(p, { id: 'W', items: [mark('x1'), mark('x2')] });
    expectValid(next);
    expect(get(next, 'W').rect).toEqual(rect(600, 50, 158, 108));
    expect(get(next, 'W').parentId).toBe('P');
    expect(get(next, 'x1').parentId).toBe('W');
    expect(get(next, 'x2').parentId).toBe('W');
  });

  it('uma selecionada que já envolve a outra: a nova vira pai da maior', () => {
    const big = mk('m1', 'A', rect(0, 0, 1000, 1000));
    const p = settleHierarchy({
      ...multiProject(),
      markings: [big, mk('m2', 'A', rect(450, 450, 50, 50)), ...multiProject().markings],
    });
    expect(get(p, 'm2').parentId).toBe('m1');
    const next = wrapItems(p, { id: 'W', items: [mark('m1'), mark('m2')] });
    expectValid(next);
    expect(get(next, 'W').rect).toEqual(rect(0, 0, 1000, 1000));
    expect(get(next, 'W').parentId).toBeNull();
    expect(get(next, 'm1').parentId).toBe('W');
    expect(get(next, 'm2').parentId).toBe('m1');
  });

  it('retângulo igual ao do pai atual que vem depois: a nova entra logo depois dele', () => {
    const p = settleHierarchy({
      ...multiProject(),
      markings: [
        mk('m3', 'A', rect(8, 8, 984, 984)),
        mk('m1', 'A', rect(0, 0, 1000, 1000)),
        ...multiProject().markings,
      ],
    });
    expect(get(p, 'm3').parentId).toBe('m1');
    const next = wrapItems(p, { id: 'W', items: [mark('m3')] });
    expectValid(next);
    expect(next.markings.map((m) => m.id).slice(0, 3)).toEqual(['m3', 'm1', 'W']);
    expect(get(next, 'W').parentId).toBe('m1');
    expect(get(next, 'm3').parentId).toBe('W');
  });

  it('containers e marcação do canvas: a nova é do canvas e os containers são filhos', () => {
    const next = wrapItems(multiProject(), {
      id: 'W',
      items: [img('D'), img('E'), mark('H')],
    });
    expectValid(next);
    expect(get(next, 'W')).toMatchObject({
      containerId: null,
      rect: rect(392, -8, 9616, 1416),
    });
    for (const id of ['D', 'E']) {
      expect(next.containers.find((c) => c.id === id)?.parentId).toBe('W');
    }
    expect(get(next, 'H').parentId).toBe('W');
  });

  it('marcações de containers diferentes: a nova é do canvas e envolve os containers', () => {
    const next = wrapItems(multiProject(), { id: 'W', items: [mark('a1'), mark('b1')] });
    expectValid(next);
    // No canvas, cada marcação conta pelo container inteiro: A (0,0)–(1000,1000) e
    // B (2000,0)–(3000,1000).
    expect(get(next, 'W')).toMatchObject({
      containerId: null,
      rect: rect(-8, -8, 3016, 1016),
      parentId: 'G',
    });
    // B passa a ser filho da nova; A segue no G2, que é menor e a nova não envolve.
    expect(next.containers.find((c) => c.id === 'B')?.parentId).toBe('W');
    expect(next.containers.find((c) => c.id === 'A')?.parentId).toBe('G2');
  });

  it('o canvas arredonda o retângulo para fora', () => {
    const p = multiProject();
    // b1 no canvas: (2100,100) 200×200; um container com escala fracionária desloca o retângulo.
    const shifted = {
      ...p,
      containers: p.containers.map((c) =>
        c.id === 'B' ? { ...c, placement: { x: 2000.5, y: 0.5, scale: 2 } } : c,
      ),
    };
    const next = wrapItems(shifted, { id: 'W', items: [img('B'), mark('H')] });
    const r = get(next, 'W').rect;
    expect(Number.isInteger(r.x + r.y + r.width + r.height)).toBe(true);
    expect(r.x).toBe(392);
    expect(r.x + r.width).toBeGreaterThanOrEqual(3001 + WRAP_MARGIN);
  });

  it('ruído de ponto flutuante no placement conta como inteiro: 8 px de margem', () => {
    const base = multiProject();
    const noisy = (id: string, x: number, scale = 1) =>
      container(id, 100, 100, { x, y: 0, scale });
    const wrapOf = (x: number, scale = 1) => {
      const p = { ...base, containers: [noisy('A', 0), noisy('B', x, scale)] };
      return wrapItems(p, { id: 'W', items: [img('A'), img('B')] }).markings.find(
        (m) => m.id === 'W',
      )!.rect;
    };
    // O ruído que o relato achou depois de ir e voltar com um arrasto.
    expect(wrapOf(-2.2737367544323206e-13)).toEqual(rect(-8, -8, 116, 116));
    // Ruído abaixo e acima de um inteiro, nas bordas esquerda e direita.
    const alone = (x: number) =>
      wrapItems(
        { ...base, containers: [noisy('B', x)] },
        { id: 'W', items: [img('B')] },
      ).markings.find((m) => m.id === 'W')!.rect;
    expect(alone(211.99999999999977)).toEqual(rect(204, -8, 116, 116));
    expect(alone(100.00000000000023)).toEqual(rect(92, -8, 116, 116));
    // Fração de verdade: o retângulo inteiro cobre, com margem entre 8 e 9.
    expect(alone(1868.13)).toEqual(rect(1860, -8, 117, 116));
  });

  it('só seta e nota flutuante: não dá para envolver', () => {
    const p = createArrow(multiProject(), { id: 'S', from: 'a1', to: 'a3' });
    const items: ItemRef[] = [{ kind: 'arrow', id: 'S' }, mark('N')];
    expect(canWrapItems(p, items)).toBe(false);
    expect(codeOf(() => wrapItems(p, { id: 'W', items }))).toBe('invalid-parent');
    expect(canWrapItems(p, [...items, mark('H')])).toBe(true);
  });

  it('nota e seta misturadas com marcações são ignoradas', () => {
    const p = createArrow(multiProject(), { id: 'S', from: 'a1', to: 'a3' });
    const items: ItemRef[] = [
      mark('a1'),
      mark('a3'),
      mark('N'),
      { kind: 'arrow', id: 'S' },
    ];
    const next = wrapItems(p, { id: 'W', items });
    expect(get(next, 'W').rect).toEqual(rect(92, 92, 716, 716));
    expect(get(next, 'N').parentId).toBeNull();
    expect(next.arrows).toEqual(p.arrows);
  });

  it('uma marcação não selecionada dentro do retângulo também vira filha', () => {
    const p = withMarkings(mk('u', 'A', rect(595, 595, 10, 10)));
    expect(get(p, 'u').parentId).toBeNull();
    const next = wrapItems(p, { id: 'W', items: [mark('a3')] });
    expect(get(next, 'W').rect).toEqual(rect(592, 592, 216, 216));
    expect(get(next, 'u').parentId).toBe('W');
  });

  it('id duplicado falha; itens inexistentes não contam', () => {
    const p = multiProject();
    expect(codeOf(() => wrapItems(p, { id: 'a1', items: [mark('a3')] }))).toBe(
      'duplicate-id',
    );
    expect(codeOf(() => wrapItems(p, { id: 'W', items: [mark('nope')] }))).toBe(
      'invalid-parent',
    );
  });

  it('não muda as marcações travadas: a trava não impede', () => {
    const p = multiProject();
    const locked = {
      ...p,
      markings: p.markings.map((m) => (m.id === 'a1' ? { ...m, locked: true } : m)),
    };
    const next = wrapItems(locked, { id: 'W', items: [mark('a1')] });
    expect(get(next, 'a1')).toMatchObject({ locked: true, rect: get(p, 'a1').rect });
  });
});

// Um item só (etapa Envolver, EV1, decisão 4): o resultado é o do `wrapItems` de hoje.
describe('wrapItems com um item só', () => {
  it('marcação de container: a nova é do container, com a margem', () => {
    const next = wrapItems(multiProject(), { id: 'W', items: [mark('a3')] });
    expectValid(next);
    expect(get(next, 'W')).toMatchObject({
      containerId: 'A',
      parentId: null,
      rect: rect(592, 592, 216, 216),
    });
    expect(get(next, 'a3').parentId).toBe('W');
  });

  it('marcação do canvas: a nova é do canvas, com a margem', () => {
    const next = wrapItems(multiProject(), { id: 'W', items: [mark('H')] });
    expectValid(next);
    expect(get(next, 'W')).toMatchObject({
      containerId: null,
      floating: false,
      rect: rect(392, 1292, 216, 116),
    });
    expect(get(next, 'H').parentId).toBe('W');
  });

  it('container: a nova é do canvas e o container vira filho', () => {
    const next = wrapItems(multiProject(), { id: 'W', items: [img('D')] });
    expectValid(next);
    const w = get(next, 'W');
    expect(w.containerId).toBeNull();
    expect(w.rect).toEqual(rect(6992, -8, 1016, 1016));
    expect(next.containers.find((c) => c.id === 'D')?.parentId).toBe('W');
  });

  it('marcação que ocupa o container inteiro: a nova tem o mesmo retângulo, sem falhar', () => {
    const full = mk('full', 'D', rect(0, 0, 1000, 1000));
    const p = settleHierarchy({
      ...multiProject(),
      markings: [...multiProject().markings, full],
    });
    expect(canWrapItems(p, [mark('full')])).toBe(true);
    const next = wrapItems(p, { id: 'W', items: [mark('full')] });
    expectValid(next);
    expect(get(next, 'W')).toMatchObject({
      containerId: 'D',
      rect: rect(0, 0, 1000, 1000),
    });
    expect(get(next, 'full').parentId).toBe('W');
  });

  it('nota (flutuante) sozinha: não entra e falha com invalid-parent', () => {
    const p = multiProject();
    expect(canWrapItems(p, [mark('N')])).toBe(false);
    expect(codeOf(() => wrapItems(p, { id: 'W', items: [mark('N')] }))).toBe(
      'invalid-parent',
    );
  });
});
