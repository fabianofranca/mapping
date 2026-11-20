// Format 4, "format gaps" stage (FG4): letter spacing in percent, number expressions as `padding`
// items and a number `$token` in `sizing` — validator and level 2 of the library.
import { describe, expect, it } from 'vitest';
import { COMPONENT_FORMAT } from '../../../src/model/components/componentFormat';
import {
  parseComponent,
  validateComponent,
} from '../../../src/model/components/parseComponent';
import { validateLibrary } from '../../../src/model/library';

const V4 = 'only allowed with formatVersion 4';
const PERCENT = 'expected a number or a percentage ("2%")';
const t = (name: string) => ({ $token: name });

function component(
  template: Record<string, unknown>,
  version = 4,
  extra: Record<string, unknown> = {},
): unknown {
  return {
    format: COMPONENT_FORMAT,
    formatVersion: version,
    id: 'c',
    name: 'C',
    size: { width: 100, height: 40 },
    template: { type: 'frame', children: [], ...template },
    ...extra,
  };
}

const withText = (font: unknown, version = 4) =>
  component({ children: [{ type: 'text', text: 'x', font }] }, version);

describe('FG4: letter spacing in percent', () => {
  const spacing = (letterSpacing: unknown, version = 4) =>
    validateComponent(withText({ letterSpacing }, version));

  it('"2%", "-1.5%" and a $switch of percents are valid in v4', () => {
    expect(spacing('2%')).toEqual([]);
    expect(spacing('-1.5%')).toEqual([]);
    expect(
      spacing({ $switch: 'style', cases: { a: '2%', b: '-1%' }, default: 0 }),
    ).toEqual([]);
  });

  it('the px number and a number $token still work', () => {
    expect(spacing(0.5)).toEqual([]);
    expect(spacing(t('tracking'))).toEqual([]);
  });

  it('another text is an error', () => {
    for (const bad of ['2px', '%', 'abc', '2 %', '--2%']) {
      expect(spacing(bad)).toEqual([
        `template.children[0].font.letterSpacing: ${PERCENT}`,
      ]);
    }
  });

  it('the percent in versions 1 to 3 gives the version error, on the key path', () => {
    for (const version of [1, 2, 3]) {
      expect(spacing('2%', version)).toEqual([
        `template.children[0].font.letterSpacing: ${V4}`,
      ]);
    }
    expect(spacing({ $switch: 'style', cases: { a: '2%' } }, 3)).toEqual([
      `template.children[0].font.letterSpacing.cases.a: ${V4}`,
    ]);
  });

  it('the px literal stays valid in any version', () => {
    expect(spacing(1, 2)).toEqual([]);
  });
});

