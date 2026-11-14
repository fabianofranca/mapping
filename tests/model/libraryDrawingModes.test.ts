// The drawing proof (level 3) runs each case in each mode of the specialization, with the mode's
// tokens resolved (FX4, decision 22 of #896): the warning cites the mode and the size comes from the typed token.
import { describe, expect, it } from 'vitest';
import { validateLibrary } from '../../src/model/library';

type Raw = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SPEC_PATH = 'm.spec.json';

const component = (fontSize: unknown): Raw => ({
  format: 'mapping-component',
  formatVersion: 4,
  id: 'm',
  name: 'M',
  size: { width: 100, height: 50 },
  template: {
    type: 'frame',
    layout: { type: 'row', align: 'center' },
    children: [
      {
        type: 'text',
        name: 'label',
        text: 'Hello world',
        font: { family: 'Roboto', size: fontSize, weight: 400, lineHeight: 20 },
        color: '#000000',
      },
    ],
  },
});

const spec = (tokens: unknown): Raw => ({
  format: 'mapping-spec',
  formatVersion: 15,
  id: 'm',
  name: 'M',
  version: 1,
  ...(tokens === null ? {} : { tokens }),
  layers: [
    {
      id: 'l',
      name: 'L',
      color: '#112233',
      annotationTypes: [
        { id: 't', name: 'T', component: 'components/m.json', fields: [] },
      ],
    },
  ],
});

function warnings(fontSize: unknown, tokens: unknown) {
  const report = validateLibrary({
    specPath: SPEC_PATH,
    level: 3,
    files: [
      { path: SPEC_PATH, text: JSON.stringify(spec(tokens)) },
      { path: 'components/m.json', text: JSON.stringify(component(fontSize)) },
    ],
  });
  return report.warnings.map((w) => w.message);
}

describe('drawing proof per mode (FX4)', () => {
  const TOKENS = {
    modes: ['light', 'dark'],
    values: { size: { light: 10, dark: 20 } },
  };

  it('a case that only does not fit in dark warns citing the dark mode (and measures with the token)', () => {
    // 11 characters × 0.55 × body: 10 px = 60.5 (fits in 100); 20 px = 121 (does not fit). Without the
    // resolved token the text would measure 14 px (84.7) and would not warn in any mode.
    expect(warnings({ $token: 'size' }, TOKENS)).toEqual([
      'type "t", the default values, mode dark, initial size 100×50: content larger than the box: frame (approximate)',
    ]);
  });

  it('a warning that applies in all modes comes out once, without a mode', () => {
    const both = { modes: ['light', 'dark'], values: { size: 40 } };
    expect(warnings({ $token: 'size' }, both)).toEqual([
      'type "t", the default values, initial size 100×50: content larger than the box: frame (approximate)',
    ]);
  });

  it('without tokens in the specialization the message does not cite a mode', () => {
    expect(warnings(30, null)).toEqual([
      'type "t", the default values, initial size 100×50: content larger than the box: frame (approximate)',
    ]);
  });
});
