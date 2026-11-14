// Library validator with the `image` node (component `formatVersion` 3): the field bound to
// `src` is `string` (a type field or a `table` column inside a `repeat`); no origin is
// declared; a literal of invalid shape arrives as a level 1 error.
import { describe, expect, it } from 'vitest';
import { validateLibrary, type LibraryIssue } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'avatar.spec.json';

const image = (src: unknown): Raw => ({ type: 'image', src, width: 24, height: 24 });
const text = (field: string): Raw => ({ type: 'text', text: { $field: field } });

function component(children: Raw[]): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 3,
    id: 'avatar',
    name: 'Avatar',
    size: { width: 200, height: 60 },
    minSize: { width: 100, height: 40 },
    template: { type: 'frame', layout: { type: 'row', gap: 8 }, children },
  };
}

function repeatOf(src: unknown): Raw {
  return {
    type: 'repeat',
    field: 'photos',
    template: { type: 'frame', layout: { type: 'row' }, children: [image(src)] },
  };
}

function spec(): Raw {
  return {
    format: 'mapping-spec',
    formatVersion: 7,
    id: 'avatar',
    name: 'Avatar',
    version: 1,
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          {
            id: 'avatar',
            name: 'Avatar',
            component: 'components/avatar.json',
            fields: [
              { key: 'name', type: 'string' },
              { key: 'photo', type: 'string' },
              { key: 'age', type: 'number' },
              { key: 'role', type: 'enum', options: ['a', 'b'] },
              { key: 'since', type: 'date' },
              {
                key: 'photos',
                type: 'table',
                columns: [
                  { key: 'url', type: 'string' },
                  { key: 'size', type: 'number' },
                  { key: 'photo', type: 'number' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function validate(comp: Raw) {
  return validateLibrary({
    specPath: SPEC_PATH,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec()) },
      { path: 'components/avatar.json', text: JSON.stringify(comp) },
    ],
  });
}

const brief = (i: LibraryIssue) => [i.severity, i.file, i.path, i.message];

describe('validateLibrary with image', () => {
  it('the src bound to a string field passes, without declaring an origin', () => {
    const report = validate(component([image({ $field: 'photo' }), text('name')]));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('a literal https:// src passes', () => {
    const report = validate(
      component([image('https://cdn.example.com/a.png'), text('name')]),
    );
    expect(report.errors).toEqual([]);
  });

  it.each(['number', 'enum', 'date', 'table'])(
    'the src bound to a %s field is an error, at the src.$field path',
    (kind) => {
      const key = { number: 'age', enum: 'role', date: 'since', table: 'photos' }[kind];
      const report = validate(component([image({ $field: key })]));
      expect(report.errors.map(brief)).toContainEqual([
        'error',
        'components/avatar.json',
        'template.children[0].src.$field',
        `the image src reads "${key}", which is a ${kind} field of the type "avatar", not string`,
      ]);
    },
  );

  it('a missing field is reported only once, by the field check', () => {
    const report = validate(component([image({ $field: 'missing' })]));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/avatar.json',
        'template.children[0].src.$field',
        'the drawing uses the field "missing", which the type "avatar" does not declare',
      ],
    ]);
  });

  it('inside a repeat, a string column passes', () => {
    const report = validate(component([repeatOf({ $field: 'url' })]));
    expect(report.errors).toEqual([]);
  });

  it('inside a repeat, a number column is an error', () => {
    const report = validate(component([repeatOf({ $field: 'size' })]));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/avatar.json',
        'template.children[0].template.children[0].src.$field',
        'the image src reads the column "size" of the table "photos" of the type "avatar", which is number, not string',
      ],
    ]);
  });

  it('the column shadows the type field of the same name', () => {
    // `photo` is string in the type, but number as a column: the column wins.
    const report = validate(component([repeatOf({ $field: 'photo' })]));
    expect(report.errors.map(brief)).toEqual([
      [
        'error',
        'components/avatar.json',
        'template.children[0].template.children[0].src.$field',
        'the image src reads the column "photo" of the table "photos" of the type "avatar", which is number, not string',
      ],
    ]);
  });

  it('inside a repeat, what is not a column falls back to the type field', () => {
    expect(validate(component([repeatOf({ $field: 'name' })])).errors).toEqual([]);
    const report = validate(component([repeatOf({ $field: 'age' })]));
    expect(report.errors.map(brief)).toContainEqual([
      'error',
      'components/avatar.json',
      'template.children[0].template.children[0].src.$field',
      'the image src reads "age", which is a number field of the type "avatar", not string',
    ]);
  });

  it.each([
    ['relative', 'images/a.png'],
    ['http:', 'http://cdn.example.com/a.png'],
    ['data:', 'data:image/png;base64,AAAA'],
    ['with credentials', 'https://u:p@cdn.example.com/a.png'],
  ])('the literal src %s arrives as a level 1 error', (_name, src) => {
    const report = validate(component([image(src), text('name')]));
    expect(report.errors.map((e) => [e.file, e.path])).toEqual([
      ['components/avatar.json', 'template.children[0].src'],
    ]);
    expect(report.errors[0]?.message).toContain('expected an absolute https:// URL');
  });
});