describe('FG4: expressions as padding items', () => {
  const frame = (padding: unknown, version = 4) =>
    validateComponent(
      component({ layout: { type: 'row', padding }, children: [] }, version),
    );

  it('a token, a field and a math item are valid in v4', () => {
    expect(frame([0, t('spacing-24')])).toEqual([]);
    expect(frame([{ $field: 'pad' }, 4, { $mul: [2, 4] }, 4])).toEqual([]);
    expect(frame([{ $if: { $has: 'wide' }, then: 24, else: t('spacing-8') }, 4])).toEqual(
      [],
    );
  });

  it('collects each token item with its path', () => {
    const r = parseComponent(
      component({ layout: { type: 'row', padding: [0, t('spacing-24')] } }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.tokenRefs).toEqual([
      { path: 'template.layout.padding[1]', name: 'spacing-24', kind: 'number' },
    ]);
  });

  it('an expression item in versions 1 to 3 gives the version error, on the item path', () => {
    for (const version of [2, 3]) {
      expect(frame([{ $field: 'pad' }, 4], version)).toEqual([
        `template.layout.padding[0]: ${V4}`,
      ]);
      expect(frame([0, t('spacing-24')], version)).toEqual([
        `template.layout.padding[1]: ${V4}`,
      ]);
    }
  });

  it('a negative or invalid literal item is still refused', () => {
    const message =
      'template.layout.padding: expected a number, a list of 2 or a list of 4 numbers (greater than or equal to 0)';
    expect(frame([-1, t('x')])).toEqual([message]);
    expect(frame([0, 'a'])).toEqual([message]);
    expect(frame([0, 1, 2])).toEqual([message]);
  });

  it('a bad leaf inside an item expression is an error at the item', () => {
    expect(frame([0, { $switch: 'size', cases: { a: -3 } }])).toEqual([
      'template.layout.padding[1].cases.a: expected a number greater than or equal to 0',
    ]);
  });

  it('the literal list keeps applying in every version', () => {
    expect(frame([1, 2, 3, 4], 2)).toEqual([]);
  });

  it('the padding of a slot and of a run accept the items too', () => {
    expect(
      validateComponent(
        component({
          children: [{ type: 'slot', layout: { type: 'row', padding: [t('a'), 2] } }],
        }),
      ),
    ).toEqual([]);
    expect(
      validateComponent(
        component({
          children: [
            {
              type: 'text',
              runs: [{ text: 'y', background: '#eee', padding: [0, t('chip-x')] }],
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('a run padding with a token in v3 gives the version error, on the item path', () => {
    expect(
      validateComponent(
        component(
          {
            children: [
              {
                type: 'text',
                runs: [{ text: 'y', background: '#eee', padding: [{ $field: 'p' }, 2] }],
              },
            ],
          },
          3,
        ),
      ),
    ).toEqual([
      `template.children[0].runs: ${V4}`,
      `template.children[0].runs[0].padding[0]: ${V4}`,
    ]);
  });
});

describe('FG4: number $token in sizing', () => {
  const sizing = (width: unknown, version = 4) =>
    validateComponent(component({}, version, { sizing: { width } }));

  it('a token and a $switch of tokens are valid in v4', () => {
    expect(sizing(t('size-48'))).toEqual([]);
    expect(
      sizing({
        $switch: 'size',
        cases: { s: t('size-24'), l: t('size-48') },
        default: 'hug',
      }),
    ).toEqual([]);
  });

  it('the token goes into tokenRefs with kind number', () => {
    const r = parseComponent(
      component({}, 4, {
        sizing: {
          width: t('size-48'),
          height: { $if: { $has: 'x' }, then: t('size-24') },
        },
      }),
    );
    if (!r.ok) throw new Error(r.errors.join('\n'));
    expect(r.tokenRefs).toEqual([
      { path: 'sizing.width', name: 'size-48', kind: 'number' },
      { path: 'sizing.height.then', name: 'size-24', kind: 'number' },
    ]);
  });

  it('$size is still refused', () => {
    expect(sizing({ $size: 'width' }).join('\n')).toContain(
      '$size is not valid in sizing',
    );
  });

  it('in versions 1 to 3 it gives the version error, on the axis path', () => {
    expect(sizing(t('size-48'), 3)).toEqual([`sizing.width: ${V4}`]);
  });
});

describe('FG4: level 2 of the library', () => {
  const spec = {
    format: 'mapping-spec',
    formatVersion: 15,
    id: 'fg',
    name: 'Fg',
    version: 1,
    tokens: {
      modes: ['light'],
      values: { primary: { light: '#1a73e8' }, 'size-48': 48 },
    },
    layers: [
      {
        id: 'l',
        name: 'L',
        color: '#112233',
        annotationTypes: [
          { id: 't', name: 'T', component: 'components/c.json', fields: [] },
        ],
      },
    ],
  };
  const validate = (comp: unknown) =>
    validateLibrary({
      specPath: 'fg.spec.json',
      level: 2,
      files: [
        { path: 'fg.spec.json', text: JSON.stringify(spec) },
        { path: 'components/c.json', text: JSON.stringify(comp) },
      ],
    }).errors.map((e) => [e.path, e.message]);

  it('a color token in sizing or in a padding item is an error', () => {
    expect(
      validate(component({}, 4, { sizing: { width: t('primary') } })),
    ).toContainEqual([
      'sizing.width',
      'the token "primary" is a color, but a number is expected here',
    ]);
    expect(
      validate(component({ layout: { type: 'row', padding: [0, t('primary')] } })),
    ).toContainEqual([
      'template.layout.padding[1]',
      'the token "primary" is a color, but a number is expected here',
    ]);
  });

  it('a number token passes in both positions', () => {
    expect(
      validate(
        component({ layout: { type: 'row', padding: [0, t('size-48')] } }, 4, {
          sizing: { width: t('size-48') },
        }),
      ),
    ).toEqual([]);
  });
});
