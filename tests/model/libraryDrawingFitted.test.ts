// The drawing proof also at the fitted size (MC2, decision 10 of #898): a component with an axis
// that depends on the content (`sizing` `hug`, or by expression) is drawn at `size` and at the fitted
// size, with the values of the case; the warning of the second cites `fitted size W×H`.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'm.spec.json';

const LONG = 'aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd';

function component(extra: Raw, textExtra: Raw = {}): Raw {
  return {
    format: 'mapping-component',
    formatVersion: 4,
    id: 'm',
    name: 'M',
    size: { width: 200, height: 50 },
    template: {
      type: 'frame',
      width: 'fill',
      height: 'fill',
      layout: { type: 'column' },
      children: [
        {
          type: 'text',
          name: 'msg',
          text: { $field: 'msg' },
          width: 'fill',
          height: 'hug',
          font: { family: 'Roboto', size: 10, weight: 400, lineHeight: 30 },
          color: '#000000',
          ...textExtra,
        },
      ],
      ...(extra.template as Raw | undefined),
    },
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'template')),
  };
}

const spec = (examples: unknown[] = []): Raw => ({
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'm',
  name: 'M',
  version: 1,
  layers: [
    {
      id: 'l',
      name: 'L',
      color: '#112233',
      annotationTypes: [
        {
          id: 't',
          name: 'T',
          component: 'components/m.json',
          fields: [{ key: 'msg', label: 'Message', type: 'string', default: LONG }],
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
      { path: 'components/m.json', text: JSON.stringify(comp) },
    ],
  });
  return report.warnings.map((w) => w.message);
}

describe('drawing proof at the fitted size (MC2, decision 10)', () => {
  it('what does not fit in size and starts to fit at the fitted size warns only on size', () => {
    // Two lines of 30 = 60 of text in a box of 50; with the `hug` height the fitted size is 200×60.
    const out = warnings(component({ sizing: { height: 'hug' } }));
    expect(out).toEqual([
      'type "t", the default values, initial size 200×50: content larger than the box: frame (approximate)',
    ]);
  });

  it('what does not fit even at the fitted size warns citing `fitted size W×H`', () => {
    // `maxHeight` 40 at the root holds the fit: the two lines (60) do not fit in 200×40.
    const out = warnings(
      component({ sizing: { height: 'hug' }, template: { maxHeight: 40 } }),
    );
    expect(out).toContain(
      'type "t", the default values, fitted size 200×40: content larger than the box: frame (approximate)',
    );
  });

  it('the value example is also proven at the fitted size, with its values', () => {
    const out = warnings(
      component({ sizing: { height: 'hug' }, template: { maxHeight: 40 } }),
      [{ name: 'long', values: { msg: LONG } }],
    );
    expect(out).toContain(
      'type "t", the example "long", fitted size 200×40: content larger than the box: frame (approximate)',
    );
  });

  it('sizing by an expression that gives px enters the fitted size', () => {
    const out = warnings(
      component({
        sizing: { height: { $if: { $has: 'msg' }, then: 40, else: 50 } },
      }),
    );
    expect(out).toContain(
      'type "t", the default values, fitted size 200×40: content larger than the box: frame (approximate)',
    );
  });

  it('a component without an axis that depends on the content does not get the fitted case', () => {
    const out = warnings(component({}));
    expect(out).toEqual([
      'type "t", the default values, initial size 200×50: content larger than the box: frame (approximate)',
    ]);
  });

  it('no drawing of today changes: no warning at both sizes when it fits', () => {
    expect(
      warnings(
        component({ size: { width: 200, height: 80 }, sizing: { height: 'hug' } }),
        [],
      ),
    ).toEqual([]);
  });

  it('sizing with an invalid value warns in the size case (without `approximate`: it does not depend on the measurement) and falls back to size', () => {
    const out = warnings(component({ sizing: { height: { $field: 'msg' } } }));
    expect(out).toContain(
      `type "t", the default values, initial size 200×50: invalid value in sizing.height: ${LONG}`,
    );
    expect(out.some((w) => w.includes('fitted size'))).toBe(false);
  });
});
