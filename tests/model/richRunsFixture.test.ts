// The test library of the rich-runs stage (`tests/fixtures/rich-runs`, script R51): the package passes
// `validateLibrary` with no errors and no warnings, the money value picks the size R51 expects for
// each of its three values, and the decorated text breaks into the lines R51 expects.
// The sizes and lines are measured with the `approximateMeasurer` (a character is 0.55 × the size
// wide); script R51 checks them again with the real fonts of the app and the MCP.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseComponentText } from '../../src/model/components/parseComponent';
import { parseIconsText } from '../../src/model/components/icons';
import { approximateMeasurer, instantiate } from '../../src/model/components/instantiate';
import { walk, type TextNode } from '../../src/model/components/scene';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';

const DIR = 'tests/fixtures/rich-runs';
const SPEC = 'rich-runs.spec.json';
const PATHS = [
  SPEC,
  'components/decorated-text.json',
  'components/money-value.json',
  'icons/icons.json',
];

const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');
const pack = (): LibraryFile[] => PATHS.map((path) => ({ path, text: read(path) }));

/** The three values R51 adds: they take 41, 32 and 29 (width 204). */
const MONEY = [
  { value: '1,234.56', size: 41 },
  { value: '123,456.78', size: 32 },
  { value: '1,234,567.89', size: 29 },
];

function textOf(path: string, values: Record<string, unknown>, name: string): TextNode {
  const parsed = parseComponentText(read(path));
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  const icons = parseIconsText(read('icons/icons.json'));
  if (!icons.ok) throw new Error('icons');
  const { root } = instantiate(
    parsed.component,
    { ...parsed.component.preview, ...values } as never,
    {
      x: 0,
      y: 0,
      width: parsed.component.size.width,
      height: parsed.component.size.height,
    },
    { measure: approximateMeasurer, icons: icons.set },
  );
  const node = [...walk(root)].find((n) => n.name === name) as TextNode | undefined;
  if (node === undefined) throw new Error(`no node ${name}`);
  return node;
}

describe('rich-runs test library', () => {
  it('the specialization parses as formatVersion 24 with its two types', () => {
    const result = parseSpecText(read(SPEC));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.formatVersion).toBe(24);
    const types = result.spec.layers.flatMap((l) => l.annotationTypes.map((t) => t.id));
    expect(types).toEqual(['decorated-text', 'money-value']);
  });

  it('the package validates with zero errors and zero warnings', () => {
    const report = validateLibrary({ files: pack() });
    expect(report.errors.map((i) => `${i.file} ${i.path}: ${i.message}`)).toEqual([]);
    expect(report.warnings.map((i) => `${i.file} ${i.path}: ${i.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it.each(MONEY)('the money value $value takes the size $size', ({ value, size }) => {
    const node = textOf('components/money-value.json', { value }, 'fill');
    expect(node.style.fontSize).toBe(size);
  });

  it('the decorated text breaks into the lines R51 expects', () => {
    const node = textOf('components/decorated-text.json', {}, 'body');
    const lines = node.runLayout?.lines.map((line) =>
      line.pieces.map((p) => (p.inline === true ? '[icon]' : p.text)).join(''),
    );
    expect(lines).toEqual([
      'Terms: Read the terms and the',
      'privacy policy for H2O and',
      'E=mc2 before you go on. [icon]',
    ]);
  });

  it('sub and sup are drawn at 75% of the size, shifted by -20% and 33% of it', () => {
    const node = textOf('components/decorated-text.json', {}, 'body');
    const shifted = (node.runs ?? []).filter((r) => (r.baselineShift ?? 0) !== 0);
    expect(shifted.map((r) => [r.text, r.fontSize])).toEqual([
      ['2', 10.5],
      ['2', 10.5],
    ]);
    expect(shifted[0]?.baselineShift).toBeCloseTo(-2.1, 6);
    expect(shifted[1]?.baselineShift).toBeCloseTo(3.465, 6);
  });
});
