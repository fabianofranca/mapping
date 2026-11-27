// RT5 of #2916: the library validator with a runs table item (`…runs[i] = { field, template }`):
// the cited field is a `table` of the type, the row's run only reads its columns or type fields,
// and the table field counts as used.
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'doc.spec.json';

function component(item: Raw = {}, over: Raw = {}): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'doc',
    name: 'Doc',
    size: { width: 200, height: 60 },
    preview: {
      pieces: [{ text: 'a' }, { text: 'b' }],
      tint: '#ff0000',
    },
    template: {
      type: 'frame',
      children: [
        {
          type: 'text',
          runs: [
            { text: 'Fixed ' },
            { field: 'pieces', template: { text: { $field: 'text' } }, ...item },
          ],
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
    id: 'doc',
    name: 'Doc',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 'doc',
            name: 'Doc',
            component: 'components/doc.json',
            fields: [
              { key: 'title', type: 'string' },
              {
                key: 'pieces',
                type: 'table',
                columns: [{ key: 'text', type: 'string' }],
              },
              { key: 'tint', type: 'string' },
              { key: 'unused', type: 'string' },
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
      { path: 'components/doc.json', text: JSON.stringify(comp) },
    ],
  });
}

const brief = (i: LibraryIssue) => [i.severity, i.file, i.path, i.message];

describe('validateLibrary with a runs table item', () => {
  it('a valid item passes and the table field counts as used', () => {
    const report = validate(component());
    expect(report.errors).toEqual([]);
    const warnings = report.warnings.map((w) => w.message).join('\n');
    expect(warnings).not.toContain('field "pieces"');
    expect(warnings).not.toContain('library.fieldUnused');
    // Only the fields no drawing reads remain.
    expect(warnings).toContain('field "unused"');
    expect(warnings).toContain('field "title"');
  });

  it('a field that is not a table is library.repeatNotTable, at …runs[i].field', () => {
    const report = validate(component({ field: 'title' }));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/doc.json',
      'template.children[0].runs[1].field',
      'the repeat repeats the rows of "title", which is a string field of the type "doc", not a table',
    ]);
    expect(report.errors.map((e) => e.code)).toContain('library.repeatNotTable');
  });

  it('a field the type does not declare is pointed out at …runs[i].field', () => {
    const report = validate(component({ field: 'missing' }));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/doc.json',
      'template.children[0].runs[1].field',
      'the drawing uses the field "missing", which the type "doc" does not declare',
    ]);
  });

  it('a name that is neither a column nor a field is library.repeatRowUnknownColumn, inside …runs[i].template', () => {
    const report = validate(component({ template: { text: { $field: 'gone' } } }));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/doc.json',
        'template.children[0].runs[1].template.text.$field',
        'the row drawing uses "gone", which is neither a column of the table "pieces" nor a field of the type "doc"',
      ],
    ]);
    expect(report.errors[0]!.code).toBe('library.repeatRowUnknownColumn');
  });

  it('a type field read inside the template counts as used', () => {
    const report = validate(
      component({
        template: { text: { $field: 'text' }, color: { $field: 'tint' } },
      }),
    );
    expect(report.errors).toEqual([]);
    const warnings = report.warnings.map((w) => w.message).join('\n');
    expect(warnings).not.toContain('field "tint"');
    expect(warnings).toContain('field "unused"');
  });

  it('a column the table no longer has is an error', () => {
    const report = validate(component(), (raw) => {
      raw.layers[0].annotationTypes[0].fields[1].columns = [
        { key: 'other', type: 'string' },
      ];
    });
    expect(report.errors.map((e) => e.path)).toEqual([
      'template.children[0].runs[1].template.text.$field',
    ]);
  });
});
