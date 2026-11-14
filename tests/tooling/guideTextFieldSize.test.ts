import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CL1, achado 3.1 (#1890): o lote do R17.14 usa o `text-field` num tamanho que o servidor aceita
// (nunca abaixo do `minSize`) e o `size` do componente não fica abaixo do `minSize`.

const ROOT = join(__dirname, '../..');
const component = JSON.parse(
  readFileSync(
    join(ROOT, 'libraries/material3-compose/components/text-field.json'),
    'utf8',
  ),
) as {
  size: { width: number; height: number };
  minSize: { width: number; height: number };
};

describe('R17.14 e o text-field da Material 3', () => {
  it('o size do componente cobre o minSize', () => {
    expect(component.size.width).toBeGreaterThanOrEqual(component.minSize.width);
    expect(component.size.height).toBeGreaterThanOrEqual(component.minSize.height);
  });

  it('o guia pede o text-field num rect que o servidor aceita', () => {
    const row = readFileSync(join(ROOT, 'docs/TESTING.md'), 'utf8')
      .split('\n')
      .find((line) => line.startsWith('| R17.14 |'));
    expect(row).toBeDefined();
    const rects = [...row!.matchAll(/`text-field` `(\d+),(\d+),(\d+),(\d+)`/g)];
    expect(rects.length).toBeGreaterThan(0);
    for (const [, , , width, height] of rects) {
      expect(Number(width)).toBeGreaterThanOrEqual(component.minSize.width);
      expect(Number(height)).toBeGreaterThanOrEqual(component.minSize.height);
    }
  });

  it('o R17.29 mede a tinta do light num recorte (os cantos do PNG também são brancos)', () => {
    const row = readFileSync(join(ROOT, 'docs/TESTING.md'), 'utf8')
      .split('\n')
      .find((line) => line.startsWith('| R17.29 |'));
    expect(row).toBeDefined();
    expect(row).toMatch(/convert su-light\.png -crop \S+ \+repage -fuzz 8%/);
  });
});
