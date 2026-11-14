// Library validator with variables (`let` and `$var`, stage #1504): the checks that look at
// the fields cited by the drawing (repeat column, type field, `$rows`) read the component with the
// variables substituted, so a root `let` variable used inside a `repeat` counts as the
// citation written there.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'tab.spec.json';

const text = (expr: unknown): Raw => ({
  type: 'text',
  text: expr,
  font: { size: 10, lineHeight: 12 },
});

function component(lets: Raw, rowText: unknown): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'tab',
    name: 'Tab',
    size: { width: 200, height: 100 },
    minSize: { width: 120, height: 60 },
    preview: { lines: [{ key: 'a' }, { key: 'b' }] },
    template: {
      type: 'frame',
      let: lets,
      layout: { type: 'column' },
      children: [
        {
          type: 'repeat',
          field: 'lines',
          template: { type: 'frame', children: [text(rowText)] },
        },
      ],
    },
  };
}

const SPEC: Raw = {
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
            {
              key: 'lines',
              type: 'table',
              columns: [{ key: 'key', type: 'string' }],
            },
            { key: 'color', type: 'string' },
          ],
        },
      ],
    },
  ],
};

function validate(comp: Raw) {
  return validateLibrary({
    specPath: SPEC_PATH,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(SPEC) },
      { path: 'components/tab.json', text: JSON.stringify(comp) },
    ],
  });
}

describe('validateLibrary with variables', () => {
  it('a root variable that cites a column, used inside the repeat, counts as the citation there', () => {
    const report = validate(component({ name: { $field: 'key' } }, { $var: 'name' }));
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('a variable that cites a type field, used only inside the repeat, counts the field as used', () => {
    const report = validate(component({ tone: { $field: 'color' } }, { $var: 'tone' }));
    expect(report.errors).toEqual([]);
    expect(report.warnings.map((w) => w.message).join('\n')).not.toContain(
      'field "color"',
    );
  });

  it('a variable that cites what is neither a column nor a type field, used in the repeat, is an error', () => {
    const report = validate(component({ x: { $field: 'gone' } }, { $var: 'x' }));
    expect(report.errors.map((e) => [e.path, e.message])).toEqual([
      [
        'template.children[0].template.children[0].text.$var(x).$field',
        'the row drawing uses "gone", which is neither a column of the table "lines" nor a field of the type "grid"',
      ],
    ]);
  });

  it('an unused variable that cites a missing field gives no error and does not count as use', () => {
    const report = validate(component({ loose: { $field: 'gone' } }, { $field: 'key' }));
    expect(report.errors).toEqual([]);
  });
});
