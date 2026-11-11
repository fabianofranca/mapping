// MF2: a geometria do contorno com vão (`gapOutlines`): o contorno de sempre, com o raio de cada
// canto, interrompido nos trechos do `Stroke.gaps`; compartilhada pelo Konva e pelo raster.
import { describe, expect, it } from 'vitest';
import { gapOutlines } from '../../../src/model/components/strokeGaps';
import type { Stroke } from '../../../src/model/components/scene';

const stroke = (extra: Partial<Stroke> = {}): Stroke => ({
  paints: [{ type: 'solid', color: '#000' }],
  width: 2,
  align: 'center',
  ...extra,
});

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

describe('gapOutlines', () => {
  const gapped = stroke({ gaps: [{ side: 'top', from: 20, to: 50 }] });
  const lines = gapOutlines(gapped, 100, 40, 6);

  it('com um vão, o contorno é uma linha aberta só: começa onde o vão termina e termina onde ele começa', () => {
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(near(line[0]!.x, 50) && near(line[0]!.y, 0)).toBe(true);
    const last = line[line.length - 1]!;
    expect(near(last.x, 20) && near(last.y, 0)).toBe(true);
  });

  it('nenhum ponto do lado de cima cai dentro do vão', () => {
    for (const p of lines.flat())
      expect(near(p.y, 0) && p.x > 20 + 1e-6 && p.x < 50 - 1e-6).toBe(false);
  });

  it('os quatro cantos seguem o raio (arcos, não pontas retas)', () => {
    const points = lines.flat();
    // O ponto do arco a 45° do canto inferior direito: (100 - 6 + 6·cos45°, 40 - 6 + 6·sin45°).
    const k = 6 * Math.SQRT1_2;
    const corners = [
      [6 - k, 6 - k],
      [94 + k, 6 - k],
      [94 + k, 34 + k],
      [6 - k, 34 + k],
    ];
    for (const [x, y] of corners)
      expect(
        points.some((p) => Math.abs(p.x - x!) < 0.1 && Math.abs(p.y - y!) < 0.1),
      ).toBe(true);
    // e nenhum ponto passa do retângulo
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(-1e-6);
      expect(p.y).toBeGreaterThanOrEqual(-1e-6);
      expect(p.x).toBeLessThanOrEqual(100 + 1e-6);
      expect(p.y).toBeLessThanOrEqual(40 + 1e-6);
    }
  });

  it('dois vãos em lados diferentes dão duas linhas abertas', () => {
    const two = gapOutlines(
      stroke({
        gaps: [
          { side: 'top', from: 20, to: 50 },
          { side: 'bottom', from: 30, to: 60 },
        ],
      }),
      100,
      40,
      6,
    );
    expect(two).toHaveLength(2);
  });

  it('o align inside leva o contorno meia largura para dentro', () => {
    const inside = gapOutlines(
      stroke({ align: 'inside', gaps: [{ side: 'top', from: 20, to: 50 }] }),
      100,
      40,
      6,
    );
    const top = inside.flat().filter((p) => p.x >= 50 && p.x <= 90 && p.y < 3);
    expect(top.length).toBeGreaterThan(0);
    for (const p of top) expect(near(p.y, 1)).toBe(true);
  });

  it('uma pílula (lados retos de tamanho 0) com vão em cima continua uma linha só', () => {
    const pill = gapOutlines(
      stroke({ gaps: [{ side: 'top', from: 30, to: 60 }] }),
      100,
      40,
      20,
    );
    expect(pill).toHaveLength(1);
  });

  it('sem nenhum trecho cortado, não há linhas (vale o contorno de sempre)', () => {
    expect(
      gapOutlines(stroke({ gaps: [{ side: 'top', from: 200, to: 300 }] }), 100, 40, 6),
    ).toEqual([]);
  });
});
