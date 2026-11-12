// EX6 da etapa "expressões que calculam no formato 4" (#897): o progress-indicator da
// material3-compose desenha o arco (circular) e o comprimento (linear) pela fração, exatos para
// qualquer `progress` de 0 a 1, sem as tabelas de 99 e 101 casos de antes. A regressão contra as
// cenas de antes (tests/fixtures/material3-ex6-v1.json) e os limites de `$switch` e `$eq` ficam aqui.
import { describe, expect, it } from 'vitest';
import { absoluteBoxes, walk } from '../../src/model/components/scene';
import type { PathNode, SceneNode } from '../../src/model/components/scene';
import { solid, spec, text, typeOf } from '../support/material3Library';
import {
  draw,
  drawnPathPoints,
  missingNodes,
  oldScenes,
} from '../support/material3Ex6Fixture';
import type { Drawing, Mode, Values } from '../support/material3Ex6Fixture';

const tokens = spec.tokens!.values as Record<string, unknown>;
const tok = (name: string, mode: Mode = 'light'): string => {
  const value = tokens[name] as string | Record<Mode, string>;
  return typeof value === 'string' ? value : value[mode];
};

const drawCircular = (progress?: unknown, mode: Mode = 'light'): Drawing =>
  draw(
    'progress-indicator',
    { shape: 'circular', ...(progress === undefined ? {} : { progress }) } as Values,
    mode,
  );
const drawLinear = (progress?: unknown, mode: Mode = 'light'): Drawing =>
  draw(
    'progress-indicator',
    { shape: 'linear', ...(progress === undefined ? {} : { progress }) } as Values,
    mode,
  );

const visible = (d: Drawing): SceneNode[] => [...walk(d.root)].filter((n) => n.visible);
const named = (d: Drawing, name: string): SceneNode[] =>
  visible(d).filter((n) => n.name === name);
const names = (d: Drawing): string[] => visible(d).map((n) => n.name);
const rectOf = (d: Drawing, n: SceneNode): number[] => {
  const b = absoluteBoxes(d.root).get(n.id)!;
  return [b.x, b.y, b.width, b.height];
};
const near = (a: number, b: number, eps = 0.01): boolean => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------------------------------------
// Circular: o arco pela fração
// ---------------------------------------------------------------------------------------------

/** O que o Compose faz (ProgressIndicator.kt, 549 a 560): o gap em graus, (4 + 4) / (π × 40) × 360. */
const GAP_SWEEP = ((4 + 4) / (Math.PI * 40)) * 360;
/** O ponto do círculo de raio 18 centrado em (20, 20), a `degrees` graus das 12h no sentido horário. */
const onCircle = (degrees: number): [number, number] => [
  20 + 18 * Math.sin((degrees * Math.PI) / 180),
  20 - 18 * Math.cos((degrees * Math.PI) / 180),
];

function arcOf(d: Drawing, name: string) {
  const node = named(d, name)[0] as PathNode;
  const points = drawnPathPoints(node)!;
  return { node, start: points[0]!, end: points[1]! };
}

