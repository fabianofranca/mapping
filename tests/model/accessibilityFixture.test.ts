// The test library of the accessibility stage (`tests/fixtures/accessibility`): the specialization
// (`formatVersion` 18) parses and the whole package passes `validateLibrary` with no errors.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { parseSpecText } from '../../src/model/spec';

const DIR = 'tests/fixtures/accessibility';
const SPEC = 'accessibility.spec.json';

const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

function pack(): LibraryFile[] {
  const components = readdirSync(join(DIR, 'components')).map((name) => ({
    path: `components/${name}`,
    text: read(`components/${name}`),
  }));
  return [{ path: SPEC, text: read(SPEC) }, ...components];
}

describe('accessibility test library', () => {
  it('the specialization parses as formatVersion 18 with its accessibility keys', () => {
    const result = parseSpecText(read(SPEC));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.formatVersion).toBe(18);
    expect(result.spec.accessibility?.touchTarget).toEqual({
      width: 44,
      height: 44,
      mode: 'visual',
    });
  });

  it('every component path exists and the package validates with no errors', () => {
    const spec = JSON.parse(read(SPEC)) as {
      layers: { annotationTypes: { component: string }[] }[];
    };
    const paths = new Set(pack().map((f) => f.path));
    for (const layer of spec.layers)
      for (const type of layer.annotationTypes)
        expect(paths.has(type.component)).toBe(true);
    const report = validateLibrary({ files: pack() });
    expect(report.errors.map((i) => `${i.file} ${i.path}: ${i.message}`)).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('the only warnings are the four "field not used by the drawing" ones (the library has no code; R29.1 lists them)', () => {
    const report = validateLibrary({ files: pack() });
    expect(report.warnings).toHaveLength(4);
    expect(report.warnings.every((i) => /not used by the drawing/.test(i.message))).toBe(
      true,
    );
  });
});
