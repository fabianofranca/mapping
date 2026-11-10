// R25.79 a R25.82: o componente que o `scripts/testing/sombras.mjs` grava é válido (formato 4), a
// cena instanciada traz a lista de 2 sombras com `spread` e o contorno com vão (`stroke.gaps`),
// e o raster desenha o que os passos do roteiro esperam.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { parseComponent, validateComponent } from '../../src/model/components/parseComponent';
import type { SceneNode } from '../../src/model/components/scene';

function buildCard(): unknown {
  const dir = mkdtempSync(path.join(tmpdir(), 'mapping-sombras-'));
  try {
    mkdirSync(path.join(dir, 'components'));
    execFileSync('node', [path.resolve('scripts/testing/sombras.mjs'), dir]);
    return JSON.parse(readFileSync(path.join(dir, 'components/card.json'), 'utf8'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function drawCard() {
  const parsed = parseComponent(buildCard());
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const { root } = instantiate(
    parsed.component,
    {},
    { x: 0, y: 0, width: 300, height: 120 },
    { measure: approximateMeasurer },
  );
  const raster = createRaster(300, 120);
  raster.data.fill(255);
  paintScene(raster, [{ root }], approximateMeasurer, {
    scaleX: 1,
    scaleY: 1,
    clip: { x: 0, y: 0, width: 300, height: 120 },
  });
  const at = (x: number, y: number) => {
    const i = (y * 300 + x) * 4;
    return [...raster.data.subarray(i, i + 3)];
  };
  const children: readonly SceneNode[] = 'children' in root ? root.children : [];
  return { at, root, child: (name: string) => children.find((c) => c.name === name) };
}

const BLUE = [0x19, 0x76, 0xd2];
const RED = [0xd3, 0x2f, 0x2f];
const WHITE = [255, 255, 255];

describe('sombras.mjs (R25.79 a R25.82)', () => {
  it('grava um componente de formato 4, de 300 × 120, que o validador aceita', () => {
    const card = buildCard() as { formatVersion: number; size: unknown };
    expect(card.formatVersion).toBe(4);
    expect(card.size).toEqual({ width: 300, height: 120 });
    expect(validateComponent(card)).toEqual([]);
  });

  it('numa formatVersion 3 a lista de sombras e o gap são erros', () => {
    const errors = validateComponent({ ...(buildCard() as object), formatVersion: 3 });
    expect(errors.some((e) => e.includes('template.children[0].shadow'))).toBe(true);
    expect(errors.some((e) => e.includes('template.children[1].stroke.gap'))).toBe(true);
    expect(errors.every((e) => e.includes('só é permitido com formatVersion 4'))).toBe(
      true,
    );
  });

  it('a cena tem 2 efeitos com spread no retângulo e o vão no contorno', () => {
    const { child } = drawCard();
    const rect = child('sombras');
    expect(rect?.effects).toHaveLength(2);
    expect(rect?.effects.map((e) => e.spread)).toEqual([4, -6]);
    expect(rect?.effects[0]?.color).toBe('#1976D2');
    const gaps = child('contorno')?.stroke?.gaps ?? [];
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.side).toBe('top');
    expect(gaps[0]?.from).toBe(16); // rótulo em x 170 - quadro em x 150 - respiro 4
    expect(gaps[0]?.to ?? 0).toBeGreaterThan(30);
  });

  it('o anel azul, a sombra ambiente e o vão do contorno aparecem onde os passos esperam', () => {
    const { at } = drawCard();
    expect(at(36, 40)).toEqual(BLUE);
    expect(at(35, 40)).toEqual(WHITE);
    expect(at(103, 40)).toEqual(BLUE);
    expect(at(104, 40)).toEqual(WHITE);
    expect(at(70, 62)).toEqual(BLUE); // a primeira sombra da lista fica por cima
    expect(at(70, 40)).toEqual([0xff, 0xeb, 0x3b]);
    expect(at(70, 66)[0]).toBeLessThan(0x80); // a preta, que passa do anel
    expect(at(70, 72)[0]).toBeGreaterThanOrEqual(0xf0); // o spread -6 a afasta
    expect(at(70, 76)).toEqual(WHITE);
    expect(at(164, 31)).toEqual(RED);
    expect(at(168, 31)).toEqual(WHITE); // no vão, no respiro de antes do rótulo
    expect(at(250, 31)).toEqual(RED);
    expect(at(150, 30)).toEqual(WHITE); // o canto reto ficaria aqui
    expect(at(150, 60)).toEqual(RED);
    expect(at(210, 89)).toEqual(RED);
    expect(at(269, 89)).toEqual(WHITE);
  });
});