describe('EX6 progress-indicator — circular: o arco sai da fração, para qualquer valor', () => {
  it.each([0.333, 0.6667, 0.0123, 0.5, 0.874, 0.9991])(
    'progress %s: o indicador parte das 12h e termina em 360 × p, no raio 18',
    (p) => {
      const d = drawCircular(p);
      const { node, start, end } = arcOf(d, 'indicador');
      const [ex, ey] = onCircle(360 * p);
      expect(start).toMatchObject({ x: 20, y: 2 });
      expect(near(end.x, ex)).toBe(true);
      expect(near(end.y, ey)).toBe(true);
      // o arco é grande quando passa de meia volta, sempre no sentido horário
      expect(end.flags).toBe(`${p > 0.5 ? 1 : 0}1`);
      expect(solid(node.stroke?.paints ?? [])).toBe(tok('primary'));
    },
  );

  it.each([0.333, 0.6667, 0.0123, 0.5, 0.874, 0.9])(
    'progress %s: o trilho vai de 360 × p + gap até -gap (o gap encurta quando o arco é curto)',
    (p) => {
      const d = drawCircular(p);
      const { start, end } = arcOf(d, 'trilho arco');
      const gap = Math.min(360 * p, GAP_SWEEP);
      const [sx, sy] = onCircle(360 * p + gap);
      const [ex, ey] = onCircle(-gap);
      expect(near(start.x, sx)).toBe(true);
      expect(near(start.y, sy)).toBe(true);
      expect(near(end.x, ex)).toBe(true);
      expect(near(end.y, ey)).toBe(true);
      const sweep = 360 - 360 * p - 2 * gap;
      // varredura negativa (falta pouco): o desenho repete o arco ao contrário do Compose
      expect(end.flags).toBe(`${sweep > 180 ? 1 : 0}${sweep >= 0 ? 1 : 0}`);
    },
  );

  it('o ponto final do arco acompanha a fração por todo o intervalo (1.000 valores)', () => {
    for (let i = 1; i < 1000; i++) {
      const p = i / 1000;
      const d = drawCircular(p);
      const { end } = arcOf(d, 'indicador');
      const [ex, ey] = onCircle(360 * p);
      expect(near(end.x, ex, 0.001) && near(end.y, ey, 0.001), `p=${p}`).toBe(true);
    }
  });

  it('em 0 só o trilho inteiro e em 1 só o anel do indicador, sem arco degenerado', () => {
    const zero = drawCircular(0);
    expect(names(zero)).toEqual(['progress indicator', 'circular', 'trilho completo']);
    const one = drawCircular(1);
    expect(names(one)).toEqual(['progress indicator', 'circular', 'anel completo']);
    expect(solid(named(one, 'anel completo')[0]!.stroke?.paints ?? [])).toBe(
      tok('primary'),
    );
  });

  it('valor fora de 0 a 1 é preso (coerceIn do Compose)', () => {
    expect(names(drawCircular(-0.4))).toEqual(names(drawCircular(0)));
    expect(names(drawCircular(1.7))).toEqual(names(drawCircular(1)));
    expect(names(drawCircular(-0))).toEqual(names(drawCircular(0)));
  });

  it('sem progress é o quadro do indeterminado, com o arco de sempre e sem trilho', () => {
    for (const d of [drawCircular(), drawCircular(null), drawCircular('')]) {
      expect(names(d)).toEqual([
        'progress indicator',
        'circular',
        'indicador indeterminado',
      ]);
      expect((named(d, 'indicador indeterminado')[0] as PathNode).d).toBe(
        'M20 2A18 18 0 0 1 21.69 37.92',
      );
    }
  });

  it('as cores seguem os tokens nos modos claro e escuro', () => {
    for (const mode of ['light', 'dark'] as const) {
      const d = drawCircular(0.4, mode);
      const paint = (name: string) => solid(named(d, name)[0]!.stroke?.paints ?? []);
      expect(paint('indicador')).toBe(tok('primary', mode));
      expect(paint('trilho arco')).toBe(tok('secondary-container', mode));
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Linear: o comprimento pela fração
// ---------------------------------------------------------------------------------------------

const WIDTH = 240;

describe('EX6 progress-indicator — linear: o comprimento sai da fração, para qualquer valor', () => {
  it.each([0.333, 0.6667, 0.0123, 0.5, 0.9876])(
    'progress %s: o indicador mede p × a largura, a barra passa 2 (ponta redonda) e a faixa do trilho começa 6 depois (e some no fim da pista)',
    (p) => {
      const d = drawLinear(p);
      const [ix, iy, iw] = rectOf(d, named(d, 'indicador')[0]!);
      expect(near(ix!, 0) && near(iw!, p * WIDTH)).toBe(true);
      const [bx, by, bw, bh] = rectOf(d, named(d, 'barra')[0]!);
      expect(near(bx!, 0) && near(bw!, p * WIDTH + 2)).toBe(true);
      expect([by, bh]).toEqual([iy, 4]);
      const [tx, , tw] = rectOf(d, named(d, 'trilho')[0]!);
      expect(near(tx!, p * WIDTH) && near(tw!, WIDTH - p * WIDTH)).toBe(true);
      // L2 (#1078): a faixa só existe com mais pista que o gap de 6 (antes ela media 0 e não desenhava nada), e a
      // parada de 4 só com pista para ela; nenhum nó passa do trilho (aviso `conteúdo maior que a caixa`).
      const rest = WIDTH - p * WIDTH;
      const faixa = named(d, 'faixa')[0];
      if (rest > 6) {
        const [fx, , fw] = rectOf(d, faixa!);
        expect(near(fx!, p * WIDTH + 6) && near(fw!, rest - 6)).toBe(true);
      } else expect(faixa).toBeUndefined();
      // a parada fica encostada no fim da pista
      const parada = named(d, 'parada')[0];
      if (rest >= 4) expect(rectOf(d, parada!)).toEqual([236, iy, 4, 4]);
      else expect(parada).toBeUndefined();
    },
  );

  it('o comprimento acompanha a fração por todo o intervalo (1.000 valores)', () => {
    for (let i = 1; i < 1000; i++) {
      const p = i / 1000;
      const d = drawLinear(p);
      const [, , iw] = rectOf(d, named(d, 'indicador')[0]!);
      expect(near(iw!, p * WIDTH, 0.001), `p=${p}`).toBe(true);
    }
  });

  it('em 0 não há barra e o trilho ocupa tudo; em 1 só a barra cheia', () => {
    const zero = drawLinear(0);
    expect(names(zero)).toEqual([
      'progress indicator',
      'linear',
      'indicador',
      'trilho',
      'faixa total',
      'parada',
    ]);
    expect(rectOf(zero, named(zero, 'faixa total')[0]!).slice(2)).toEqual([WIDTH, 4]);
    const one = drawLinear(1);
    expect(names(one)).toEqual(['progress indicator', 'linear', 'indicador', 'barra']);
    expect(rectOf(one, named(one, 'barra')[0]!)[2]).toBe(WIDTH + 2);
  });

  it('valor fora de 0 a 1 é preso (coerceIn do Compose)', () => {
    expect(names(drawLinear(-3))).toEqual(names(drawLinear(0)));
    expect(names(drawLinear(2))).toEqual(names(drawLinear(1)));
    const over = drawLinear(1.5);
    expect(rectOf(over, named(over, 'barra')[0]!)[2]).toBe(WIDTH + 2);
    const under = drawLinear(-0.25);
    expect(rectOf(under, named(under, 'indicador')[0]!)[2]).toBe(0);
    expect(named(under, 'barra')).toEqual([]);
  });

  it('sem progress é o quadro do indeterminado: a barra de 30% a 70% com o trilho dos dois lados', () => {
    for (const d of [drawLinear(), drawLinear(null)]) {
      expect(names(d)).toEqual([
        'progress indicator',
        'linear',
        'trilho antes',
        'faixa antes',
        'indicador',
        'barra indeterminada',
        'trilho',
        'faixa',
        'parada',
      ]);
      expect(rectOf(d, named(d, 'indicador')[0]!)[0]).toBe(72);
      expect(rectOf(d, named(d, 'indicador')[0]!)[2]).toBe(96);
    }
  });

  it('as cores seguem os tokens nos modos claro e escuro', () => {
    for (const mode of ['light', 'dark'] as const) {
      const d = drawLinear(0.4, mode);
      expect(solid(named(d, 'barra')[0]!.fills)).toBe(tok('primary', mode));
      expect(solid(named(d, 'faixa')[0]!.fills)).toBe(tok('secondary-container', mode));
      expect(solid(named(d, 'parada')[0]!.fills)).toBe(tok('primary', mode));
    }
  });
});

describe('EX6 progress-indicator — sem avisos do motor', () => {
  it('desenha sem aviso em qualquer valor, preso ou vazio, nas duas formas e nos dois modos', () => {
    const values: unknown[] = [
      undefined,
      null,
      '',
      -2,
      -0.1,
      0,
      0.0001,
      0.333,
      0.5,
      0.9999,
      1,
      1.5,
    ];
    for (const mode of ['light', 'dark'] as const) {
      for (const progress of values) {
        expect(
          drawCircular(progress, mode).warnings,
          `circular ${String(progress)}`,
        ).toEqual([]);
        expect(drawLinear(progress, mode).warnings, `linear ${String(progress)}`).toEqual(
          [],
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------
// Regressão: as cenas de antes das tabelas, a ≤ 0,5 px por nó
// ---------------------------------------------------------------------------------------------

describe('EX6 regressão — o progress-indicator de antes das tabelas, a ≤ 0,5 px por nó', () => {
  const scenes = oldScenes('progress-');

  it('há as 210 cenas gravadas (3 exemplos em 2 modos, 101 + 101 valores e os 2 indeterminados)', () => {
    expect(scenes).toHaveLength(6 + 202 + 2);
  });

  it('todo nó de antes existe agora (tipo, nome, caixa, cor e pontos do arco)', () => {
    const failures: string[] = [];
    for (const scene of scenes) {
      // L2 (#1078): a faixa de largura 0 (nada a desenhar) e a parada sem pista de 4 não são mais desenhadas.
      const rest =
        WIDTH * (1 - Math.min(Math.max(Number(scene.values['progress']), 0), 1));
      const linear = scene.values['shape'] === 'linear' && 'progress' in scene.values;
      const missing = missingNodes(
        draw(scene.id, scene.values, scene.mode),
        scene.nodes,
        {
          skip: (o) =>
            (o.n === 'faixa' && o.r[2] === 0) || (linear && o.n === 'parada' && rest < 4),
        },
      );
      if (missing.length > 0) failures.push(`${scene.key}: ${missing.join(' ; ')}`);
    }
    expect(failures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Sem tabelas
// ---------------------------------------------------------------------------------------------

/** Cada `$switch` com mais de 12 casos e cada `$eq` sobre um campo `number` do tipo. */
function offenders(id: string): string[] {
  const numberFields = new Set(
    typeOf(id)
      .fields.filter((f) => f.type === 'number')
      .map((f) => f.key),
  );
  const found: string[] = [];
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) return value.forEach((v, i) => visit(v, `${path}[${i}]`));
    if (typeof value !== 'object' || value === null) return;
    const obj = value as Record<string, unknown>;
    const cases = obj['cases'];
    if ('$switch' in obj && typeof cases === 'object' && cases !== null) {
      const count = Object.keys(cases).length;
      // O `trackColor` escolhe um papel do ColorScheme (MF5): é um enum de cor, não uma tabela de números.
      if (count > 12 && obj['$switch'] !== 'trackColor')
        found.push(`${path}: $switch de ${count} casos`);
    }
    const eq = obj['$eq'];
    if (Array.isArray(eq) && typeof eq[0] === 'string' && numberFields.has(eq[0]))
      found.push(`${path}: $eq sobre o campo number ${eq[0]}`);
    for (const [k, v] of Object.entries(obj)) visit(v, `${path}.${k}`);
  };
  visit(JSON.parse(text(`components/${id}.json`)), id);
  return found;
}

describe('EX6 progress-indicator — sem tabelas enumeradas', () => {
  it('não tem $switch com mais de 12 casos nem $eq sobre o campo number progress', () => {
    expect(offenders('progress-indicator')).toEqual([]);
  });

  it('o arquivo fica enxuto (os 23 kB de antes; os papéis de cor do trackColor da MF5 respondem pelo resto)', () => {
    // Antes da MF5 o limite era de 11 kB. O `trackColor` leva o `$switch` dos 36 papéis do ColorScheme em cada nó do trilho.
    expect(text('components/progress-indicator.json').length).toBeLessThan(27_000);
  });
});
