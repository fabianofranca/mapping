// Library validator with the `repeat` node (ME4): the cited field is a `table` of the type, the
// row drawing only reads its columns or type fields, and the drawing proof accepts rows in the
// `preview`.
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'tab.spec.json';

const text = (field: string, extra: Raw = {}): Raw => ({
  type: 'text',
  text: { $field: field },
  font: { size: 10, lineHeight: 12 },
  ...extra,
});

function component(repeat: Raw = {}, over: Raw = {}): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 2,
    id: 'tab',
    name: 'Tab',
    size: { width: 200, height: 100 },
    minSize: { width: 120, height: 60 },
    preview: {
      title: 'T',
      lines: [
        { key: 'a', value: '1' },
        { key: 'b', value: '2' },
      ],
    },
    template: {
      type: 'frame',
      layout: { type: 'column', gap: 4, padding: 8 },
      children: [
        text('title'),
        {
          type: 'repeat',
          field: 'lines',
          gap: 2,
          template: {
            type: 'frame',
            layout: { type: 'row', gap: 8 },
            children: [text('key', { width: 'hug' }), text('value')],
          },
          ...repeat,
        },
      ],
    },
    ...over,
  };
}

function spec(edit: (raw: Raw) => void = () => undefined): Raw {
  const raw: Raw = {
    format: 'mapping-spec',
    formatVersion: 7,
    id: 'tab',
    name: 'Tab',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 'grid',
            name: 'Grid',
            component: 'components/tab.json',
            fields: [
              { key: 'title', type: 'string' },
              {
                key: 'lines',
                type: 'table',
                columns: [
                  { key: 'key', type: 'string' },
                  { key: 'value', type: 'string' },
                ],
              },
              { key: 'color', type: 'string' },
              { key: 'total', type: 'number' },
            ],
          },
        ],
      },
    ],
  };
  edit(raw);
  return raw;
}

function validate(comp: Raw, edit?: (raw: Raw) => void) {
  return validateLibrary({
    specPath: SPEC_PATH,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec(edit)) },
      { path: 'components/tab.json', text: JSON.stringify(comp) },
    ],
  });
}

const brief = (i: LibraryIssue) => [i.severity, i.file, i.path, i.message];

describe('validateLibrary with repeat', () => {
  it('a package with a valid repeat (and the preview with rows) passes with no error and no field warning', () => {
    const report = validate(component());
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
    // Only the fields `color` and `total` are not used by the drawing.
    expect(report.warnings.map((w) => w.message)).toEqual([
      expect.stringContaining('field "color" of the type "grid" is not used'),
      expect.stringContaining('field "total" of the type "grid" is not used'),
    ]);
  });

  it('a repeat that cites a field the type does not declare is an error, at the repeat field', () => {
    const report = validate(component({ field: 'missing' }));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/tab.json',
      'template.children[1].field',
      'the drawing uses the field "missing", which the type "grid" does not declare',
    ]);
  });

  it('a repeat that cites a field that is not a table is an error', () => {
    const report = validate(component({ field: 'title' }));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/tab.json',
      'template.children[1].field',
      'the repeat repeats the rows of "title", which is a string field of the type "grid", not a table',
    ]);
  });

  it('a row drawing that cites what is neither a column nor a type field is an error, at the citation', () => {
    const report = validate(
      component({
        template: {
          type: 'frame',
          layout: { type: 'row' },
          children: [text('key'), text('gone', { name: 'x' })],
        },
      }),
    );
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/tab.json',
        'template.children[1].template.children[1].text.$field',
        'the row drawing uses "gone", which is neither a column of the table "lines" nor a field of the type "grid"',
      ],
    ]);
  });

  it('the row drawing may read a type field that is not a column, and that counts it as used', () => {
    const report = validate(
      component({
        template: {
          type: 'frame',
          layout: { type: 'row' },
          children: [text('key'), text('color')],
        },
      }),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.message).join('\n')).not.toContain('field "color"');
    expect(report.warnings.map((w) => w.message).join('\n')).toContain('field "total"');
  });

  it('a used column that no longer exists in the table is an error', () => {
    const report = validate(component(), (raw) => {
      raw.layers[0].annotationTypes[0].fields[1].columns.pop();
    });
    expect(report.errors.map((e) => e.path)).toEqual([
      'template.children[1].template.children[1].text.$field',
    ]);
  });

  it('repeat in a formatVersion 1 is a component error, at the node path', () => {
    const report = validate(component({}, { formatVersion: 1 }));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/tab.json',
        'template.children[1].type',
        'the repeat node only exists in formatVersion 2',
      ],
    ]);
  });

  it('the preview of a table must be a list of rows with columns that exist', () => {
    const notList = validate(component({}, { preview: { lines: 'x' } }));
    expect(notList.warnings.map(brief)).toContainEqual([
      'warning',
      'components/tab.json',
      'preview.lines',
      '"lines" is a table of the type "grid"; its preview must be a list of rows',
    ]);
    const extra = validate(
      component({}, { preview: { lines: [{ key: 'a', extra: 'x' }] } }),
    );
    expect(extra.warnings.map(brief)).toContainEqual([
      'warning',
      'components/tab.json',
      'preview.lines[0].extra',
      '"extra" is not a column of the table "lines" of the type "grid"',
    ]);
    const scalar = validate(component({}, { preview: { title: [{ a: 'b' }] } }));
    expect(scalar.warnings.map(brief)).toContainEqual([
      'warning',
      'components/tab.json',
      'preview.title',
      '"title" is not a table of the type "grid"; its preview must be a simple value',
    ]);
  });

  it('the drawing proof uses the preview rows: a table that does not fit the initial size warns', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ key: `k${i}`, value: 'v' }));
    const report = validate(component({}, { preview: { title: 'T', lines: many } }));
    expect(report.errors).toEqual([]);
    const overflow = report.warnings.filter((w) => w.message.includes('content larger'));
    expect(overflow.map((w) => [w.file, w.path])).toEqual([
      ['components/tab.json', 'preview'],
    ]);
    // The minimum size is not drawn: only the initial size.
    expect(overflow[0]?.message).toContain('initial size 200×100');
  });

  it('without a preview, the proof uses the empty table and passes', () => {
    const comp = component();
    delete comp.preview;
    const report = validate(comp);
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.message).join('\n')).not.toContain(
      'content larger',
    );
  });
});

