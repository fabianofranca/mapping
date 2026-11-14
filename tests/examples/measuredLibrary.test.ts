// Example library `measured` (CF11): the `measured` origin, in which a tree of measured
// rectangles (the page of a web app) becomes markings through the types' `sources`.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importMeasured } from '../../src/model/components/measured';
import { validateLibrary } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';

const ROOT = join(__dirname, '../../examples/libraries/measured');
const SPEC_FILE = 'measured.spec.json';
// The measured tree sits beside the folder: the `measured` origin does not declare `examples`, and a
// loose file inside the library would become an "unreferenced" warning.
const TREE = join(__dirname, '../../examples/page.measured.json');

function listDisk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? listDisk(join(dir, e.name))
      : [relative(ROOT, join(dir, e.name)).split('\\').join('/')],
  );
}

const files = listDisk(ROOT)
  .sort()
  .map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
const text = (path: string): string => files.find((f) => f.path === path)?.text ?? '';

describe('example library measured', () => {
  it('has the specialization, one component and one document per type', () => {
    expect(files.map((f) => f.path)).toEqual(
      [
        SPEC_FILE,
        'components/button.json',
        'components/card.json',
        'docs/button.md',
        'docs/card.md',
      ].sort(),
    );
  });

  it('validates without errors on the three levels and without warnings', () => {
    const report = validateLibrary({ files, specPath: SPEC_FILE });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({ level: 3, types: 2, components: 2, docs: 2 });
  });

  it('declares the measured origin at formatVersion 15', () => {
    const parsed = parseSpecText(text(SPEC_FILE));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.id).toBe('measured');
    expect(parsed.spec.origins).toMatchObject([
      { system: 'dom', name: 'Measured page', kind: 'measured' },
    ]);
  });
});

describe('import of the example measured tree', () => {
  const parsed = parseSpecText(text(SPEC_FILE));
  const result = parsed.ok
    ? importMeasured([parsed.spec], {
        system: 'dom',
        tree: JSON.parse(readFileSync(TREE, 'utf8')),
      })
    : undefined;

  it('creates the card and the three buttons', () => {
    expect(result?.error).toBeUndefined();
    expect(result?.markings.map((m) => m.typeId)).toEqual([
      'card',
      'button',
      'button',
      'button',
    ]);
  });

  it('fills the fields from the props, with values for the enum', () => {
    const buttons = result?.markings.filter((m) => m.typeId === 'button') ?? [];
    expect(buttons[0]?.values).toEqual({ label: 'Save', tone: 'error' });
    expect(buttons[1]?.values).toEqual({ label: 'Cancel', tone: 'neutral' });
  });

  it('ignores typeless nodes with a warning and continues with the children', () => {
    const warnings = result?.warnings ?? [];
    expect(warnings).toHaveLength(2);
    expect(warnings.some((w) => w.includes('x-page'))).toBe(true);
    expect(warnings.some((w) => w.includes('x-mysterious'))).toBe(true);
    expect(result?.markings.some((m) => m.values.label === 'Help')).toBe(true);
  });
});
