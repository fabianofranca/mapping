// Examples with the rows of a `table` field (decision 24 of #897, EX5): the Catalog gives `_id`
// to the rows and draws the example with them, the drawing proof uses the rows, and the example without the
// field stays without rows (it does not inherit the `preview`).
import { describe, expect, it } from 'vitest';
import { buildCatalog, exampleDrawing, findEntry } from '../../src/model/catalog';
import { approximateMeasurer } from '../../src/model/components/instantiate';
import { validateLibrary, type LibraryFile } from '../../src/model/library';

const FONT = { family: 'Roboto', size: 14, weight: 500, lineHeight: 20 };

const COMPONENT = {
  format: 'mapping-component',
  formatVersion: 4,
  id: 'tabs-lite',
  name: 'Tabs',
  size: { width: 240, height: 48 },
  preview: { items: [{ label: 'Home' }, { label: 'Search' }, { label: 'Profile' }] },
  template: {
    type: 'frame',
    name: 'tabs',
    layout: { type: 'row', align: 'center' },
    children: [
      {
        type: 'repeat',
        name: 'tabs',
        field: 'items',
        direction: 'row',
        template: {
          type: 'frame',
          name: 'tab',
          layout: { type: 'row' },
          children: [
            {
              type: 'text',
              name: 'label',
              text: { $field: 'label' },
              font: FONT,
              color: '#000000',
            },
          ],
        },
      },
    ],
  },
};

function specJson(examples: unknown[]): Record<string, unknown> {
  return {
    format: 'mapping-spec',
    formatVersion: 4,
    id: 'lite',
    name: 'Lite',
    version: 1,
    fonts: [{ family: 'Roboto', file: 'fonts/Roboto-Medium.ttf', weight: 500 }],
    layers: [
      {
        id: 'ui',
        name: 'UI',
        color: '#6750A4',
        annotationTypes: [
          {
            id: 'tabs-lite',
            name: 'Tabs',
            component: 'components/tabs-lite.json',
            doc: 'docs/tabs-lite.md',
            examples,
            fields: [
              {
                key: 'items',
                type: 'table',
                columns: [{ key: 'label', type: 'string' }],
              },
            ],
          },
        ],
      },
    ],
  };
}

function pack(examples: unknown[], component: unknown = COMPONENT): LibraryFile[] {
  return [
    { path: 'lite.spec.json', text: JSON.stringify(specJson(examples)) },
    { path: 'components/tabs-lite.json', text: JSON.stringify(component) },
    { path: 'docs/tabs-lite.md', text: '# Tabs\n\nRow of tabs.\n' },
    { path: 'fonts/Roboto-Medium.ttf', binary: true },
  ];
}

const WITH_ROWS = {
  name: 'With destinations',
  values: { items: [{ label: 'Home' }, { label: 'Search' }] },
};
const WITHOUT_ROWS = { name: 'Without the field', values: {} };

/** The drawn texts, in order. */
function texts(node: unknown): string[] {
  if (typeof node !== 'object' || node === null) return [];
  const n = node as { type?: string; text?: string; children?: unknown[] };
  const own = n.type === 'text' && typeof n.text === 'string' ? [n.text] : [];
  return [...own, ...(n.children ?? []).flatMap(texts)];
}

describe('Catalog: example with the rows of a table field', () => {
  const catalog = buildCatalog(pack([WITH_ROWS, WITHOUT_ROWS]));
  const entry = findEntry(catalog, 'tabs-lite')!;

  it('the pack is valid', () => {
    expect(catalog.report.errors).toEqual([]);
  });

  it("the example rows get _id, like the preview's", () => {
    const rows = entry.examples[0]?.values?.items;
    expect(rows).toEqual([
      { _id: 'preview-1', label: 'Home' },
      { _id: 'preview-2', label: 'Search' },
    ]);
    expect(entry.previewValues?.items).toEqual([
      { _id: 'preview-1', label: 'Home' },
      { _id: 'preview-2', label: 'Search' },
      { _id: 'preview-3', label: 'Profile' },
    ]);
  });

  it('the example with rows draws the rows', () => {
    const drawing = exampleDrawing(
      catalog,
      entry,
      entry.examples[0],
      approximateMeasurer,
    );
    expect(texts(drawing?.root)).toEqual(['Home', 'Search']);
  });

  it('the example without the table field stays without rows (does not inherit the preview)', () => {
    expect(entry.examples[1]?.values).toEqual({});
    const drawing = exampleDrawing(
      catalog,
      entry,
      entry.examples[1],
      approximateMeasurer,
    );
    expect(texts(drawing?.root)).toEqual([]);
  });
});

describe('drawing proof: the example with rows', () => {
  const NARROW = { ...COMPONENT, size: { width: 30, height: 48 } };
  const drawingWarnings = (examples: unknown[]) =>
    validateLibrary({ files: pack(examples, NARROW) }).warnings.filter((w) =>
      w.message.includes('the example'),
    );

  it('draws the rows: they do not fit in the narrow box and the warning cites the example', () => {
    const warnings = drawingWarnings([WITH_ROWS]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      file: 'lite.spec.json',
      path: 'layers[0].annotationTypes[0].examples[0]',
    });
    expect(warnings[0]?.message).toContain('the example "With destinations"');
  });

  it('the example without the table field draws no rows and does not warn', () => {
    expect(drawingWarnings([WITHOUT_ROWS])).toEqual([]);
  });

  it('a pack with an example of valid rows has no errors', () => {
    expect(validateLibrary({ files: pack([WITH_ROWS]) }).errors).toEqual([]);
  });
});
