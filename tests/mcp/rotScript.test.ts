// R25.75 ao R25.78: o componente que o `scripts/testing/rot.mjs` grava é válido e desenha o que
// os passos do roteiro esperam (a barra por `$size`/`$mul` e o retângulo girado 45°).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRaster } from '../../mcp/image/raster';
import { paintScene } from '../../mcp/image/sceneRaster';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { parseComponent } from '../../src/model/components/parseComponent';

function drawCard(width: number, height: number) {
  const dir = mkdtempSync(path.join(tmpdir(), 'mapping-rot-'));
  try {
    mkdirSync(path.join(dir, 'components'));
    execFileSync('node', [path.resolve('scripts/testing/rot.mjs'), dir]);
    const parsed = parseComponent(
      JSON.parse(readFileSync(path.join(dir, 'components/card.json'), 'utf8')),
    );
    if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
    const { root } = instantiate(
      parsed.component,
      {},
      { x: 0, y: 0, width, height },
      { measure: approximateMeasurer },
    );
    const raster = createRaster(width, height);
    raster.data.fill(255);
    paintScene(raster, [{ root }], approximateMeasurer, {
      scaleX: 1,
      scaleY: 1,
      clip: { x: 0, y: 0, width, height },
    });
    return (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return [...raster.data.subarray(i, i + 3)];
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const BLUE = [0x19, 0x76, 0xd2];
const RED = [0xd3, 0x2f, 0x2f];
const WHITE = [255, 255, 255];

describe('rot.mjs (R25.75 ao R25.78)', () => {
  it('a barra tem metade da largura da instância e o retângulo gira em volta do centro', () => {
    const at = drawCard(300, 120);
    expect(at(100, 25)).toEqual(BLUE);
    expect(at(168, 25)).toEqual(BLUE);
    expect(at(172, 25)).toEqual(WHITE);
    expect(at(230, 70)).toEqual(RED);
    expect(at(244, 84)).toEqual(RED); // dentro só girado
    expect(at(201, 61)).toEqual(WHITE); // canto do retângulo sem giro, fora do girado
    expect(at(258, 62)).toEqual(WHITE);
  });

  it('a barra segue a largura da instância', () => {
    const at = drawCard(200, 120);
    expect(at(118, 25)).toEqual(BLUE);
    expect(at(122, 25)).toEqual(WHITE);
  });
});
