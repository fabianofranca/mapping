// The `field-display` fixture (stage #2918, FG4, decision 11): the package that script R52 copies.
// It validates with no error and no warning, the `scroll` slot resolves without `scroll`, and
// `fieldDisplay` of `decorated-text` gives the counts that the script expects.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryFile } from '../../src/model/library';
import { parseComponent } from '../../src/model/components/parseComponent';
import { fieldDisplay } from '../../src/model/specFieldDisplay';
import { specTypeSlots } from '../../src/model/specSlots';
import { SPEC_FORMAT_VERSION } from '../../src/model/spec';

const DIR = 'tests/fixtures/field-display';
const read = (path: string): string => readFileSync(join(DIR, path), 'utf8');

function pkg(): LibraryFile[] {
  const components = readdirSync(join(DIR, 'components')).map((name) => ({
    path: `components/${name}`,
    text: read(`components/${name}`),
  }));
  return [
    { path: 'field-display.spec.json', text: read('field-display.spec.json') },
    ...components,
  ];
}

describe('the field-display fixture', () => {
  const report = validateLibrary({ files: pkg() });

  it('validates with no error and no warning, four types', () => {
    expect(report.errors).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.summary.types).toBe(4);
  });

  it('is at the current specialization formatVersion', () => {
    expect(JSON.parse(read('field-display.spec.json')).formatVersion).toBe(
      SPEC_FORMAT_VERSION,
    );
  });

  it('the scroll slot resolves without scroll and the column slot takes everything', () => {
    const spec = report.spec!;
    const comp = (name: string) => {
      const parsed = parseComponent(JSON.parse(read(`components/${name}.json`)));
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
      return parsed.component;
    };
    const [content] = specTypeSlots(spec, 'scroll', comp('scroll'));
    expect([...(content!.accepts ?? [])].sort()).toEqual([
      'column',
      'decorated-text',
      'text',
    ]);
    const [items] = specTypeSlots(spec, 'column', comp('column'));
    expect(items!.accepts).toBeUndefined();
  });

  it('fieldDisplay of decorated-text gives the counts of R52', () => {
    const type = report.spec!.layers[0]!.annotationTypes.find(
      (t) => t.id === 'decorated-text',
    )!;
    const plain = fieldDisplay(type, {}, new Set());
    expect(plain.items.map((i) => i.kind)).toEqual(['field', 'field']);
    expect(plain.hidden).toHaveLength(6);
    const tagged = fieldDisplay(type, { variant: 'htmlTagged' }, new Set());
    expect(tagged.items.map((i) => i.kind)).toEqual(['field', 'field', 'group', 'group']);
    expect(tagged.hidden).toHaveLength(2);
    const link = fieldDisplay(
      type,
      { variant: 'htmlTagged', part1Effect: 'link' },
      new Set(),
    );
    expect(link.hidden).toHaveLength(1);
  });
});
