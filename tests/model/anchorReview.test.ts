// Correções da revisão da fase R3 (etapa #1096): a âncora nas operações em lote
// (excluir a seleção, passo de teclado).
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  createMarking,
  removeItems,
  itemsDeletionImpact,
  nudgeItems,
  setMarkingAnchor,
  validateProject,
  type Project,
} from '../../src/model';
import { emptyProject, marking } from './fixtures';

function base(): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 800 });
  const make = (id: string, containerId: string | null, x: number, y: number) =>
    (p = createMarking(p, { id, containerId, rect: { x, y, width: 100, height: 50 } }));
  make('A', 'I1', 100, 100);
  make('B', 'I1', 400, 100);
  make('C', 'I1', 700, 100);
  make('F', null, -500, -500);
  make('G', null, -300, -500);
  return p;
}

const item = (id: string) => ({ kind: 'marking' as const, id });

describe('excluir a seleção solta a âncora de quem apontava', () => {
  it('removeItems da âncora deixa a ancorada com anchor null (sem anchor-missing)', () => {
    let p = setMarkingAnchor(base(), 'B', { to: 'A' });
    p = setMarkingAnchor(p, 'C', { to: 'B' });
    const out = removeItems(p, [item('A')]);
    expect(out.markings.some((m) => m.id === 'A')).toBe(false);
    expect(marking(out, 'B').anchor).toBeNull();
    expect(marking(out, 'C').anchor).toEqual({ to: 'B' });
    expect(validateProject(out)).toEqual([]);
  });

  it('a ancorada também selecionada sai sem deixar rastro e a contagem de impacto confere', () => {
    const p = setMarkingAnchor(base(), 'G', { to: 'F' });
    const out = removeItems(p, [item('F'), item('C')]);
    expect(marking(out, 'G').anchor).toBeNull();
    expect(validateProject(out)).toEqual([]);
    expect(itemsDeletionImpact(p, [item('F')]).markings).toBe(1);
  });
});

describe('passo de teclado leva as ancoradas', () => {
  it('nudgeItems leva a ancorada (container) e a ancorada do canvas', () => {
    let p = setMarkingAnchor(base(), 'B', { to: 'A' });
    p = setMarkingAnchor(p, 'C', { to: 'B' });
    p = setMarkingAnchor(p, 'G', { to: 'F' });
    const moved = nudgeItems(p, [item('A')], 3, 2);
    expect(marking(moved, 'A').rect).toMatchObject({ x: 103, y: 102 });
    expect(marking(moved, 'B').rect).toMatchObject({ x: 403, y: 102 });
    expect(marking(moved, 'C').rect).toMatchObject({ x: 703, y: 102 });
    const canvas = nudgeItems(p, [item('F')], 1, 1);
    expect(marking(canvas, 'G').rect).toMatchObject({ x: -299, y: -499 });
  });

  it('a ancorada que sairia do container faz o passo falhar', () => {
    const p = setMarkingAnchor(base(), 'C', { to: 'A' });
    expect(() => nudgeItems(p, [item('A')], 250, 0)).toThrow(/rect-out-of-image/);
  });
});
