import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// CL1, finding 3.1 (#1890): the R17.14 batch uses the `text-field` at a size the server accepts
// (never below `minSize`) and the component's `size` does not fall below `minSize`.

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

  it('R17.29 measures the light ink in a crop (the PNG corners are white too)', () => {
    const row = readFileSync(join(ROOT, 'docs/TESTING.md'), 'utf8')
      .split('\n')
      .find((line) => line.startsWith('| R17.29 |'));
    expect(row).toBeDefined();
    expect(row).toMatch(/convert su-light\.png -crop \S+ \+repage -fuzz 8%/);
  });

  it('R17.22 e R17.31 informam vazio o que o preview do componente completaria (achado 3.2)', () => {
    const text = readFileSync(join(ROOT, 'docs/TESTING.md'), 'utf8');
    const row = (id: string): string =>
      text.split('\n').find((line) => line.startsWith(`| ${id} |`)) ?? '';
    expect(row('R17.22')).toContain('"subtitle":"","supportingText":"","media":""');
    expect(row('R17.31')).toContain('"actionLabel":""');
    expect(row('R17.31')).toContain('"icon":""');
  });
});
