// OV1 (decision 5 of #2913): `validate_library` is the only reader of an intended overflow. The drawing
// proof passes `reportIntended`, so a flagged overflow is the warning `overflow intended: <frame>`, once per case.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'bar.spec.json';

/** A 360 × 44 bar with two 48 × 48 touch targets (flagged or not). */
function component(touch: Raw): Raw {
  const target = (name: string): Raw => ({
    type: 'rect',
    name,
    width: 48,
    height: 48,
    fill: '#cccccc',
    ...touch,
  });
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'bar',
    name: 'Bar',
    size: { width: 360, height: 44 },
    template: {
      type: 'frame',
      name: 'bar',
      width: 'fill',
      height: 'fill',
      layout: { type: 'row', justify: 'space-between' },
      children: [target('start'), target('end')],
    },
  };
}

const spec = (examples: unknown[] = []): Raw => ({
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'bar',
  name: 'Bar',
  version: 1,
  layers: [
    {
      id: 'l',
      name: 'L',
      color: '#112233',
      annotationTypes: [
        {
          id: 'top-bar',
          name: 'Top bar',
          component: 'components/bar.json',
          fields: [],
          examples,
        },
      ],
    },
  ],
});

function warnings(comp: Raw, examples: unknown[] = []): string[] {
  const report = validateLibrary({
    specPath: SPEC_PATH,
    level: 3,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec(examples)) },
      { path: 'components/bar.json', text: JSON.stringify(comp) },
    ],
  });
  expect(report.errors).toEqual([]);
  return report.warnings.map((w) => w.message);
}

describe('validate_library and the intended overflow', () => {
  it('a flagged node warns "overflow intended: <frame>", once per case', () => {
    expect(warnings(component({ overflow: 'intended' }))).toEqual([
      'type "top-bar", the default values, initial size 360×44: overflow intended: bar (approximate)',
    ]);
  });

  it('with an example, each case gets its own note', () => {
    expect(
      warnings(component({ overflow: 'intended' }), [{ name: 'one', values: {} }]),
    ).toEqual([
      'type "top-bar", the default values, initial size 360×44: overflow intended: bar (approximate)',
      'type "top-bar", the example "one", initial size 360×44: overflow intended: bar (approximate)',
    ]);
  });

  it('the same package without the flag warns "content larger than the box: <frame>"', () => {
    expect(warnings(component({}))).toEqual([
      'type "top-bar", the default values, initial size 360×44: content larger than the box: bar (approximate)',
    ]);
  });

  it('a sibling that really overflows keeps the usual warning and gets no note', () => {
    const comp = component({ overflow: 'intended' });
    (comp.template.children as Raw[])[1] = {
      type: 'rect',
      name: 'end',
      width: 48,
      height: 60,
      fill: '#cccccc',
    };
    expect(warnings(comp)).toEqual([
      'type "top-bar", the default values, initial size 360×44: content larger than the box: bar (approximate)',
    ]);
  });
});
