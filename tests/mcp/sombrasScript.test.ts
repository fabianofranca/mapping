// R25.79 to R25.82: the component that `scripts/testing/sombras.mjs` writes is valid (format 4), the
// instantiated scene carries the list of 2 shadows with `spread` and the outline with a gap (`stroke.gaps`),
// and the raster draws what the script's steps expect.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import {
  parseComponent,
  validateComponent,
} from '../../src/model/components/parseComponent';
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

function drawCard(scale = 1) {
  const parsed = parseComponent(buildCard());
  if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
  const { root } = instantiate(
    parsed.component,
    {},
    { x: 0, y: 0, width: 300, height: 120 },
    { measure: approximateMeasurer },
  );
  const w = Math.round(300 * scale);
  const h = Math.round(120 * scale);
  const raster = createRaster(w, h);
  raster.data.fill(255);
  paintScene(raster, [{ root }], approximateMeasurer, {
    scaleX: scale,
    scaleY: scale,
    clip: { x: 0, y: 0, width: w, height: h },
  });
  const at = (x: number, y: number) => {
    const i = (Math.round(y * scale) * w + Math.round(x * scale)) * 4;
    return [...raster.data.subarray(i, i + 3)];
  };
  const children: readonly SceneNode[] = 'children' in root ? root.children : [];
  return { at, root, child: (name: string) => children.find((c) => c.name === name) };
}

const BLUE = [0x19, 0x76, 0xd2];
const RED = [0xd3, 0x2f, 0x2f];
const WHITE = [255, 255, 255];

describe('sombras.mjs (R25.79 to R25.82)', () => {
  it('writes a format 4 component, 300 × 120, that the validator accepts', () => {
    const card = buildCard() as { formatVersion: number; size: unknown };
    expect(card.formatVersion).toBe(4);
    expect(card.size).toEqual({ width: 300, height: 120 });
    expect(validateComponent(card)).toEqual([]);
  });

  it('in formatVersion 3 the shadow list and the gap are errors', () => {
    const errors = validateComponent({ ...(buildCard() as object), formatVersion: 3 });
    expect(errors.some((e) => e.includes('template.children[0].shadow'))).toBe(true);
    expect(errors.some((e) => e.includes('template.children[1].stroke.gap'))).toBe(true);
    expect(errors.every((e) => e.includes('only allowed with formatVersion 4'))).toBe(
      true,
    );
  });

  it('the scene has 2 effects with spread on the rectangle and the gap in the outline', () => {
    const { child } = drawCard();
    const rect = child('sombras');
    expect(rect?.effects).toHaveLength(2);
    expect(rect?.effects.map((e) => e.spread)).toEqual([4, -6]);
    expect(rect?.effects[0]?.color).toBe('#1976D2');
    const gaps = child('contorno')?.stroke?.gaps ?? [];
    expect(gaps).toHaveLength(1);
    expect(gaps[0]?.side).toBe('top');
    expect(gaps[0]?.from).toBe(16); // label at x 170 - frame at x 150 - breathing room 4
    expect(gaps[0]?.to ?? 0).toBeGreaterThan(30);
  });

  it('the blue ring, the ambient shadow and the outline gap show up where the steps expect', () => {
    const { at } = drawCard();
    expect(at(36, 40)).toEqual(BLUE);
    expect(at(35, 40)).toEqual(WHITE);
    expect(at(103, 40)).toEqual(BLUE);
    expect(at(104, 40)).toEqual(WHITE);
    expect(at(70, 62)).toEqual(BLUE); // a primeira sombra da lista fica por cima
    expect(at(70, 40)).toEqual([0xff, 0xeb, 0x3b]);
    expect(at(70, 66)[0]).toBeLessThan(0x80); // the black one, which goes past the ring
    expect(at(70, 72)[0]).toBeGreaterThanOrEqual(0xf0); // o spread -6 a afasta
    expect(at(70, 76)).toEqual(WHITE);
    expect(at(164, 31)).toEqual(RED);
    expect(at(168, 31)).toEqual(WHITE); // in the gap, in the breathing room before the label
    expect(at(250, 31)).toEqual(RED);
    expect(at(150, 30)).toEqual(WHITE); // o canto reto ficaria aqui
    expect(at(150, 60)).toEqual(RED);
    expect(at(210, 89)).toEqual(RED);
    expect(at(269, 89)).toEqual(WHITE);
  });

  it('R25.82: at a non-integer scale the outline, at half the stroke, and the grays follow the criterion', () => {
    for (const scale of [1.76, 2.8, 4.2]) {
      const { at } = drawCard(scale);
      expect(at(151, 60)).toEqual(RED); // middle of the 2 stroke (150 is its edge)
      const dark = at(70, 66);
      expect(dark[0]).toBe(dark[1]);
      expect(dark[1]).toBe(dark[2]);
      expect(dark[0]).toBeLessThan(0x80); // 2B a 47 conforme `s`, nunca um valor fixo
      const light = at(70, 72);
      expect(light[0]).toBe(light[1]);
      expect(light[1]).toBe(light[2]);
      expect(light[0]).toBeGreaterThanOrEqual(0xf0);
    }
  });
});