describe('validateLibrary: $rows, $index and repeat by count (format 4)', () => {
  const v4 = (children: Raw[]): Raw => {
    const comp = component();
    comp.formatVersion = 4;
    comp.template.children = children;
    return comp;
  };

  it('$rows over a type table is valid and counts the field as used', () => {
    const report = validate(
      v4([text('title'), { ...text('x'), text: { $rows: 'lines' } }]),
    );
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.message).join('\n')).not.toContain('"lines"');
  });

  it('$rows over a field that is not a table is an error, at the $rows path', () => {
    const report = validate(v4([{ ...text('x'), text: { $rows: 'title' } }]));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/tab.json',
      'template.children[0].text.$rows',
      '$rows counts the rows of "title", which is a string field of the type "grid", not a table',
    ]);
  });

  it('$rows over a missing field is an undeclared field error', () => {
    const report = validate(v4([{ ...text('x'), text: { $rows: 'nothing' } }]));
    expect(report.errors.map((e) => e.message)).toContain(
      'the drawing uses the field "nothing", which the type "grid" does not declare',
    );
  });

  it('$index is not a type field: neither an error nor a field requirement', () => {
    const report = validate(
      v4([
        {
          type: 'repeat',
          count: 3,
          template: {
            type: 'frame',
            layout: { type: 'row' },
            children: [{ ...text('x'), text: { $field: '$index' } }, text('title')],
          },
        },
      ]),
    );
    expect(report.errors).toEqual([]);
  });

  it('the repeat by count reads type fields in the template; a missing field is an error', () => {
    const report = validate(
      v4([
        {
          type: 'repeat',
          count: { $rows: 'lines' },
          template: {
            type: 'frame',
            layout: { type: 'row' },
            children: [text('missing')],
          },
        },
      ]),
    );
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/tab.json',
      'template.children[0].template.children[0].text.$field',
      'the row drawing uses "missing", which the type "grid" does not declare',
    ]);
  });
});

describe('validateLibrary: $index in conditions', () => {
  it('$eq, $has and $switch over $index are not type fields', () => {
    const comp = component();
    comp.formatVersion = 4;
    comp.template.children = [
      {
        type: 'repeat',
        count: 3,
        template: {
          type: 'frame',
          layout: { type: 'row' },
          children: [
            { ...text('title'), visible: { $eq: ['$index', 0] } },
            { ...text('title'), visible: { $has: '$index' } },
            { ...text('title'), width: { $switch: '$index', cases: { '0': 10 } } },
          ],
        },
      },
    ];
    expect(validate(comp).errors).toEqual([]);
  });
});
