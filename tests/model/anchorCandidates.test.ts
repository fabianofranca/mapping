// `canAnchorTo` (R4, decisão 13): quem a lista da seção Âncora oferece é o que `setMarkingAnchor`
// aceitaria, sem tentar e capturar o erro.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  canAnchorTo,
  createMarking,
  setMarkingAnchor,
  type Project,
} from '../../src/model';
import { emptyProject } from './fixtures';

function scene(): Project {
  let p = emptyProject();
  p = addContainer(p, { id: 'I1', file: 'a.png', width: 1000, height: 800 });
  p = addContainer(p, { id: 'I2', file: 'b.png', width: 1000, height: 800 });
  const at = (id: string, containerId: string | null, x: number) =>
    createMarking(p, { id, containerId, rect: { x, y: 10, width: 50, height: 50 } });
  p = at('A', 'I1', 10);
  p = at('B', 'I1', 100);
  p = at('C', 'I1', 200);
  p = at('D', 'I2', 10);
  return createMarking(p, {
    id: 'F',
    containerId: null,
    rect: { x: -3000, y: -3000, width: 50, height: 50 },
  });
}

describe('canAnchorTo', () => {
  it('aceita as outras marcações do mesmo espaço', () => {
    const p = scene();
    expect(canAnchorTo(p, 'A', 'B')).toBe(true);
    expect(canAnchorTo(p, 'A', 'C')).toBe(true);
  });

  it('recusa a própria marcação, a inexistente e a de outro espaço', () => {
    const p = scene();
    expect(canAnchorTo(p, 'A', 'A')).toBe(false);
    expect(canAnchorTo(p, 'A', 'nope')).toBe(false);
    expect(canAnchorTo(p, 'A', 'D')).toBe(false);
    expect(canAnchorTo(p, 'A', 'F')).toBe(false);
  });

  it('recusa quem fecharia um ciclo (a que já depende dela, direta ou transitivamente)', () => {
    let p = scene();
    p = setMarkingAnchor(p, 'B', { to: 'A' });
    p = setMarkingAnchor(p, 'C', { to: 'B' });
    expect(canAnchorTo(p, 'A', 'B')).toBe(false);
    expect(canAnchorTo(p, 'A', 'C')).toBe(false);
    expect(canAnchorTo(p, 'B', 'C')).toBe(false);
    expect(canAnchorTo(p, 'C', 'A')).toBe(true);
  });
});
