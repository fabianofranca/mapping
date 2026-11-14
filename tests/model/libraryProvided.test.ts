// MF3 (decision 8): the drawing proof and the Catalog use the `default` of `$provided` (no ancestor),
// and `provide` cites type fields like any expression.
import { describe, expect, it } from 'vitest';
import { buildCatalog, exampleDrawing, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { validateLibrary, type LibraryFile } from '../../src/model/library';

const head = { format: 'mapping-component', formatVersion: 4 };
const READER = {
  ...head,
  id: 'reader',
  name: 'Reader',
  size: { width: 120, height: 40 },
  template: {
    type: 'frame',
    children: [
      {
        type: 'text',
        name: 'text',
        text: 'Hello',
        color: { $provided: 'ink', default: '#123456' },
      },
    ],
  },
};
const giver = (provide: unknown) => ({
  ...head,
  id: 'giver',
  name: 'Provider',
  size: { width: 200, height: 80 },
  template: {
    type: 'frame',
    children: [
      {
        type: 'slot',
        anchors: { left: 0, right: 0, top: 0, bottom: 0 },
        layout: { type: 'row' },
        provide,
      },
    ],
  },
});

function pack(provide: unknown): LibraryFile[] {
  const type = (id: string, fields: unknown[] = []) => ({
    id,
    name: id,
    component: `components/${id}.json`,
    doc: `docs/${id}.md`,
    fields,
  });
  const spec = {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'lite',
    name: 'Lite',
    version: 1,
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#6750A4',
        annotationTypes: [
          type('reader'),
          type('giver', [{ key: 'ink', type: 'string' }]),
        ],
      },
    ],
  };
  return [
    { path: 'lite.spec.json', text: JSON.stringify(spec) },
    { path: 'components/reader.json', text: JSON.stringify(READER) },
    { path: 'components/giver.json', text: JSON.stringify(giver(provide)) },
    { path: 'docs/reader.md', text: '# Reader\n' },
    { path: 'docs/giver.md', text: '# Provider\n' },
  ];
}

describe('library with an inherited color', () => {
  it('is valid and the drawing proof warns of nothing', () => {
    const report = validateLibrary({
      files: pack({ ink: { $field: 'ink', default: '#abcdef' } }),
    });
    expect(report.errors).toEqual([]);
    expect(report.warnings.filter((w) => /desenho|aproximado/i.test(w.message))).toEqual(
      [],
    );
  });

  it('the Catalog draws the reader with the default (no ancestor provides one)', () => {
    const catalog = buildCatalog(pack({ ink: '#abcdef' }));
    const entry = findEntry(catalog, 'reader')!;
    const drawing = exampleDrawing(catalog, entry, undefined, approximateMeasurer);
    const text = (
      drawing?.root as unknown as { children?: { fills?: { color?: string }[] }[] }
    ).children?.[0];
    expect(text?.fills?.[0]?.color).toBe('#123456');
  });

  it('a provide that cites a field the type does not have is an error', () => {
    const report = validateLibrary({
      files: pack({ ink: { $field: 'does-not-exist' } }),
    });
    expect(JSON.stringify(report.errors)).toContain('does-not-exist');
  });
});
