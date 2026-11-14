// `canAnchorTo` (R4, decisão 13): quem a lista da seção Âncora oferece é o que `setMarkingAnchor`
// aceitaria, sem tentar e capturar o erro.
import { describe, expect, it } from 'vitest';
import {
  addContainer,
  anchorCandidates,
  canAnchorTo,
  createMarking,
  projectIndex,
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

describe('canAnchorTo: descendentes e seguidores de descendentes (achado 2 do CL2)', () => {
  /** P (grande) contém C; D está ancorada em C; E solta. */
  function nested(): Project {
    let p = scene();
    p = createMarking(p, {
      id: 'P',
      containerId: 'I1',
      rect: { x: 400, y: 400, width: 300, height: 300 },
    });
    p = createMarking(p, {
      id: 'Cc',
      containerId: 'I1',
      rect: { x: 420, y: 420, width: 50, height: 50 },
    });
    p = createMarking(p, {
      id: 'Dd',
      containerId: 'I1',
      rect: { x: 800, y: 420, width: 50, height: 50 },
    });
    return setMarkingAnchor(p, 'Dd', { to: 'Cc' });
  }

  it('recusa um descendente de P e o seguidor (direto ou indireto) de um descendente', () => {
    const p = nested();
    expect(projectIndex(p).markings.get('Cc')?.parentId).toBe('P');
    expect(canAnchorTo(p, 'P', 'Cc')).toBe(false);
    expect(canAnchorTo(p, 'P', 'Dd')).toBe(false);
    expect(() => setMarkingAnchor(p, 'P', { to: 'Cc' })).toThrow();
    expect(() => setMarkingAnchor(p, 'P', { to: 'Dd' })).toThrow();
  });

  it('continua aceitando quem não anda junto com P', () => {
    const p = nested();
    expect(canAnchorTo(p, 'P', 'A')).toBe(true);
    expect(canAnchorTo(p, 'Cc', 'P')).toBe(true);
  });
});

describe('anchorCandidates (achado 7 do CL2)', () => {
  /** M0 grande contendo as outras n-1 (o pior caso de `withAnchoredFollowers`). */
  function crowded(n: number): Project {
    let p = addContainer(emptyProject(), {
      id: 'I1',
      file: 'a.png',
      width: 100000,
      height: 100000,
    });
    p = createMarking(p, {
      id: 'M0',
      containerId: 'I1',
      rect: { x: 0, y: 0, width: 99000, height: 99000 },
    });
    for (let i = 1; i < n; i++) {
      p = createMarking(p, {
        id: `M${i}`,
        containerId: 'I1',
        rect: { x: (i % 100) * 60, y: Math.floor(i / 100) * 60, width: 50, height: 50 },
      });
    }
    return p;
  }

  it('devolve o mesmo que canAnchorTo item a item, na ordem do espaço', () => {
    const p = setMarkingAnchor(scene(), 'B', { to: 'A' });
    for (const id of ['A', 'B', 'C']) {
      const space = p.markings.filter((m) => m.containerId === 'I1');
      expect(anchorCandidates(p, id, space).map((m) => m.id)).toEqual(
        space.filter((m) => canAnchorTo(p, id, m.id)).map((m) => m.id),
      );
    }
    expect(anchorCandidates(p, 'nope', p.markings)).toEqual([]);
  });

  it('o custo cresce linear: 4n marcações custam menos de 6× n (a dona de todas as outras)', () => {
    const time = (n: number): number => {
      const p = crowded(n);
      const space = p.markings.filter((m) => m.containerId === 'I1');
      const start = performance.now();
      anchorCandidates(p, 'M0', space);
      return performance.now() - start;
    };
    // The minimum of a few runs is the cost without scheduler noise: one slow sample on a loaded
    // runner made the ratio flaky, while the 6× limit stays the same.
    const best = (n: number): number =>
      Math.min(...Array.from({ length: 5 }, () => time(n)));
    time(100); // warm-up
    const small = Math.max(best(300), 0.05);
    expect(best(1200) / small).toBeLessThan(6);
  });
});
